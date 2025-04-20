using System;
using System.Runtime.CompilerServices;
using System.Threading;

namespace SpaceReclaimer.Core
{
    /// <summary>
    /// High-performance lock-free MPMC (Multiple Producer Multiple Consumer) queue
    /// Optimized for file record processing with minimal contention
    /// </summary>
    public sealed class LockFreeQueue<T> where T : class
    {
        private readonly int _bufferMask;
        private readonly Cell[] _buffer;
        private long _enqueuePosition;
        private long _dequeuePosition;
        
        private struct Cell
        {
            public long Sequence;
            public T Item;
        }
        
        public LockFreeQueue(int capacity)
        {
            // Ensure power of 2 capacity for fast modulo with masking
            int size = 2;
            while (size < capacity) size <<= 1;
            
            _bufferMask = size - 1;
            _buffer = new Cell[size];
            
            // Initialize sequence numbers
            for (int i = 0; i < size; i++)
            {
                _buffer[i].Sequence = i;
            }
            
            _enqueuePosition = 0;
            _dequeuePosition = 0;
        }
        
        /// <summary>
        /// Try to enqueue an item without blocking
        /// </summary>
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public bool TryEnqueue(T item)
        {
            do
            {
                long position = Interlocked.Read(ref _enqueuePosition);
                Cell[] buffer = _buffer;
                int index = (int)(position & _bufferMask);
                Cell cell = buffer[index];
                
                // Check if cell is available for enqueue
                if (cell.Sequence != position)
                {
                    return false; // Queue is full
                }
                
                // Try to advance enqueue position
                if (Interlocked.CompareExchange(
                    ref _enqueuePosition, position + 1, position) != position)
                {
                    continue; // Another thread updated position, retry
                }
                
                // Update cell
                buffer[index].Item = item;
                buffer[index].Sequence = position + 1;
                
                return true;
            } while (true);
        }
        
        /// <summary>
        /// Try to dequeue an item without blocking
        /// </summary>
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public bool TryDequeue(out T item)
        {
            do
            {
                long position = Interlocked.Read(ref _dequeuePosition);
                Cell[] buffer = _buffer;
                int index = (int)(position & _bufferMask);
                Cell cell = buffer[index];
                
                // Check if cell is available for dequeue
                if (cell.Sequence != position + 1)
                {
                    item = default;
                    return false; // Queue is empty
                }
                
                // Try to advance dequeue position
                if (Interlocked.CompareExchange(
                    ref _dequeuePosition, position + 1, position) != position)
                {
                    continue; // Another thread updated position, retry
                }
                
                // Get item from cell
                item = cell.Item;
                buffer[index].Item = default;
                buffer[index].Sequence = position + buffer.Length;
                
                return true;
            } while (true);
        }
    }
}
