# File Systems

## Quick Reference

- **Inodes** store file metadata (size, permissions, timestamps, block pointers) separately from directory entries (which map names to inode numbers)
- **ext4** is Linux's default filesystem: supports files up to 16TB, volumes up to 1EB, uses extents (contiguous block ranges) instead of indirect block pointers
- **XFS** excels at large files and parallel I/O: uses B+ trees for metadata, allocation groups for parallelism, and delayed allocation to reduce fragmentation
- **Journaling** writes metadata changes to a log before applying them, enabling crash recovery by replaying or discarding incomplete transactions
- The **VFS** (Virtual File System) layer provides a uniform interface (open, read, write, stat) across all filesystem implementations (ext4, XFS, NFS, procfs, tmpfs)
- The **page cache** buffers file data in RAM; reads are served from cache when possible, writes are buffered and flushed asynchronously (writeback)
- **Direct I/O** (O_DIRECT) bypasses the page cache for applications managing their own caching (databases), avoiding double-buffering overhead
- Hard links create multiple directory entries pointing to the same inode; symbolic links store a target path string resolved at access time
- `fsync()` flushes file data and metadata to persistent storage; `fdatasync()` flushes only data and essential metadata (not timestamps)

## When to Use

File system knowledge is critical when:

- **Choosing a filesystem for production workloads** — ext4 for general-purpose, XFS for large files and high-throughput sequential I/O, ZFS/Btrfs for data integrity and snapshots, tmpfs for ephemeral high-speed storage
- **Tuning database storage** — understanding how journaling interacts with database WAL, when to use O_DIRECT vs buffered I/O, how to align I/O to filesystem block boundaries for optimal performance
- **Diagnosing I/O performance issues** — distinguishing between filesystem-level bottlenecks (metadata operations, journal contention) and device-level bottlenecks (disk throughput, IOPS limits)
- **Designing backup and snapshot strategies** — leveraging filesystem snapshots (LVM, ZFS, Btrfs) for consistent point-in-time copies without stopping applications
- **Implementing log rotation and archival** — understanding how rename() is atomic within a filesystem, how hard links enable zero-downtime log rotation, and how inotify monitors file changes
- **Configuring container storage** — choosing between overlay filesystems (overlayfs for Docker layers), bind mounts, and volume drivers for persistent container data

## Code Examples

### File System Operations and Metadata Inspection (C)

```c
#include <stdio.h>
#include <stdlib.h>
#include <fcntl.h>
#include <unistd.h>
#include <sys/stat.h>
#include <sys/statvfs.h>
#include <string.h>
#include <errno.h>
#include <time.h>

// Demonstrate atomic file write using rename
int atomic_write(const char *path, const void *data, size_t len) {
    char tmp_path[256];
    snprintf(tmp_path, sizeof(tmp_path), "%s.tmp.%d", path, getpid());
    
    // Write to temporary file
    int fd = open(tmp_path, O_WRONLY | O_CREAT | O_TRUNC | O_CLOEXEC, 0644);
    if (fd == -1) return -1;
    
    ssize_t written = write(fd, data, len);
    if (written != (ssize_t)len) {
        close(fd);
        unlink(tmp_path);
        return -1;
    }
    
    // Flush data to disk (not just OS buffers)
    if (fsync(fd) == -1) {
        close(fd);
        unlink(tmp_path);
        return -1;
    }
    close(fd);
    
    // Atomic rename replaces old file
    if (rename(tmp_path, path) == -1) {
        unlink(tmp_path);
        return -1;
    }
    
    // fsync the directory to ensure rename is persisted
    int dir_fd = open(".", O_RDONLY | O_DIRECTORY);
    if (dir_fd != -1) {
        fsync(dir_fd);
        close(dir_fd);
    }
    
    return 0;
}

// Inspect inode metadata
void print_inode_info(const char *path) {
    struct stat st;
    if (lstat(path, &st) == -1) {
        perror("lstat");
        return;
    }
    
    printf("File: %s\n", path);
    printf("  Inode: %lu\n", (unsigned long)st.st_ino);
    printf("  Device: %lu\n", (unsigned long)st.st_dev);
    printf("  Links: %lu\n", (unsigned long)st.st_nlink);
    printf("  Size: %ld bytes\n", (long)st.st_size);
    printf("  Blocks: %ld (512-byte)\n", (long)st.st_blocks);
    printf("  Block size: %ld\n", (long)st.st_blksize);
    printf("  Type: ");
    
    if (S_ISREG(st.st_mode)) printf("regular file\n");
    else if (S_ISDIR(st.st_mode)) printf("directory\n");
    else if (S_ISLNK(st.st_mode)) printf("symbolic link\n");
    else if (S_ISBLK(st.st_mode)) printf("block device\n");
    else if (S_ISCHR(st.st_mode)) printf("character device\n");
    else if (S_ISFIFO(st.st_mode)) printf("FIFO/pipe\n");
    else if (S_ISSOCK(st.st_mode)) printf("socket\n");
    
    char time_buf[64];
    struct tm *tm = localtime(&st.st_mtime);
    strftime(time_buf, sizeof(time_buf), "%Y-%m-%d %H:%M:%S", tm);
    printf("  Modified: %s\n", time_buf);
}

// Check filesystem capacity
void print_fs_stats(const char *path) {
    struct statvfs vfs;
    if (statvfs(path, &vfs) == -1) {
        perror("statvfs");
        return;
    }
    
    unsigned long total = vfs.f_blocks * vfs.f_frsize;
    unsigned long free = vfs.f_bfree * vfs.f_frsize;
    unsigned long avail = vfs.f_bavail * vfs.f_frsize;  // Available to non-root
    
    printf("Filesystem stats for %s:\n", path);
    printf("  Total: %lu MB\n", total / (1024 * 1024));
    printf("  Free: %lu MB\n", free / (1024 * 1024));
    printf("  Available: %lu MB\n", avail / (1024 * 1024));
    printf("  Inodes total: %lu\n", (unsigned long)vfs.f_files);
    printf("  Inodes free: %lu\n", (unsigned long)vfs.f_ffree);
}
```

### Buffered vs Direct I/O Performance Comparison (C)

```c
#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <fcntl.h>
#include <unistd.h>
#include <time.h>
#include <string.h>
#include <sys/stat.h>

#define FILE_SIZE (256 * 1024 * 1024)  // 256MB
#define BLOCK_SIZE (4096)              // 4KB aligned for O_DIRECT

// Allocate aligned buffer for direct I/O
void *aligned_alloc_buffer(size_t size) {
    void *buf;
    if (posix_memalign(&buf, BLOCK_SIZE, size) != 0) {
        return NULL;
    }
    return buf;
}

double time_diff_ms(struct timespec *start, struct timespec *end) {
    return (end->tv_sec - start->tv_sec) * 1000.0 +
           (end->tv_nsec - start->tv_nsec) / 1000000.0;
}

// Write with buffered I/O (uses page cache)
double benchmark_buffered_write(const char *path) {
    int fd = open(path, O_WRONLY | O_CREAT | O_TRUNC, 0644);
    char *buf = malloc(BLOCK_SIZE);
    memset(buf, 'A', BLOCK_SIZE);
    
    struct timespec start, end;
    clock_gettime(CLOCK_MONOTONIC, &start);
    
    size_t total = 0;
    while (total < FILE_SIZE) {
        write(fd, buf, BLOCK_SIZE);
        total += BLOCK_SIZE;
    }
    fsync(fd);  // Ensure data hits disk
    
    clock_gettime(CLOCK_MONOTONIC, &end);
    close(fd);
    free(buf);
    
    return time_diff_ms(&start, &end);
}

// Write with direct I/O (bypasses page cache)
double benchmark_direct_write(const char *path) {
    int fd = open(path, O_WRONLY | O_CREAT | O_TRUNC | O_DIRECT, 0644);
    if (fd == -1) {
        perror("open O_DIRECT");
        return -1;
    }
    
    char *buf = aligned_alloc_buffer(BLOCK_SIZE);
    memset(buf, 'B', BLOCK_SIZE);
    
    struct timespec start, end;
    clock_gettime(CLOCK_MONOTONIC, &start);
    
    size_t total = 0;
    while (total < FILE_SIZE) {
        write(fd, buf, BLOCK_SIZE);
        total += BLOCK_SIZE;
    }
    // No fsync needed - O_DIRECT writes go directly to device
    
    clock_gettime(CLOCK_MONOTONIC, &end);
    close(fd);
    free(buf);
    
    return time_diff_ms(&start, &end);
}

int main() {
    printf("Writing %d MB...\n", FILE_SIZE / (1024 * 1024));
    
    double buffered_ms = benchmark_buffered_write("/tmp/bench_buffered");
    printf("Buffered I/O: %.1f ms (%.1f MB/s)\n",
           buffered_ms, (FILE_SIZE / (1024.0 * 1024.0)) / (buffered_ms / 1000.0));
    
    double direct_ms = benchmark_direct_write("/tmp/bench_direct");
    printf("Direct I/O:   %.1f ms (%.1f MB/s)\n",
           direct_ms, (FILE_SIZE / (1024.0 * 1024.0)) / (direct_ms / 1000.0));
    
    unlink("/tmp/bench_buffered");
    unlink("/tmp/bench_direct");
    return 0;
}
```

### File System Event Monitoring with inotify (C)

```c
#include <stdio.h>
#include <stdlib.h>
#include <sys/inotify.h>
#include <unistd.h>
#include <string.h>
#include <errno.h>

#define EVENT_BUF_SIZE (1024 * (sizeof(struct inotify_event) + 256))

void print_event(struct inotify_event *event) {
    printf("  ");
    if (event->mask & IN_CREATE) printf("CREATED: ");
    if (event->mask & IN_DELETE) printf("DELETED: ");
    if (event->mask & IN_MODIFY) printf("MODIFIED: ");
    if (event->mask & IN_MOVED_FROM) printf("MOVED_FROM: ");
    if (event->mask & IN_MOVED_TO) printf("MOVED_TO: ");
    if (event->mask & IN_ATTRIB) printf("ATTRIB_CHANGED: ");
    
    if (event->len > 0) {
        printf("%s", event->name);
    }
    
    if (event->mask & IN_ISDIR) printf(" [directory]");
    printf("\n");
}

int main(int argc, char *argv[]) {
    const char *watch_path = argc > 1 ? argv[1] : "/tmp";
    
    int inotify_fd = inotify_init1(IN_NONBLOCK | IN_CLOEXEC);
    if (inotify_fd == -1) {
        perror("inotify_init1");
        exit(EXIT_FAILURE);
    }
    
    uint32_t mask = IN_CREATE | IN_DELETE | IN_MODIFY | IN_MOVED_FROM | IN_MOVED_TO;
    int wd = inotify_add_watch(inotify_fd, watch_path, mask);
    if (wd == -1) {
        perror("inotify_add_watch");
        exit(EXIT_FAILURE);
    }
    
    printf("Watching %s for filesystem events...\n", watch_path);
    
    char buf[EVENT_BUF_SIZE];
    while (1) {
        ssize_t len = read(inotify_fd, buf, sizeof(buf));
        if (len == -1) {
            if (errno == EAGAIN) {
                usleep(100000);  // 100ms poll interval
                continue;
            }
            perror("read");
            break;
        }
        
        char *ptr = buf;
        while (ptr < buf + len) {
            struct inotify_event *event = (struct inotify_event *)ptr;
            print_event(event);
            ptr += sizeof(struct inotify_event) + event->len;
        }
    }
    
    inotify_rm_watch(inotify_fd, wd);
    close(inotify_fd);
    return 0;
}
```

### Journaling Simulation (Python)

```python
import json
import os
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional

class TxState(Enum):
    PENDING = "pending"
    COMMITTED = "committed"
    APPLIED = "applied"
    ABORTED = "aborted"

@dataclass
class JournalEntry:
    tx_id: int
    timestamp: float
    operations: List[dict]
    state: TxState = TxState.PENDING

class JournaledFileSystem:
    """Simulates a write-ahead journaling filesystem."""
    
    def __init__(self, journal_path: str, data_path: str):
        self.journal_path = journal_path
        self.data_path = data_path
        self.next_tx_id = 1
        self.journal: List[JournalEntry] = []
        self.data: Dict[str, bytes] = {}
        
        # Recover from crash if journal exists
        self._recover()
    
    def write_file(self, filename: str, content: bytes) -> int:
        """Write file with journaling for crash consistency."""
        tx_id = self.next_tx_id
        self.next_tx_id += 1
        
        # Phase 1: Write intent to journal
        entry = JournalEntry(
            tx_id=tx_id,
            timestamp=time.time(),
            operations=[{
                "op": "write",
                "file": filename,
                "size": len(content),
                "checksum": hash(content)
            }]
        )
        self.journal.append(entry)
        self._flush_journal()
        
        # Phase 2: Mark as committed (point of no return)
        entry.state = TxState.COMMITTED
        self._flush_journal()
        
        # Phase 3: Apply to data area
        self.data[filename] = content
        self._flush_data()
        
        # Phase 4: Mark as applied (can be garbage collected)
        entry.state = TxState.APPLIED
        self._flush_journal()
        
        return tx_id
    
    def delete_file(self, filename: str) -> int:
        tx_id = self.next_tx_id
        self.next_tx_id += 1
        
        entry = JournalEntry(
            tx_id=tx_id,
            timestamp=time.time(),
            operations=[{"op": "delete", "file": filename}]
        )
        self.journal.append(entry)
        self._flush_journal()
        
        entry.state = TxState.COMMITTED
        self._flush_journal()
        
        self.data.pop(filename, None)
        self._flush_data()
        
        entry.state = TxState.APPLIED
        self._flush_journal()
        
        return tx_id
    
    def _recover(self):
        """Replay committed but unapplied journal entries after crash."""
        if not os.path.exists(self.journal_path):
            return
        
        with open(self.journal_path, 'r') as f:
            saved_journal = json.load(f)
        
        for entry_data in saved_journal:
            entry = JournalEntry(**entry_data)
            if entry.state == TxState.COMMITTED:
                # Replay: apply the operation
                for op in entry.operations:
                    if op["op"] == "write":
                        print(f"Recovery: replaying write to {op['file']}")
                    elif op["op"] == "delete":
                        self.data.pop(op["file"], None)
                entry.state = TxState.APPLIED
            elif entry.state == TxState.PENDING:
                # Incomplete: discard
                entry.state = TxState.ABORTED
                print(f"Recovery: aborting incomplete tx {entry.tx_id}")
    
    def _flush_journal(self):
        """Persist journal to disk."""
        with open(self.journal_path, 'w') as f:
            json.dump([{
                "tx_id": e.tx_id,
                "timestamp": e.timestamp,
                "operations": e.operations,
                "state": e.state.value
            } for e in self.journal], f)
            f.flush()
            os.fsync(f.fileno())
    
    def _flush_data(self):
        """Persist data to disk."""
        with open(self.data_path, 'w') as f:
            json.dump({k: v.hex() for k, v in self.data.items()}, f)
            f.flush()
            os.fsync(f.fileno())
```

## Common Pitfalls

1. **Not calling fsync() after critical writes**: write() only transfers data to the kernel page cache — it doesn't guarantee persistence to disk. A power failure after write() but before the kernel flushes dirty pages loses data. For durability, call fsync(fd) after writing critical data (database WAL entries, configuration files). Note: fsync() is expensive (forces disk flush, ~5-10ms on HDD, ~0.1ms on NVMe). Batch writes and fsync once rather than per-write.

2. **Assuming rename() is durable without directory fsync**: rename() is atomic (the file appears at the new path or the old path, never both or neither), but it's not durable until the directory entry is persisted. After rename(), fsync the parent directory to ensure the rename survives a crash. Many applications (including early versions of PostgreSQL) had data loss bugs from missing directory fsync.

3. **Running out of inodes before disk space**: Each file and directory consumes one inode. Filesystems allocate a fixed number of inodes at creation time (ext4 default: 1 inode per 16KB of space). Workloads with millions of tiny files (mail servers, package caches) can exhaust inodes while disk space remains available. Check with `df -i`. XFS dynamically allocates inodes and doesn't have this limitation.

4. **Ignoring the 5% reserved space on ext4**: ext4 reserves 5% of disk space for root by default (tune2fs -m). On a 1TB filesystem, that's 50GB unavailable to normal users. This prevents the filesystem from becoming 100% full (which causes severe fragmentation and potential system instability). Reduce to 1% for data-only volumes: `tune2fs -m 1 /dev/sdX`. Never set to 0% on root filesystems.

5. **Using O_DIRECT without proper alignment**: Direct I/O requires buffer addresses, file offsets, and transfer sizes to be aligned to the filesystem block size (typically 512 bytes or 4096 bytes). Unaligned O_DIRECT operations fail with EINVAL. Use posix_memalign() or aligned_alloc() for buffers. This is a common source of bugs when porting database code between filesystems with different alignment requirements.

6. **Ext4 metadata journaling doesn't protect file data**: The default ext4 mount option (data=ordered) ensures metadata is consistent after crash but doesn't journal file data. A crash during a write can leave a file with correct metadata (size, blocks) but stale or zero-filled data blocks. For applications requiring data consistency, use data=journal mount option (2x write amplification) or implement application-level WAL (write-ahead logging).

## Real-World Use Cases

- **Docker overlay filesystem**: Docker uses overlayfs to layer container images. Each image layer is a read-only directory; the container's writable layer sits on top. File reads traverse layers top-down until found. Writes use copy-up: the file is copied from the lower layer to the upper layer before modification. Understanding overlayfs explains why first writes to large files in containers are slow (copy-up overhead) and why container image layer ordering matters for build cache efficiency.

- **PostgreSQL WAL and fsync**: PostgreSQL writes all changes to the Write-Ahead Log before applying them to data files. WAL records are fsync'd to disk at commit time (synchronous_commit=on), ensuring durability. The infamous "fsync bug" (2018) revealed that Linux's fsync() could silently fail — PostgreSQL now uses O_DIRECT for WAL or retries fsync on failure. Understanding the interaction between WAL, page cache, and fsync is essential for database reliability.

- **Log-structured merge trees (LSM) in RocksDB/LevelDB**: LSM-tree databases write all data sequentially to immutable sorted files (SSTables), then merge them in background compaction. This converts random writes to sequential writes, achieving high write throughput on both HDD and SSD. Understanding filesystem sequential write performance, the impact of compaction on I/O bandwidth, and how to tune compaction to avoid write stalls requires deep filesystem knowledge.

- **NFS and distributed file access**: NFS provides transparent remote file access using the VFS layer — applications use standard file operations without knowing files are remote. NFS v4 adds stateful operations (file locking, delegation) and compound operations (multiple ops in one RPC). Understanding VFS, caching semantics (close-to-open consistency), and the CAP theorem tradeoffs in distributed filesystems helps debug NFS performance issues and stale file handle errors.

- **ZFS for data integrity**: ZFS checksums every block (data and metadata), detecting silent data corruption (bit rot) that traditional filesystems miss. It uses copy-on-write for atomic updates, supports transparent compression (LZ4, ZSTD), deduplication, and send/receive for efficient replication. ZFS is used in storage servers (FreeNAS/TrueNAS), database backups, and any environment where data integrity is paramount.

## Interview Questions

**Q: Explain the difference between hard links and symbolic links. What happens when you delete the original file?**

A: A hard link is an additional directory entry pointing to the same inode — the file's data blocks are shared, and the inode's link count tracks how many directory entries reference it. Deleting any one name just decrements the link count; the data is only freed when the link count reaches zero (and no processes have the file open). A symbolic link is a separate file containing a path string that is resolved at access time. If the target is deleted, the symlink becomes a "dangling" reference — accessing it returns ENOENT. Hard links cannot cross filesystem boundaries (different filesystems have independent inode spaces) and cannot link to directories (to prevent cycles in the directory tree). Symbolic links can cross filesystems and link to directories.

**Q: How does journaling provide crash consistency? What are the tradeoffs between metadata-only and full data journaling?**

A: Journaling writes a description of intended changes to a sequential log (journal) before modifying the actual filesystem structures. If a crash occurs mid-operation, recovery replays committed journal entries (redo) or discards uncommitted ones (undo). Metadata-only journaling (ext4 default, data=ordered) journals structural changes (inode updates, block allocation, directory modifications) but not file data. This ensures filesystem structure is always consistent but a crash during a write can leave files with allocated blocks containing stale data. Full data journaling (data=journal) writes both metadata and file data to the journal first, providing complete consistency but at 2x write amplification cost (data written twice: journal then final location). Most production systems use metadata-only journaling with application-level WAL for data consistency.

**Q: What is the VFS layer and why does Linux need it?**

A: The Virtual File System (VFS) is an abstraction layer that provides a uniform API (open, read, write, stat, mkdir) for all filesystem implementations. Without VFS, every application would need filesystem-specific code. VFS defines abstract operation tables (inode_operations, file_operations, super_operations, dentry_operations) that each filesystem driver implements. When an application calls read(), the VFS resolves the path through the dentry cache, finds the inode, and dispatches to the filesystem-specific read implementation. This enables transparent access to ext4, XFS, NFS, procfs, sysfs, tmpfs, FUSE filesystems, and any future filesystem through the same system calls. It also enables features like union mounts (overlayfs) and bind mounts that compose multiple filesystems.

**Q: Why do databases use O_DIRECT instead of relying on the OS page cache?**

A: Databases use O_DIRECT to bypass the OS page cache for several reasons: (1) **Avoid double-buffering** — databases maintain their own buffer pool with application-specific eviction policies (LRU-2, clock sweep), so caching in the page cache wastes RAM. (2) **Predictable memory usage** — without O_DIRECT, the page cache grows unpredictably, potentially evicting other processes' pages or triggering OOM. (3) **Control over write ordering** — databases need precise control over when data hits disk (WAL before data pages); the page cache's writeback is asynchronous and unordered. (4) **Avoid readahead waste** — the kernel's readahead heuristics don't match database access patterns (random page reads). The tradeoff: O_DIRECT requires aligned buffers, aligned offsets, and the application must implement its own caching and readahead logic.

## Production Tips

- **Monitor inode usage alongside disk space**: `df -i` shows inode utilization. Systems with many small files (container image layers, mail spools, package caches) can exhaust inodes before disk space. Set monitoring alerts at 80% inode usage. On ext4, inode count is fixed at filesystem creation — the only fix is reformatting. XFS dynamically allocates inodes and doesn't have this limitation.

- **Use noatime mount option for read-heavy workloads**: By default, Linux updates the access time (atime) on every file read, generating a write for every read operation. Mount with `noatime` or `relatime` (updates atime only if older than mtime) to eliminate this overhead. This is especially impactful for workloads that read many small files (web servers serving static content, package managers scanning directories).

- **Tune dirty page writeback for your workload**: The kernel's dirty page writeback parameters (`vm.dirty_ratio`, `vm.dirty_background_ratio`, `vm.dirty_expire_centisecs`) control when buffered writes are flushed to disk. High values improve write throughput (more batching) but increase data loss risk on crash and cause write stalls when the dirty limit is hit. For databases: lower values (5-10%) for predictable latency. For batch processing: higher values (20-40%) for throughput.

- **Use filesystem-level encryption (fscrypt) for data at rest**: Linux's fscrypt provides per-file encryption at the filesystem level (supported by ext4, F2FS). It's more efficient than full-disk encryption (dm-crypt) because only file contents and names are encrypted — metadata operations don't require decryption. Each directory can have a different encryption key, enabling per-user or per-application key management without separate partitions.

## Related Topics

- [Memory Management](./memory-management.md) — The page cache bridges file I/O and memory management, buffering file data in physical RAM
- [I/O and Scheduling](./io-and-scheduling.md) — I/O scheduling algorithms determine how filesystem block requests are ordered and dispatched to storage devices
- [Processes and Threads](./processes-and-threads.md) — File descriptors are per-process resources inherited across fork() and shared between threads
