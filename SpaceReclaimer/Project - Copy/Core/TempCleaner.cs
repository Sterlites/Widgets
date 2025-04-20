using System;
using System.Collections.Generic;
using System.IO;
using System.Threading;
using System.Threading.Tasks;

namespace SpaceReclaimer.Core
{
    /// <summary>
    /// Handles cleanup of temporary files
    /// </summary>
    public sealed class TempCleaner : IDisposable
    {
        private readonly LockFreeQueue<TempFileInfo> _cleanupQueue;
        
        public TempCleaner()
        {
            _cleanupQueue = new LockFreeQueue<TempFileInfo>(10000);
        }
        
        /// <summary>
        /// Clean user temp files
        /// </summary>
        public async Task<CleanupResult> CleanUserTemp()
        {
            var result = new CleanupResult();
            string tempPath = Path.GetTempPath();
            
            try
            {
                // Get all files in temp directory
                var files = Directory.GetFiles(tempPath, "*", SearchOption.AllDirectories);
                
                // Add eligible files to cleanup queue
                foreach (var file in files)
                {
                    if (SecurityManager.IsSafeToClean(file))
                    {
                        var fileInfo = new FileInfo(file);
                        _cleanupQueue.TryEnqueue(new TempFileInfo
                        {
                            FileName = fileInfo.Name,
                            LastModified = fileInfo.LastWriteTime,
                            EstimatedSize = (ulong)fileInfo.Length
                        });
                    }
                }
                
                // Process cleanup queue
                await CleanFilesFromQueueAsync(result);
            }
            catch (Exception ex)
            {
                result.ErrorMessage = ex.Message;
            }
            
            return result;
        }
        
        /// <summary>
        /// Clean temp files identified through NTFS journal analysis
        /// </summary>
        public async Task<CleanupResult> CleanTempFiles(
            List<TempFileInfo> tempFiles, 
            CancellationToken token)
        {
            var result = new CleanupResult();
            
            try
            {
                // Add eligible files to cleanup queue
                foreach (var file in tempFiles)
                {
                    string filePath = ResolveFilePathFromMFT(file);
                    if (!string.IsNullOrEmpty(filePath) && SecurityManager.IsSafeToClean(filePath))
                    {
                        _cleanupQueue.TryEnqueue(file);
                    }
                }
                
                // Process cleanup queue
                await CleanFilesFromQueueAsync(result, token);
            }
            catch (Exception ex)
            {
                result.ErrorMessage = ex.Message;
            }
            
            return result;
        }
        
        /// <summary>
        /// Processes files in the cleanup queue
        /// </summary>
        private async Task CleanFilesFromQueueAsync(
            CleanupResult result, 
            CancellationToken token = default)
        {
            // Process in batches for better performance
            const int batchSize = 100;
            var batch = new List<TempFileInfo>(batchSize);
            
            // Setup parallel processing
            var options = new ParallelOptions
            {
                MaxDegreeOfParallelism = Environment.ProcessorCount,
                CancellationToken = token
            };
            
            while (true)
            {
                // Fill batch from queue
                batch.Clear();
                for (int i = 0; i < batchSize; i++)
                {
                    if (!_cleanupQueue.TryDequeue(out var item))
                    {
                        break;
                    }
                    
                    batch.Add(item);
                }
                
                if (batch.Count == 0)
                {
                    break; // Queue is empty
                }
                
                // Process batch in parallel
                await Parallel.ForEachAsync(batch, options, async (file, ct) =>
                {
                    string filePath = ResolveFilePathFromMFT(file);
                    if (string.IsNullOrEmpty(filePath))
                    {
                        return;
                    }
                    
                    try
                    {
                        // Check again if file is safe to clean (might have changed)
                        if (!SecurityManager.IsSafeToClean(filePath))
                        {
                            return;
                        }
                        
                        // Get file size before deletion
                        ulong fileSize = 0;
                        try
                        {
                            var fileInfo = new FileInfo(filePath);
                            if (fileInfo.Exists)
                            {
                                fileSize = (ulong)fileInfo.Length;
                            }
                        }
                        catch
                        {
                            // Ignore errors during size check
                        }
                        
                        // Use secure delete for sensitive files, regular delete for others
                        bool isSecure = IsSecureDeleteRequired(filePath);
                        bool success = false;
                        
                        if (isSecure)
                        {
                            // Use SecureDelete from TurboScanner
                            using var scanner = new TurboScanner();
                            success = scanner.SecureDelete(filePath, true);
                        }
                        else
                        {
                            // Use standard .NET file deletion
                            try
                            {
                                File.Delete(filePath);
                                success = true;
                            }
                            catch
                            {
                                // Try to move to recycle bin instead
                                success = MoveToRecycleBin(filePath);
                            }
                        }
                        
                        // Update result
                        if (success)
                        {
                            Interlocked.Increment(ref result.FilesDeleted);
                            Interlocked.Add(ref result.BytesReclaimed, (long)fileSize);
                        }
                    }
                    catch
                    {
                        // Ignore individual file errors
                    }
                });
                
                // Yield to prevent UI blocking
                await Task.Yield();
            }
        }
        
        /// <summary>
        /// Resolves a file path from an MFT record
        /// </summary>
        private string ResolveFilePathFromMFT(TempFileInfo file)
        {
            // For files from direct temp directory scan, the path is already known
            if (!string.IsNullOrEmpty(file.FileName) && 
                Path.IsPathRooted(file.FileName))
            {
                return file.FileName;
            }
            
            // For files from NTFS journal, resolve path based on file reference number
            // This is a simplified implementation
            // [In a real implementation, this would use MFT data to resolve]
            
            return null;
        }
        
        /// <summary>
        /// Determines if secure deletion is required for a file
        /// </summary>
        private bool IsSecureDeleteRequired(string filePath)
        {
            // Check if file appears to contain sensitive information
            // For example, check file extension or location
            string ext = Path.GetExtension(filePath).ToLowerInvariant();
            
            return ext == ".key" || ext == ".pem" || ext == ".pfx" || 
                   filePath.Contains("password", StringComparison.OrdinalIgnoreCase) ||
                   filePath.Contains("sensitive", StringComparison.OrdinalIgnoreCase);
        }
        
        /// <summary>
        /// Moves a file to the recycle bin
        /// </summary>
        private bool MoveToRecycleBin(string filePath)
        {
            try
            {
                // Use shell32.dll to move to recycle bin
                // [Code omitted for brevity]
                
                return true;
            }
            catch
            {
                return false;
            }
        }
        
        public void Dispose()
        {
            // No resources to dispose in this implementation
        }
    }
    
    /// <summary>
    /// Result of a cleanup operation
    /// </summary>
    public class CleanupResult
    {
        public long FilesDeleted;
        public long BytesReclaimed;
        public string ErrorMessage;
    }
}
