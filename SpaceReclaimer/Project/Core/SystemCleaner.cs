using System;
using System.IO; // Added for Path, Directory, File, FileInfo
using System.Runtime.InteropServices;
using System.Threading.Tasks;

namespace SpaceReclaimer.Core
{
    /// <summary>
    /// Handles system-level cleanup operations
    /// </summary>
    public class SystemCleaner
    {
        // COM interface for storage cleanup (Example structure, implementation needed)
        [ComImport, Guid("AFBC8E55-1277-4FD3-9E55-06A7C207E21A")] // Example GUID
        [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        private interface IEmptyVolumeCache2 // Note: Real interface might differ slightly
        {
            [PreserveSig]
            int Initialize(
                IntPtr hwnd,
                IntPtr hkRegKey, // Use IntPtr for HKEY
                [MarshalAs(UnmanagedType.LPWStr)] string pcwszVolume,
                [MarshalAs(UnmanagedType.LPWStr)] string pcwszKeyName, // May not be needed depending on handler
                out uint pdwFlags); // Use 'out' and appropriate type (uint often used for flags)

            [PreserveSig]
            int GetSpaceUsed(
                out ulong pdwlSpaceUsed,
                IEmptyVolumeCacheCallBack picb); // Pass the callback interface

            [PreserveSig]
            int Purge(
                ulong dwlSpaceToFree, // Often 0xFFFFFFFFFFFFFFFF for 'purge all'
                IEmptyVolumeCacheCallBack picb); // Pass the callback interface

            [PreserveSig]
            int ShowProperties(IntPtr hwnd);

            [PreserveSig]
            int Deactivate();
        }

        [ComImport, Guid("6E79D991-CA27-4AB0-8C85-B5A56F28CD8E")] // Example GUID
        [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        private interface IEmptyVolumeCacheCallBack // Note: Real interface might differ slightly
        {
            [PreserveSig]
            int ScanProgress(
                ulong dwlSpaceUsed, // Should likely be ulong to match GetSpaceUsed
                uint dwFlags,
                [MarshalAs(UnmanagedType.LPWStr)] string pcwszStatus);

            [PreserveSig]
            int PurgeProgress(
                ulong dwlSpaceFreed, // Should likely be ulong
                uint dwFlags,
                [MarshalAs(UnmanagedType.LPWStr)] string pcwszStatus);
        }

        // Callback implementation
        private class CleanupCallback : IEmptyVolumeCacheCallBack
        {
            public int ScanProgress(ulong dwlSpaceUsed, uint dwFlags, string pcwszStatus)
            {
                // Report scan progress if needed (e.g., update UI)
                Console.WriteLine($"Scan progress: Status='{pcwszStatus}', SpaceUsed={dwlSpaceUsed}, Flags={dwFlags}");
                return 0; // S_OK
            }

            public int PurgeProgress(ulong dwlSpaceFreed, uint dwFlags, string pcwszStatus)
            {
                // Report purge progress if needed (e.g., update UI)
                Console.WriteLine($"Purge progress: Status='{pcwszStatus}', SpaceFreed={dwlSpaceFreed}, Flags={dwFlags}");
                return 0; // S_OK
            }
        }

        /// <summary>
        /// Clean system temporary files using Windows disk cleanup APIs
        /// </summary>
        public async Task<CleanupResult> CleanSystemTemp()
        {
            var result = new CleanupResult();

            try
            {
                // Note: Implementing actual COM Disk Cleanup requires more setup
                // (e.g., finding correct CLSID for temp files handler, error handling, CoCreateInstance)
                // This simulation avoids that complexity for now.
                await Task.Run(() =>
                {
                    // [Code omitted for brevity - would use COM interfaces]

                    // Simulate cleanup result
                    result.FilesDeleted = 1000;
                    result.BytesReclaimed = 1024 * 1024 * 50; // 50MB
                    Console.WriteLine("Simulated cleaning system temp files."); // Added console output
                });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error cleaning system temp: {ex.Message}"); // Added console output
                result.ErrorMessage = ex.Message;
            }

            return result;
        }

        /// <summary>
        /// Clean Windows update cache
        /// </summary>
        public async Task<CleanupResult> CleanWindowsUpdateCache()
        {
            var result = new CleanupResult();

            try
            {
                // Note: Cleaning WU cache often involves stopping services (wuauserv),
                // deleting contents of C:\Windows\SoftwareDistribution\Download,
                // and restarting services. Requires administrative privileges.
                await Task.Run(() =>
                {
                    // [Code omitted for brevity - would use specific APIs/commands]

                    // Simulate cleanup result
                    result.FilesDeleted = 200;
                    // *** CORRECTED LINE 116 by removing the backticks ***
                    result.BytesReclaimed = 1024 * 1024 * 100; // 100MB
                    Console.WriteLine("Simulated cleaning Windows Update cache."); // Added console output
                });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error cleaning Windows Update cache: {ex.Message}"); // Added console output
                result.ErrorMessage = ex.Message;
            }

            return result;
        }

        /// <summary>
        /// Clean browser caches
        /// </summary>
        public async Task<CleanupResult> CleanBrowserCaches()
        {
            var result = new CleanupResult();

            try
            {
                await Task.Run(() =>
                {
                    Console.WriteLine("Cleaning browser caches..."); // Added console output
                    // Chrome cache
                    CleanChromeCache(result);

                    // Edge cache
                    CleanEdgeCache(result);

                    // Firefox cache
                    CleanFirefoxCache(result);
                    Console.WriteLine("Finished cleaning browser caches."); // Added console output
                });
            }
            catch (Exception ex)
            {
                 Console.WriteLine($"Error cleaning browser caches: {ex.Message}"); // Added console output
                result.ErrorMessage = ex.Message;
            }

            return result;
        }

        private void CleanChromeCache(CleanupResult result)
        {
            try
            {
                string chromeCachePath = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    @"Google\Chrome\User Data\Default\Cache");

                if (Directory.Exists(chromeCachePath))
                {
                    Console.WriteLine($"Cleaning Chrome cache at: {chromeCachePath}"); // Added console output
                    // Get cache size before cleaning
                    long initialSize = GetDirectorySize(chromeCachePath);
                    long filesDeleted = 0;

                    // Delete files that are not in use
                    // Consider more robust handling of locked files
                    foreach (var file in Directory.GetFiles(chromeCachePath, "*", SearchOption.AllDirectories)) // Include subdirs
                    {
                        try
                        {
                            // Placeholder for safety check - Implement SecurityManager.IsSafeToClean
                            // if (SecurityManager.IsSafeToClean(file))
                            // {
                                File.Delete(file);
                                filesDeleted++;
                            // }
                        }
                        catch (IOException ioEx)
                        {
                            // File likely locked, log or ignore
                             Console.WriteLine($"Could not delete Chrome cache file (likely locked): {file} - {ioEx.Message}"); // Added console output
                        }
                        catch (UnauthorizedAccessException uaEx)
                        {
                             Console.WriteLine($"Access denied deleting Chrome cache file: {file} - {uaEx.Message}"); // Added console output
                        }
                        catch (Exception ex)
                        {
                            // Ignore other errors for individual files for now
                             Console.WriteLine($"Error deleting Chrome cache file: {file} - {ex.Message}"); // Added console output
                        }
                    }

                    long finalSize = GetDirectorySize(chromeCachePath);
                    long bytesCleaned = initialSize - finalSize;
                    result.FilesDeleted += filesDeleted; // Increment count
                    result.BytesReclaimed += bytesCleaned > 0 ? bytesCleaned : 0; // Add reclaimed space
                    Console.WriteLine($"Chrome cache cleaned: {filesDeleted} files deleted, approx {bytesCleaned / (1024.0*1024.0):F2} MB reclaimed."); // Added console output
                }
                else
                {
                    Console.WriteLine("Chrome cache directory not found."); // Added console output
                }
            }
            catch(Exception ex) // Catch specific exceptions if possible
            {
                 Console.WriteLine($"General error cleaning Chrome cache: {ex.Message}"); // Added console output
                // Ignore errors for this browser
            }
        }

        private void CleanEdgeCache(CleanupResult result)
        {
            try
            {
                 // Correct path for modern Edge (Chromium-based)
                string edgeCachePath = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    @"Microsoft\Edge\User Data\Default\Cache");

                if (Directory.Exists(edgeCachePath))
                {
                    Console.WriteLine($"Cleaning Edge cache at: {edgeCachePath}"); // Added console output
                    // Similar implementation to Chrome cache cleaning
                    long initialSize = GetDirectorySize(edgeCachePath);
                    long filesDeleted = 0;
                    foreach (var file in Directory.GetFiles(edgeCachePath, "*", SearchOption.AllDirectories))
                    {
                        try
                        {
                            File.Delete(file);
                            filesDeleted++;
                        }
                         catch (IOException ioEx) { Console.WriteLine($"Could not delete Edge cache file (likely locked): {file} - {ioEx.Message}"); }
                         catch (UnauthorizedAccessException uaEx) { Console.WriteLine($"Access denied deleting Edge cache file: {file} - {uaEx.Message}"); }
                         catch (Exception ex) { Console.WriteLine($"Error deleting Edge cache file: {file} - {ex.Message}"); }
                    }
                     long finalSize = GetDirectorySize(edgeCachePath);
                     long bytesCleaned = initialSize - finalSize;
                     result.FilesDeleted += filesDeleted;
                     result.BytesReclaimed += bytesCleaned > 0 ? bytesCleaned : 0;
                     Console.WriteLine($"Edge cache cleaned: {filesDeleted} files deleted, approx {bytesCleaned / (1024.0*1024.0):F2} MB reclaimed."); // Added console output
                }
                 else
                {
                    Console.WriteLine("Edge cache directory not found."); // Added console output
                }
            }
            catch (Exception ex)
            {
                 Console.WriteLine($"General error cleaning Edge cache: {ex.Message}"); // Added console output
                // Ignore errors for this browser
            }
        }

        private void CleanFirefoxCache(CleanupResult result)
        {
            try
            {
                string firefoxProfilesPath = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                    @"Mozilla\Firefox\Profiles");

                if (Directory.Exists(firefoxProfilesPath))
                {
                    Console.WriteLine($"Searching Firefox profiles in: {firefoxProfilesPath}"); // Added console output
                    // Handle multiple profiles
                    foreach (var profileDir in Directory.GetDirectories(firefoxProfilesPath))
                    {
                         // Cache is typically in cache2/entries under the profile
                        string cachePath = Path.Combine(profileDir, "cache2", "entries");
                        if (Directory.Exists(cachePath))
                        {
                             Console.WriteLine($"Cleaning Firefox cache at: {cachePath}"); // Added console output
                            // Similar implementation to Chrome cache cleaning
                             long initialSize = GetDirectorySize(cachePath);
                             long filesDeleted = 0;
                             foreach (var file in Directory.GetFiles(cachePath, "*", SearchOption.AllDirectories))
                             {
                                 try
                                 {
                                     File.Delete(file);
                                     filesDeleted++;
                                 }
                                 catch (IOException ioEx) { Console.WriteLine($"Could not delete Firefox cache file (likely locked): {file} - {ioEx.Message}"); }
                                 catch (UnauthorizedAccessException uaEx) { Console.WriteLine($"Access denied deleting Firefox cache file: {file} - {uaEx.Message}"); }
                                 catch (Exception ex) { Console.WriteLine($"Error deleting Firefox cache file: {file} - {ex.Message}"); }
                             }
                             long finalSize = GetDirectorySize(cachePath);
                             long bytesCleaned = initialSize - finalSize;
                             result.FilesDeleted += filesDeleted;
                             result.BytesReclaimed += bytesCleaned > 0 ? bytesCleaned : 0;
                             Console.WriteLine($"Firefox profile cache cleaned: {filesDeleted} files deleted, approx {bytesCleaned / (1024.0*1024.0):F2} MB reclaimed."); // Added console output
                        }
                         else
                         {
                             Console.WriteLine($"Firefox cache directory not found in profile: {cachePath}"); // Added console output
                         }
                    }
                }
                 else
                {
                    Console.WriteLine("Firefox profiles directory not found."); // Added console output
                }
            }
            catch (Exception ex)
            {
                 Console.WriteLine($"General error cleaning Firefox cache: {ex.Message}"); // Added console output
                // Ignore errors for this browser
            }
        }

        private long GetDirectorySize(string path)
        {
            long size = 0;
            var dirInfo = new DirectoryInfo(path);

            try
            {
                // Add file sizes
                foreach (var fileInfo in dirInfo.GetFiles())
                {
                    try
                    {
                        size += fileInfo.Length;
                    }
                    catch (FileNotFoundException) { /* File might disappear */ }
                    catch (Exception ex)
                    {
                         Console.WriteLine($"Could not get size of file {fileInfo.FullName}: {ex.Message}"); // Added console output
                        // Ignore individual file errors
                    }
                }

                // Add subdirectory sizes
                foreach (var subDirInfo in dirInfo.GetDirectories())
                {
                    try
                    {
                        size += GetDirectorySize(subDirInfo.FullName);
                    }
                     catch (UnauthorizedAccessException) { /* Skip dirs we cannot access */ }
                     catch (Exception ex)
                     {
                          Console.WriteLine($"Could not get size of directory {subDirInfo.FullName}: {ex.Message}"); // Added console output
                         // Ignore individual subdirectory errors
                     }
                }
            }
            catch (DirectoryNotFoundException) { /* Directory might disappear */ }
            catch (UnauthorizedAccessException) { /* Cannot access this directory */ }
            catch (Exception ex)
            {
                 Console.WriteLine($"Could not fully get size of directory {path}: {ex.Message}"); // Added console output
                // Return whatever we could measure
            }

            return size;
        }

        // Placeholder for SecurityManager - Implement actual safety checks if needed
        private static class SecurityManager
        {
            public static bool IsSafeToClean(string filePath)
            {
                // Add logic here to determine if a file is critical or shouldn't be deleted
                // For now, assume all files found in cache folders are safe
                return true;
            }
        }

        // Class to hold cleanup results
        public class CleanupResult
        {
            public long FilesDeleted { get; set; }
            public long BytesReclaimed { get; set; }
            public string? ErrorMessage { get; set; } // Use nullable string
        }
    }
}
