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

### Event-Driven Server with epoll (C)

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <fcntl.h>
#include <errno.h>
#include <sys/epoll.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <netinet/tcp.h>

#define MAX_EVENTS 1024
#define LISTEN_BACKLOG 512
#define BUFFER_SIZE 4096

int set_nonblocking(int fd) {
    int flags = fcntl(fd, F_GETFL, 0);
    return fcntl(fd, F_SETFL, flags | O_NONBLOCK);
}

int create_listener(int port) {
    int fd = socket(AF_INET, SOCK_STREAM | SOCK_NONBLOCK | SOCK_CLOEXEC, 0);
    
    int opt = 1;
    setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));
    setsockopt(fd, SOL_SOCKET, SO_REUSEPORT, &opt, sizeof(opt));
    setsockopt(fd, IPPROTO_TCP, TCP_NODELAY, &opt, sizeof(opt));
    
    struct sockaddr_in addr = {
        .sin_family = AF_INET,
        .sin_port = htons(port),
        .sin_addr.s_addr = INADDR_ANY
    };
    
    bind(fd, (struct sockaddr *)&addr, sizeof(addr));
    listen(fd, LISTEN_BACKLOG);
    return fd;
}

void event_loop(int listen_fd) {
    int epoll_fd = epoll_create1(EPOLL_CLOEXEC);
    
    struct epoll_event ev = {
        .events = EPOLLIN | EPOLLET,  // Edge-triggered for listener
        .data.fd = listen_fd
    };
    epoll_ctl(epoll_fd, EPOLL_CTL_ADD, listen_fd, &ev);
    
    struct epoll_event events[MAX_EVENTS];
    char buffer[BUFFER_SIZE];
    
    printf("Server listening, epoll fd=%d\n", epoll_fd);
    
    while (1) {
        // Block until at least one fd is ready (-1 = infinite timeout)
        int nfds = epoll_wait(epoll_fd, events, MAX_EVENTS, -1);
        
        for (int i = 0; i < nfds; i++) {
            if (events[i].data.fd == listen_fd) {
                // Accept all pending connections (edge-triggered)
                while (1) {
                    int client_fd = accept4(listen_fd, NULL, NULL,
                                           SOCK_NONBLOCK | SOCK_CLOEXEC);
                    if (client_fd == -1) {
                        if (errno == EAGAIN || errno == EWOULDBLOCK)
                            break;  // No more pending connections
                        perror("accept4");
                        break;
                    }
                    
                    struct epoll_event client_ev = {
                        .events = EPOLLIN | EPOLLET | EPOLLRDHUP,
                        .data.fd = client_fd
                    };
                    epoll_ctl(epoll_fd, EPOLL_CTL_ADD, client_fd, &client_ev);
                }
            } else {
                int fd = events[i].data.fd;
                
                if (events[i].events & (EPOLLRDHUP | EPOLLERR | EPOLLHUP)) {
                    epoll_ctl(epoll_fd, EPOLL_CTL_DEL, fd, NULL);
                    close(fd);
                    continue;
                }
                
                // Read all available data (edge-triggered)
                while (1) {
                    ssize_t n = read(fd, buffer, sizeof(buffer));
                    if (n <= 0) {
                        if (n == 0 || (errno != EAGAIN && errno != EWOULDBLOCK)) {
                            epoll_ctl(epoll_fd, EPOLL_CTL_DEL, fd, NULL);
                            close(fd);
                        }
                        break;
                    }
                    // Echo back (simple example)
                    write(fd, buffer, n);
                }
            }
        }
    }
    
    close(epoll_fd);
}

int main() {
    int listen_fd = create_listener(8080);
    event_loop(listen_fd);
    return 0;
}
```

### io_uring Async File I/O (C)

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <fcntl.h>
#include <unistd.h>
#include <liburing.h>

#define QUEUE_DEPTH 64
#define BLOCK_SIZE 4096

struct io_request {
    int fd;
    off_t offset;
    size_t length;
    char *buffer;
    int op;  // IORING_OP_READ or IORING_OP_WRITE
};

int setup_io_uring(struct io_uring *ring) {
    struct io_uring_params params = {0};
    // SQPOLL: kernel thread polls submission queue, avoiding syscalls
    // params.flags = IORING_SETUP_SQPOLL;
    // params.sq_thread_idle = 2000;  // ms before kernel thread sleeps
    
    int ret = io_uring_queue_init_params(QUEUE_DEPTH, ring, &params);
    if (ret < 0) {
        fprintf(stderr, "io_uring_queue_init: %s\n", strerror(-ret));
        return -1;
    }
    return 0;
}

// Submit async read request
int submit_read(struct io_uring *ring, int fd, off_t offset, 
                size_t length, char *buffer) {
    struct io_uring_sqe *sqe = io_uring_get_sqe(ring);
    if (!sqe) return -1;  // Submission queue full
    
    io_uring_prep_read(sqe, fd, buffer, length, offset);
    
    // Attach user data for completion identification
    struct io_request *req = malloc(sizeof(struct io_request));
    req->fd = fd;
    req->offset = offset;
    req->length = length;
    req->buffer = buffer;
    req->op = IORING_OP_READ;
    io_uring_sqe_set_data(sqe, req);
    
    return 0;
}

// Submit batch and wait for completions
int process_completions(struct io_uring *ring, int min_complete) {
    // Submit all queued requests
    int submitted = io_uring_submit(ring);
    if (submitted < 0) return submitted;
    
    // Wait for at least min_complete completions
    struct io_uring_cqe *cqe;
    int completed = 0;
    
    while (completed < min_complete) {
        int ret = io_uring_wait_cqe(ring, &cqe);
        if (ret < 0) break;
        
        struct io_request *req = io_uring_cqe_get_data(cqe);
        
        if (cqe->res < 0) {
            fprintf(stderr, "I/O error for offset %ld: %s\n",
                    req->offset, strerror(-cqe->res));
        } else {
            printf("Completed %s: fd=%d offset=%ld bytes=%d\n",
                   req->op == IORING_OP_READ ? "read" : "write",
                   req->fd, req->offset, cqe->res);
        }
        
        free(req);
        io_uring_cqe_seen(ring, cqe);
        completed++;
    }
    
    return completed;
}

int main() {
    struct io_uring ring;
    if (setup_io_uring(&ring) < 0) return 1;
    
    int fd = open("testfile.dat", O_RDONLY | O_DIRECT);
    if (fd < 0) { perror("open"); return 1; }
    
    // Submit multiple async reads
    for (int i = 0; i < 8; i++) {
        char *buf;
        posix_memalign((void **)&buf, BLOCK_SIZE, BLOCK_SIZE);
        submit_read(&ring, fd, i * BLOCK_SIZE, BLOCK_SIZE, buf);
    }
    
    // Process all completions
    process_completions(&ring, 8);
    
    close(fd);
    io_uring_queue_exit(&ring);
    return 0;
}
```


### CPU Scheduling Simulation: CFS Virtual Runtime (Python)

```python
import heapq
from dataclasses import dataclass, field
from typing import List, Optional
import time

@dataclass(order=True)
class Task:
    vruntime: float
    pid: int = field(compare=False)
    name: str = field(compare=False)
    nice: int = field(compare=False, default=0)
    total_runtime_ms: float = field(compare=False, default=0)
    
    @property
    def weight(self) -> float:
        """CFS weight from nice value. Nice 0 = weight 1024."""
        # Simplified: each nice level is ~1.25x weight difference
        return 1024 * (1.25 ** (-self.nice))

class CFSScheduler:
    """Simulates Linux's Completely Fair Scheduler."""
    
    def __init__(self, target_latency_ms: float = 6.0, min_granularity_ms: float = 0.75):
        self.run_queue: List[Task] = []  # Min-heap by vruntime
        self.current: Optional[Task] = None
        self.target_latency_ms = target_latency_ms
        self.min_granularity_ms = min_granularity_ms
        self.clock_ms = 0.0
        self.nr_running = 0
        self.total_weight = 0.0
        self.min_vruntime = 0.0  # Floor for new tasks
    
    def add_task(self, pid: int, name: str, nice: int = 0):
        task = Task(
            vruntime=self.min_vruntime,  # Start at current minimum
            pid=pid,
            name=name,
            nice=nice
        )
        heapq.heappush(self.run_queue, task)
        self.nr_running += 1
        self.total_weight += task.weight
    
    def _time_slice(self, task: Task) -> float:
        """Calculate time slice proportional to weight."""
        if self.nr_running <= 1:
            return self.target_latency_ms
        
        # Proportional share of the scheduling period
        period = max(self.target_latency_ms, 
                     self.nr_running * self.min_granularity_ms)
        slice_ms = period * (task.weight / self.total_weight)
        return max(slice_ms, self.min_granularity_ms)
    
    def _update_vruntime(self, task: Task, delta_ms: float):
        """Update virtual runtime (inversely proportional to weight)."""
        # Higher weight = slower vruntime growth = more CPU time
        task.vruntime += delta_ms * (1024.0 / task.weight)
        task.total_runtime_ms += delta_ms
    
    def tick(self, delta_ms: float = 1.0):
        """Advance scheduler by delta_ms."""
        self.clock_ms += delta_ms
        
        if self.current is None and self.run_queue:
            self.current = heapq.heappop(self.run_queue)
        
        if self.current is None:
            return None
        
        # Run current task
        self._update_vruntime(self.current, delta_ms)
        
        # Check if time slice expired or a task with lower vruntime exists
        time_slice = self._time_slice(self.current)
        should_preempt = False
        
        if self.run_queue and self.run_queue[0].vruntime < self.current.vruntime:
            # Another task has less vruntime (is "less fair")
            if self.current.total_runtime_ms >= self.min_granularity_ms:
                should_preempt = True
        
        if should_preempt:
            # Put current back and pick the task with lowest vruntime
            heapq.heappush(self.run_queue, self.current)
            self.current = heapq.heappop(self.run_queue)
        
        # Update min_vruntime (monotonically increasing)
        if self.run_queue:
            self.min_vruntime = max(self.min_vruntime, self.run_queue[0].vruntime)
        if self.current:
            self.min_vruntime = max(self.min_vruntime, self.current.vruntime)
        
        return self.current
    
    def stats(self):
        all_tasks = list(self.run_queue) + ([self.current] if self.current else [])
        print(f"\n--- CFS Stats at {self.clock_ms:.1f}ms ---")
        for task in sorted(all_tasks, key=lambda t: t.pid):
            print(f"  PID {task.pid} ({task.name}): nice={task.nice} "
                  f"weight={task.weight:.0f} vruntime={task.vruntime:.2f} "
                  f"runtime={task.total_runtime_ms:.1f}ms")

# Simulate mixed-priority workload
scheduler = CFSScheduler()
scheduler.add_task(1, "web-server", nice=-5)    # Higher priority
scheduler.add_task(2, "batch-job", nice=10)     # Lower priority  
scheduler.add_task(3, "api-handler", nice=0)    # Normal priority
scheduler.add_task(4, "log-processor", nice=5)  # Below normal

# Run for 100ms
for _ in range(100):
    running = scheduler.tick(delta_ms=1.0)

scheduler.stats()
```

### I/O Multiplexing with select/poll Comparison (Python)

```python
import select
import socket
import errno
from typing import Dict, Callable

class EventLoop:
    """Simple event loop demonstrating I/O multiplexing patterns."""
    
    def __init__(self, use_poll: bool = True):
        self._readers: Dict[int, Callable] = {}
        self._writers: Dict[int, Callable] = {}
        self._use_poll = use_poll
        if use_poll:
            self._poll = select.poll()
    
    def add_reader(self, fd: int, callback: Callable):
        self._readers[fd] = callback
        if self._use_poll:
            events = select.POLLIN
            if fd in self._writers:
                events |= select.POLLOUT
            self._poll.register(fd, events)
    
    def add_writer(self, fd: int, callback: Callable):
        self._writers[fd] = callback
        if self._use_poll:
            events = select.POLLOUT
            if fd in self._readers:
                events |= select.POLLIN
            self._poll.modify(fd, events) if fd in self._readers else self._poll.register(fd, events)
    
    def remove(self, fd: int):
        self._readers.pop(fd, None)
        self._writers.pop(fd, None)
        if self._use_poll:
            try:
                self._poll.unregister(fd)
            except (KeyError, OSError):
                pass
    
    def run_once(self, timeout_ms: int = 1000):
        if self._use_poll:
            self._run_poll(timeout_ms)
        else:
            self._run_select(timeout_ms)
    
    def _run_poll(self, timeout_ms: int):
        """poll() - O(n) where n = number of ready fds."""
        events = self._poll.poll(timeout_ms)
        for fd, event in events:
            if event & (select.POLLIN | select.POLLHUP | select.POLLERR):
                if fd in self._readers:
                    self._readers[fd]()
            if event & select.POLLOUT:
                if fd in self._writers:
                    self._writers[fd]()
    
    def _run_select(self, timeout_ms: int):
        """select() - O(n) scan of all fds, limited to FD_SETSIZE (1024)."""
        rlist = list(self._readers.keys())
        wlist = list(self._writers.keys())
        
        timeout = timeout_ms / 1000.0
        readable, writable, _ = select.select(rlist, wlist, [], timeout)
        
        for fd in readable:
            if fd in self._readers:
                self._readers[fd]()
        for fd in writable:
            if fd in self._writers:
                self._writers[fd]()
    
    def run_forever(self):
        while self._readers or self._writers:
            self.run_once()


class EchoServer:
    """Non-blocking echo server using event loop."""
    
    def __init__(self, port: int = 8080):
        self.loop = EventLoop(use_poll=True)
        self.server_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.server_sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.server_sock.setblocking(False)
        self.server_sock.bind(('0.0.0.0', port))
        self.server_sock.listen(128)
        
        self.loop.add_reader(self.server_sock.fileno(), self._on_accept)
        self.clients: Dict[int, socket.socket] = {}
    
    def _on_accept(self):
        while True:
            try:
                client, addr = self.server_sock.accept()
                client.setblocking(False)
                fd = client.fileno()
                self.clients[fd] = client
                self.loop.add_reader(fd, lambda f=fd: self._on_read(f))
            except BlockingIOError:
                break
    
    def _on_read(self, fd: int):
        client = self.clients.get(fd)
        if not client:
            return
        try:
            data = client.recv(4096)
            if data:
                client.sendall(data)  # Echo back
            else:
                self._close_client(fd)
        except (ConnectionResetError, BrokenPipeError):
            self._close_client(fd)
    
    def _close_client(self, fd: int):
        self.loop.remove(fd)
        client = self.clients.pop(fd, None)
        if client:
            client.close()
    
    def run(self):
        print(f"Echo server running on port 8080")
        self.loop.run_forever()
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
