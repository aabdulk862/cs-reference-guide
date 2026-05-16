# Operating Systems

Operating systems form the foundational layer between hardware and applications, managing CPU scheduling, memory allocation, file storage, and device I/O. Every production system — from containerized microservices to high-frequency trading platforms — depends on OS primitives for process isolation, resource management, and concurrency control.

This section provides a deep dive into the core subsystems that senior engineers encounter daily: process lifecycle management, virtual memory mechanics, file system internals, synchronization primitives, and I/O scheduling models. Understanding these concepts is critical for diagnosing production issues (memory leaks, CPU contention, deadlocks, I/O bottlenecks), tuning application performance, and making informed architectural decisions.

## Learning Path

1. [Processes and Threads](./processes-and-threads.md) — Process lifecycle, threading models, context switching, IPC mechanisms, and thread pool design
2. [Memory Management](./memory-management.md) — Virtual memory, paging, page tables, TLB optimization, memory-mapped files, and OOM handling
3. [File Systems](./file-systems.md) — ext4, XFS, inodes, journaling, the VFS layer, and I/O buffering strategies
4. [Concurrency Primitives](./concurrency-primitives.md) — Mutexes, semaphores, condition variables, read-write locks, lock-free structures, and deadlock detection
5. [I/O and Scheduling](./io-and-scheduling.md) — I/O models (blocking, non-blocking, async, multiplexing), epoll/kqueue, and CPU scheduling algorithms

## Prerequisites

- Basic understanding of computer architecture (CPU, RAM, disk)
- Familiarity with C or systems-level programming
- Experience with Linux command-line tools

## Related Topics

- [System Design](../../system-design/system-design.md) — Distributed systems build on OS concurrency and resource management concepts
- [Docker & Containerization](../../backend/docker-containerization.md) — Containers use OS namespaces and cgroups for isolation
