using System;
using System.Collections.Generic;
using System.Drawing;
using System.Windows.Forms;
using System.Threading.Tasks;
using SpaceReclaimer.Core;

namespace SpaceReclaimer.UI
{
    public class MainForm : Form
    {
        private DirectTreemapRenderer _renderer;
        private TurboScanner _scanner;
        private System.Windows.Forms.Timer _renderTimer;
        private System.Windows.Forms.Timer _updateTimer;
        private Button _instantCleanButton;
        private Label _spaceReclaimedLabel;
        private Label _systemImpactLabel;
        private Panel _renderPanel;
        private ComboBox _driveSelector;
        private long _spaceReclaimed;
        
        public MainForm()
        {
            InitializeComponents();
            InitializeScanner();
        }
        
        private void InitializeComponents()
        {
            // Configure form
            Text = "SpaceReclaimer - High Performance Disk Analyzer";
            ClientSize = new System.Drawing.Size(1024, 768);
            
            // Create drive selector
            _driveSelector = new ComboBox
            {
                Location = new System.Drawing.Point(10, 10),
                Width = 80,
                DropDownStyle = ComboBoxStyle.DropDownList
            };
            
            // Add available drives
            foreach (var drive in DriveInfo.GetDrives())
            {
                if (drive.IsReady)
                {
                    _driveSelector.Items.Add(drive.Name[0]);
                }
            }
            
            if (_driveSelector.Items.Count > 0)
            {
                _driveSelector.SelectedIndex = 0;
            }
            
            _driveSelector.SelectedIndexChanged += DriveSelector_SelectedIndexChanged;
            Controls.Add(_driveSelector);
            
            // Create instant clean button
            _instantCleanButton = new Button
            {
                Text = "Instant Clean",
                Location = new System.Drawing.Point(100, 10),
                Width = 120,
                Height = 30,
                BackColor = System.Drawing.Color.FromArgb(0, 120, 215),
                ForeColor = System.Drawing.Color.White,
                FlatStyle = FlatStyle.Flat
            };
            _instantCleanButton.Click += InstantClean_Click;
            Controls.Add(_instantCleanButton);
            
            // Create space reclaimed label
            _spaceReclaimedLabel = new Label
            {
                Text = "Space Reclaimed: 0 B",
                Location = new System.Drawing.Point(230, 15),
                Width = 300,
                Height = 20
            };
            Controls.Add(_spaceReclaimedLabel);
            
            // Create system impact meter
            _systemImpactLabel = new Label
            {
                Text = "System Impact: Low",
                Location = new System.Drawing.Point(540, 15),
                Width = 200,
                Height = 20
            };
            Controls.Add(_systemImpactLabel);
            
            // Create render panel for visualization
            _renderPanel = new Panel
            {
                Location = new System.Drawing.Point(10, 50),
                Size = new System.Drawing.Size(ClientSize.Width - 20, ClientSize.Height - 60),
                BackColor = System.Drawing.Color.Black
            };
            Controls.Add(_renderPanel);
            
            // Create render timer
            _renderTimer = new System.Windows.Forms.Timer
            {
                Interval = 16 // ~60 FPS
            };
            _renderTimer.Tick += RenderTimer_Tick;
            
            // Create update timer for stats
            _updateTimer = new System.Windows.Forms.Timer
            {
                Interval = 1000 // 1 second
            };
            _updateTimer.Tick += UpdateTimer_Tick;
            
            // Handle form resize
            Resize += MainForm_Resize;
            
            // Handle form closing
            FormClosing += MainForm_FormClosing;
        }
        
        private void InitializeScanner()
        {
            _scanner = new TurboScanner();
            _renderer = new DirectTreemapRenderer(_renderPanel.Handle);
            
            // Start timers
            _renderTimer.Start();
            _updateTimer.Start();
            
            // Trigger initial scan
            if (_driveSelector.SelectedItem != null)
            {
                StartScan((char)_driveSelector.SelectedItem);
            }
        }
        
        private async void StartScan(char driveLetter)
        {
            try
            {
                _instantCleanButton.Enabled = false;
                _instantCleanButton.Text = "Scanning...";
                
                // Perform scan
                var result = await _scanner.ScanDriveAsync(driveLetter, default);
                
                // Convert to folder sizes for visualization
                var folderSizes = new List<FolderSize>();
                foreach (var pair in result.FolderSizeMap)
                {
                    folderSizes.Add(new FolderSize 
                    { 
                        Path = pair.Key, 
                        Size = pair.Value 
                    });
                }
                
                // Update visualization
                _renderer.UpdateTreemap(folderSizes, result.TotalSizeBytes);
                
                // Update UI
                _instantCleanButton.Enabled = true;
                _instantCleanButton.Text = "Instant Clean";
                
                // Update title with scan results
                Text = $"SpaceReclaimer - {result.TotalFilesFound} files, {FormatSize(result.TotalSizeBytes)}";
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Error scanning drive: {ex.Message}", "Error", 
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
                    
                _instantCleanButton.Enabled = true;
                _instantCleanButton.Text = "Instant Clean";
            }
        }
        
        private async void InstantClean_Click(object sender, EventArgs e)
        {
            if (_driveSelector.SelectedItem == null) return;
            
            char driveLetter = (char)_driveSelector.SelectedItem;
            
            // Confirm cleanup
            if (MessageBox.Show(
                "Are you sure you want to run Instant Clean? This will remove temporary and unnecessary files.",
                "Confirm Cleanup",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Question) != DialogResult.Yes)
            {
                return;
            }
            
            try
            {
                _instantCleanButton.Enabled = false;
                _instantCleanButton.Text = "Cleaning...";
                
                // Create high-priority thread for cleanup
                await Task.Run(async () => 
                {
                    // Set thread priority to above normal for better responsiveness
                    System.Threading.Thread.CurrentThread.Priority = 
                        System.Threading.ThreadPriority.AboveNormal;
                        
                    // Run turbo mode scanner
                    var turboScanner = new TurboModeScanner();
                    var result = await turboScanner.RunTurboModeAsync(
                        driveLetter, true, true, default);
                        
                    // Process temp files
                    using var cleaner = new TempCleaner();
                    var cleanupResult = await cleaner.CleanTempFiles(
                        result.RecentTempFiles, default);
                        
                    // Update space reclaimed counter
                    _spaceReclaimed += cleanupResult.BytesReclaimed;
                    
                    // Refresh scan after cleanup
                    await Task.Delay(500); // Brief delay
                    await Invoke(new Func<Task>(async () => 
                    {
                        await Task.Run(() => StartScan(driveLetter));
                    }));
                });
                
                _instantCleanButton.Enabled = true;
                _instantCleanButton.Text = "Instant Clean";
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Error during cleanup: {ex.Message}", "Error", 
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
                    
                _instantCleanButton.Enabled = true;
                _instantCleanButton.Text = "Instant Clean";
            }
        }
        
        private void DriveSelector_SelectedIndexChanged(object sender, EventArgs e)
        {
            if (_driveSelector.SelectedItem != null)
            {
                StartScan((char)_driveSelector.SelectedItem);
            }
        }
        
        private void RenderTimer_Tick(object sender, EventArgs e)
        {
            // Render visualization
            _renderer?.Render();
        }
        
        private void UpdateTimer_Tick(object sender, EventArgs e)
        {
            // Update space reclaimed counter
            _spaceReclaimedLabel.Text = $"Space Reclaimed: {FormatSize(_spaceReclaimed)}";
            
            // Update system impact meter
            UpdateSystemImpactMeter();
        }
        
        private void UpdateSystemImpactMeter()
        {
            // Get current CPU and memory usage
            float cpuUsage = GetCpuUsage();
            float memoryUsage = GetMemoryUsage();
            
            // Calculate overall impact
            float impact = (cpuUsage * 0.7f) + (memoryUsage * 0.3f);
            
            string impactText;
            if (impact < 30)
            {
                impactText = "Low";
                _systemImpactLabel.ForeColor = System.Drawing.Color.Green;
            }
            else if (impact < 70)
            {
                impactText = "Medium";
                _systemImpactLabel.ForeColor = System.Drawing.Color.Orange;
            }
            else
            {
                impactText = "High";
                _systemImpactLabel.ForeColor = System.Drawing.Color.Red;
            }
            
            _systemImpactLabel.Text = $"System Impact: {impactText} ({impact:F1}%)";
        }
        
        private float GetCpuUsage()
        {
            // Use P/Invoke to get CPU usage
            // This is a simplified implementation
            return 10.0f; // Placeholder value
        }
        
        private float GetMemoryUsage()
        {
            // Get current memory usage as percentage of allowable maximum (50MB)
            long currentMemory = GC.GetTotalMemory(false);
            return (float)currentMemory / (50 * 1024 * 1024) * 100;
        }
        
        private void MainForm_Resize(object sender, EventArgs e)
        {
            if (_renderPanel != null)
            {
                _renderPanel.Size = new System.Drawing.Size(
                    ClientSize.Width - 20, 
                    ClientSize.Height - 60);
            }
        }
        
        private void MainForm_FormClosing(object sender, FormClosingEventArgs e)
        {
            // Clean up resources
            _renderTimer?.Stop();
            _updateTimer?.Stop();
            _renderer?.Dispose();
            _scanner?.Dispose();
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
    }
}
