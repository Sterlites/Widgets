// D:\RDx\DevBox\Widgets\SpaceReclaimer\Project\UI\DirectTreemapRenderer.cs

using System;
using System.Collections.Generic;
using System.Runtime.InteropServices; // Keep for IntPtr if needed, though might not be strictly necessary here
using System.Threading;               // For ReaderWriterLockSlim
using System.Threading.Tasks;         // Though Tasks might not be directly used in this renderer part
using SharpDX;
using SharpDX.Direct2D1;
using SharpDX.Direct3D;
using SharpDX.Direct3D11;
using SharpDX.DXGI;
using SharpDX.DirectWrite;          // Added for TextFormat/Factory
using SpaceReclaimer.Core;          // Assuming FolderSize is defined in Core or a shared location

namespace SpaceReclaimer.UI
{
    /// <summary>
    /// High-performance real-time treemap visualization using Direct2D.
    /// Requires the SharpDX NuGet packages (SharpDX, SharpDX.Direct2D1, SharpDX.Direct3D11, SharpDX.DXGI, SharpDX.DirectWrite).
    /// </summary>
    public sealed class DirectTreemapRenderer : IDisposable
    {
        // Direct2D/DirectX objects
        private SharpDX.Direct3D11.Device _d3dDevice;
        private SharpDX.Direct2D1.Device _d2dDevice;
        private SharpDX.Direct2D1.DeviceContext _d2dContext;
        private Texture2D _backBuffer;
        private RenderTargetView _renderTargetView;
        private SwapChain _swapChain;
        private SharpDX.Direct2D1.Factory2 _d2dFactory; // Use specific namespace
        private SharpDX.DirectWrite.Factory _dwriteFactory; // Factory for text formats

        // Rendering resources
        private SolidColorBrush _backgroundBrush;
        private SolidColorBrush[] _folderBrushes;
        private SolidColorBrush _textBrush;
        private SolidColorBrush _highlightBrush;
        private TextFormat _textFormat;
        private TextFormat _headerFormat;

        // Treemap data
        private List<TreemapItem> _treemapItems;
        private long _totalSize;
        private readonly ReaderWriterLockSlim _dataLock;

        // Animation state (Example - can be expanded)
        private float _animationProgress;
        private bool _isAnimating;
        private DateTime _lastFrameTime;
        private int _frameCount;
        private float _fps;

        // Window handle for rendering
        private IntPtr _windowHandle;

        public DirectTreemapRenderer(IntPtr windowHandle)
        {
            if (windowHandle == IntPtr.Zero)
                throw new ArgumentNullException(nameof(windowHandle));

            _windowHandle = windowHandle;
            _dataLock = new ReaderWriterLockSlim();
            _treemapItems = new List<TreemapItem>();
            InitializeDevice();
        }

        private void InitializeDevice()
        {
            // Create DXGI factory
            using (var factory = new SharpDX.DXGI.Factory1()) // Use specific namespace
            {
                // Configure device and swap chain
                var desc = new SwapChainDescription
                {
                    BufferCount = 2, // Use double buffering
                    Usage = Usage.RenderTargetOutput,
                    OutputHandle = _windowHandle,
                    IsWindowed = true,
                    ModeDescription = new ModeDescription(
                        0, 0, new Rational(60, 1), Format.B8G8R8A8_UNorm), // Use common BGRA format
                    SampleDescription = new SampleDescription(1, 0), // No multisampling
                    Flags = SwapChainFlags.None, // No special flags needed for basic windowed
                    SwapEffect = SwapEffect.FlipDiscard // Efficient swap effect
                };

                // Specify feature levels (Direct3D 11.0 is a good baseline)
                FeatureLevel[] featureLevels = { FeatureLevel.Level_11_0 };

                // Create device and swap chain
                SharpDX.Direct3D11.Device.CreateWithSwapChain(
                    DriverType.Hardware, // Use hardware acceleration
                    DeviceCreationFlags.BgraSupport | DeviceCreationFlags.SingleThreaded, // BGRA support is needed for Direct2D interop
                    featureLevels,
                    desc,
                    out _d3dDevice,
                    out _swapChain);

                // Prevent DXGI from monitoring Alt+Enter (fullscreen switch)
                 factory.MakeWindowAssociation(_windowHandle, WindowAssociationFlags.IgnoreAltEnter);
            }

            // Create D2D factory
            _d2dFactory = new SharpDX.Direct2D1.Factory2(FactoryType.SingleThreaded);

            // Create DirectWrite factory
            _dwriteFactory = new SharpDX.DirectWrite.Factory(SharpDX.DirectWrite.FactoryType.Shared);

            // Create D2D device from D3D device
            using (var dxgiDevice = _d3dDevice.QueryInterface<SharpDX.DXGI.Device>())
            {
                _d2dDevice = new SharpDX.Direct2D1.Device(_d2dFactory, dxgiDevice);
            }

            // Create D2D device context
            _d2dContext = new SharpDX.Direct2D1.DeviceContext(_d2dDevice, DeviceContextOptions.None);

            // Get back buffer and create render target view
            _backBuffer = SharpDX.Direct3D11.Resource.FromSwapChain<Texture2D>(_swapChain, 0);
            _renderTargetView = new RenderTargetView(_d3dDevice, _backBuffer);

            // Create D2D bitmap render target linked to the swap chain's back buffer
            // Use properties consistent with the swap chain
            var bitmapProperties = new BitmapProperties1(
                new PixelFormat(Format.B8G8R8A8_UNorm, SharpDX.Direct2D1.AlphaMode.Premultiplied),
                _d3dDevice.ImmediateContext.Rasterizer.State?.Description.MultisampleCount > 1 ? 96f : 96f, // Use 96 DPI
                _d3dDevice.ImmediateContext.Rasterizer.State?.Description.MultisampleCount > 1 ? 96f : 96f,
                BitmapOptions.Target | BitmapOptions.CannotDraw); // Target for drawing, cannot be drawn itself

            using (var dxgiSurface = _backBuffer.QueryInterface<Surface>())
            {
                var d2dRenderTarget = new Bitmap1(_d2dContext, dxgiSurface, bitmapProperties);
                _d2dContext.Target = d2dRenderTarget; // Set the target
                d2dRenderTarget.Dispose(); // Dispose the temporary render target object after setting Target
            }

            // Set transform to identity
            _d2dContext.Transform = Matrix3x2.Identity;

            CreateDeviceDependentResources();

            // Initialize animation state
            _lastFrameTime = DateTime.Now;
            _frameCount = 0;
            _fps = 0;
        }

        // Create resources that depend on the D2D device context
        private void CreateDeviceDependentResources()
        {
            // Dispose existing resources first if recreating
            _backgroundBrush?.Dispose();
            _textBrush?.Dispose();
            _highlightBrush?.Dispose();
            _textFormat?.Dispose();
            _headerFormat?.Dispose();
            if (_folderBrushes != null) foreach (var b in _folderBrushes) b?.Dispose();


            // Create brushes
            _backgroundBrush = new SolidColorBrush(_d2dContext, new Color4(0.15f, 0.15f, 0.18f, 1.0f)); // Slightly bluish dark gray
            _textBrush = new SolidColorBrush(_d2dContext, new Color4(0.9f, 0.9f, 0.9f, 1.0f)); // Off-white
            _highlightBrush = new SolidColorBrush(_d2dContext, new Color4(1.0f, 0.6f, 0.2f, 1.0f)); // Orange highlight

            // Create folder color brushes (example: shades of blue/cyan)
            _folderBrushes = new SolidColorBrush[10];
            for (int i = 0; i < 10; i++)
            {
                float hue = 180f + (i * 5f); // Vary hue around cyan/blue
                float saturation = 0.6f + (i * 0.03f); // Vary saturation
                float lightness = 0.4f + (i * 0.02f); // Vary lightness slightly
                // Convert HSL to RGB (this is a simplified placeholder - use a proper HSL-to-RGB conversion)
                float r = 0.1f; float g = lightness; float b = saturation; // Placeholder conversion
                _folderBrushes[i] = new SolidColorBrush(_d2dContext, new Color4(r, g, b, 1.0f));
            }

            // Create text formats
            _textFormat = new TextFormat(_dwriteFactory, "Segoe UI", FontWeight.Normal, FontStyle.Normal, FontStretch.Normal, 12.0f);
            _headerFormat = new TextFormat(_dwriteFactory, "Segoe UI", FontWeight.SemiBold, FontStyle.Normal, FontStretch.Normal, 14.0f);

            // Set text alignment if needed
             _textFormat.TextAlignment = TextAlignment.Leading;
             _textFormat.ParagraphAlignment = ParagraphAlignment.Near;
             _headerFormat.TextAlignment = TextAlignment.Leading;
             _headerFormat.ParagraphAlignment = ParagraphAlignment.Near;
        }

        /// <summary>
        /// Update treemap data with new folder information. Call this from your data scanning thread.
        /// </summary>
        public void UpdateTreemap(IEnumerable<FolderSize> folderSizes, long totalSize)
        {
            if (folderSizes == null) return;

            var newItems = new List<TreemapItem>();
            long currentTotal = 0;

            // Convert folder data to treemap items
            foreach (var folder in folderSizes)
            {
                 // Basic filtering (e.g., skip very small items relative to total)
                 // Threshold can be adjusted
                 if (totalSize > 0 && folder.Size < totalSize / 2000) // Less than 0.05%
                 {
                     continue;
                 }

                newItems.Add(new TreemapItem
                {
                    Name = folder.Path ?? "Unknown", // Handle null paths
                    Size = folder.Size,
                    // Calculate depth simply (adjust if paths are inconsistent)
                    Depth = (folder.Path?.Split(new[] { Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar }, StringSplitOptions.RemoveEmptyEntries).Length ?? 1) -1
                });
                currentTotal += folder.Size;
            }

            // Lock for writing data
            _dataLock.EnterWriteLock();
            try
            {
                 _treemapItems = newItems; // Replace the list
                _totalSize = currentTotal; // Use the sum of items actually added

                // Start animation for smooth transition
                _animationProgress = 0.0f;
                _isAnimating = true;
            }
            finally
            {
                _dataLock.ExitWriteLock();
            }
        }

        /// <summary>
        /// Renders the treemap visualization. Call this in your UI thread's render loop.
        /// </summary>
        public void Render()
        {
            if (_d2dContext == null || _d2dContext.IsDisposed) return;

            // Calculate FPS
            _frameCount++;
            TimeSpan elapsed = DateTime.Now - _lastFrameTime;
            if (elapsed.TotalSeconds >= 1.0)
            {
                _fps = _frameCount / (float)elapsed.TotalSeconds;
                _frameCount = 0;
                _lastFrameTime = DateTime.Now;
            }

            // Update animation state
            if (_isAnimating)
            {
                // Simple linear animation, could use easing functions
                _animationProgress += 0.08f; // Adjust speed as needed
                if (_animationProgress >= 1.0f)
                {
                    _animationProgress = 1.0f;
                    _isAnimating = false;
                }
            }

            _d2dContext.BeginDraw();
            _d2dContext.Clear(_backgroundBrush.Color); // Clear with background color

            // Get current size of the render target
            var clientRect = new RectangleF(0, 0, _d2dContext.Size.Width, _d2dContext.Size.Height);

            // Draw treemap (read lock protects _treemapItems list)
            _dataLock.EnterReadLock();
            try
            {
                if (_treemapItems.Count > 0 && _totalSize > 0)
                {
                    // TODO: Replace placeholder layout with actual Squarified Treemap logic
                    DrawTreemapLayout_Placeholder(clientRect);
                }
                else
                {
                    // Display message when no data
                    var centerRect = clientRect;
                    centerRect.Height = 50; // Limit height for text
                     _headerFormat.TextAlignment = TextAlignment.Center;
                     _headerFormat.ParagraphAlignment = ParagraphAlignment.Center;
                    _d2dContext.DrawText("Scanning or no data...", _headerFormat,
                        centerRect, _textBrush);
                     _headerFormat.TextAlignment = TextAlignment.Leading; // Reset alignment
                     _headerFormat.ParagraphAlignment = ParagraphAlignment.Near;
                }
            }
            finally
            {
                _dataLock.ExitReadLock();
            }

            // Draw FPS counter and stats
            DrawStats(clientRect);

            var renderResult = _d2dContext.EndDraw();
            if (renderResult == ResultCode.RecreateTarget)
            {
                 // Handle device loss/recreation if necessary
                 // Dispose and recreate resources
                 Console.WriteLine("WARNING: D2D Target needs recreation.");
                 // Simple handling: potentially re-initialize device/resources
                 // DisposeDeviceDependentResources();
                 // CreateDeviceDependentResources();
            }


            // Present the frame
             try
             {
                _swapChain.Present(1, PresentFlags.None); // Vsync interval 1
             }
             catch (SharpDXException ex)
             {
                  if(ex.ResultCode == ResultCode.DeviceRemoved || ex.ResultCode == ResultCode.DeviceReset)
                  {
                       Console.WriteLine($"ERROR: Device removed or reset during Present: {ex.ResultCode}");
                       // Handle device loss - requires re-initialization
                       // Dispose(); InitializeDevice(); ? Or signal main loop to restart.
                  }
                  else throw;
             }
        }

        // Placeholder drawing logic - REPLACE with actual treemap algorithm implementation
        private void DrawTreemapLayout_Placeholder(RectangleF bounds)
        {
            float x = bounds.Left;
            float y = bounds.Top;
            float availableWidth = bounds.Width;

            foreach (var item in _treemapItems)
            {
                 if (_totalSize <= 0) break; // Avoid division by zero

                float itemRatio = (float)item.Size / _totalSize;
                float itemWidth = availableWidth * itemRatio;
                // Clamp minimum width for visibility
                itemWidth = Math.Max(itemWidth, 2.0f);

                var targetRect = new RectangleF(x, y, itemWidth, bounds.Height);

                // Simple animation (just use target for now as original isn't stored in this placeholder)
                var rect = AnimateRectangle(targetRect, targetRect); // Pass target as original for no anim

                // Select brush based on depth (cycle through brushes)
                var brush = _folderBrushes[Math.Abs(item.Depth) % _folderBrushes.Length];

                // Draw rectangle
                _d2dContext.FillRectangle(rect, brush);
                _d2dContext.DrawRectangle(rect, _textBrush, 0.5f); // Thin border

                // Draw text if rectangle is large enough
                if (rect.Width > 40 && rect.Height > 20)
                {
                    string sizeText = FormatSize(item.Size);
                    string nameText = GetShortName(item.Name);

                    var textRect = new RectangleF(rect.Left + 4, rect.Top + 2, rect.Width - 8, rect.Height - 4);

                    // Clip text drawing to the rectangle bounds
                    _d2dContext.PushAxisAlignedClip(rect, AntialiasMode.PerPrimitive);

                    // Draw name and size (consider using different formats or positions)
                    _d2dContext.DrawText(nameText, _textFormat, textRect, _textBrush, DrawTextOptions.Clip);

                    textRect.Top += 15; // Move down for size text
                     if(textRect.Bottom > rect.Bottom - 4) // Check if space remains
                        _d2dContext.DrawText(sizeText, _textFormat, textRect, _textBrush, DrawTextOptions.Clip);

                    _d2dContext.PopAxisAlignedClip();
                }

                x += itemWidth; // Move to next position
                 if (x >= bounds.Right) break; // Stop if we run out of space
            }
        }


        // NOTE: This needs actual implementation of a Treemap algorithm (like Squarified)
        // The placeholder above just draws items in a single row.
        private List<TreemapLayout> CalculateTreemapLayout(RectangleF bounds)
        {
             // --> IMPLEMENT SQUARIFIED TREEMAP ALGORITHM HERE <--
             // This algorithm recursively partitions the 'bounds' rectangle
             // based on the 'Size' of items in '_treemapItems'.
             // It tries to keep rectangles as close to square as possible.
             // The result should be a list of TreemapLayout objects,
             // where each object contains the calculated TargetRect for an item.
             // You'll also need logic to store the 'OriginalRect' from the
             // previous frame to enable animation in AnimateRectangle.

            throw new NotImplementedException("Squarified Treemap algorithm needs to be implemented.");
        }


        private RectangleF AnimateRectangle(RectangleF original, RectangleF target)
        {
            // If not animating, or progress is complete, return the target immediately
            if (!_isAnimating || _animationProgress >= 1.0f)
            {
                return target;
            }
            // If animation just started, original might be zero-sized or needs setting
             if (_animationProgress <= 0.0f) // Or close to 0
             {
                  // Define a starting state, e.g., collapse to center or use previous frame's position
                  // For simplicity here, just return the target instantly on first frame
                   //return target; // Or return a 'start' rect
                    return new RectangleF(
                       target.X + target.Width / 2,
                       target.Y + target.Height / 2,
                       0, 0); // Start collapsed
             }


            // Use an easing function for smoother animation (e.g., ease-out cubic)
            float t = _animationProgress;
            float easedT = 1.0f - (float)Math.Pow(1.0f - t, 3); // Ease-out cubic

            return new RectangleF(
                Lerp(original.X, target.X, easedT),
                Lerp(original.Y, target.Y, easedT),
                Lerp(original.Width, target.Width, easedT),
                Lerp(original.Height, target.Height, easedT));
        }

        // Linear interpolation helper
        private float Lerp(float a, float b, float t)
        {
            // Clamp t just in case
            t = Math.Max(0.0f, Math.Min(1.0f, t));
            return a + (b - a) * t;
        }


        private void DrawStats(RectangleF bounds)
        {
            var statsRect = new RectangleF(
                bounds.Left + 10, bounds.Top + 5, // Position near top-left
                bounds.Width - 20, 30);

            string statsText = $"FPS: {_fps:F1} | Items: {_treemapItems.Count} | Display Total: {FormatSize(_totalSize)}";
             _headerFormat.TextAlignment = TextAlignment.Leading; // Ensure alignment
             _headerFormat.ParagraphAlignment = ParagraphAlignment.Near;
            _d2dContext.DrawText(statsText, _headerFormat, statsRect, _highlightBrush); // Use highlight brush for stats
        }

        private string FormatSize(long bytes)
        {
            if (bytes < 0) return "N/A";
            if (bytes == 0) return "0 B";

            string[] suffixes = { "B", "KB", "MB", "GB", "TB", "PB", "EB" }; // Added more suffixes
            int i = 0;
            double size = bytes;

            while (size >= 1024 && i < suffixes.Length - 1)
            {
                size /= 1024.0; // Use floating point division
                i++;
            }

            return $"{size:F2} {suffixes[i]}"; // Format to 2 decimal places
        }

        private string GetShortName(string path)
        {
             if (string.IsNullOrEmpty(path)) return "Unknown";

            // Try to get the last part of the path
            int lastSlash = path.LastIndexOfAny(new[] { Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar });
            if (lastSlash >= 0 && lastSlash < path.Length - 1)
            {
                return path.Substring(lastSlash + 1);
            }

            // If no slash or it's the root (e.g., "C:"), return the path itself
            return path;
        }

        // Dispose device-dependent resources
        private void DisposeDeviceDependentResources()
        {
             _textFormat?.Dispose(); _textFormat = null;
             _headerFormat?.Dispose(); _headerFormat = null;
             _backgroundBrush?.Dispose(); _backgroundBrush = null;
             _textBrush?.Dispose(); _textBrush = null;
             _highlightBrush?.Dispose(); _highlightBrush = null;

             if (_folderBrushes != null)
             {
                 foreach (var brush in _folderBrushes) { brush?.Dispose(); }
                 _folderBrushes = null;
             }
        }


        public void Dispose()
        {
            _dataLock?.Dispose();

            // Dispose D2D resources
             DisposeDeviceDependentResources(); // Dispose brushes, text formats

            // Dispose Core D2D/D3D objects
             _d2dContext?.Dispose(); _d2dContext = null;
             _d2dDevice?.Dispose(); _d2dDevice = null;
             _dwriteFactory?.Dispose(); _dwriteFactory = null;
             _d2dFactory?.Dispose(); _d2dFactory = null;

             _renderTargetView?.Dispose(); _renderTargetView = null;
             _backBuffer?.Dispose(); _backBuffer = null;
             _swapChain?.Dispose(); _swapChain = null;
             _d3dDevice?.Dispose(); _d3dDevice = null; // Dispose D3D device last
        }

        // Internal data structure for items being rendered
        private class TreemapItem
        {
            public string Name { get; set; }
            public long Size { get; set; }
            public int Depth { get; set; }
        }

        // Internal data structure for layout results (placeholder)
        // You'll need this if implementing the actual layout algorithm
        private class TreemapLayout
        {
            public TreemapItem Item { get; set; }
            public RectangleF TargetRect { get; set; }
            public RectangleF OriginalRect { get; set; } // For animation start point
        }

    }

    // Data structure for input folder sizes (assuming defined elsewhere, maybe Core)
    // If not defined elsewhere, uncomment this or define appropriately in Core namespace
    /*
    public class FolderSize
    {
        public string Path { get; set; }
        public long Size { get; set; }
    }
    */
}