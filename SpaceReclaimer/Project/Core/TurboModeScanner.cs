using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Win32.SafeHandles; // Needed for SafeFileHandle

// *** REMOVED BACKTICKS FROM ORIGINAL LINE 8 ***
namespace SpaceReclaimer.Core
{
    /// <summary>
    /// Implements ultra-fast "Turbo Mode" scanning combining multiple techniques
    /// </summary>
    public sealed class TurboModeScanner : IDisposable // Implement IDisposable if using SafeHandles
    {
        //region Win32 P/Invoke Declarations

        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern SafeFileHandle CreateFile(
            string lpFileName,
            uint dwDesiredAccess,
            uint dwShareMode,
            IntPtr lpSecurityAttributes,
            uint dwCreationDisposition,
            uint dwFlagsAndAttributes,
            IntPtr hTemplateFile);

        [DllImport("kernel32.dll", ExactSpelling = true, SetLastError = true, CharSet = CharSet.Auto)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool DeviceIoControl(
            SafeFileHandle hDevice,
            uint dwIoControlCode,
            IntPtr lpInBuffer, // Use IntPtr for structs passed by pointer/ref if not using specific marshalling
            uint nInBufferSize,
            ref USN_JOURNAL_DATA lpOutBuffer, // Example for Query USN Journal (adjust based on control code)
            uint nOutBufferSize,
            ref uint lpBytesReturned,
            IntPtr lpOverlapped);

        [DllImport("kernel32.dll", ExactSpelling = true, SetLastError = true, CharSet = CharSet.Auto)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool DeviceIoControl(
           SafeFileHandle hDevice,
           uint dwIoControlCode,
           ref MFT_ENUM_DATA lpInBuffer, // Specific overload for Read USN Journal Input
           uint nInBufferSize,
           IntPtr lpOutBuffer, // Buffer to receive records
           uint nOutBufferSize,
           ref uint lpBytesReturned,
           IntPtr lpOverlapped);

        // File Access constants
        private const uint GENERIC_READ = 0x80000000;
        private const uint FILE_SHARE_READ = 0x00000001;
        private const uint FILE_SHARE_WRITE = 0x00000002;
        private const uint OPEN_EXISTING = 3;

        // Win32 constants for NTFS journal
        private const uint FSCTL_QUERY_USN_JOURNAL = 0x00090068; // Corrected common code
        private const uint FSCTL_READ_USN_JOURNAL = 0x0009002B; // Corrected common code

        //endregion

        //region COM Definitions (Disk Cleanup)

        // COM interface for storage cleanup callback
        [ComImport, Guid("6E79D991-CA27-4AB0-8C85-B5A56F28CD8E")] // Example GUID for IEmptyVolumeCacheCallBack
        [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        private interface IEmptyVolumeCacheCallBack
        {
            [PreserveSig]
            int ScanProgress(
                ulong dwlSpaceUsed, // Use ulong for sizes
                uint dwFlags, // Flags defined by specific handler
                [MarshalAs(UnmanagedType.LPWStr)] string pcwszStatus);

            [PreserveSig]
            int PurgeProgress(
                ulong dwlSpaceFreed, // Use ulong for sizes
                uint dwFlags, // Flags defined by specific handler
                [MarshalAs(UnmanagedType.LPWStr)] string pcwszStatus);
        }

        // COM interface for storage cleanup handler
        [ComImport, Guid("8369AB23-CAD4-11D0-8217-00C04FB68004")] // Example GUID for IEmptyVolumeCache
        [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        private interface IEmptyVolumeCache // Simplified version for example
        {
            [PreserveSig]
            int Initialize(
                IntPtr hkRegKeyRoot, // HKEY root key
                [MarshalAs(UnmanagedType.LPWStr)] string pcwszVolume,
                [MarshalAs(UnmanagedType.LPWStr)] out string ppwszDisplayName,
                [MarshalAs(UnmanagedType.LPWStr)] out string ppwszDescription,
                ref uint pdwFlags); // Use ref uint for flags

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
            int Deactivate(out uint pdwFlags);
        }
        // Note: IEmptyVolumeCache2 exists with more methods, but basic cleanup uses IEmptyVolumeCache

        //endregion

        //region NTFS Journal Structures

        [StructLayout(LayoutKind.Sequential)]
        private struct USN_JOURNAL_DATA // Keep struct names matching WinAPI if possible
        {
            public ulong UsnJournalID;
            public ulong FirstUsn;
            public ulong NextUsn;
            public ulong LowestValidUsn;
            public ulong MaxUsn;
            public ulong MaximumSize;
            public ulong AllocationDelta;
            public ushort MinSupportedMajorVersion; // Added missing fields based on common struct def
            public ushort MaxSupportedMajorVersion; // Added missing fields based on common struct def
        }

        [StructLayout(LayoutKind.Sequential, Pack = 1)] // Ensure packing if needed
        private struct MFT_ENUM_DATA_V0 // V0 structure for ReadUsnJournal
        {
            public ulong StartFileReferenceNumber;
            public ulong LowUsn;
            public ulong HighUsn;
        }

        // Use MFT_ENUM_DATA_V0 for Win7/Server2008R2 and later when calling ReadUsnJournal
        // Use MFT_ENUM_DATA for older OS versions if needed (different structure)
        private struct MFT_ENUM_DATA // Alias for clarity
        {
            public ulong StartFileReferenceNumber;
            public ulong LowUsn;
            public ulong HighUsn;
        }


        // Structure definition from MSDN for USN_RECORD_V2 (WinXP/2003+)
        // Use USN_RECORD_V3 for Win8/2012+ if needing 128-bit file IDs
        [StructLayout(LayoutKind.Sequential)]
        private struct USN_RECORD_V2
        {
            public uint RecordLength;
            public ushort MajorVersion; // Should be 2 for this struct
            public ushort MinorVersion; // Should be 0
            public ulong FileReferenceNumber;
            public ulong ParentFileReferenceNumber;
            public long Usn; // Use long for signed USN
            public long TimeStamp; // FILETIME format
            public uint Reason;
            public uint SourceInfo;
            public uint SecurityId;
            public uint FileAttributes;
            public ushort FileNameLength; // Length in bytes
            public ushort FileNameOffset; // Offset from start of record
            // FileName (variable length) follows here
        }
        // Use alias for simplicity in code
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


        //endregion

        // Placeholder implementation for the callback
        private class EmptyVolumeCacheCallback : IEmptyVolumeCacheCallBack
        {
            public int ScanProgress(ulong dwlSpaceUsed, uint dwFlags, string pcwszStatus)
            {
                Console.WriteLine($"Disk Cleanup Scan: Status='{pcwszStatus}', SpaceUsed={dwlSpaceUsed}, Flags={dwFlags}");
                // Update UI or log progress
                return 0; // S_OK
            }

            public int PurgeProgress(ulong dwlSpaceFreed, uint dwFlags, string pcwszStatus)
            {
                Console.WriteLine($"Disk Cleanup Purge: Status='{pcwszStatus}', SpaceFreed={dwlSpaceFreed}, Flags={dwFlags}");
                // Update UI or log progress
                return 0; // S_OK
            }
        }

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
                    // NOTE: Actual COM usage requires CoCreateInstance, finding specific handlers by CLSID, etc.
                    // This is a simplified placeholder call.
                    ulong cleanupSpaceUsed = RunWindowsDiskCleanup(driveLetter, token);
                    result.SystemTempBytes = cleanupSpaceUsed;
                }, token));
            }

            // 2. Start NTFS journal analysis in parallel
            tasks.Add(Task.Run(() =>
            {
                var recentTempFiles = AnalyzeNtfsJournal(
                    driveLetter,
                    TimeSpan.FromDays(7), // Example: Look for files modified in last 7 days
                    token);

                result.RecentTempFiles = recentTempFiles;
            }, token));

            // 3. Start prefetch analysis in parallel if requested
            if (includePrefetch)
            {
                tasks.Add(Task.Run(() =>
                {
                    // NOTE: Prefetch parsing requires understanding complex binary formats or using libraries.
                    var prefetchPredictions = AnalyzePrefetchForLargeFiles(token);
                    result.PrefetchPredictions = prefetchPredictions;
                }, token));
            }

            // Wait for all parallel tasks to complete
            try
            {
                 await Task.WhenAll(tasks);
            }
            catch (OperationCanceledException)
            {
                 Console.WriteLine("Turbo scan cancelled.");
                 // Handle cancellation appropriately
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error during Turbo scan parallel execution: {ex}");
                // Handle other potential errors from tasks
            }


            return result;
        }

        /// <summary>
        /// Uses COM interfaces to calculate space used by Windows Disk Cleanup handlers.
        /// Placeholder - Actual implementation needs COM activation and handler iteration.
        /// </summary>
        private ulong RunWindowsDiskCleanup(char driveLetter, CancellationToken token)
        {
            Console.WriteLine("Simulating Windows Disk Cleanup scan...");
            // Create callback for disk cleanup progress
            var callback = new EmptyVolumeCacheCallback();
            ulong totalSpaceUsed = 0;

            // TODO: Implement actual COM logic:
            // 1. Iterate through registered cleanup handlers under a specific registry key.
            // 2. For each handler CLSID:
            //    a. CoCreateInstance to get IEmptyVolumeCache interface.
            //    b. Call Initialize (passing volume like "C:\").
            //    c. Call GetSpaceUsed (passing callback). Add result to totalSpaceUsed.
            //    d. Call Deactivate.
            //    e. Release COM object.
            // 3. Handle HRESULT errors from COM calls.
            // 4. Check CancellationToken periodically.

            // Simulate some space found
            Task.Delay(500, token).Wait(token); // Simulate work
            totalSpaceUsed = 1024 * 1024 * 150; // 150 MB example
            Console.WriteLine($"Simulated Disk Cleanup found: {totalSpaceUsed / (1024*1024)} MB");

            return totalSpaceUsed;
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
            SafeFileHandle volumeHandle = null; // Use SafeHandle for safety

            try
            {
                // Open volume for direct access
                string volumePath = $"\\\\.\\{driveLetter}:";
                volumeHandle = CreateFile(
                    volumePath,
                    GENERIC_READ, // Use GENERIC_READ or specific rights needed
                    FILE_SHARE_READ | FILE_SHARE_WRITE,
                    IntPtr.Zero,
                    OPEN_EXISTING,
                    0, // FILE_ATTRIBUTE_NORMAL often used here
                    IntPtr.Zero);

                if (volumeHandle.IsInvalid)
                {
                    int error = Marshal.GetLastWin32Error();
                    Console.WriteLine($"Failed to open volume {volumePath}. Error code: {error}");
                    return results; // Cannot proceed
                }

                // Query USN journal data
                var journalData = new USN_JOURNAL_DATA();
                uint bytesReturned = 0;

                // Use the correct DeviceIoControl overload for query
                bool success = DeviceIoControl(
                    volumeHandle,
                    FSCTL_QUERY_USN_JOURNAL,
                    IntPtr.Zero, // No input buffer for query
                    0,
                    ref journalData, // Output buffer is the struct
                    (uint)Marshal.SizeOf<USN_JOURNAL_DATA>(),
                    ref bytesReturned,
                    IntPtr.Zero);

                if (!success)
                {
                    int error = Marshal.GetLastWin32Error();
                    Console.WriteLine($"Failed to query USN journal. Error code: {error}");
                    return results;
                }

                // Prepare parameters for reading the journal
                var enumData = new MFT_ENUM_DATA // Use V0 struct for ReadUsnJournal
                {
                    StartFileReferenceNumber = 0, // Start from beginning of MFT
                    LowUsn = journalData.LowestValidUsn, // Start from the lowest valid USN
                    HighUsn = journalData.NextUsn // Read up to the current USN
                };


                // Allocate buffer for reading journal records
                const int bufferSize = 64 * 1024; // 64KB buffer is common
                IntPtr buffer = Marshal.AllocHGlobal(bufferSize);

                try
                {
                    DateTime cutoffTime = DateTime.UtcNow.Subtract(maxAge); // Use UTC for FILETIME comparison

                    // Read USN journal records in batches
                    while (!token.IsCancellationRequested)
                    {
                        bytesReturned = 0;
                        // Use the correct DeviceIoControl overload for read
                        success = DeviceIoControl(
                            volumeHandle,
                            FSCTL_READ_USN_JOURNAL,
                            ref enumData, // Input buffer is the enum data struct
                            (uint)Marshal.SizeOf<MFT_ENUM_DATA>(),
                            buffer, // Output buffer pointer
                            bufferSize,
                            ref bytesReturned,
                            IntPtr.Zero);

                        if (!success)
                        {
                            int error = Marshal.GetLastWin32Error();
                            // ERROR_JOURNAL_ENTRY_DELETED or ERROR_WRITE_PROTECT might mean end of useful data
                             if (error == 1179 || error == 19) break; // Stop on expected end conditions
                            Console.WriteLine($"Failed to read USN journal. Error code: {error}");
                            break; // Stop on other errors
                        }

                         // First 8 bytes of the buffer contain the next USN to start reading from.
                         // Records start after these 8 bytes.
                        if (bytesReturned <= 8)
                        {
                            break; // No more records in this batch
                        }

                        long nextUsn = Marshal.ReadInt64(buffer, 0); // Read the next starting USN

                        // Process journal records within the buffer
                        int offset = 8; // Start processing after the USN
                        while (offset < bytesReturned)
                        {
                            // Get pointer to the current record
                            IntPtr currentRecordPtr = IntPtr.Add(buffer, offset);
                            // Read just the RecordLength first to avoid reading past buffer end
                            uint recordLength = (uint)Marshal.ReadInt32(currentRecordPtr, 0);

                            if (recordLength == 0 || (offset + recordLength) > bytesReturned)
                            {
                                Console.WriteLine("Warning: Invalid record length encountered or record spans buffer boundary.");
                                break; // Avoid reading invalid memory
                            }


                            // Marshal the structure safely
                            USN_RECORD record = (USN_RECORD)Marshal.PtrToStructure(currentRecordPtr, typeof(USN_RECORD));

                            // Check record version (expect V2)
                            if (record.MajorVersion == 2)
                            {
                                // Check if it's a potentially interesting temp file based on criteria
                                if (IsTempFileRecord(record, currentRecordPtr, cutoffTime))
                                {
                                    var fileInfo = ExtractTempFileInfo(record, currentRecordPtr);
                                    if (fileInfo != null)
                                    {
                                        // TODO: Get file size (requires opening file by ID or path lookup)
                                        // This is the slow part USN Journal doesn't store size.
                                        // fileInfo.EstimatedSize = GetSizeByFileId(volumeHandle, record.FileReferenceNumber);
                                        results.Add(fileInfo);
                                    }
                                }
                            }
                            else
                            {
                                 Console.WriteLine($"Skipping USN Record with MajorVersion {record.MajorVersion}");
                            }


                            // Move to the next record
                            offset += (int)recordLength;
                        }

                        // Update the starting USN for the next read operation
                        enumData.LowUsn = nextUsn;

                        // Apply early termination if we have enough results (optional)
                        // if (results.Count > 10000) break;
                    }
                }
                finally
                {
                    Marshal.FreeHGlobal(buffer); // Ensure buffer is always freed
                }
            }
             catch (Exception ex)
            {
                Console.WriteLine($"Exception during NTFS Journal Analysis: {ex}");
                // Log or handle exception
            }
            finally
            {
                 volumeHandle?.Dispose(); // Ensure handle is always closed/disposed
            }


            Console.WriteLine($"NTFS Journal scan found {results.Count} potential temp files.");
            return results;
        }


        /// <summary>
        /// Analyze Windows Prefetch files to predict large files.
        /// Placeholder - Actual implementation requires parsing prefetch file format.
        /// </summary>
        private List<PrefetchPrediction> AnalyzePrefetchForLargeFiles(CancellationToken token)
        {
            Console.WriteLine("Simulating Prefetch analysis...");
            var results = new List<PrefetchPrediction>();
            string prefetchPath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.Windows), // Usually C:\Windows
                "Prefetch");

            if (!Directory.Exists(prefetchPath))
            {
                Console.WriteLine("Prefetch directory not found.");
                return results;
            }

            try
            {
                 // Get all prefetch files
                 var prefetchFiles = Directory.GetFiles(prefetchPath, "*.pf");
                 Console.WriteLine($"Found {prefetchFiles.Length} prefetch files.");

                // TODO: Implement actual Prefetch parsing (.pf file format)
                // This involves reading binary data, understanding structures like
                // SCCA_HEADER, FILE_METRICS_ARRAY, FILENAMES_STRINGS etc.
                // Libraries exist for this (e.g., Eric Zimmerman's tools source code)

                 // Simulate finding some predictions
                 foreach (var file in prefetchFiles.Take(5)) // Limit simulation
                 {
                     if (token.IsCancellationRequested) break;
                     // Simulate parsing one file
                     Task.Delay(50, token).Wait(token);
                     results.Add(new PrefetchPrediction
                     {
                         FilePath = $"C:\\Temp\\SimulatedLargeFile_From_{Path.GetFileName(file)}.tmp",
                         EstimatedSize = (ulong)new Random().Next(10, 200) * 1024 * 1024, // 10-200 MB example
                         LastAccessed = DateTime.Now.AddDays(-new Random().Next(1, 30)),
                         Confidence = 0.75 + (new Random().NextDouble() * 0.2) // 0.75 - 0.95 confidence
                     });
                 }
            }
            catch (Exception ex)
            {
                 Console.WriteLine($"Error accessing or parsing Prefetch files: {ex.Message}");
                 // Log or handle exception
            }


            Console.WriteLine($"Prefetch analysis simulated {results.Count} predictions.");
            return results;
        }

        // Helper to check if a USN record looks like a temp file
        private bool IsTempFileRecord(USN_RECORD record, IntPtr recordPtr, DateTime cutoffTime)
        {
            // Convert FILETIME (100-nanosecond intervals since Jan 1, 1601 UTC) to DateTime
            DateTime fileTimeUtc = DateTime.FromFileTimeUtc(record.TimeStamp);

            // Check if it's recent enough
            if (fileTimeUtc < cutoffTime)
            {
                return false; // Too old
            }

            // Check common temp file attributes (optional, might filter too much)
            // if ((record.FileAttributes & (uint)FileAttributes.Temporary) == 0) return false;

            // Extract filename from the record buffer
            string fileName = GetFileNameFromRecord(record, recordPtr);
            if (string.IsNullOrEmpty(fileName)) return false;


            // Check if it's a temp file by extension or common patterns
            // Case-insensitive comparison is important
            return fileName.EndsWith(".tmp", StringComparison.OrdinalIgnoreCase) ||
                   fileName.EndsWith(".temp", StringComparison.OrdinalIgnoreCase) ||
                   fileName.EndsWith(".dmp", StringComparison.OrdinalIgnoreCase) || // Crash dumps
                   fileName.StartsWith("~", StringComparison.OrdinalIgnoreCase) || // Office temp files often start with ~
                   fileName.EndsWith(".log", StringComparison.OrdinalIgnoreCase); // Include log files as potential cleanup targets
                   // Add more patterns if needed (e.g., specific cache file names)
        }

        // Helper to extract filename string from USN record buffer
        private string GetFileNameFromRecord(USN_RECORD record, IntPtr recordPtr)
        {
            if (record.FileNameLength == 0 || record.FileNameOffset == 0)
            {
                return string.Empty;
            }

            try
            {
                // Calculate the pointer to the beginning of the filename string
                IntPtr fileNamePtr = IntPtr.Add(recordPtr, (int)record.FileNameOffset);

                // Marshal the string using the correct length (in bytes)
                // USN filenames are Unicode (UTF-16LE)
                return Marshal.PtrToStringUni(fileNamePtr, record.FileNameLength / sizeof(char));
            }
            catch (Exception ex)
            {
                 Console.WriteLine($"Error extracting filename from USN record: {ex.Message}");
                 return string.Empty;
            }
        }


        // Helper to extract file info from USN record
        private TempFileInfo ExtractTempFileInfo(USN_RECORD record, IntPtr recordPtr)
        {
            string fileName = GetFileNameFromRecord(record, recordPtr);
            if (string.IsNullOrEmpty(fileName)) return null;

            return new TempFileInfo
            {
                FileName = fileName,
                FileReferenceNumber = record.FileReferenceNumber,
                ParentFileReferenceNumber = record.ParentFileReferenceNumber,
                LastModified = DateTime.FromFileTimeUtc(record.TimeStamp), // Use UTC
                FileAttributes = record.FileAttributes,
                EstimatedSize = 0 // Size needs to be fetched separately
            };
        }

        // Required by IDisposable if using SafeHandle or other managed resources
        public void Dispose()
        {
            // Dispose managed resources if any (e.g., SafeFileHandle instances if held longer)
            // Currently handles are disposed in their methods, but good practice if class held them.
        }
    }

    //region Data Structures for Results

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

        // Example calculation - refine as needed
        public ulong TotalPotentialRecoveryBytes
        {
            get
            {
                ulong total = SystemTempBytes;

                // Add size from temp files (NOTE: EstimatedSize is currently 0)
                // Need to implement size fetching for TempFileInfo
                foreach (var file in RecentTempFiles)
                {
                    total += file.EstimatedSize; // Will be 0 until size fetching is added
                }

                // Add size from prefetch predictions
                foreach (var prediction in PrefetchPredictions)
                {
                    // Apply confidence factor? Maybe just sum estimated size.
                    total += prediction.EstimatedSize;
                }

                return total;
            }
        }
    }

    public class TempFileInfo
    {
        public string FileName { get; set; } = string.Empty; // Initialize to avoid nulls
        public ulong FileReferenceNumber { get; set; }
        public ulong ParentFileReferenceNumber { get; set; }
        public DateTime LastModified { get; set; }
        public uint FileAttributes { get; set; }
        public ulong EstimatedSize { get; set; } // Important: USN Journal does NOT contain size. Needs separate lookup.
        public string? FullPath { get; set; } // Optional: Store full path if resolved
    }

    public class PrefetchPrediction
    {
        public string FilePath { get; set; } = string.Empty; // Initialize to avoid nulls
        public ulong EstimatedSize { get; set; }
        public DateTime LastAccessed { get; set; }
        public double Confidence { get; set; } // How sure the prediction is
    }

    //endregion

    // *** REMOVED UI CODE BLOCK AND BACKTICKS FROM ORIGINAL LINE 891 onwards ***
} // End of namespace SpaceReclaimer.Core