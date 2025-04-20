using System;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Threading.Tasks;
using System.Text.Json;

namespace SpaceReclaimer.Core
{
    /// <summary>
    /// Auto-update implementation using Windows Package Manager
    /// </summary>
    public class AutoUpdater
    {
        private const string PackageId = "YourCompany.SpaceReclaimer";
        private const string VersionEndpoint = "https://example.com/api/version";
        
        /// <summary>
        /// Checks for updates using WinGet
        /// </summary>
        public async Task<UpdateCheckResult> CheckForUpdatesAsync()
        {
            var result = new UpdateCheckResult();
            
            try
            {
                // First check if WinGet is available
                bool wingetAvailable = IsWinGetAvailable();
                if (!wingetAvailable)
                {
                    result.UpdateAvailable = false;
                    result.ErrorMessage = "Windows Package Manager not available";
                    return result;
                }
                
                // Check current version
                string currentVersion = GetCurrentVersion();
                
                // Check latest version from server
                string latestVersion = await GetLatestVersionAsync();
                
                if (string.IsNullOrEmpty(latestVersion))
                {
                    result.UpdateAvailable = false;
                    result.ErrorMessage = "Could not determine latest version";
                    return result;
                }
                
                // Compare versions
                bool updateAvailable = IsUpdateAvailable(currentVersion, latestVersion);
                
                result.CurrentVersion = currentVersion;
                result.LatestVersion = latestVersion;
                result.UpdateAvailable = updateAvailable;
                
                return result;
            }
            catch (Exception ex)
            {
                result.UpdateAvailable = false;
                result.ErrorMessage = ex.Message;
                return result;
            }
        }
        
        /// <summary>
        /// Performs automatic update using WinGet
        /// </summary>
        public async Task<bool> PerformUpdateAsync()
        {
            try
            {
                var startInfo = new ProcessStartInfo
                {
                    FileName = "winget",
                    Arguments = $"upgrade {PackageId} --silent",
                    CreateNoWindow = true,
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true
                };
                
                var process = Process.Start(startInfo);
                await process.WaitForExitAsync();
                
                return process.ExitCode == 0;
            }
            catch
            {
                return false;
            }
        }
        
        private bool IsWinGetAvailable()
        {
            try
            {
                var startInfo = new ProcessStartInfo
                {
                    FileName = "winget",
                    Arguments = "--version",
                    CreateNoWindow = true,
                    UseShellExecute = false,
                    RedirectStandardOutput = true
                };
                
                var process = Process.Start(startInfo);
                process.WaitForExit();
                
                return process.ExitCode == 0;
            }
            catch
            {
                return false;
            }
        }
        
        private string GetCurrentVersion()
        {
            return typeof(AutoUpdater).Assembly.GetName().Version.ToString();
        }
        
        private async Task<string> GetLatestVersionAsync()
        {
            using var client = new HttpClient();
            var response = await client.GetStringAsync(VersionEndpoint);
            
            using var doc = JsonDocument.Parse(response);
            return doc.RootElement.GetProperty("version").GetString();
        }
        
        private bool IsUpdateAvailable(string currentVersion, string latestVersion)
        {
            var current = Version.Parse(currentVersion);
            var latest = Version.Parse(latestVersion);
            
            return latest > current;
        }
    }
    
    public class UpdateCheckResult
    {
        public bool UpdateAvailable { get; set; }
        public string CurrentVersion { get; set; }
        public string LatestVersion { get; set; }
        public string ErrorMessage { get; set; }
    }
}
