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

### Virtual Memory Page Table Walk Simulation (C)

```c
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>

#define PAGE_SIZE       4096
#define ENTRIES_PER_TABLE 512
#define PTE_PRESENT     (1UL << 0)
#define PTE_WRITABLE    (1UL << 1)
#define PTE_USER        (1UL << 2)
#define PTE_ACCESSED    (1UL << 5)
#define PTE_DIRTY       (1UL << 6)
#define PTE_ADDR_MASK   0x000FFFFFFFFFF000UL

typedef struct {
    uint64_t entries[ENTRIES_PER_TABLE];
} PageTable;

typedef struct {
    PageTable *pgd;
    uint64_t page_faults;
    uint64_t tlb_hits;
    uint64_t translations;
} AddressSpace;

// Extract indices from 48-bit virtual address
static inline uint64_t pgd_index(uint64_t va) { return (va >> 39) & 0x1FF; }
static inline uint64_t pud_index(uint64_t va) { return (va >> 30) & 0x1FF; }
static inline uint64_t pmd_index(uint64_t va) { return (va >> 21) & 0x1FF; }
static inline uint64_t pte_index(uint64_t va) { return (va >> 12) & 0x1FF; }
static inline uint64_t page_offset(uint64_t va) { return va & 0xFFF; }

// Allocate and zero a new page table
PageTable *alloc_page_table() {
    PageTable *pt = (PageTable *)calloc(1, sizeof(PageTable));
    return pt;
}

// Map a virtual page to a physical frame
int map_page(AddressSpace *as, uint64_t vaddr, uint64_t paddr, uint64_t flags) {
    uint64_t entry;
    
    // Walk/create PGD -> PUD
    entry = as->pgd->entries[pgd_index(vaddr)];
    PageTable *pud;
    if (!(entry & PTE_PRESENT)) {
        pud = alloc_page_table();
        as->pgd->entries[pgd_index(vaddr)] = (uint64_t)pud | PTE_PRESENT | PTE_WRITABLE | PTE_USER;
    } else {
        pud = (PageTable *)(entry & PTE_ADDR_MASK);
    }
    
    // Walk/create PUD -> PMD
    entry = pud->entries[pud_index(vaddr)];
    PageTable *pmd;
    if (!(entry & PTE_PRESENT)) {
        pmd = alloc_page_table();
        pud->entries[pud_index(vaddr)] = (uint64_t)pmd | PTE_PRESENT | PTE_WRITABLE | PTE_USER;
    } else {
        pmd = (PageTable *)(entry & PTE_ADDR_MASK);
    }
    
    // Walk/create PMD -> PTE
    entry = pmd->entries[pmd_index(vaddr)];
    PageTable *pte;
    if (!(entry & PTE_PRESENT)) {
        pte = alloc_page_table();
        pmd->entries[pmd_index(vaddr)] = (uint64_t)pte | PTE_PRESENT | PTE_WRITABLE | PTE_USER;
    } else {
        pte = (PageTable *)(entry & PTE_ADDR_MASK);
    }
    
    // Set the final PTE
    pte->entries[pte_index(vaddr)] = (paddr & PTE_ADDR_MASK) | flags | PTE_PRESENT;
    return 0;
}

// Translate virtual address to physical address
uint64_t translate(AddressSpace *as, uint64_t vaddr) {
    as->translations++;
    
    uint64_t entry = as->pgd->entries[pgd_index(vaddr)];
    if (!(entry & PTE_PRESENT)) { as->page_faults++; return 0; }
    
    PageTable *pud = (PageTable *)(entry & PTE_ADDR_MASK);
    entry = pud->entries[pud_index(vaddr)];
    if (!(entry & PTE_PRESENT)) { as->page_faults++; return 0; }
    
    PageTable *pmd = (PageTable *)(entry & PTE_ADDR_MASK);
    entry = pmd->entries[pmd_index(vaddr)];
    if (!(entry & PTE_PRESENT)) { as->page_faults++; return 0; }
    
    PageTable *pte = (PageTable *)(entry & PTE_ADDR_MASK);
    entry = pte->entries[pte_index(vaddr)];
    if (!(entry & PTE_PRESENT)) { as->page_faults++; return 0; }
    
    // Mark accessed
    pte->entries[pte_index(vaddr)] |= PTE_ACCESSED;
    
    return (entry & PTE_ADDR_MASK) | page_offset(vaddr);
}
```

### Memory-Mapped File I/O (C)

```c
#include <stdio.h>
#include <stdlib.h>
#include <fcntl.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <unistd.h>
#include <string.h>

// Memory-mapped file for a simple key-value store
typedef struct {
    char key[64];
    char value[256];
    uint32_t hash;
    uint8_t occupied;
} Entry;

typedef struct {
    uint32_t count;
    uint32_t capacity;
    Entry entries[];  // Flexible array member
} MappedHashTable;

MappedHashTable *create_mapped_table(const char *path, uint32_t capacity) {
    size_t size = sizeof(MappedHashTable) + capacity * sizeof(Entry);
    
    int fd = open(path, O_RDWR | O_CREAT | O_TRUNC, 0644);
    if (fd == -1) return NULL;
    
    // Extend file to required size
    if (ftruncate(fd, size) == -1) {
        close(fd);
        return NULL;
    }
    
    // Map file into memory
    MappedHashTable *table = mmap(NULL, size, PROT_READ | PROT_WRITE,
                                   MAP_SHARED, fd, 0);
    close(fd);  // fd can be closed after mmap
    
    if (table == MAP_FAILED) return NULL;
    
    table->count = 0;
    table->capacity = capacity;
    memset(table->entries, 0, capacity * sizeof(Entry));
    
    // Advise kernel about access pattern
    madvise(table, size, MADV_RANDOM);
    
    return table;
}

MappedHashTable *open_mapped_table(const char *path) {
    int fd = open(path, O_RDWR);
    if (fd == -1) return NULL;
    
    struct stat st;
    fstat(fd, &st);
    
    MappedHashTable *table = mmap(NULL, st.st_size, PROT_READ | PROT_WRITE,
                                   MAP_SHARED, fd, 0);
    close(fd);
    
    return (table == MAP_FAILED) ? NULL : table;
}

// Changes are automatically persisted to disk via page cache
// Use msync() for explicit durability guarantees
void sync_table(MappedHashTable *table) {
    size_t size = sizeof(MappedHashTable) + table->capacity * sizeof(Entry);
    msync(table, size, MS_SYNC);  // Blocks until written to disk
}
```

### Custom Memory Allocator with Free List (C)

```c
#include <stdint.h>
#include <sys/mman.h>
#include <string.h>

#define ARENA_SIZE (1024 * 1024)  // 1MB arena
#define ALIGNMENT 16
#define ALIGN(size) (((size) + (ALIGNMENT - 1)) & ~(ALIGNMENT - 1))

typedef struct Block {
    size_t size;
    struct Block *next;
    uint8_t free;
} Block;

#define BLOCK_HEADER_SIZE ALIGN(sizeof(Block))

typedef struct {
    void *arena;
    size_t arena_size;
    Block *free_list;
    size_t allocated;
    size_t peak_allocated;
} Allocator;

Allocator *allocator_create() {
    // Request memory from OS via mmap (bypasses malloc)
    void *arena = mmap(NULL, ARENA_SIZE, PROT_READ | PROT_WRITE,
                       MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
    if (arena == MAP_FAILED) return NULL;
    
    Allocator *alloc = (Allocator *)arena;
    alloc->arena = (uint8_t *)arena + ALIGN(sizeof(Allocator));
    alloc->arena_size = ARENA_SIZE - ALIGN(sizeof(Allocator));
    alloc->allocated = 0;
    alloc->peak_allocated = 0;
    
    // Initialize free list with single large block
    alloc->free_list = (Block *)alloc->arena;
    alloc->free_list->size = alloc->arena_size - BLOCK_HEADER_SIZE;
    alloc->free_list->next = NULL;
    alloc->free_list->free = 1;
    
    return alloc;
}

void *allocator_alloc(Allocator *alloc, size_t size) {
    size = ALIGN(size);
    
    // First-fit search through free list
    Block *prev = NULL;
    Block *curr = alloc->free_list;
    
    while (curr) {
        if (curr->free && curr->size >= size) {
            // Split block if remainder is large enough
            if (curr->size >= size + BLOCK_HEADER_SIZE + ALIGNMENT) {
                Block *new_block = (Block *)((uint8_t *)curr + BLOCK_HEADER_SIZE + size);
                new_block->size = curr->size - size - BLOCK_HEADER_SIZE;
                new_block->next = curr->next;
                new_block->free = 1;
                
                curr->size = size;
                curr->next = new_block;
            }
            
            curr->free = 0;
            alloc->allocated += curr->size;
            if (alloc->allocated > alloc->peak_allocated)
                alloc->peak_allocated = alloc->allocated;
            
            return (uint8_t *)curr + BLOCK_HEADER_SIZE;
        }
        prev = curr;
        curr = curr->next;
    }
    
    return NULL;  // Out of memory
}

void allocator_free(Allocator *alloc, void *ptr) {
    if (!ptr) return;
    
    Block *block = (Block *)((uint8_t *)ptr - BLOCK_HEADER_SIZE);
    block->free = 1;
    alloc->allocated -= block->size;
    
    // Coalesce adjacent free blocks
    Block *curr = alloc->free_list;
    while (curr) {
        if (curr->free && curr->next && curr->next->free) {
            curr->size += BLOCK_HEADER_SIZE + curr->next->size;
            curr->next = curr->next->next;
            continue;  // Check again in case of multiple adjacent free blocks
        }
        curr = curr->next;
    }
}
```

### LRU Page Replacement Simulation (Python)

```python
from collections import OrderedDict
from dataclasses import dataclass
from enum import Enum
from typing import Optional

class PageState(Enum):
    CLEAN = "clean"
    DIRTY = "dirty"

@dataclass
class PageFrame:
    page_number: int
    state: PageState
    access_count: int = 0

class LRUPageCache:
    """Simulates OS page cache with LRU eviction policy."""
    
    def __init__(self, num_frames: int):
        self.num_frames = num_frames
        self.frames: OrderedDict[int, PageFrame] = OrderedDict()
        self.page_faults = 0
        self.disk_writes = 0
        self.total_accesses = 0
    
    def access(self, page_number: int, write: bool = False) -> bool:
        """Access a page. Returns True if page was in cache (hit)."""
        self.total_accesses += 1
        
        if page_number in self.frames:
            # Cache hit: move to end (most recently used)
            self.frames.move_to_end(page_number)
            frame = self.frames[page_number]
            frame.access_count += 1
            if write:
                frame.state = PageState.DIRTY
            return True
        
        # Cache miss: page fault
        self.page_faults += 1
        
        # Evict LRU page if cache is full
        if len(self.frames) >= self.num_frames:
            self._evict_lru()
        
        # Load new page
        state = PageState.DIRTY if write else PageState.CLEAN
        self.frames[page_number] = PageFrame(
            page_number=page_number,
            state=state,
            access_count=1
        )
        return False
    
    def _evict_lru(self):
        """Evict the least recently used page."""
        # OrderedDict.popitem(last=False) removes the first (oldest) item
        page_num, frame = self.frames.popitem(last=False)
        if frame.state == PageState.DIRTY:
            self.disk_writes += 1  # Must write back dirty page
    
    @property
    def hit_rate(self) -> float:
        if self.total_accesses == 0:
            return 0.0
        return 1.0 - (self.page_faults / self.total_accesses)
    
    def stats(self) -> dict:
        return {
            "total_accesses": self.total_accesses,
            "page_faults": self.page_faults,
            "disk_writes": self.disk_writes,
            "hit_rate": f"{self.hit_rate:.2%}",
            "frames_used": len(self.frames),
        }

# Simulate a workload
cache = LRUPageCache(num_frames=4)
# Locality-heavy access pattern
accesses = [1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5, 1, 2, 3]
for page in accesses:
    hit = cache.access(page, write=(page % 2 == 0))
    status = "HIT" if hit else "MISS"
    print(f"Access page {page}: {status}")

print(f"\nStats: {cache.stats()}")
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
