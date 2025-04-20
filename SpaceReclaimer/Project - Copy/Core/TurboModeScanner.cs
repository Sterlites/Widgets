using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;

```
namespace SpaceReclaimer.Core
{
    /// <summary>
    /// Implements ultra-fast "Turbo Mode" scanning combining multiple techniques
    /// </summary>
    public sealed class TurboModeScanner
    {
        // COM interfaces for Windows Disk Cleanup
        [ComImport, Guid("77WBC578-35BF-45AB-94ED-D85C08B9CFCF")]
        [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        private interface IEmptyVolumeCacheCallBack
        {
            [PreserveSig]
            int ScanProgress(
                uint dwlSpaceUsed, 
                uint dwFlags, 
                [MarshalAs(UnmanagedType.LPWStr)] string pcwszStatus);
                
            [PreserveSig]
            int PurgeProgress(
                uint dwlSpaceFreed, 
                uint dwFlags, 
                [MarshalAs(UnmanagedType.LPWStr)] string pcwszStatus);
        }
        
        [ComImport, Guid("AFBC8E55-1277-4FD3-9E55-06A7C207E21A")]
        [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        private interface IEmptyVolumeCache2
        {
            [PreserveSig]
            int Initialize(
                IntPtr hwnd, 
                IntPtr hkRegKey,
                [MarshalAs(UnmanagedType.LPWStr)] string pcwszVolume,
                [MarshalAs(UnmanagedType.LPWStr)] string pcwszKeyName,
                ref ulong pdwFlags);
                
            [PreserveSig]
            int GetSpaceUsed(
                out ulong pdwlSpaceUsed, 
                IEmptyVolumeCacheCallBack picb);
                
            [PreserveSig]
            int Purge(
                ulong dwlSpaceToFree, 
                IEmptyVolumeCacheCallBack picb);
                
            [PreserveSig]
            int ShowProperties(IntPtr hwnd);
            
            [PreserveSig]
            int Deactivate();
        }
        
        // NTFS Journal structures
        [StructLayout(LayoutKind.Sequential)]
        private struct USN_JOURNAL_DATA
        {
            public ulong UsnJournalID;
            public ulong FirstUsn;
            public ulong NextUsn;
            public ulong LowestValidUsn;
            public ulong MaxUsn;
            public ulong MaximumSize;
            public ulong AllocationDelta;
        }
        
        [StructLayout(LayoutKind.Sequential)]
        private struct MFT_ENUM_DATA
        {
            public ulong StartFileReferenceNumber;
            public ulong LowUsn;
            public ulong HighUsn;
        }
        
        [StructLayout(LayoutKind.Sequential)]
        private struct USN_RECORD
        {
            public uint RecordLength;
            public ushort MajorVersion;
            public ushort MinorVersion;
            public ulong FileReferenceNumber;
            public ulong ParentFileReferenceNumber;
            public long Usn;
            public long TimeStamp;
            public uint Reason;
            public uint SourceInfo;
            public uint SecurityId;
            public uint FileAttributes;
            public ushort FileNameLength;
            public ushort FileNameOffset;
        }
        
        // Win32 constants for NTFS journal
        private const uint FSCTL_QUERY_USN_JOURNAL = 0x900f4;
        private const uint FSCTL_READ_USN_JOURNAL = 0x900bb;
        
        /// <summary>
        /// Implements Turbo Mode scan combining Windows Disk Cleanup APIs, 
        /// NTFS journal analysis, and prefetch-based prediction
        /// </summary>
        public async Task<TurboScanResult> RunTurboModeAsync(
            char driveLetter, 
            bool includePrefetch, 
            bool includeSystemTemp,
            CancellationToken token)
        {
            var result = new TurboScanResult();
            var tasks = new List<Task>();
            
            // 1. Start Disk Cleanup COM interface analysis in parallel
            if (includeSystemTemp)
            {
                tasks.Add(Task.Run(() => 
                {
                    var cleanupSpaceUsed = RunWindowsDiskCleanup(driveLetter);
                    result.SystemTempBytes = cleanupSpaceUsed;
                }, token));
            }
            
            // 2. Start NTFS journal analysis in parallel
            tasks.Add(Task.Run(() => 
            {
                var recentTempFiles = AnalyzeNtfsJournal(
                    driveLetter, 
                    TimeSpan.FromDays(7),
                    token);
                    
                result.RecentTempFiles = recentTempFiles;
            }, token));
            
            // 3. Start prefetch analysis in parallel if requested
            if (includePrefetch)
            {
                tasks.Add(Task.Run(() => 
                {
                    var prefetchPredictions = AnalyzePrefetchForLargeFiles();
                    result.PrefetchPredictions = prefetchPredictions;
                }, token));
            }
            
            // Wait for all parallel tasks to complete
            await Task.WhenAll(tasks);
            
            return result;
        }
        
        /// <summary>
        /// Uses COM interfaces to calculate space used by Windows Disk Cleanup
        /// </summary>
        private ulong RunWindowsDiskCleanup(char driveLetter)
        {
            // Create callback for disk cleanup progress
            var callback = new EmptyVolumeCacheCallback();
            
            // Get cleanup interface via COM
            // [Code omitted for brevity - would use COM to access Windows Disk Cleanup]
            
            return 0;
        }
        
        /// <summary>
        /// Analyzes NTFS USN journal to quickly find recently modified temp files
        /// </summary>
        private List<TempFileInfo> AnalyzeNtfsJournal(
            char driveLetter, 
            TimeSpan maxAge,
            CancellationToken token)
        {
            var results = new List<TempFileInfo>();
            
            // Open volume for direct access
            string volumePath = $"\\\\.\\{driveLetter}:";
            using var volumeHandle = CreateFile(
                volumePath,
                GENERIC_READ,
                FILE_SHARE_READ | FILE_SHARE_WRITE,
                IntPtr.Zero,
                OPEN_EXISTING,
                0,
                IntPtr.Zero);
                
            if (volumeHandle.IsInvalid)
            {
                return results;
            }
            
            // Query USN journal data
            var journalData = new USN_JOURNAL_DATA();
            uint bytesReturned = 0;
            
            bool success = DeviceIoControl(
                volumeHandle,
                FSCTL_QUERY_USN_JOURNAL,
                IntPtr.Zero,
                0,
                ref journalData,
                (uint)Marshal.SizeOf<USN_JOURNAL_DATA>(),
                ref bytesReturned,
                IntPtr.Zero);
                
            if (!success)
            {
                return results;
            }
            
            // Calculate USN range to analyze based on timestamp
            // We'll focus on recent changes only
            var enumData = new MFT_ENUM_DATA
            {
                StartFileReferenceNumber = 0,
                LowUsn = journalData.FirstUsn,
                HighUsn = journalData.NextUsn
            };
            
            // Allocate buffer for reading journal records
            const int bufferSize = 64 * 1024;
            IntPtr buffer = Marshal.AllocHGlobal(bufferSize);
            
            try
            {
                DateTime cutoffTime = DateTime.Now.Subtract(maxAge);
                
                // Read USN journal records in batches
                while (!token.IsCancellationRequested)
                {
                    bytesReturned = 0;
                    success = DeviceIoControl(
                        volumeHandle,
                        FSCTL_READ_USN_JOURNAL,
                        ref enumData,
                        (uint)Marshal.SizeOf<MFT_ENUM_DATA>(),
                        buffer,
                        bufferSize,
                        ref bytesReturned,
                        IntPtr.Zero);
                        
                    if (!success || bytesReturned <= 8)
                    {
                        break; // No more records or error
                    }
                    
                    // Process journal records
                    uint offset = 8; // Skip the first 8 bytes (USN value)
                    while (offset < bytesReturned)
                    {
                        var record = Marshal.PtrToStructure<USN_RECORD>(
                            IntPtr.Add(buffer, (int)offset));
                            
                        // Check if this is a temp file
                        if (IsTempFileRecord(record, buffer, cutoffTime))
                        {
                            var fileInfo = ExtractTempFileInfo(record, buffer);
                            if (fileInfo != null)
                            {
                                results.Add(fileInfo);
                            }
                        }
                        
                        offset += record.RecordLength;
                    }
                    
                    // Update starting position for next batch
                    enumData.StartFileReferenceNumber = BitConverter.ToUInt64(
                        buffer, (int)(bytesReturned - 8));
                        
                    // Apply early termination if we have enough results
                    if (results.Count > 10000)
                    {
                        break;
                    }
                }
            }
            finally
            {
                Marshal.FreeHGlobal(buffer);
            }
            
            return results;
        }
        
        /// <summary>
        /// Analyze Windows Prefetch files to predict large files
        /// </summary>
        private List<PrefetchPrediction> AnalyzePrefetchForLargeFiles()
        {
            var results = new List<PrefetchPrediction>();
            string prefetchPath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.Windows),
                "Prefetch");
                
            // Read prefetch directory
            if (!Directory.Exists(prefetchPath))
            {
                return results;
            }
            
            // Get all prefetch files
            var prefetchFiles = Directory.GetFiles(prefetchPath, "*.pf");
            
            // Parse each prefetch file for file references
            foreach (var file in prefetchFiles)
            {
                try
                {
                    // Parse prefetch file format
                    // [Code omitted for brevity - would use native APIs]
                    
                    // Add predictions for large files found in prefetch
                    results.Add(new PrefetchPrediction
                    {
                        FilePath = "Example large temp file path",
                        EstimatedSize = 1024 * 1024 * 10, // 10MB example
                        LastAccessed = DateTime.Now.AddDays(-3),
                        Confidence = 0.85
                    });
                }
                catch
                {
                    // Skip errors in prefetch parsing
                    continue;
                }
            }
            
            return results;
        }
        
        private bool IsTempFileRecord(USN_RECORD record, IntPtr buffer, DateTime cutoffTime)
        {
            // Extract filename from the record
            string fileName = GetFileName(record, buffer);
            
            // Check if it's a temp file by extension or location
            bool isTempExtension = fileName.EndsWith(".tmp") || 
                                   fileName.EndsWith(".temp") ||
                                   fileName.EndsWith(".~mp");
                                   
            // Convert file timestamp to DateTime
            var fileTime = DateTime.FromFileTime(record.TimeStamp);
            
            // Check if it's recent enough
            bool isRecent = fileTime > cutoffTime;
            
            return isTempExtension && isRecent;
        }
        
        private string GetFileName(USN_RECORD record, IntPtr buffer)
        {
            IntPtr fileNamePtr = IntPtr.Add(buffer, 
                (int)record.FileNameOffset + Marshal.SizeOf<USN_RECORD>());
                
            return Marshal.PtrToStringUni(fileNamePtr, record.FileNameLength / 2);
        }
        
        private TempFileInfo ExtractTempFileInfo(USN_RECORD record, IntPtr buffer)
        {
            string fileName = GetFileName(record, buffer);
            
            return new TempFileInfo
            {
                FileName = fileName,
                FileReferenceNumber = record.FileReferenceNumber,
                ParentFileReferenceNumber = record.ParentFileReferenceNumber,
                LastModified = DateTime.FromFileTime(record.TimeStamp),
                FileAttributes = record.FileAttributes
            };
        }
    }
    
    public class TurboScanResult
    {
        public ulong SystemTempBytes { get; set; }
        public List<TempFileInfo> RecentTempFiles { get; set; }
        public List<PrefetchPrediction> PrefetchPredictions { get; set; }
        
        public TurboScanResult()
        {
            RecentTempFiles = new List<TempFileInfo>();
            PrefetchPredictions = new List<PrefetchPrediction>();
        }
        
        public ulong TotalPotentialRecoveryBytes
        {
            get
            {
                ulong total = SystemTempBytes;
                
                // Add size from temp files
                foreach (var file in RecentTempFiles)
                {
                    total += file.EstimatedSize;
                }
                
                // Add size from prefetch predictions
                foreach (var prediction in PrefetchPredictions)
                {
                    // Apply confidence factor
                    total += (ulong)(prediction.EstimatedSize * prediction.Confidence);
                }
                
                return total;
            }
        }
    }
    
    public class TempFileInfo
    {
        public string FileName { get; set; }
        public ulong FileReferenceNumber { get; set; }
        public ulong ParentFileReferenceNumber { get; set; }
        public DateTime LastModified { get; set; }
        public uint FileAttributes { get; set; }
        public ulong EstimatedSize { get; set; }
    }
    
    public class PrefetchPrediction
    {
        public string FilePath { get; set; }
        public ulong EstimatedSize { get; set; }
        public DateTime LastAccessed { get; set; }
        public double Confidence { get; set; }
    }
}

#region UI/DirectTreemapRenderer.cs
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using SharpDX;
using SharpDX.Direct2D1;
using SharpDX.Direct3D;
using SharpDX.Direct3D11;
using SharpDX.DXGI;

namespace SpaceReclaimer.UI
{
    /// <summary>
    /// High-performance real-time treemap visualization using Direct2D
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
        private Factory2 _d2dFactory;
        
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
        
        // Animation state
        private float _animationProgress;
        private bool _isAnimating;
        private DateTime _lastFrameTime;
        private int _frameCount;
        private float _fps;
        
        // Window handle for rendering
        private IntPtr _windowHandle;
        
        public DirectTreemapRenderer(IntPtr windowHandle)
        {
            _windowHandle = windowHandle;
            _dataLock = new ReaderWriterLockSlim();
            _treemapItems = new List<TreemapItem>();
            InitializeDevice();
        }
        
        private void InitializeDevice()
        {
            // Create DXGI factory
            var factory = new Factory1();
            
            // Configure device and swap chain
            var desc = new SwapChainDescription
            {
                BufferCount = 2,
                Usage = Usage.RenderTargetOutput,
                OutputHandle = _windowHandle,
                IsWindowed = true,
                ModeDescription = new ModeDescription(
                    0, 0, new Rational(60, 1), Format.R8G8B8A8_UNorm),
                SampleDescription = new SampleDescription(1, 0),
                Flags = SwapChainFlags.AllowModeSwitch,
                SwapEffect = SwapEffect.Discard
            };
            
            // Create device and swap chain
            SharpDX.Direct3D11.Device.CreateWithSwapChain(
                DriverType.Hardware,
                DeviceCreationFlags.BgraSupport,
                new[] { FeatureLevel.Level_11_0 },
                desc,
                out _d3dDevice,
                out _swapChain);
                
            // Create D2D factory
            _d2dFactory = new Factory2(FactoryType.SingleThreaded);
            
            // Create D2D device from D3D device
            using (var dxgiDevice = _d3dDevice.QueryInterface<SharpDX.DXGI.Device>())
            {
                _d2dDevice = new SharpDX.Direct2D1.Device(_d2dFactory, dxgiDevice);
            }
            
            // Create D2D device context
            _d2dContext = new DeviceContext(_d2dDevice, DeviceContextOptions.None);
            
            // Create back buffer and render target view
            _backBuffer = SharpDX.Direct3D11.Resource.FromSwapChain<Texture2D>(_swapChain, 0);
            _renderTargetView = new RenderTargetView(_d3dDevice, _backBuffer);
            
            // Create bitmap render target
            using (var surface = _backBuffer.QueryInterface<Surface>())
            {
                var bitmapProperties = new BitmapProperties1(
                    new PixelFormat(Format.R8G8B8A8_UNorm, SharpDX.Direct2D1.AlphaMode.Premultiplied),
                    96, 96, BitmapOptions.Target | BitmapOptions.CannotDraw);
                    
                var bitmap = new Bitmap1(_d2dContext, surface, bitmapProperties);
                _d2dContext.Target = bitmap;
            }
            
            // Create brushes
            _backgroundBrush = new SolidColorBrush(_d2dContext, new Color4(0.1f, 0.1f, 0.1f, 1.0f));
            _textBrush = new SolidColorBrush(_d2dContext, new Color4(1.0f, 1.0f, 1.0f, 1.0f));
            _highlightBrush = new SolidColorBrush(_d2dContext, new Color4(1.0f, 0.5f, 0.0f, 1.0f));
            
            // Create folder color brushes (gradient of colors)
            _folderBrushes = new SolidColorBrush[10];
            for (int i = 0; i < 10; i++)
            {
                float intensity = 0.3f + (0.7f * i / 9.0f);
                _folderBrushes[i] = new SolidColorBrush(_d2dContext, 
                    new Color4(0.0f, intensity, 0.7f * intensity, 1.0f));
            }
            
            // Create text formats
            var textFactory = new SharpDX.DirectWrite.Factory();
            _textFormat = new TextFormat(textFactory, "Segoe UI", 10.0f);
            _headerFormat = new TextFormat(textFactory, "Segoe UI", 14.0f) 
            { 
                FontWeight = SharpDX.DirectWrite.FontWeight.Bold 
            };
            
            // Initialize animation state
            _lastFrameTime = DateTime.Now;
            _frameCount = 0;
            _fps = 0;
        }
        
        /// <summary>
        /// Update treemap data with new folder information
        /// </summary>
        public void UpdateTreemap(IEnumerable<FolderSize> folderSizes, long totalSize)
        {
            _dataLock.EnterWriteLock();
            try
            {
                _treemapItems.Clear();
                _totalSize = totalSize;
                
                // Convert folder data to treemap items
                foreach (var folder in folderSizes)
                {
                    // Skip folders that are too small (less than 0.1% of total)
                    if (folder.Size < totalSize / 1000)
                    {
                        continue;
                    }
                    
                    _treemapItems.Add(new TreemapItem
                    {
                        Name = folder.Path,
                        Size = folder.Size,
                        Depth = folder.Path.Split('\\').Length
                    });
                }
                
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
        /// Renders the treemap visualization with animations
        /// </summary>
        public void Render()
        {
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
                _animationProgress += 0.05f;
                if (_animationProgress >= 1.0f)
                {
                    _animationProgress = 1.0f;
                    _isAnimating = false;
                }
            }
            
            // Clear the render target
            _d2dContext.BeginDraw();
            _d2dContext.Clear(_backgroundBrush.Color);
            
            // Get window size
            var clientRect = new RectangleF(0, 0, _d2dContext.Size.Width, _d2dContext.Size.Height);
            
            // Draw treemap
            _dataLock.EnterReadLock();
            try
            {
                if (_treemapItems.Count > 0)
                {
                    DrawTreemap(clientRect);
                }
                else
                {
                    _d2dContext.DrawText("No data available", _headerFormat, 
                        clientRect, _textBrush);
                }
            }
            finally
            {
                _dataLock.ExitReadLock();
            }
            
            // Draw FPS counter and stats
            DrawStats(clientRect);
            
            // End drawing
            _d2dContext.EndDraw();
            
            // Present the frame
            _swapChain.Present(1, PresentFlags.None);
        }
        
        private void DrawTreemap(RectangleF bounds)
        {
            // Calculate layout using the squarified treemap algorithm
            var layout = CalculateTreemapLayout(bounds);
            
            // Draw each rectangle
            foreach (var item in layout)
            {
                // Apply animation
                var rect = AnimateRectangle(item.OriginalRect, item.TargetRect);
                
                // Select brush based on depth
                var brush = _folderBrushes[item.Item.Depth % _folderBrushes.Length];
                
                // Draw rectangle
                _d2dContext.FillRectangle(rect, brush);
                _d2dContext.DrawRectangle(rect, _textBrush, 0.5f);
                
                // Draw text if rectangle is large enough
                if (rect.Width > 50 && rect.Height > 20)
                {
                    // Format file size for display
                    string sizeText = FormatSize(item.Item.Size);
                    string nameText = GetShortName(item.Item.Name);
                    
                    // Create layout rectangle for text
                    var textRect = new RectangleF(
                        rect.X + 5, rect.Y + 5, 
                        rect.Width - 10, rect.Height - 10);
                    
                    // Draw name and size
                    _d2dContext.DrawText(nameText, _textFormat, textRect, _textBrush);
                    
                    textRect.Y += 15;
                    _d2dContext.DrawText(sizeText, _textFormat, textRect, _textBrush);
                }
            }
        }
        
        private RectangleF AnimateRectangle(RectangleF original, RectangleF target)
        {
            if (!_isAnimating)
            {
                return target;
            }
            
            return new RectangleF(
                Lerp(original.X, target.X, _animationProgress),
                Lerp(original.Y, target.Y, _animationProgress),
                Lerp(original.Width, target.Width, _animationProgress),
                Lerp(original.Height, target.Height, _animationProgress));
        }
        
        private float Lerp(float a, float b, float t)
        {
            return a + (b - a) * t;
        }
        
        private List<TreemapLayout> CalculateTreemapLayout(RectangleF bounds)
        {
            var result = new List<TreemapLayout>();
            
            // Keep track of previous layout for animation
            var previousLayout = new Dictionary<string, RectangleF>();
            
            // Calculate total size
            long totalSize = 0;
            foreach (var item in _treemapItems)
            {
                totalSize += item.Size;
            }
            
            if (totalSize == 0)
            {
                return result;
            }
            
            // Sort items by size (largest first)
            var sortedItems = new List<TreemapItem>(_treemapItems);
            sortedItems.Sort((a, b) => b.Size.CompareTo(a.Size));
            
            // Apply squarified treemap algorithm
            SquarifiedTreemap(sortedItems, bounds, totalSize, previousLayout, result);
            
            return result;
        }
        
        private void SquarifiedTreemap(
            List<TreemapItem> items, 
            RectangleF bounds, 
            long totalSize,
            Dictionary<string, RectangleF> previousLayout,
            List<TreemapLayout> result)
        {
            // Implementation of the squarified treemap algorithm
            // [Code omitted for brevity - would implement the algorithm]
            
            // For demonstration, we'll use a simple row layout
            float x = bounds.X;
            float y = bounds.Y;
            float remainingWidth = bounds.Width;
            float remainingHeight = bounds.Height;
            
            foreach (var item in items)
            {
                // Calculate rectangle size proportional to item size
                float ratio = (float)item.Size / totalSize;
                float width, height;
                
                if (remainingWidth > remainingHeight)
                {
                    // Horizontal layout
                    width = remainingWidth * ratio;
                    height = remainingHeight;
                    x += width;
                    remainingWidth -= width;
                }
                else
                {
                    // Vertical layout
                    width = remainingWidth;
                    height = remainingHeight * ratio;
                    y += height;
                    remainingHeight -= height;
                }
                
                var targetRect = new RectangleF(x - width, y - height, width, height);
                
                // Get original rect for animation (or use target if not found)
                RectangleF originalRect;
                if (!previousLayout.TryGetValue(item.Name, out originalRect))
                {
                    originalRect = new RectangleF(
                        bounds.X + bounds.Width / 2,
                        bounds.Y + bounds.Height / 2,
                        0, 0);
                }
                
                result.Add(new TreemapLayout
                {
                    Item = item,
                    TargetRect = targetRect,
                    OriginalRect = originalRect
                });
            }
        }
        
        private void DrawStats(RectangleF bounds)
        {
            var statsRect = new RectangleF(
                bounds.X + 10, bounds.Y + 10,
                bounds.Width - 20, 30);
                
            string statsText = $"FPS: {_fps:F1} | Items: {_treemapItems.Count} | Total: {FormatSize(_totalSize)}";
            _d2dContext.DrawText(statsText, _headerFormat, statsRect, _highlightBrush);
        }
        
        private string FormatSize(long bytes)
        {
            string[] suffixes = { "B", "KB", "MB", "GB", "TB" };
            int i = 0;
            double size = bytes;
            
            while (size >= 1024 && i < suffixes.Length - 1)
            {
                size /= 1024;
                i++;
            }
            
            return $"{size:F2} {suffixes[i]}";
        }
        
        private string GetShortName(string path)
        {
            int lastSlash = path.LastIndexOf('\\');
            if (lastSlash >= 0 && lastSlash < path.Length - 1)
            {
                return path.Substring(lastSlash + 1);
            }
            
            return path;
        }
        
        public void Dispose()
        {
            // Dispose Direct2D/DirectX resources
            _textFormat?.Dispose();
            _headerFormat?.Dispose();
            _backgroundBrush?.Dispose();
            _textBrush?.Dispose();
            _highlightBrush?.Dispose();
            
            if (_folderBrushes != null)
            {
                foreach (var brush in _folderBrushes)
                {
                    brush?.Dispose();
                }
            }
            
            _d2dContext?.Dispose();
            _d2dDevice?.Dispose();
            _renderTargetView?.Dispose();
            _backBuffer?.Dispose();
            _swapChain?.Dispose();
            _d3dDevice?.Dispose();
            _d2dFactory?.Dispose();
        }
        
        private class TreemapItem
        {
            public string Name { get; set; }
            public long Size { get; set; }
            public int Depth { get; set; }
        }
        
```
        private class TreemapLayout
        {
            public TreemapItem Item { get; set; }
            public RectangleF TargetRect { get; set; }
            public RectangleF OriginalRect { get; set; }
        }
    }
    
    public class FolderSize
    {
        public string Path { get; set; }
        public long Size { get; set; }
    }
}
