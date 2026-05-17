# I/O and Scheduling

## Quick Reference

- **Blocking I/O**: thread sleeps until operation completes — simple but wastes threads (one thread per connection doesn't scale past ~10K connections)
- **Non-blocking I/O**: operations return immediately with EAGAIN if not ready — requires polling, wastes CPU cycles checking readiness
- **I/O multiplexing** (select/poll/epoll/kqueue): single thread monitors many file descriptors, waking only when I/O is ready — foundation of event-driven servers
- **epoll** (Linux) uses a kernel-maintained interest set with O(1) readiness notification; **kqueue** (BSD/macOS) provides similar functionality with a unified event interface
- **Async I/O** (io_uring, IOCP): kernel performs I/O and notifies completion — true asynchronous operation without blocking or polling
- **CFS** (Completely Fair Scheduler): Linux's default CPU scheduler using a red-black tree of virtual runtimes, providing proportional fairness based on nice values
- **Real-time scheduling** (SCHED_FIFO, SCHED_RR): deterministic scheduling for latency-sensitive workloads — runs until yield or preemption by higher priority
- CPU scheduling metrics: **throughput** (tasks/second), **latency** (time to first response), **fairness** (proportional CPU share), **utilization** (% CPU busy)
- **io_uring**: Linux's modern async I/O interface using shared ring buffers between user and kernel space — eliminates system call overhead for high-IOPS workloads

## When to Use

I/O models and scheduling knowledge is critical when:

- **Designing high-concurrency network servers** — choosing between thread-per-connection (simple, limited to ~10K), event-driven with epoll (scales to millions of connections), or io_uring (highest throughput for disk and network I/O)
- **Tuning application latency** — understanding how CPU scheduling affects tail latency (p99/p999), when to use real-time priorities, and how to avoid priority inversion
- **Building event loops and async frameworks** — implementing or configuring frameworks like Node.js (libuv/epoll), Netty (epoll/kqueue), Tokio (io_uring/epoll), or Go runtime (netpoller)
- **Optimizing database I/O** — choosing between buffered reads (page cache), direct I/O (O_DIRECT), and async I/O (io_uring) for different access patterns
- **Configuring container CPU limits** — understanding how CFS bandwidth throttling (cpu.cfs_quota_us) interacts with application thread pools and causes latency spikes
- **Diagnosing I/O bottlenecks** — using iostat, iotop, and blktrace to identify whether bottlenecks are in the application, filesystem, I/O scheduler, or device

## Code Examples

### Event-Driven Server with NIO Selector (Java)

```java
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.ByteBuffer;
import java.nio.channels.*;
import java.util.Iterator;
import java.util.Set;

public class NioEchoServer {
    private static final int MAX_EVENTS = 1024;
    private static final int LISTEN_BACKLOG = 512;
    private static final int BUFFER_SIZE = 4096;

    public static void main(String[] args) throws IOException {
        int port = 8080;
        ServerSocketChannel listener = createListener(port);
        eventLoop(listener);
    }

    static ServerSocketChannel createListener(int port) throws IOException {
        ServerSocketChannel serverChannel = ServerSocketChannel.open();
        serverChannel.configureBlocking(false);
        serverChannel.socket().setReuseAddress(true);
        serverChannel.socket().bind(new InetSocketAddress(port), LISTEN_BACKLOG);
        return serverChannel;
    }

    static void eventLoop(ServerSocketChannel listener) throws IOException {
        Selector selector = Selector.open();

        // Register listener for accept events (equivalent to EPOLLIN on listen fd)
        listener.register(selector, SelectionKey.OP_ACCEPT);

        ByteBuffer buffer = ByteBuffer.allocate(BUFFER_SIZE);

        System.out.println("Server listening on port " + listener.socket().getLocalPort());

        while (true) {
            // Block until at least one channel is ready (like epoll_wait with -1 timeout)
            int readyCount = selector.select();
            if (readyCount == 0) continue;

            Set<SelectionKey> selectedKeys = selector.selectedKeys();
            Iterator<SelectionKey> iter = selectedKeys.iterator();

            while (iter.hasNext()) {
                SelectionKey key = iter.next();
                iter.remove();

                if (key.isAcceptable()) {
                    // Accept all pending connections
                    ServerSocketChannel server = (ServerSocketChannel) key.channel();
                    SocketChannel client;
                    while ((client = server.accept()) != null) {
                        client.configureBlocking(false);
                        client.socket().setTcpNoDelay(true);
                        client.register(selector, SelectionKey.OP_READ);
                    }
                } else if (key.isReadable()) {
                    SocketChannel client = (SocketChannel) key.channel();
                    buffer.clear();

                    try {
                        int bytesRead = client.read(buffer);
                        if (bytesRead == -1) {
                            // Client disconnected
                            key.cancel();
                            client.close();
                            continue;
                        }

                        // Echo back (simple example)
                        buffer.flip();
                        while (buffer.hasRemaining()) {
                            client.write(buffer);
                        }
                    } catch (IOException e) {
                        key.cancel();
                        client.close();
                    }
                }
            }
        }
    }
}
```

### Async File I/O with AsynchronousFileChannel (Java)

```java
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.AsynchronousFileChannel;
import java.nio.channels.CompletionHandler;
import java.nio.file.*;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicInteger;

public class AsyncFileIO {
    private static final int QUEUE_DEPTH = 64;
    private static final int BLOCK_SIZE = 4096;

    static class IoRequest {
        final int fd;
        final long offset;
        final int length;
        final ByteBuffer buffer;
        final String op;

        IoRequest(int fd, long offset, int length, ByteBuffer buffer, String op) {
            this.fd = fd;
            this.offset = offset;
            this.length = length;
            this.buffer = buffer;
            this.op = op;
        }
    }

    // Submit async read request with completion handler
    static void submitRead(AsynchronousFileChannel channel, long offset,
                           ByteBuffer buffer, CountDownLatch latch) {
        IoRequest req = new IoRequest(0, offset, buffer.capacity(), buffer, "read");

        channel.read(buffer, offset, req, new CompletionHandler<Integer, IoRequest>() {
            @Override
            public void completed(Integer bytesRead, IoRequest attachment) {
                System.out.printf("Completed %s: offset=%d bytes=%d%n",
                        attachment.op, attachment.offset, bytesRead);
                latch.countDown();
            }

            @Override
            public void failed(Throwable exc, IoRequest attachment) {
                System.err.printf("I/O error for offset %d: %s%n",
                        attachment.offset, exc.getMessage());
                latch.countDown();
            }
        });
    }

    public static void main(String[] args) throws IOException, InterruptedException {
        Path path = Paths.get("testfile.dat");
        if (!Files.exists(path)) {
            System.err.println("File not found: " + path);
            return;
        }

        AsynchronousFileChannel channel = AsynchronousFileChannel.open(
                path, StandardOpenOption.READ);

        int numReads = 8;
        CountDownLatch latch = new CountDownLatch(numReads);

        // Submit multiple async reads
        for (int i = 0; i < numReads; i++) {
            ByteBuffer buffer = ByteBuffer.allocateDirect(BLOCK_SIZE);
            submitRead(channel, (long) i * BLOCK_SIZE, buffer, latch);
        }

        // Wait for all completions
        latch.await();

        channel.close();
        System.out.println("All async reads completed.");
    }
}
```


### CPU Scheduling Simulation: CFS Virtual Runtime (Java)

```java
import java.util.*;

public class CFSScheduler {
    /**Simulates Linux's Completely Fair Scheduler.*/

    static class Task implements Comparable<Task> {
        double vruntime;
        final int pid;
        final String name;
        final int nice;
        double totalRuntimeMs = 0;

        Task(double vruntime, int pid, String name, int nice) {
            this.vruntime = vruntime;
            this.pid = pid;
            this.name = name;
            this.nice = nice;
        }

        /** CFS weight from nice value. Nice 0 = weight 1024. */
        double weight() {
            // Simplified: each nice level is ~1.25x weight difference
            return 1024 * Math.pow(1.25, -nice);
        }

        @Override
        public int compareTo(Task other) {
            return Double.compare(this.vruntime, other.vruntime);
        }
    }

    private final PriorityQueue<Task> runQueue = new PriorityQueue<>(); // Min-heap by vruntime
    private Task current = null;
    private final double targetLatencyMs;
    private final double minGranularityMs;
    private double clockMs = 0.0;
    private int nrRunning = 0;
    private double totalWeight = 0.0;
    private double minVruntime = 0.0; // Floor for new tasks

    public CFSScheduler(double targetLatencyMs, double minGranularityMs) {
        this.targetLatencyMs = targetLatencyMs;
        this.minGranularityMs = minGranularityMs;
    }

    public CFSScheduler() {
        this(6.0, 0.75);
    }

    public void addTask(int pid, String name, int nice) {
        Task task = new Task(minVruntime, pid, name, nice);
        runQueue.add(task);
        nrRunning++;
        totalWeight += task.weight();
    }

    private double timeSlice(Task task) {
        /** Calculate time slice proportional to weight. */
        if (nrRunning <= 1) return targetLatencyMs;

        // Proportional share of the scheduling period
        double period = Math.max(targetLatencyMs, nrRunning * minGranularityMs);
        double sliceMs = period * (task.weight() / totalWeight);
        return Math.max(sliceMs, minGranularityMs);
    }

    private void updateVruntime(Task task, double deltaMs) {
        /** Update virtual runtime (inversely proportional to weight). */
        // Higher weight = slower vruntime growth = more CPU time
        task.vruntime += deltaMs * (1024.0 / task.weight());
        task.totalRuntimeMs += deltaMs;
    }

    public Task tick(double deltaMs) {
        /** Advance scheduler by deltaMs. */
        clockMs += deltaMs;

        if (current == null && !runQueue.isEmpty()) {
            current = runQueue.poll();
        }

        if (current == null) return null;

        // Run current task
        updateVruntime(current, deltaMs);

        // Check if a task with lower vruntime exists (should preempt)
        boolean shouldPreempt = false;
        if (!runQueue.isEmpty() && runQueue.peek().vruntime < current.vruntime) {
            // Another task has less vruntime (is "less fair")
            if (current.totalRuntimeMs >= minGranularityMs) {
                shouldPreempt = true;
            }
        }

        if (shouldPreempt) {
            // Put current back and pick the task with lowest vruntime
            runQueue.add(current);
            current = runQueue.poll();
        }

        // Update minVruntime (monotonically increasing)
        if (!runQueue.isEmpty()) {
            minVruntime = Math.max(minVruntime, runQueue.peek().vruntime);
        }
        if (current != null) {
            minVruntime = Math.max(minVruntime, current.vruntime);
        }

        return current;
    }

    public Task tick() {
        return tick(1.0);
    }

    public void stats() {
        List<Task> allTasks = new ArrayList<>(runQueue);
        if (current != null) allTasks.add(current);
        allTasks.sort(Comparator.comparingInt(t -> t.pid));

        System.out.printf("%n--- CFS Stats at %.1fms ---%n", clockMs);
        for (Task task : allTasks) {
            System.out.printf("  PID %d (%s): nice=%d weight=%.0f vruntime=%.2f runtime=%.1fms%n",
                    task.pid, task.name, task.nice, task.weight(), task.vruntime, task.totalRuntimeMs);
        }
    }

    // Simulate mixed-priority workload
    public static void main(String[] args) {
        CFSScheduler scheduler = new CFSScheduler();
        scheduler.addTask(1, "web-server", -5);    // Higher priority
        scheduler.addTask(2, "batch-job", 10);     // Lower priority
        scheduler.addTask(3, "api-handler", 0);    // Normal priority
        scheduler.addTask(4, "log-processor", 5);  // Below normal

        // Run for 100ms
        for (int i = 0; i < 100; i++) {
            scheduler.tick(1.0);
        }

        scheduler.stats();
    }
}
```

### I/O Multiplexing with NIO Selector (Java)

```java
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.ByteBuffer;
import java.nio.channels.*;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Consumer;

public class EventLoop {
    /**Simple event loop demonstrating I/O multiplexing patterns.*/

    private final Selector selector;
    private final Map<SelectableChannel, Consumer<SelectionKey>> readers = new ConcurrentHashMap<>();
    private final Map<SelectableChannel, Consumer<SelectionKey>> writers = new ConcurrentHashMap<>();

    public EventLoop() throws IOException {
        this.selector = Selector.open();
    }

    public void addReader(SelectableChannel channel, Consumer<SelectionKey> callback) throws ClosedChannelException {
        readers.put(channel, callback);
        int ops = SelectionKey.OP_READ;
        if (writers.containsKey(channel)) ops |= SelectionKey.OP_WRITE;
        channel.register(selector, ops);
    }

    public void addWriter(SelectableChannel channel, Consumer<SelectionKey> callback) throws ClosedChannelException {
        writers.put(channel, callback);
        int ops = SelectionKey.OP_WRITE;
        if (readers.containsKey(channel)) ops |= SelectionKey.OP_READ;
        channel.register(selector, ops);
    }

    public void remove(SelectableChannel channel) {
        readers.remove(channel);
        writers.remove(channel);
        SelectionKey key = channel.keyFor(selector);
        if (key != null) key.cancel();
    }

    public void runOnce(long timeoutMs) throws IOException {
        // select() - blocks until at least one channel is ready
        int ready = selector.select(timeoutMs);
        if (ready == 0) return;

        Iterator<SelectionKey> iter = selector.selectedKeys().iterator();
        while (iter.hasNext()) {
            SelectionKey key = iter.next();
            iter.remove();

            if (key.isReadable()) {
                Consumer<SelectionKey> cb = readers.get(key.channel());
                if (cb != null) cb.accept(key);
            }
            if (key.isValid() && key.isWritable()) {
                Consumer<SelectionKey> cb = writers.get(key.channel());
                if (cb != null) cb.accept(key);
            }
        }
    }

    public void runForever() throws IOException {
        while (!readers.isEmpty() || !writers.isEmpty()) {
            runOnce(1000);
        }
    }
}

class EchoServer {
    /**Non-blocking echo server using event loop.*/

    private final EventLoop loop;
    private final ServerSocketChannel serverChannel;
    private final Map<SocketChannel, ByteBuffer> clients = new ConcurrentHashMap<>();

    public EchoServer(int port) throws IOException {
        this.loop = new EventLoop();
        this.serverChannel = ServerSocketChannel.open();
        serverChannel.configureBlocking(false);
        serverChannel.socket().setReuseAddress(true);
        serverChannel.socket().bind(new InetSocketAddress(port), 128);

        serverChannel.register(loop.selector, SelectionKey.OP_ACCEPT);
        loop.readers.put(serverChannel, this::onAccept);
    }

    private void onAccept(SelectionKey key) {
        try {
            SocketChannel client;
            while ((client = serverChannel.accept()) != null) {
                client.configureBlocking(false);
                clients.put(client, ByteBuffer.allocate(4096));
                final SocketChannel ch = client;
                loop.addReader(client, k -> onRead(ch));
            }
        } catch (IOException e) {
            // No more pending connections
        }
    }

    private void onRead(SocketChannel client) {
        ByteBuffer buffer = clients.get(client);
        if (buffer == null) return;
        try {
            buffer.clear();
            int bytesRead = client.read(buffer);
            if (bytesRead > 0) {
                buffer.flip();
                client.write(buffer); // Echo back
            } else if (bytesRead == -1) {
                closeClient(client);
            }
        } catch (IOException e) {
            closeClient(client);
        }
    }

    private void closeClient(SocketChannel client) {
        loop.remove(client);
        clients.remove(client);
        try { client.close(); } catch (IOException ignored) {}
    }

    public void run() throws IOException {
        System.out.println("Echo server running on port " + serverChannel.socket().getLocalPort());
        loop.runForever();
    }
}
```

## Common Pitfalls

1. **Using level-triggered epoll without draining the socket**: In level-triggered mode (default), epoll reports readiness on every epoll_wait call as long as data is available. If you read only part of the available data, epoll_wait returns immediately again, potentially causing a busy loop. Either drain the socket completely (read until EAGAIN) or switch to edge-triggered mode (EPOLLET) which only notifies on state transitions. Edge-triggered requires draining because you won't be notified again until new data arrives.

2. **Thread-per-connection model hitting OS limits**: Each thread consumes ~8MB of virtual address space (stack) and a kernel task_struct. At 10K connections, that's 80GB of virtual memory and significant scheduler overhead. The C10K problem is solved by I/O multiplexing (one thread handling thousands of connections via epoll). Modern systems target C10M (10 million connections) using io_uring, kernel bypass (DPDK), or userspace TCP stacks.

3. **CFS bandwidth throttling causing latency spikes in containers**: When a container's CPU quota (cpu.cfs_quota_us) is exhausted within a period (cpu.cfs_period_us, default 100ms), all threads in the cgroup are throttled until the next period. This causes periodic latency spikes even when the host has idle CPU. Mitigations: increase the period (reduces burst penalty), set quota higher than average usage (accommodate bursts), or use cpuset pinning instead of CFS quotas for latency-sensitive workloads. Monitor with `cpu.stat` throttled_time.

4. **Ignoring the thundering herd problem with epoll**: When multiple threads/processes epoll_wait on the same listening socket, a new connection wakes all of them but only one can accept it. The rest wake up, fail to accept, and go back to sleep — wasting CPU. Solutions: use EPOLLEXCLUSIVE flag (Linux 4.5+) to wake only one waiter, use SO_REUSEPORT to give each thread its own accept queue, or accept in a single thread and distribute connections to workers.

5. **Mixing blocking and non-blocking I/O in the same event loop**: If any operation in an event loop blocks (DNS resolution, file I/O without O_NONBLOCK, synchronous database queries), it stalls all other connections handled by that loop. Use async DNS (c-ares, getaddrinfo_a), thread pools for blocking file I/O, and async database drivers. Node.js's libuv uses a thread pool specifically for operations that lack async OS interfaces (file I/O on Linux before io_uring).

6. **Not handling partial writes in non-blocking mode**: write() on a non-blocking socket may write fewer bytes than requested (returns partial count) or fail with EAGAIN (buffer full). You must buffer the remaining data and register for EPOLLOUT to retry when the socket becomes writable. Failing to handle partial writes causes data corruption or truncation. Similarly, read() may return partial data — accumulate in a buffer and parse only when a complete message is available.

## Real-World Use Cases

- **Nginx event-driven architecture**: Nginx uses a multi-process model where each worker process runs a single-threaded event loop with epoll (Linux) or kqueue (BSD). One worker handles thousands of concurrent connections without threading overhead. The master process manages workers, handles configuration reloads (graceful restart via SIGHUP), and distributes listening sockets. This architecture achieves high throughput with minimal memory overhead — Nginx can handle 100K+ concurrent connections per worker.

- **Redis single-threaded event loop**: Redis processes all commands in a single thread using an event loop (ae library wrapping epoll/kqueue). This eliminates lock contention entirely — no synchronization needed for data structure access. The single-threaded model works because Redis operations are CPU-bound for microseconds (in-memory data structures). Redis 6.0+ added I/O threads for network read/write (parsing and serialization) while keeping command execution single-threaded.

- **Java NIO and Netty**: Java NIO provides Selector (wrapping epoll/kqueue) for I/O multiplexing. Netty builds on this with a multi-reactor pattern: a boss EventLoopGroup accepts connections and distributes them to worker EventLoopGroups that handle I/O. Each EventLoop is a single thread with its own Selector, processing all I/O for its assigned channels without synchronization. This powers high-performance servers (gRPC, Elasticsearch, Cassandra) handling millions of requests per second.

- **Linux CFS and container scheduling**: Kubernetes CPU requests map to CFS shares (cpu.shares in cgroups v1, cpu.weight in v2), providing proportional fairness under contention. CPU limits map to CFS bandwidth control (cpu.cfs_quota_us/cpu.cfs_period_us), hard-capping CPU usage. Understanding CFS explains why a container with 500m CPU limit (50ms quota per 100ms period) experiences periodic 50ms stalls when burst-heavy, and why burstable QoS class pods have unpredictable latency under contention.

- **High-frequency trading with kernel bypass**: HFT systems bypass the kernel entirely for network I/O using DPDK (Data Plane Development Kit) or Solarflare's OpenOnload. These frameworks map NIC memory directly into user space, eliminating system call overhead, interrupt handling, and kernel network stack processing. Combined with busy-polling (spinning on the NIC ring buffer), they achieve sub-microsecond network latency. The tradeoff: dedicated CPU cores for polling (100% utilization even when idle) and loss of kernel network features (firewalling, routing, monitoring).

## Interview Questions

**Q: Compare blocking I/O, non-blocking I/O, I/O multiplexing, and async I/O. When would you use each?**

A: **Blocking I/O**: thread sleeps until operation completes. Simple to program but requires one thread per connection, limiting scalability to ~10K connections (thread memory and scheduling overhead). Use for simple clients or low-concurrency servers. **Non-blocking I/O**: operations return immediately with EAGAIN if not ready. Requires application-level polling loop, wasting CPU. Rarely used alone. **I/O multiplexing** (epoll/kqueue): register interest in multiple FDs, block until any is ready. One thread handles thousands of connections efficiently. Use for high-concurrency servers (web servers, proxies, databases). **Async I/O** (io_uring/IOCP): submit operations to the kernel, get notified on completion. True async — no blocking, no polling. Use for maximum throughput on modern kernels, especially for disk I/O where epoll doesn't help (regular files are always "ready" in epoll).

**Q: Explain how epoll works and why it's more efficient than select/poll for large numbers of connections.**

A: select/poll require passing the entire set of file descriptors to the kernel on every call, and the kernel scans all of them to find ready ones — O(n) per call where n is total FDs monitored. epoll maintains a persistent interest set in the kernel (epoll_ctl adds/removes FDs once). epoll_wait returns only the ready FDs — O(1) for adding the ready event, O(k) total where k is the number of ready FDs (typically much smaller than n). For 100K connections where 100 are ready, select scans 100K FDs while epoll returns just 100. epoll also avoids copying the FD set between user and kernel space on every call. Edge-triggered mode (EPOLLET) further reduces notifications by only reporting state transitions rather than current state.

**Q: What is the Completely Fair Scheduler (CFS) and how does it achieve fairness?**

A: CFS maintains a red-black tree of runnable tasks, ordered by virtual runtime (vruntime). The task with the lowest vruntime (least CPU time relative to its weight) is always scheduled next — O(log n) to find and rebalance. Virtual runtime advances inversely proportional to the task's weight (derived from nice value): high-weight tasks accumulate vruntime slowly, getting more CPU time. A nice-0 task with weight 1024 and a nice-5 task with weight 335 sharing a CPU get ~75% and ~25% respectively. The scheduling period (target latency) is divided proportionally among all runnable tasks, with a minimum granularity to prevent excessive context switching. CFS provides proportional fairness without fixed time slices or priority levels.

**Q: How does io_uring improve upon traditional Linux async I/O (aio)?**

A: Linux's legacy aio (io_submit/io_getevents) only supports direct I/O on files (not buffered I/O, not network), requires aligned buffers, and has high per-operation overhead from system calls. io_uring solves these limitations: (1) **Shared ring buffers** between user and kernel space eliminate system call overhead — submissions and completions are written to memory-mapped rings without syscalls (with SQPOLL mode). (2) **Universal** — supports all I/O operations (files, network, timers, even non-I/O operations like openat, statx). (3) **Batching** — submit multiple operations with a single io_uring_enter() call. (4) **Linked operations** — chain dependent operations (read then write) without returning to userspace between them. (5) **Fixed buffers/files** — pre-register resources to avoid per-operation kernel validation. io_uring achieves 2-10x higher IOPS than epoll+read for storage workloads.

**Q: Explain CFS bandwidth throttling and its impact on containerized applications.**

A: CFS bandwidth control limits a cgroup's CPU usage to quota microseconds per period (default 100ms). A container with 200m CPU limit gets 20ms per 100ms period. If the container's threads consume their 20ms quota in a burst (e.g., handling a request spike in the first 5ms), all threads are throttled for the remaining 95ms — causing a latency spike visible as p99 tail latency. This is the "CFS throttling" problem. Mitigations: (1) Set CPU limits higher than average usage to accommodate bursts. (2) Increase the period (cpu.cfs_period_us = 10ms) so throttling is shorter and more frequent. (3) Use cpu.shares (proportional, no hard cap) instead of quotas for latency-sensitive services. (4) Monitor nr_throttled and throttled_time in cpu.stat. (5) In Kubernetes, set requests (shares) without limits (no quota) for latency-sensitive pods.

## Production Tips

- **Use SO_REUSEPORT for multi-core network servers**: SO_REUSEPORT allows multiple sockets to bind to the same port, with the kernel distributing incoming connections across them using a hash. Each worker thread/process gets its own accept queue, eliminating the thundering herd problem and lock contention on the accept path. Nginx, HAProxy, and Envoy use this for linear scaling across cores. Combine with CPU affinity (SO_INCOMING_CPU) to keep connections on the same core as the accepting thread.

- **Monitor I/O scheduler queue depth and latency**: Use `iostat -x 1` to monitor await (average I/O latency), avgqu-sz (queue depth), and %util (device utilization). High await with low %util indicates I/O scheduling delays or filesystem contention. High %util with high avgqu-sz indicates device saturation. For NVMe devices, use `nvme smart-log` for device-level latency histograms. Set alerts on p99 I/O latency exceeding your SLO (typically 1-10ms for SSD, 10-50ms for HDD).

- **Pin latency-sensitive event loops to dedicated cores**: Use CPU affinity (taskset, pthread_setaffinity_np) to bind event loop threads to specific cores, and isolate those cores from the scheduler (isolcpus kernel parameter). This eliminates context switch overhead and cache pollution from other processes. Combine with NAPI busy polling (SO_BUSY_POLL) for network I/O to reduce interrupt-to-userspace latency from ~10μs to ~1μs. Standard practice in HFT and real-time audio processing.

- **Tune epoll with EPOLLEXCLUSIVE and batch accept**: For servers with multiple worker threads sharing a listening socket, use EPOLLEXCLUSIVE (Linux 4.5+) to wake only one thread per event, avoiding thundering herd. In the accept handler, loop accept() until EAGAIN to batch-accept all pending connections in one wake-up. This reduces the number of epoll_wait returns and system calls. For very high connection rates (>100K/s), consider accept4() with SOCK_NONBLOCK|SOCK_CLOEXEC to avoid separate fcntl calls.

## Related Topics

- [Processes and Threads](./processes-and-threads.md) — Thread pools and process models that interact with I/O multiplexing and CPU scheduling
- [Concurrency Primitives](./concurrency-primitives.md) — Lock-free structures and synchronization used in event loop implementations
- [File Systems](./file-systems.md) — File I/O buffering, direct I/O, and the page cache that interact with I/O scheduling
