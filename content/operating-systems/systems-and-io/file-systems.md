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

### File System Operations and Metadata Inspection (Java)

```java
import java.io.*;
import java.nio.file.*;
import java.nio.file.attribute.*;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;

public class FileSystemOps {

    // Demonstrate atomic file write using rename
    static boolean atomicWrite(Path path, byte[] data) throws IOException {
        Path tmpPath = path.resolveSibling(path.getFileName() + ".tmp." + ProcessHandle.current().pid());

        try {
            // Write to temporary file
            Files.write(tmpPath, data, StandardOpenOption.CREATE,
                    StandardOpenOption.WRITE, StandardOpenOption.TRUNCATE_EXISTING);

            // Force data to disk (not just OS buffers)
            try (FileOutputStream fos = new FileOutputStream(tmpPath.toFile())) {
                fos.getFD().sync();
            }

            // Atomic rename replaces old file
            Files.move(tmpPath, path, StandardCopyOption.ATOMIC_MOVE,
                    StandardCopyOption.REPLACE_EXISTING);

            return true;
        } catch (IOException e) {
            Files.deleteIfExists(tmpPath);
            return false;
        }
    }

    // Inspect file metadata (similar to inode info)
    static void printFileInfo(Path path) throws IOException {
        BasicFileAttributes attrs = Files.readAttributes(path, BasicFileAttributes.class);
        PosixFileAttributes posixAttrs = null;
        try {
            posixAttrs = Files.readAttributes(path, PosixFileAttributes.class);
        } catch (UnsupportedOperationException ignored) {}

        System.out.println("File: " + path);
        System.out.println("  Size: " + attrs.size() + " bytes");
        System.out.println("  Is regular file: " + attrs.isRegularFile());
        System.out.println("  Is directory: " + attrs.isDirectory());
        System.out.println("  Is symbolic link: " + attrs.isSymbolicLink());

        if (posixAttrs != null) {
            System.out.println("  Owner: " + posixAttrs.owner().getName());
            System.out.println("  Group: " + posixAttrs.group().getName());
            System.out.println("  Permissions: " + PosixFilePermissions.toString(posixAttrs.permissions()));
        }

        DateTimeFormatter fmt = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")
                .withZone(ZoneId.systemDefault());
        System.out.println("  Modified: " + fmt.format(attrs.lastModifiedTime().toInstant()));
        System.out.println("  Created: " + fmt.format(attrs.creationTime().toInstant()));
    }

    // Check filesystem capacity
    static void printFsStats(Path path) throws IOException {
        FileStore store = Files.getFileStore(path);

        long total = store.getTotalSpace();
        long free = store.getUnallocatedSpace();
        long usable = store.getUsableSpace(); // Available to non-root

        System.out.println("Filesystem stats for " + path + ":");
        System.out.println("  Total: " + (total / (1024 * 1024)) + " MB");
        System.out.println("  Free: " + (free / (1024 * 1024)) + " MB");
        System.out.println("  Usable: " + (usable / (1024 * 1024)) + " MB");
        System.out.println("  Type: " + store.type());
        System.out.println("  Read-only: " + store.isReadOnly());
    }

    public static void main(String[] args) throws IOException {
        Path testPath = Paths.get(args.length > 0 ? args[0] : ".");
        printFileInfo(testPath);
        printFsStats(testPath);
    }
}
```

### Buffered vs Direct I/O Performance Comparison (Java)

```java
import java.io.*;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.file.*;

public class IOBenchmark {
    private static final int FILE_SIZE = 256 * 1024 * 1024; // 256MB
    private static final int BLOCK_SIZE = 4096;             // 4KB

    // Write with buffered I/O (uses page cache via BufferedOutputStream)
    static double benchmarkBufferedWrite(Path path) throws IOException {
        byte[] buf = new byte[BLOCK_SIZE];
        java.util.Arrays.fill(buf, (byte) 'A');

        long start = System.nanoTime();

        try (BufferedOutputStream bos = new BufferedOutputStream(
                new FileOutputStream(path.toFile()), 64 * 1024)) {
            int total = 0;
            while (total < FILE_SIZE) {
                bos.write(buf);
                total += BLOCK_SIZE;
            }
            bos.flush();
        }

        // Force data to disk
        try (FileOutputStream fos = new FileOutputStream(path.toFile(), true)) {
            fos.getFD().sync();
        }

        long end = System.nanoTime();
        return (end - start) / 1_000_000.0;
    }

    // Write with direct ByteBuffer (bypasses JVM heap, closer to direct I/O)
    static double benchmarkDirectWrite(Path path) throws IOException {
        ByteBuffer buf = ByteBuffer.allocateDirect(BLOCK_SIZE);
        for (int i = 0; i < BLOCK_SIZE; i++) buf.put((byte) 'B');

        long start = System.nanoTime();

        try (FileChannel channel = FileChannel.open(path,
                StandardOpenOption.CREATE, StandardOpenOption.WRITE,
                StandardOpenOption.TRUNCATE_EXISTING)) {
            int total = 0;
            while (total < FILE_SIZE) {
                buf.flip();
                channel.write(buf);
                buf.clear();
                total += BLOCK_SIZE;
            }
            channel.force(true); // Equivalent to fsync - flush to disk
        }

        long end = System.nanoTime();
        return (end - start) / 1_000_000.0;
    }

    public static void main(String[] args) throws IOException {
        System.out.printf("Writing %d MB...%n", FILE_SIZE / (1024 * 1024));

        Path bufferedPath = Paths.get("/tmp/bench_buffered");
        Path directPath = Paths.get("/tmp/bench_direct");

        double bufferedMs = benchmarkBufferedWrite(bufferedPath);
        System.out.printf("Buffered I/O: %.1f ms (%.1f MB/s)%n",
                bufferedMs, (FILE_SIZE / (1024.0 * 1024.0)) / (bufferedMs / 1000.0));

        double directMs = benchmarkDirectWrite(directPath);
        System.out.printf("Direct I/O:   %.1f ms (%.1f MB/s)%n",
                directMs, (FILE_SIZE / (1024.0 * 1024.0)) / (directMs / 1000.0));

        Files.deleteIfExists(bufferedPath);
        Files.deleteIfExists(directPath);
    }
}
```

### File System Event Monitoring with WatchService (Java)

```java
import java.io.IOException;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;

public class FileWatcher {

    static void printEvent(WatchEvent<?> event) {
        WatchEvent.Kind<?> kind = event.kind();
        Path filename = (Path) event.context();

        String action;
        if (kind == StandardWatchEventKinds.ENTRY_CREATE) action = "CREATED";
        else if (kind == StandardWatchEventKinds.ENTRY_DELETE) action = "DELETED";
        else if (kind == StandardWatchEventKinds.ENTRY_MODIFY) action = "MODIFIED";
        else action = "UNKNOWN";

        System.out.printf("  %s: %s%n", action, filename);

        // Check if it's a directory
        if (kind == StandardWatchEventKinds.ENTRY_CREATE) {
            try {
                Path full = ((Path) event.context());
                if (Files.isDirectory(full)) {
                    System.out.println("    [directory]");
                }
            } catch (Exception ignored) {}
        }
    }

    public static void main(String[] args) throws IOException, InterruptedException {
        Path watchPath = Paths.get(args.length > 0 ? args[0] : "/tmp");

        WatchService watchService = FileSystems.getDefault().newWatchService();

        watchPath.register(watchService,
                StandardWatchEventKinds.ENTRY_CREATE,
                StandardWatchEventKinds.ENTRY_DELETE,
                StandardWatchEventKinds.ENTRY_MODIFY);

        System.out.println("Watching " + watchPath + " for filesystem events...");

        while (true) {
            WatchKey key = watchService.take(); // Blocks until events available

            for (WatchEvent<?> event : key.pollEvents()) {
                if (event.kind() == StandardWatchEventKinds.OVERFLOW) {
                    System.out.println("  OVERFLOW: events may have been lost");
                    continue;
                }
                printEvent(event);
            }

            // Reset key to receive further events
            boolean valid = key.reset();
            if (!valid) {
                System.out.println("Watch key no longer valid, exiting.");
                break;
            }
        }

        watchService.close();
    }
}
```

### Journaling Simulation (Java)

```java
import java.io.*;
import java.nio.file.*;
import java.util.*;

public class JournaledFileSystem {
    /**Simulates a write-ahead journaling filesystem.*/

    enum TxState { PENDING, COMMITTED, APPLIED, ABORTED }

    static class JournalEntry implements Serializable {
        int txId;
        long timestamp;
        List<Map<String, Object>> operations;
        TxState state;

        JournalEntry(int txId, long timestamp, List<Map<String, Object>> operations) {
            this.txId = txId;
            this.timestamp = timestamp;
            this.operations = operations;
            this.state = TxState.PENDING;
        }
    }

    private final Path journalPath;
    private final Path dataPath;
    private int nextTxId = 1;
    private final List<JournalEntry> journal = new ArrayList<>();
    private final Map<String, byte[]> data = new HashMap<>();

    public JournaledFileSystem(String journalPath, String dataPath) {
        this.journalPath = Paths.get(journalPath);
        this.dataPath = Paths.get(dataPath);
        // Recover from crash if journal exists
        recover();
    }

    /** Write file with journaling for crash consistency. */
    public int writeFile(String filename, byte[] content) throws IOException {
        int txId = nextTxId++;

        // Phase 1: Write intent to journal
        Map<String, Object> op = new HashMap<>();
        op.put("op", "write");
        op.put("file", filename);
        op.put("size", content.length);
        op.put("checksum", Arrays.hashCode(content));

        JournalEntry entry = new JournalEntry(txId, System.currentTimeMillis(),
                Collections.singletonList(op));
        journal.add(entry);
        flushJournal();

        // Phase 2: Mark as committed (point of no return)
        entry.state = TxState.COMMITTED;
        flushJournal();

        // Phase 3: Apply to data area
        data.put(filename, content);
        flushData();

        // Phase 4: Mark as applied (can be garbage collected)
        entry.state = TxState.APPLIED;
        flushJournal();

        return txId;
    }

    public int deleteFile(String filename) throws IOException {
        int txId = nextTxId++;

        Map<String, Object> op = new HashMap<>();
        op.put("op", "delete");
        op.put("file", filename);

        JournalEntry entry = new JournalEntry(txId, System.currentTimeMillis(),
                Collections.singletonList(op));
        journal.add(entry);
        flushJournal();

        entry.state = TxState.COMMITTED;
        flushJournal();

        data.remove(filename);
        flushData();

        entry.state = TxState.APPLIED;
        flushJournal();

        return txId;
    }

    /** Replay committed but unapplied journal entries after crash. */
    private void recover() {
        if (!Files.exists(journalPath)) return;

        try (ObjectInputStream ois = new ObjectInputStream(
                new FileInputStream(journalPath.toFile()))) {
            @SuppressWarnings("unchecked")
            List<JournalEntry> savedJournal = (List<JournalEntry>) ois.readObject();

            for (JournalEntry entry : savedJournal) {
                if (entry.state == TxState.COMMITTED) {
                    // Replay: apply the operation
                    for (Map<String, Object> op : entry.operations) {
                        if ("write".equals(op.get("op"))) {
                            System.out.println("Recovery: replaying write to " + op.get("file"));
                        } else if ("delete".equals(op.get("op"))) {
                            data.remove((String) op.get("file"));
                        }
                    }
                    entry.state = TxState.APPLIED;
                } else if (entry.state == TxState.PENDING) {
                    // Incomplete: discard
                    entry.state = TxState.ABORTED;
                    System.out.println("Recovery: aborting incomplete tx " + entry.txId);
                }
            }
        } catch (IOException | ClassNotFoundException e) {
            System.err.println("Recovery failed: " + e.getMessage());
        }
    }

    /** Persist journal to disk. */
    private void flushJournal() throws IOException {
        try (ObjectOutputStream oos = new ObjectOutputStream(
                new FileOutputStream(journalPath.toFile()))) {
            oos.writeObject(journal);
            oos.flush();
        }
        // Force to disk
        try (FileOutputStream fos = new FileOutputStream(journalPath.toFile(), true)) {
            fos.getFD().sync();
        }
    }

    /** Persist data to disk. */
    private void flushData() throws IOException {
        try (ObjectOutputStream oos = new ObjectOutputStream(
                new FileOutputStream(dataPath.toFile()))) {
            oos.writeObject(data);
            oos.flush();
        }
        try (FileOutputStream fos = new FileOutputStream(dataPath.toFile(), true)) {
            fos.getFD().sync();
        }
    }
}
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
