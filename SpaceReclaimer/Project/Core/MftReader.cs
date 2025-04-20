using Microsoft.Win32.SafeHandles;
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using System.Collections.Generic;

namespace SpaceReclaimer.Core
{
    /// <summary>
    /// High-performance NTFS MFT reader with memory mapping
    /// </summary>
    public sealed unsafe class MftReader : IDisposable
    {
        // Win32 API declarations for MFT access
        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool ReadFile(
            SafeFileHandle hFile,
            IntPtr lpBuffer,
            uint nNumberOfBytesToRead,
            out uint lpNumberOfBytesRead,
            IntPtr lpOverlapped);
            
        // NTFS-specific structures
        [StructLayout(LayoutKind.Sequential)]
        private struct NTFS_VOLUME_DATA_BUFFER
        {
            public ulong VolumeSerialNumber;
            public ulong NumberSectors;
            public ulong TotalClusters;
            public ulong FreeClusters;
            public ulong TotalReserved;
            public uint BytesPerSector;
            public uint BytesPerCluster;
            public uint BytesPerFileRecordSegment;
            public uint ClustersPerFileRecordSegment;
            public ulong MftValidDataLength;
            public ulong MftStartLcn;
            public ulong Mft2StartLcn;
            public ulong MftZoneStart;
            public ulong MftZoneEnd;
        }
        
        private readonly SafeFileHandle _volumeHandle;
        private NTFS_VOLUME_DATA_BUFFER _volumeData;
        private IntPtr _mftBuffer;
        private ulong _currentMftOffset;
        private ulong _totalMftSize;
        private bool _initialized;
        
        public MftReader(SafeFileHandle volumeHandle)
        {
            _volumeHandle = volumeHandle ?? throw new ArgumentNullException(nameof(volumeHandle));
        }
        
        /// <summary>
        /// Initialize MFT reader with direct volume access
        /// </summary>
        public async Task InitializeAsync()
        {
            if (_initialized) return;
            
            // Get NTFS volume data
            IntPtr outBuffer = Marshal.AllocHGlobal(Marshal.SizeOf<NTFS_VOLUME_DATA_BUFFER>());
            try
            {
                uint bytesReturned = 0;
                if (!DeviceIoControl(
                    _volumeHandle,
                    FSCTL_GET_NTFS_VOLUME_DATA,
                    IntPtr.Zero,
                    0,
                    outBuffer,
                    (uint)Marshal.SizeOf<NTFS_VOLUME_DATA_BUFFER>(),
                    ref bytesReturned,
                    IntPtr.Zero))
                {
                    throw new IOException($"Failed to get NTFS volume data. Error: {Marshal.GetLastWin32Error()}");
                }
                
                _volumeData = Marshal.PtrToStructure<NTFS_VOLUME_DATA_BUFFER>(outBuffer);
                
                // Calculate MFT size and allocate buffer
                _totalMftSize = _volumeData.MftValidDataLength;
                _currentMftOffset = 0;
                
                // Allocate memory-mapped buffer for MFT
                // Use 64MB chunks for efficient processing
                const ulong chunkSize = 64 * 1024 * 1024;
                _mftBuffer = Marshal.AllocHGlobal(new IntPtr(chunkSize));
                
                _initialized = true;
            }
            finally
            {
                Marshal.FreeHGlobal(outBuffer);
            }
            
            await Task.CompletedTask; // For async pattern consistency
        }
        
        /// <summary>
        /// Read the next batch of MFT records
        /// </summary>
        public async Task<bool> GetNextBatchAsync(
            List<MftRecord> records, 
            ObjectPool<MftRecord> recordPool,
            CancellationToken token)
        {
            if (!_initialized) throw new InvalidOperationException("MFT reader not initialized");
            if (_currentMftOffset >= _totalMftSize) return false;
            
            // Calculate how many records to read in this batch
            const ulong bytesToRead = 64 * 1024 * 1024; // 64MB chunks
            ulong remainingBytes = _totalMftSize - _currentMftOffset;
            ulong batchSize = Math.Min(bytesToRead, remainingBytes);
            
            // Read MFT chunk directly from volume
            uint bytesRead = 0;
            if (!ReadFile(
                _volumeHandle,
                _mftBuffer,
                (uint)batchSize,
                out bytesRead,
                IntPtr.Zero))
            {
                throw new IOException($"Failed to read MFT data. Error: {Marshal.GetLastWin32Error()}");
            }
            
            if (bytesRead == 0) return false;
            
            // Process records from the buffer
            int recordSize = (int)_volumeData.BytesPerFileRecordSegment;
            int recordCount = (int)(bytesRead / recordSize);
            
            await Task.Run(() => {
                for (int i = 0; i < recordCount; i++)
                {
                    if (token.IsCancellationRequested) break;
                    
                    // Get pointer to current record
                    IntPtr recordPtr = IntPtr.Add(_mftBuffer, i * recordSize);
                    
                    // Validate record signature "FILE"
                    byte* recordBytes = (byte*)recordPtr.ToPointer();
                    if (recordBytes[0] != 'F' || recordBytes[1] != 'I' || 
                        recordBytes[2] != 'L' || recordBytes[3] != 'E')
                    {
                        continue; // Skip invalid records
                    }
                    
                    // Get record from pool and copy data
                    var record = recordPool.Get();
                    Marshal.Copy(recordPtr, new IntPtr(&record), recordSize);
                    
                    // Add to results
                    records.Add(record);
                }
            }, token);
            
            // Update offset for next batch
            _currentMftOffset += bytesRead;
            
            return true;
        }
        
        public void Dispose()
        {
            if (_mftBuffer != IntPtr.Zero)
            {
                Marshal.FreeHGlobal(_mftBuffer);
                _mftBuffer = IntPtr.Zero;
            }
        }
    }
}
