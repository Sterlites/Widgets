using SpaceReclaimer.UI;
using SpaceReclaimer.Core;
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Threading.Tasks;

namespace SpaceReclaimer.Benchmark
{
    /// <summary>
    /// Performance benchmark and validation utilities
    /// </summary>
    public static class BenchmarkUtil
    {
        /// <summary>
        /// Run comprehensive benchmark suite
        /// </summary>
        public static async Task<BenchmarkResult> RunComprehensiveBenchmarkAsync(
            char driveLetter, 
            bool stressTest = false)
        {
            var result = new BenchmarkResult();
            var stopwatch = new Stopwatch();
            
            Console.WriteLine("Starting comprehensive benchmark suite");
            Console.WriteLine($"Target drive: {driveLetter}:");
            
            // Measure memory before tests
            GC.Collect();
            GC.WaitForPendingFinalizers();
            result.BaselineMemoryUsage = GC.GetTotalMemory(true);
            
            try
            {
                // 1. Test drive scanning performance
                Console.WriteLine("\nTesting drive scanning performance...");
                stopwatch.Restart();
                
                using var scanner = new Core.TurboScanner();
                var scanResult = await scanner.ScanDriveAsync(driveLetter, default);
                
                stopwatch.Stop();
                result.ScanTimeMs = stopwatch.ElapsedMilliseconds;
                result.FilesScanned = scanResult.TotalFilesFound;
                result.TotalBytes = scanResult.TotalSizeBytes;
                
                // Check if scan completed under the 15-second requirement for Turbo Mode
                result.MeetsScanTimeRequirement = result.ScanTimeMs <= 15000;
                
                Console.WriteLine($"Scanned {result.FilesScanned} files " +
                    $"({FormatSize(result.TotalBytes)}) in {result.ScanTimeMs}ms");
                
                // 2. Test memory usage during scanning
                GC.Collect();
                GC.WaitForPendingFinalizers();
                result.PeakMemoryUsage = GC.GetTotalMemory(true);
                result.MeetsMemoryRequirement = result.PeakMemoryUsage <= 50 * 1024 * 1024; // 50MB
                
                Console.WriteLine($"Peak memory usage: {FormatSize(result.PeakMemoryUsage)}");
                
                // 3. Test Turbo Mode performance
                Console.WriteLine("\nTesting Turbo Mode performance...");
                stopwatch.Restart();
                
                var turboScanner = new Core.TurboModeScanner();
                var turboResult = await turboScanner.RunTurboModeAsync(
                    driveLetter, true, true, default);
                
                stopwatch.Stop();
                result.TurboModeTimeMs = stopwatch.ElapsedMilliseconds;
                
                Console.WriteLine($"Turbo Mode completed in {result.TurboModeTimeMs}ms");
                Console.WriteLine($"Potential recovery: {FormatSize(turboResult.TotalPotentialRecoveryBytes)}");
                
                // 4. Test visualization performance
                Console.WriteLine("\nTesting visualization rendering performance...");
                
                // Create dummy form for Direct2D testing
                using var dummyForm = new System.Windows.Forms.Form();
                dummyForm.Show();
                dummyForm.Hide();
                
                using var renderer = new UI.DirectTreemapRenderer(dummyForm.Handle);
                
                // Convert results to test data
                var folderSizes = new List<UI.FolderSize>();
                foreach (var pair in scanResult.FolderSizeMap)
                {
                    folderSizes.Add(new UI.FolderSize { Path = pair.Key, Size = pair.Value });
                }
                
                // Update treemap
                renderer.UpdateTreemap(folderSizes, scanResult.TotalSizeBytes);
                
                // Measure frame rate
                int frames = 0;
                stopwatch.Restart();
                
                while (stopwatch.ElapsedMilliseconds < 1000)
                {
                    renderer.Render();
                    frames++;
                }
                
                stopwatch.Stop();
                result.VisualizationFPS = frames * 1000.0 / stopwatch.ElapsedMilliseconds;
                
                Console.WriteLine($"Visualization performance: {result.VisualizationFPS:F1} FPS");
                
                // 5. Stress test during high I/O if requested
                if (stressTest)
                {
                    Console.WriteLine("\nRunning stress test with high disk I/O...");
                    
                    // Create I/O load
                    var ioTask = Task.Run(() => GenerateDiskIO(driveLetter));
                    
                    // Run scan during I/O load
                    stopwatch.Restart();
                    
                    var stressScanResult = await scanner.ScanDriveAsync(driveLetter, default);
                    
                    stopwatch.Stop();
                    result.StressTestScanTimeMs = stopwatch.ElapsedMilliseconds;
                    
                    // Stop I/O load
                    await ioTask;
                    
                    Console.WriteLine($"Stress test scan completed in {result.StressTestScanTimeMs}ms");
                    
                    // Calculate overhead percentage
                    if (result.ScanTimeMs > 0)
                    {
                        result.StressTestOverheadPercent = 
                            (double)(result.StressTestScanTimeMs - result.ScanTimeMs) / 
                            result.ScanTimeMs * 100.0;
                            
                        Console.WriteLine($"Stress test overhead: {result.StressTestOverheadPercent:F1}%");
                    }
                }
                
                // 6. Final validation
                result.ValidationPassed = 
                    result.MeetsScanTimeRequirement && 
                    result.MeetsMemoryRequirement &&
                    result.VisualizationFPS >= 30.0; // Require at least 30 FPS
                
                Console.WriteLine($"\nOverall validation: {(result.ValidationPassed ? "PASSED" : "FAILED")}");
                
                // Summary report
                PrintSummary(result);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Benchmark failed: {ex.Message}");
                result.ValidationPassed = false;
                result.ErrorMessage = ex.Message;
            }
            
            return result;
        }
        
        /// <summary>
        /// Generate disk I/O load for stress testing
        /// </summary>
        private static async Task GenerateDiskIO(char driveLetter)
        {
            string testPath = $"{driveLetter}:\\SpaceReclaimerStressTest";
            string testFile = Path.Combine(testPath, "iotest.dat");
            
            try
            {
                // Create test directory if it doesn't exist
                Directory.CreateDirectory(testPath);
                
                // Generate I/O load with multiple tasks
                const int fileSize = 100 * 1024 * 1024; // 100MB
                const int bufferSize = 4096;
                var buffer = new byte[bufferSize];
                var random = new Random();
                
                var tasks = new List<Task>();
                
                // Create multiple writer tasks
                for (int i = 0; i < 4; i++)
                {
                    string file = Path.Combine(testPath, $"iotest_{i}.dat");
                    tasks.Add(Task.Run(() =>
                    {
                        using var fs = new FileStream(
                            file, 
                            FileMode.Create, 
                            FileAccess.Write, 
                            FileShare.None, 
                            bufferSize, 
                            FileOptions.WriteThrough);
                            
                        for (int j = 0; j < fileSize / bufferSize; j++)
                        {
                            random.NextBytes(buffer);
                            fs.Write(buffer, 0, buffer.Length);
                            fs.Flush(true);
                        }
                    }));
                }
                
                // Create multiple reader tasks
                for (int i = 0; i < 4; i++)
                {
                    int index = i;
                    tasks.Add(Task.Run(async () =>
                    {
                        // Wait for file to be partially written
                        await Task.Delay(100);
                        
                        string file = Path.Combine(testPath, $"iotest_{index}.dat");
                        
                        try
                        {
                            using var fs = new FileStream(
                                file, 
                                FileMode.Open, 
                                FileAccess.Read, 
                                FileShare.ReadWrite);
                                
                            for (int j = 0; j < 1000; j++)
                            {
                                fs.Position = random.Next(0, (int)Math.Max(fs.Length - bufferSize, 0));
                                await fs.ReadAsync(buffer, 0, buffer.Length);
                                await Task.Delay(5); // Short delay
                            }
                        }
                        catch
                        {
                            // Ignore errors, file might not be fully created yet
                        }
                    }));
                }
                
                // Run for 5 seconds
                await Task.Delay(5000);
                
                // Allow tasks to complete
                await Task.WhenAll(tasks.ToArray());
            }
            finally
            {
                // Cleanup
                try
                {
                    if (Directory.Exists(testPath))
                    {
                        Directory.Delete(testPath, true);
                    }
                }
                catch
                {
                    // Ignore cleanup errors
                }
            }
        }
        
        private static void PrintSummary(BenchmarkResult result)
        {
            Console.WriteLine("\n=== Benchmark Summary ===");
            Console.WriteLine($"Scan Time: {result.ScanTimeMs}ms {(result.MeetsScanTimeRequirement ? "âœ“" : "âœ—")}");
            Console.WriteLine($"Memory Usage: {FormatSize(result.PeakMemoryUsage)} {(result.MeetsMemoryRequirement ? "âœ“" : "âœ—")}");
            Console.WriteLine($"Visualization: {result.VisualizationFPS:F1} FPS {(result.VisualizationFPS >= 30.0 ? "âœ“" : "âœ—")}");
            
            if (result.StressTestScanTimeMs > 0)
            {
                Console.WriteLine($"Stress Test Overhead: {result.StressTestOverheadPercent:F1}% {(result.StressTestOverheadPercent < 50.0 ? "âœ“" : "âœ—")}");
            }
            
            Console.WriteLine($"Overall Validation: {(result.ValidationPassed ? "PASSED âœ“" : "FAILED âœ—")}");
            
            if (!string.IsNullOrEmpty(result.ErrorMessage))
            {
                Console.WriteLine($"Error: {result.ErrorMessage}");
            }
        }
        
        private static string FormatSize(long bytes)
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
    
    /// <summary>
    /// Benchmark result data
    /// </summary>
    public class BenchmarkResult
    {
        // Scan performance
        public long ScanTimeMs { get; set; }
        public long FilesScanned { get; set; }
        public long TotalBytes { get; set; }
        public bool MeetsScanTimeRequirement { get; set; }
        
        // Memory usage
        public long BaselineMemoryUsage { get; set; }
        public long PeakMemoryUsage { get; set; }
        public bool MeetsMemoryRequirement { get; set; }
        
        // Turbo mode
        public long TurboModeTimeMs { get; set; }
        
        // Visualization
        public double VisualizationFPS { get; set; }
        
        // Stress test
        public long StressTestScanTimeMs { get; set; }
        public double StressTestOverheadPercent { get; set; }
        
        // Overall
        public bool ValidationPassed { get; set; }
        public string ErrorMessage { get; set; }
    }
}


