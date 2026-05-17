# Memory Management

## Quick Reference

- **Virtual memory** gives each process a private, contiguous address space (48-bit on x86-64 = 256TB) mapped to physical frames via page tables
- x86-64 uses 4-level page tables (PGD → PUD → PMD → PTE), each level indexing 512 entries with 9 bits of the virtual address
- The **TLB** (Translation Lookaside Buffer) caches recent virtual-to-physical translations; a TLB miss costs 10-100 cycles for a page table walk vs 1 cycle for a hit
- **Huge pages** (2MB or 1GB) reduce TLB pressure by covering more address space per entry — critical for large heaps (JVM, databases)
- **Copy-on-write** (COW) makes fork() O(1) by sharing physical pages until a write triggers duplication
- The **page cache** buffers disk I/O in unused RAM; Linux dynamically grows/shrinks it based on memory pressure
- **OOM killer** terminates processes when physical memory + swap is exhausted, selecting victims by oom_score (memory usage, age, privilege)
- Kernel uses **buddy allocation** for page frames and **slab allocation** for fixed-size kernel objects (task_struct, inode, dentry)
- User-space allocators (glibc ptmalloc2, jemalloc, tcmalloc) subdivide kernel-provided chunks using thread-local caches and size-class bins

## When to Use

Deep understanding of memory management is required when:

- **Tuning JVM garbage collection** — GC interacts with virtual memory (huge pages reduce TLB misses during heap traversal, swapped-out pages cause GC pauses, G1/ZGC use mmap tricks for concurrent compaction)
- **Diagnosing memory leaks and fragmentation** — distinguishing between virtual memory growth (harmless address space expansion) and RSS growth (actual physical memory consumption), understanding why free() doesn't always return memory to the OS
- **Configuring container memory limits** — setting cgroup memory.max, understanding the difference between anonymous memory (heap/stack) and page cache (reclaimable), preventing OOM kills
- **Optimizing database buffer pools** — choosing between OS page cache and application-managed buffers (O_DIRECT), configuring huge pages for large buffer pools, understanding NUMA effects on memory access latency
- **Building memory-mapped data structures** — using mmap for persistent data structures, shared memory IPC, or memory-mapped files that exceed physical RAM
- **Performance profiling** — interpreting perf counters for TLB misses, page faults, cache misses, and understanding NUMA topology effects

## Code Examples

### Virtual Memory Page Table Walk Simulation (Java)

```java
public class PageTableSimulation {
    private static final int PAGE_SIZE = 4096;
    private static final int ENTRIES_PER_TABLE = 512;
    private static final long PTE_PRESENT = 1L;
    private static final long PTE_WRITABLE = 1L << 1;
    private static final long PTE_USER = 1L << 2;
    private static final long PTE_ACCESSED = 1L << 5;
    private static final long PTE_DIRTY = 1L << 6;
    private static final long PTE_ADDR_MASK = 0x000FFFFFFFFFF000L;

    // Simulated page table: each level is an array of 512 entries
    // Entry stores either a "pointer" (index into table pool) or physical address + flags
    private final long[][] tablePool;
    private int nextTable = 0;
    private long pageFaults = 0;
    private long translations = 0;

    public PageTableSimulation(int maxTables) {
        this.tablePool = new long[maxTables][ENTRIES_PER_TABLE];
    }

    // Extract indices from 48-bit virtual address
    static int pgdIndex(long va) { return (int) ((va >> 39) & 0x1FF); }
    static int pudIndex(long va) { return (int) ((va >> 30) & 0x1FF); }
    static int pmdIndex(long va) { return (int) ((va >> 21) & 0x1FF); }
    static int pteIndex(long va) { return (int) ((va >> 12) & 0x1FF); }
    static long pageOffset(long va) { return va & 0xFFF; }

    // Allocate a new page table, returns its index in the pool
    private int allocPageTable() {
        int idx = nextTable++;
        java.util.Arrays.fill(tablePool[idx], 0);
        return idx;
    }

    // Map a virtual page to a physical frame
    public void mapPage(int pgdIdx, long vaddr, long paddr, long flags) {
        long entry;

        // Walk/create PGD -> PUD
        entry = tablePool[pgdIdx][pgdIndex(vaddr)];
        int pudIdx;
        if ((entry & PTE_PRESENT) == 0) {
            pudIdx = allocPageTable();
            tablePool[pgdIdx][pgdIndex(vaddr)] = ((long) pudIdx << 12) | PTE_PRESENT | PTE_WRITABLE | PTE_USER;
        } else {
            pudIdx = (int) ((entry & PTE_ADDR_MASK) >> 12);
        }

        // Walk/create PUD -> PMD
        entry = tablePool[pudIdx][pudIndex(vaddr)];
        int pmdIdx;
        if ((entry & PTE_PRESENT) == 0) {
            pmdIdx = allocPageTable();
            tablePool[pudIdx][pudIndex(vaddr)] = ((long) pmdIdx << 12) | PTE_PRESENT | PTE_WRITABLE | PTE_USER;
        } else {
            pmdIdx = (int) ((entry & PTE_ADDR_MASK) >> 12);
        }

        // Walk/create PMD -> PTE
        entry = tablePool[pmdIdx][pmdIndex(vaddr)];
        int pteIdx;
        if ((entry & PTE_PRESENT) == 0) {
            pteIdx = allocPageTable();
            tablePool[pmdIdx][pmdIndex(vaddr)] = ((long) pteIdx << 12) | PTE_PRESENT | PTE_WRITABLE | PTE_USER;
        } else {
            pteIdx = (int) ((entry & PTE_ADDR_MASK) >> 12);
        }

        // Set the final PTE
        tablePool[pteIdx][pteIndex(vaddr)] = (paddr & PTE_ADDR_MASK) | flags | PTE_PRESENT;
    }

    // Translate virtual address to physical address
    public long translate(int pgdIdx, long vaddr) {
        translations++;

        long entry = tablePool[pgdIdx][pgdIndex(vaddr)];
        if ((entry & PTE_PRESENT) == 0) { pageFaults++; return 0; }

        int pudIdx = (int) ((entry & PTE_ADDR_MASK) >> 12);
        entry = tablePool[pudIdx][pudIndex(vaddr)];
        if ((entry & PTE_PRESENT) == 0) { pageFaults++; return 0; }

        int pmdIdx = (int) ((entry & PTE_ADDR_MASK) >> 12);
        entry = tablePool[pmdIdx][pmdIndex(vaddr)];
        if ((entry & PTE_PRESENT) == 0) { pageFaults++; return 0; }

        int pteIdx = (int) ((entry & PTE_ADDR_MASK) >> 12);
        entry = tablePool[pteIdx][pteIndex(vaddr)];
        if ((entry & PTE_PRESENT) == 0) { pageFaults++; return 0; }

        // Mark accessed
        tablePool[pteIdx][pteIndex(vaddr)] |= PTE_ACCESSED;

        return (entry & PTE_ADDR_MASK) | pageOffset(vaddr);
    }

    public long getPageFaults() { return pageFaults; }
    public long getTranslations() { return translations; }
}
```

### Memory-Mapped File I/O (Java)

```java
import java.io.*;
import java.nio.*;
import java.nio.channels.FileChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;

// Memory-mapped file for a simple key-value store
public class MappedHashTable {
    private static final int KEY_SIZE = 64;
    private static final int VALUE_SIZE = 256;
    private static final int ENTRY_SIZE = KEY_SIZE + VALUE_SIZE + 4 + 1; // key + value + hash + occupied

    private final MappedByteBuffer buffer;
    private final int capacity;
    private final FileChannel channel;

    public MappedHashTable(Path path, int capacity, boolean create) throws IOException {
        this.capacity = capacity;
        long size = 8L + (long) capacity * ENTRY_SIZE; // count(4) + capacity(4) + entries

        if (create) {
            this.channel = FileChannel.open(path,
                    StandardOpenOption.CREATE, StandardOpenOption.READ, StandardOpenOption.WRITE);
            // Extend file to required size
            channel.truncate(size);
            // Force file to be the right size
            ByteBuffer zero = ByteBuffer.allocate(1);
            channel.write(zero, size - 1);
        } else {
            this.channel = FileChannel.open(path, StandardOpenOption.READ, StandardOpenOption.WRITE);
        }

        // Map file into memory
        this.buffer = channel.map(FileChannel.MapMode.READ_WRITE, 0, size);

        if (create) {
            buffer.putInt(0, 0);         // count = 0
            buffer.putInt(4, capacity);  // capacity
        }
    }

    public void put(String key, String value) {
        int hash = key.hashCode();
        int index = Math.abs(hash) % capacity;

        int offset = 8 + index * ENTRY_SIZE;
        byte[] keyBytes = new byte[KEY_SIZE];
        byte[] valBytes = new byte[VALUE_SIZE];
        System.arraycopy(key.getBytes(StandardCharsets.UTF_8), 0, keyBytes, 0,
                Math.min(key.length(), KEY_SIZE));
        System.arraycopy(value.getBytes(StandardCharsets.UTF_8), 0, valBytes, 0,
                Math.min(value.length(), VALUE_SIZE));

        buffer.position(offset);
        buffer.put(keyBytes);
        buffer.put(valBytes);
        buffer.putInt(hash);
        buffer.put((byte) 1); // occupied

        // Increment count
        buffer.putInt(0, buffer.getInt(0) + 1);
    }

    // Changes are automatically persisted to disk via page cache
    // Use force() for explicit durability guarantees
    public void sync() {
        buffer.force(); // Equivalent to msync - blocks until written to disk
    }

    public void close() throws IOException {
        channel.close();
    }
}
```

### Custom Memory Allocator with Free List (Java)

```java
import java.nio.ByteBuffer;

public class ArenaAllocator {
    private static final int ARENA_SIZE = 1024 * 1024; // 1MB arena
    private static final int ALIGNMENT = 16;
    private static final int BLOCK_HEADER_SIZE = align(16); // size(8) + next(4) + free(1) padded

    private final ByteBuffer arena;
    private int freeListHead; // Offset of first free block
    private long allocated = 0;
    private long peakAllocated = 0;

    private static int align(int size) {
        return (size + (ALIGNMENT - 1)) & ~(ALIGNMENT - 1);
    }

    public ArenaAllocator() {
        // Allocate direct buffer (off-heap, similar to mmap anonymous)
        this.arena = ByteBuffer.allocateDirect(ARENA_SIZE);

        // Initialize free list with single large block
        freeListHead = 0;
        setBlockSize(0, ARENA_SIZE - BLOCK_HEADER_SIZE);
        setBlockNext(0, -1); // -1 = null
        setBlockFree(0, true);
    }

    // Block header layout: [size: long (8)] [next: int (4)] [free: byte (1)]
    private long getBlockSize(int offset) { return arena.getLong(offset); }
    private void setBlockSize(int offset, long size) { arena.putLong(offset, size); }
    private int getBlockNext(int offset) { return arena.getInt(offset + 8); }
    private void setBlockNext(int offset, int next) { arena.putInt(offset + 8, next); }
    private boolean isBlockFree(int offset) { return arena.get(offset + 12) != 0; }
    private void setBlockFree(int offset, boolean free) { arena.put(offset + 12, (byte) (free ? 1 : 0)); }

    public int alloc(int requestedSize) {
        int size = align(requestedSize);

        // First-fit search through free list
        int prev = -1;
        int curr = freeListHead;

        while (curr != -1) {
            if (isBlockFree(curr) && getBlockSize(curr) >= size) {
                long currSize = getBlockSize(curr);

                // Split block if remainder is large enough
                if (currSize >= size + BLOCK_HEADER_SIZE + ALIGNMENT) {
                    int newBlock = curr + BLOCK_HEADER_SIZE + size;
                    setBlockSize(newBlock, currSize - size - BLOCK_HEADER_SIZE);
                    setBlockNext(newBlock, getBlockNext(curr));
                    setBlockFree(newBlock, true);

                    setBlockSize(curr, size);
                    setBlockNext(curr, newBlock);
                }

                setBlockFree(curr, false);
                allocated += getBlockSize(curr);
                if (allocated > peakAllocated) peakAllocated = allocated;

                return curr + BLOCK_HEADER_SIZE; // Return offset past header
            }
            prev = curr;
            curr = getBlockNext(curr);
        }

        return -1; // Out of memory
    }

    public void free(int ptr) {
        if (ptr < 0) return;

        int block = ptr - BLOCK_HEADER_SIZE;
        setBlockFree(block, true);
        allocated -= getBlockSize(block);

        // Coalesce adjacent free blocks
        int curr = freeListHead;
        while (curr != -1) {
            int next = getBlockNext(curr);
            if (isBlockFree(curr) && next != -1 && isBlockFree(next)) {
                setBlockSize(curr, getBlockSize(curr) + BLOCK_HEADER_SIZE + getBlockSize(next));
                setBlockNext(curr, getBlockNext(next));
                continue; // Check again in case of multiple adjacent free blocks
            }
            curr = getBlockNext(curr);
        }
    }

    public long getAllocated() { return allocated; }
    public long getPeakAllocated() { return peakAllocated; }
}
```

### LRU Page Replacement Simulation (Java)

```java
import java.util.*;

public class LRUPageCache {
    /**Simulates OS page cache with LRU eviction policy.*/

    enum PageState { CLEAN, DIRTY }

    static class PageFrame {
        final int pageNumber;
        PageState state;
        int accessCount;

        PageFrame(int pageNumber, PageState state) {
            this.pageNumber = pageNumber;
            this.state = state;
            this.accessCount = 1;
        }
    }

    private final int numFrames;
    private final LinkedHashMap<Integer, PageFrame> frames;
    private int pageFaults = 0;
    private int diskWrites = 0;
    private int totalAccesses = 0;

    public LRUPageCache(int numFrames) {
        this.numFrames = numFrames;
        // LinkedHashMap with accessOrder=true provides LRU ordering
        this.frames = new LinkedHashMap<>(numFrames, 0.75f, true);
    }

    /** Access a page. Returns true if page was in cache (hit). */
    public boolean access(int pageNumber, boolean write) {
        totalAccesses++;

        if (frames.containsKey(pageNumber)) {
            // Cache hit: LinkedHashMap moves to end on access (most recently used)
            PageFrame frame = frames.get(pageNumber);
            frame.accessCount++;
            if (write) frame.state = PageState.DIRTY;
            return true;
        }

        // Cache miss: page fault
        pageFaults++;

        // Evict LRU page if cache is full
        if (frames.size() >= numFrames) {
            evictLru();
        }

        // Load new page
        PageState state = write ? PageState.DIRTY : PageState.CLEAN;
        frames.put(pageNumber, new PageFrame(pageNumber, state));
        return false;
    }

    private void evictLru() {
        // The first entry in a LinkedHashMap with accessOrder=true is the LRU
        Iterator<Map.Entry<Integer, PageFrame>> iter = frames.entrySet().iterator();
        if (iter.hasNext()) {
            Map.Entry<Integer, PageFrame> entry = iter.next();
            if (entry.getValue().state == PageState.DIRTY) {
                diskWrites++; // Must write back dirty page
            }
            iter.remove();
        }
    }

    public double hitRate() {
        if (totalAccesses == 0) return 0.0;
        return 1.0 - ((double) pageFaults / totalAccesses);
    }

    public Map<String, Object> stats() {
        Map<String, Object> s = new LinkedHashMap<>();
        s.put("total_accesses", totalAccesses);
        s.put("page_faults", pageFaults);
        s.put("disk_writes", diskWrites);
        s.put("hit_rate", String.format("%.2f%%", hitRate() * 100));
        s.put("frames_used", frames.size());
        return s;
    }

    // Simulate a workload
    public static void main(String[] args) {
        LRUPageCache cache = new LRUPageCache(4);
        // Locality-heavy access pattern
        int[] accesses = {1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5, 1, 2, 3};
        for (int page : accesses) {
            boolean hit = cache.access(page, page % 2 == 0);
            String status = hit ? "HIT" : "MISS";
            System.out.printf("Access page %d: %s%n", page, status);
        }

        System.out.println("\nStats: " + cache.stats());
    }
}
```

## Common Pitfalls

1. **Confusing virtual memory size (VSZ) with physical memory usage (RSS)**: A process can have a large virtual address space (mapped but uncommitted memory, memory-mapped files, shared libraries) while using little physical RAM. RSS (Resident Set Size) shows actual physical pages in use. Monitoring VSZ for memory leaks gives false alarms; monitor RSS and PSS (Proportional Set Size, which accounts for shared pages). Use `smaps_rollup` for accurate per-process memory accounting in containerized environments.

2. **Memory fragmentation in long-running services**: After many allocation/deallocation cycles, the heap becomes fragmented — free memory exists but not in contiguous chunks large enough for new allocations. This causes RSS to grow even though logical usage is stable. glibc's ptmalloc2 is particularly prone to fragmentation with certain allocation patterns. Mitigations: use jemalloc or tcmalloc (better fragmentation resistance), periodically call malloc_trim(), or redesign to use arena/pool allocators for same-sized objects.

3. **Transparent Huge Pages (THP) causing latency spikes**: THP automatically promotes 4KB pages to 2MB huge pages, which reduces TLB misses but can cause latency spikes during compaction (the kernel must find 512 contiguous free pages). Databases (Redis, MongoDB) and latency-sensitive services often disable THP (`echo never > /sys/kernel/mm/transparent_hugepage/enabled`) and use explicit hugetlbfs instead, which pre-allocates huge pages at boot time.

4. **OOM killer targeting the wrong process**: When the system runs out of memory, the OOM killer selects a victim based on oom_score (primarily memory usage). It might kill your database instead of a runaway batch job. Protect critical processes with `oom_score_adj = -1000` (never kill) and set appropriate cgroup memory limits so containers are killed before the host OOM killer activates. Monitor `/proc/meminfo` MemAvailable and set alerts at 10-15% remaining.

5. **Swap thrashing destroying performance**: When working set exceeds physical memory, the system pages out to swap (disk), and subsequent accesses trigger page faults requiring disk reads (milliseconds vs nanoseconds for RAM). This creates a death spiral where the system spends all time swapping instead of computing. Production systems often set `vm.swappiness=1` or disable swap entirely, relying on cgroup memory limits and OOM killing for memory pressure handling. Monitor with `vmstat` (si/so columns) and page fault rates.

6. **NUMA-unaware memory allocation**: On multi-socket servers, memory access latency depends on which NUMA node the memory is allocated from. Accessing remote-node memory costs 1.5-2x local access latency. Applications that allocate memory on one node but access it from threads on another node suffer significant performance degradation. Use `numactl --membind` or `set_mempolicy()` for NUMA-aware allocation. Monitor with `numastat` for cross-node access patterns.

## Real-World Use Cases

- **JVM garbage collection and OS interaction**: The JVM's garbage collector traverses the entire heap, touching every live object's header. With a 32GB heap using 4KB pages, that's 8 million TLB entries needed — far exceeding typical TLB capacity (1024-2048 entries). Huge pages (2MB) reduce this to ~16K entries, dramatically reducing GC pause times. ZGC uses colored pointers and memory mapping tricks (multiple virtual addresses mapping to the same physical page) for concurrent compaction without stop-the-world pauses.

- **Database buffer pool management**: PostgreSQL's shared_buffers and MySQL's InnoDB buffer pool manage their own page caches in shared memory. They use O_DIRECT to bypass the OS page cache (avoiding double-buffering), implement custom eviction policies (clock sweep for PostgreSQL, LRU with midpoint insertion for InnoDB), and use huge pages for the buffer pool. Understanding the interaction between application buffers, OS page cache, and physical memory is critical for database tuning.

- **Container memory limits and OOM behavior**: Kubernetes memory limits map to cgroup memory.max. When a container exceeds its limit, the cgroup OOM killer terminates a process within that cgroup (not the host OOM killer). The page cache counts against the cgroup limit, so a container doing heavy file I/O may OOM even with low heap usage. Set memory.high (soft limit with throttling) below memory.max to provide backpressure. Monitor container_memory_working_set_bytes (RSS + active page cache) rather than just RSS.

- **Redis memory management**: Redis stores all data in memory and uses jemalloc for allocation. Memory fragmentation (mem_fragmentation_ratio > 1.5) indicates jemalloc cannot efficiently reuse freed memory. Redis 4.0+ includes active defragmentation that moves allocations to reduce fragmentation. Understanding virtual memory helps explain why Redis RSS doesn't decrease after deleting keys (freed pages may not be returned to OS) and why fork-based persistence (RDB snapshots) temporarily doubles memory usage due to COW page duplication under write-heavy workloads.

- **Memory-mapped databases (LMDB, RocksDB)**: LMDB maps the entire database file into virtual memory, relying on the OS page cache for caching and the MMU for access. This eliminates application-level buffer management complexity and enables zero-copy reads. The database can be larger than physical RAM — the OS transparently pages in/out as needed. However, this approach makes performance dependent on OS page cache behavior and can suffer from page fault storms under memory pressure.

## Interview Questions

**Q: Explain the 4-level page table structure on x86-64 and why it exists.**

A: x86-64 uses 48 bits of virtual address space (256TB), divided into 4 levels of page tables: PGD (Page Global Directory), PUD (Page Upper Directory), PMD (Page Middle Directory), and PTE (Page Table Entry). Each level uses 9 bits of the virtual address to index into a 512-entry table, with the final 12 bits as the page offset (4KB pages). The hierarchical structure exists because a flat page table for 48-bit addresses would require 512GB of memory per process. With hierarchical tables, only populated regions of the address space need page table pages allocated — a process using 100MB might only need a few hundred page table pages rather than millions. Each entry contains the physical address of the next level (or the final frame) plus permission bits (present, writable, user-accessible, no-execute).

**Q: What is the TLB and why do huge pages improve performance?**

A: The TLB is a hardware cache in the CPU that stores recent virtual-to-physical address translations, avoiding the expensive 4-level page table walk (10-100 cycles) on every memory access. A typical L1 TLB has 64-128 entries and the L2 TLB has 1024-2048 entries. With 4KB pages, 2048 TLB entries cover only 8MB of address space — insufficient for applications with large working sets (databases, JVMs). Huge pages (2MB) allow each TLB entry to cover 512x more memory, so 2048 entries cover 4GB. This dramatically reduces TLB miss rates for applications with large, randomly-accessed memory regions. The tradeoff is increased internal fragmentation (allocating 2MB when you need 8KB wastes memory) and higher allocation cost (finding contiguous 2MB physical regions).

**Q: How does the OOM killer work and how do you protect critical processes?**

A: When the system exhausts physical memory and swap, the OOM killer selects a process to terminate based on oom_score (0-1000). The score is primarily based on the process's memory consumption as a proportion of total memory, adjusted by oom_score_adj (-1000 to +1000). Higher scores mean more likely to be killed. To protect critical processes: set oom_score_adj to -1000 (OOM_SCORE_ADJ_MIN) which makes the process unkillable by OOM. In containerized environments, set cgroup memory limits so the cgroup-level OOM killer activates before the system-wide one. Monitor /proc/meminfo MemAvailable and set alerts. Best practice: don't rely on OOM killer — use memory limits, monitoring, and backpressure to prevent OOM conditions entirely.

**Q: Explain copy-on-write and its implications for fork().**

A: Copy-on-write (COW) is an optimization where fork() doesn't copy the parent's physical memory pages. Instead, both parent and child share the same physical frames, with page table entries marked read-only. When either process writes to a shared page, the MMU triggers a protection fault, the kernel allocates a new frame, copies the original page content, updates the writer's page table entry to point to the new frame with write permission, and resumes execution. This makes fork() nearly O(1) regardless of process size. Implications: fork() in a process with a 32GB heap is fast (only page tables are copied, ~6MB for 32GB), but if the child writes to many pages (e.g., Redis during RDB save under write-heavy load), physical memory usage temporarily doubles. This is why Redis can OOM during background saves even with memory limits set to half of available RAM.

## Production Tips

- **Use cgroups v2 memory.high for graceful degradation**: Set memory.high below memory.max to throttle the process (slow down allocations) before hitting the hard limit that triggers OOM kill. This gives the application time to shed load or free caches. Monitor memory.events for high/max/oom counters. Example: memory.max=4G, memory.high=3.5G gives 500MB of throttling buffer before hard kill.

- **Monitor page fault rates to detect swap pressure**: Track major page faults (requiring disk I/O) via `/proc/pid/stat` field 12 or `perf stat -e page-faults`. A sudden increase in major faults indicates the working set exceeds physical memory and pages are being loaded from swap. Correlate with `vmstat` si/so (swap in/out) columns. For latency-sensitive services, any major page faults in steady state indicate a memory sizing problem.

- **Pre-fault memory for latency-sensitive applications**: After mmap() or malloc() of large regions, the memory isn't physically allocated until first access (demand paging). This causes page faults during request processing, adding latency jitter. Pre-fault by touching every page at startup: `memset(ptr, 0, size)` or use MAP_POPULATE with mmap(). JVMs use -XX:+AlwaysPreTouch to pre-fault the entire heap at startup, trading slower startup for consistent runtime latency.

- **Configure NUMA-aware memory allocation for multi-socket systems**: On dual-socket servers, memory access to the remote NUMA node costs 40-100ns more than local access. Use `numactl --localalloc` to keep allocations on the local node, or `--interleave=all` for workloads that access memory from all cores equally. Monitor with `numastat -p <pid>` to detect excessive remote-node allocations. Database buffer pools should be NUMA-interleaved since all cores access the shared buffer.

## Related Topics

- [Processes and Threads](./processes-and-threads.md) — Process address spaces and fork/exec rely on virtual memory and COW
- [File Systems](./file-systems.md) — The page cache bridges memory management and file I/O, buffering disk data in RAM
- [I/O and Scheduling](./io-and-scheduling.md) — Memory-mapped I/O and page faults interact with the I/O subsystem
