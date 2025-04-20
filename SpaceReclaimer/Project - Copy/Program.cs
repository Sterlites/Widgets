using System;
using System.IO;
using System.Windows.Forms;
using System.Threading.Tasks;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using SpaceReclaimer.Core;
using SpaceReclaimer.UI;

namespace SpaceReclaimer
{
    public class Program
    {
        [STAThread]
        public static void Main(string[] args)
        {
            // Check for CLI mode
            if (args.Length > 0 && args[0].StartsWith("/"))
            {
                HandleCommandLine(args);
                return;
            }
            
            // Start GUI mode
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new MainForm());
        }
        
        static void HandleCommandLine(string[] args)
        {
            // Parse command line arguments
            bool autoMode = false;
            string[] targets = null;
            
            foreach (var arg in args)
            {
                if (arg.Equals("/auto", StringComparison.OrdinalIgnoreCase))
                {
                    autoMode = true;
                }
                else if (arg.StartsWith("/target:", StringComparison.OrdinalIgnoreCase))
                {
                    string targetList = arg.Substring("/target:".Length);
                    targets = targetList.Split(',');
                }
            }
            
            if (autoMode && targets != null)
            {
                // Execute in silent mode
                Console.WriteLine("SpaceReclaimer running in silent mode");
                
                using var scanner = new TurboScanner();
                
                foreach (var target in targets)
                {
                    if (target.Equals("system", StringComparison.OrdinalIgnoreCase))
                    {
                        // Clean system temp files
                        Console.WriteLine("Cleaning system temp files...");
                        var cleaner = new SystemCleaner();
                        var result = cleaner.CleanSystemTemp().Result;
                        Console.WriteLine($"Cleaned {FormatSize(result.BytesReclaimed)} of system temp files");
                    }
                    else if (target.Equals("temp", StringComparison.OrdinalIgnoreCase))
                    {
                        // Clean user temp files
                        Console.WriteLine("Cleaning user temp files...");
                        var cleaner = new TempCleaner();
                        var result = cleaner.CleanUserTemp().Result;
                        Console.WriteLine($"Cleaned {FormatSize(result.BytesReclaimed)} of user temp files");
                    }
                    else if (target.Length == 1 && char.IsLetter(target[0]))
                    {
                        // Scan drive
                        char drive = char.ToUpper(target[0]);
                        Console.WriteLine($"Scanning drive {drive}:...");
                        var result = scanner.ScanDriveAsync(drive, default).Result;
                        Console.WriteLine($"Found {result.TotalFilesFound} files totaling {FormatSize(result.TotalSizeBytes)}");
                        Console.WriteLine($"Cleanup potential: {FormatSize(result.CleanupCandidates.Length * 1024 * 1024)} (estimated)");
                    }
                }
            }
            else
            {
                // Show command line usage
                Console.WriteLine("SpaceReclaimer Command Line Usage:");
                Console.WriteLine("  /auto                - Run in silent mode");
                Console.WriteLine("  /target:system,temp  - Specify cleanup targets");
                Console.WriteLine("  Example: spacerc /auto /target:system,temp,C");
            }
        }
        
        static string FormatSize(long bytes)
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
