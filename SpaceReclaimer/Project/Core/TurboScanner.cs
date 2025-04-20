using System.IO.MemoryMappedFiles;
using Microsoft.Win32.SafeHandles;
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using System.Threading.Tasks.Dataflow;
using System.Collections.Concurrent;
using System.Runtime.CompilerServices;

namespace SpaceReclaimer.Core
{
    /// <summary>
    /// High-performance drive scanner using direct NTFS MFT access
    /// </summary>
    public unsafe class TurboScanner : IDisposable
    {
        // Win32 API declarations for direct file access
        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Auto)]
        private static extern SafeFileHandle CreateFile(
            string lpFileName,
            uint dwDesiredAccess,
            uint dwShareMode,
            IntPtr lpSecurityAttributes,
            uint dwCreationDisposition,
            uint dwFlagsAndAttributes,
            IntPtr hTemplateFile);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool DeviceIoControl(
            SafeFileHandle hDevice,
            uint dwIoControlCode,
            IntPtr lpInBuffer,
            uint nInBufferSize,
            IntPtr lpOutBuffer,
            uint nOutBufferSize,
            ref uint lpBytesReturned,
            IntPtr lpOverlapped);

        // Constants for direct volume access
        private const uint OPEN_EXISTING = 3;
        private const uint FILE_SHARE_READ = 0x00000001;
        private const uint FILE_SHARE_WRITE = 0x00000002;
        private const uint GENERIC_READ = 0x80000000;
        private const uint FILE_FLAG_OVERLAPPED = 0x40000000;
        private const uint FILE_FLAG_NO_BUFFERING = 0x20000000;
        private const uint FILE_ATTRIBUTE_READONLY = 0x00000001;

        // NTFS MFT constants
        private const uint FSCTL_GET_NTFS_VOLUME_DATA = 0x90064;
        private const uint FSCTL_GET_NTFS_FILE_RECORD = 0x90068;
        private const int MFT_RECORD_SIZE = 1024;

        // Performance tracking
        private long _totalSize;
        private long _fileCount;
        private readonly ConcurrentQueue<MftRecord> _analysisQueue;
        private readonly ConcurrentDictionary<string, long> _folderSizes;
        
        // Memory management
        private readonly ObjectPool<MftRecord> _recordPool;
        private readonly MemoryMappedViewAccessor _mftView;
        private readonly SafeFileHandle _volumeHandle;
        
        public TurboScanner()
        {
            _analysisQueue = new ConcurrentQueue<MftRecord>();
            _folderSizes = new ConcurrentDictionary<string, long>(
                Environment.ProcessorCount * 2, 
                10000);
            
            // Initialize object pool for record reuse (avoid GC pressure)
            _recordPool = new ObjectPool<MftRecord>(
                () => new MftRecord(), 
                10000);
        }

        /// <summary>
        /// Performs high-speed drive scan using direct MFT access
        /// </summary>
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public async Task<TurboScanResult> ScanDriveAsync(char driveLetter, CancellationToken token)
        {
            _totalSize = 0;
            _fileCount = 0;
            
            // Open volume with direct access
            string volumePath = $"\\\\.\\{driveLetter}:";
            _volumeHandle = CreateFile(
                volumePath,
                GENERIC_READ,
                FILE_SHARE_READ | FILE_SHARE_WRITE,
                IntPtr.Zero,
                OPEN_EXISTING,
                FILE_FLAG_NO_BUFFERING | FILE_ATTRIBUTE_READONLY,
                IntPtr.Zero);
            
            if (_volumeHandle.IsInvalid)
            {
                throw new IOException($"Failed to open volume {driveLetter}. Error: {Marshal.GetLastWin32Error()}");
            }
            
            // Setup parallel processing pipeline for maximum throughput
            var options = new ExecutionDataflowBlockOptions
            {
                MaxDegreeOfParallelism = Environment.ProcessorCount * 2,
                BoundedCapacity = 10000,
                CancellationToken = token
            };
            
            // Process MFT records in parallel
            var processorBlock = new ActionBlock<MftRecord>(async record =>
            {
                // Skip system files and directories as needed
                if (record.IsSystemFile || record.IsDirectory)
                {
                    _recordPool.Return(record);
                    return;
                }
                
                // AVX2-accelerated hash computation when necessary
                if (record.ShouldCheckDuplicate)
                {
                    record.ComputeHashAVX2();
                }
                
                // Update statistics atomically
                Interlocked.Add(ref _totalSize, record.Size);
                Interlocked.Increment(ref _fileCount);
                
                // Track folder sizes for visualization
                string parentPath = record.GetParentPath();
                _folderSizes.AddOrUpdate(
                    parentPath,
                    record.Size,
                    (_, currentSize) => currentSize + record.Size);
                
                // Queue for analysis if meets criteria
                if (record.IsPotentialCleanupTarget())
                {
                    _analysisQueue.Enqueue(record);
                }
                else
                {
                    _recordPool.Return(record);
                }
                
                // Yield occasionally to prevent UI freezing
                if (_fileCount % 10000 == 0)
                {
                    await Task.Yield();
                }
            }, options);
            
            // Read MFT records directly using memory mapping
            using var mftReader = new MftReader(_volumeHandle);
            await mftReader.InitializeAsync();
            
            var batch = new List<MftRecord>(1000);
            
            while (await mftReader.GetNextBatchAsync(batch, _recordPool, token))
            {
                foreach (var record in batch)
                {
                    // Skip unnecessary processing early
                    if (IsExcluded(record))
                    {
                        _recordPool.Return(record);
                        continue;
                    }
                    
                    // Post to processor while respecting backpressure
                    while (!processorBlock.Post(record) && !token.IsCancellationRequested)
                    {
                        await Task.Delay(1);
                    }
                }
                
                batch.Clear();
            }
            
            // Signal completion and wait for processing to finish
            processorBlock.Complete();
            await processorBlock.Completion;
            
            return new TurboScanResult
            {
                TotalFilesFound = _fileCount,
                TotalSizeBytes = _totalSize,
                FolderSizeMap = _folderSizes.ToArray(),
                CleanupCandidates = _analysisQueue.ToArray()
            };
        }
        
        /// <summary>
        /// Determine if file should be excluded from processing
        /// </summary>
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        private bool IsExcluded(MftRecord record)
        {
            // Check against exclusion list - using a perfect hash for speed
            if (_exclusionHashSet.Contains(record.GetFileExtensionHash()))
            {
                return true;
            }
            
            // Check if file is in use by active process
            return IsFileInUseByProcess(record.FullPath);
        }
        
        /// <summary>
        /// Implements secure file deletion using FILE_DISPOSITION_INFO
        /// </summary>
        public unsafe bool SecureDelete(string filePath, bool overwrite)
        {
            if (overwrite)
            {
                // Overwrite with zeros before deleting
                using var fileHandle = CreateFile(
                    filePath,
                    GENERIC_WRITE,
                    0,
                    IntPtr.Zero,
                    OPEN_EXISTING,
                    0,
                    IntPtr.Zero);
                
                if (!fileHandle.IsInvalid)
                {
                    // Implement secure overwrite
                    // [Code omitted for brevity]
                }
            }
            
            // Use FILE_DISPOSITION_INFO for secure deletion
            // [Code omitted for brevity]
            
            return true;
        }

        public void Dispose()
        {
            _volumeHandle?.Dispose();
            _mftView?.Dispose();
        }
    }

    /// <summary>
    /// Represents an NTFS MFT record with optimized memory layout
    /// </summary>
    [StructLayout(LayoutKind.Explicit, Size = 1024)]
    public unsafe class MftRecord
    {
        [FieldOffset(0)]
        public fixed byte Signature[4];
        
        [FieldOffset(4)]
        public ushort UpdateSequenceOffset;
        
        [FieldOffset(6)]
        public ushort UpdateSequenceCount;
        
        [FieldOffset(8)]
        public ulong LogFileSequenceNumber;
        
        [FieldOffset(16)]
        public ushort SequenceNumber;
        
        [FieldOffset(18)]
        public ushort HardLinkCount;
        
        [FieldOffset(20)]
        public ushort AttributeOffset;
        
        [FieldOffset(22)]
        public ushort Flags;
        
        [FieldOffset(24)]
        public uint RealSize;
        
        [FieldOffset(28)]
        public uint AllocatedSize;
        
        [FieldOffset(32)]
        public ulong BaseRecordReference;
        
        [FieldOffset(40)]
        public ushort NextAttributeId;
        
        // Methods for file analysis
        public bool IsDirectory => (Flags & 0x0002) != 0;
        public bool IsSystemFile => (Flags & 0x0004) != 0;
        public long Size => AllocatedSize;
        
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public ulong GetFileExtensionHash()
        {
            // Implement fast extension hashing
            // [Code omitted for brevity]
            return 0;
        }
        
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public void ComputeHashAVX2()
        {
            // AVX2-accelerated hash computation
            // [Code omitted for brevity]
        }
        
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public bool IsPotentialCleanupTarget()
        {
            // Quick checks for temporary files, etc.
            // [Code omitted for brevity]
            return false;
        }
        
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public string GetParentPath()
        {
            // Extract parent path
            // [Code omitted for brevity]
            return string.Empty;
        }
    }
    
    /// <summary>
    /// High-performance object pool to reduce GC pressure
    /// </summary>
    public class ObjectPool<T> where T : class, new()
    {
        private readonly ConcurrentBag<T> _objects;
        private readonly Func<T> _objectGenerator;
        private readonly int _capacity;
        
        public ObjectPool(Func<T> objectGenerator, int capacity)
        {
            _objectGenerator = objectGenerator ?? throw new ArgumentNullException(nameof(objectGenerator));
            _objects = new ConcurrentBag<T>();
            _capacity = capacity;
        }
        
        public T Get() => _objects.TryTake(out T item) ? item : _objectGenerator();
        
        public void Return(T item)
        {
            if (_objects.Count < _capacity)
            {
                _objects.Add(item);
            }
        }
    }
}

