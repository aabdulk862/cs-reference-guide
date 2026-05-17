# Processes and Threads

## Quick Reference

- A **process** is an instance of a running program with its own address space, file descriptors, signal handlers, and at least one thread of execution
- Process states follow the lifecycle: New → Ready → Running → Waiting → Terminated; the kernel scheduler transitions processes between states
- A **thread** is the smallest unit of CPU scheduling — threads within a process share the address space and resources but have independent stacks and register contexts
- Context switch cost includes saving/restoring registers, updating the PCB, TLB flush (for process switches), and cache pollution — typically 1-10 microseconds
- Linux uses a 1:1 threading model where each user thread maps to a kernel thread (task_struct), scheduled independently by CFS
- The `clone()` system call creates both processes and threads on Linux, with flags controlling which resources are shared (CLONE_VM, CLONE_FILES, CLONE_SIGHAND)
- Thread pools amortize thread creation cost and bound concurrency; size them to match available cores for CPU-bound work or higher for I/O-bound work
- IPC mechanisms (pipes, shared memory, sockets, message queues, signals) enable communication between isolated processes

## When to Use

Understanding processes and threads is essential when designing any concurrent or parallel system. You need this knowledge when:

- **Sizing thread pools** for web servers, database connection pools, or background job processors — undersized pools cause request queuing, oversized pools cause excessive context switching
- **Choosing between processes and threads** for your application architecture — processes provide fault isolation (a crash in one doesn't kill others) while threads provide efficient shared-state communication
- **Debugging production issues** like high CPU usage from excessive context switches, thread starvation from lock contention, or zombie processes from missing wait() calls
- **Designing microservice communication** — selecting between shared memory (fastest, same-host only), Unix domain sockets (fast, bidirectional), or TCP sockets (network-capable)
- **Configuring container resource limits** — understanding how cgroups CPU shares and quotas interact with the kernel scheduler to throttle or prioritize containers
- **Implementing graceful shutdown** — handling SIGTERM to drain in-flight requests, waiting for worker threads to complete, and cleaning up child processes

## Code Examples

### Thread-Safe Producer-Consumer Queue with Condition Variables (Java)

```java
import java.util.LinkedList;
import java.util.Queue;
import java.util.concurrent.locks.Condition;
import java.util.concurrent.locks.ReentrantLock;

public class BoundedBlockingQueue<T> {
    private final Queue<T> queue;
    private final int capacity;
    private final ReentrantLock lock;
    private final Condition notFull;
    private final Condition notEmpty;

    public BoundedBlockingQueue(int capacity) {
        this.capacity = capacity;
        this.queue = new LinkedList<>();
        this.lock = new ReentrantLock();
        this.notFull = lock.newCondition();
        this.notEmpty = lock.newCondition();
    }

    public void put(T item) throws InterruptedException {
        lock.lock();
        try {
            while (queue.size() == capacity) {
                notFull.await();  // Release lock and wait
            }
            queue.offer(item);
            notEmpty.signal();  // Wake one waiting consumer
        } finally {
            lock.unlock();
        }
    }

    public T take() throws InterruptedException {
        lock.lock();
        try {
            while (queue.isEmpty()) {
                notEmpty.await();  // Release lock and wait
            }
            T item = queue.poll();
            notFull.signal();  // Wake one waiting producer
            return item;
        } finally {
            lock.unlock();
        }
    }

    public int size() {
        lock.lock();
        try {
            return queue.size();
        } finally {
            lock.unlock();
        }
    }
}
```

### Thread Creation and Parallel Computation (Java)

```java
import java.util.concurrent.*;

public class ParallelSum {
    private static final int NUM_THREADS = 4;
    private static final int WORK_ITEMS = 1000;

    static class ComputeTask implements Callable<Long> {
        final int threadId;
        final int start;
        final int end;

        ComputeTask(int threadId, int start, int end) {
            this.threadId = threadId;
            this.start = start;
            this.end = end;
        }

        @Override
        public Long call() {
            long sum = 0;
            for (int i = start; i < end; i++) {
                sum += (long) i * i; // Compute sum of squares
            }
            System.out.printf("Thread %d computed partial sum [%d, %d): %d%n",
                    threadId, start, end, sum);
            return sum;
        }
    }

    public static void main(String[] args) throws InterruptedException, ExecutionException {
        ExecutorService executor = Executors.newFixedThreadPool(NUM_THREADS);
        int chunkSize = WORK_ITEMS / NUM_THREADS;

        // Submit tasks with divided work
        Future<Long>[] futures = new Future[NUM_THREADS];
        for (int i = 0; i < NUM_THREADS; i++) {
            int start = i * chunkSize;
            int end = (i == NUM_THREADS - 1) ? WORK_ITEMS : (i + 1) * chunkSize;
            futures[i] = executor.submit(new ComputeTask(i, start, end));
        }

        // Collect results and aggregate
        long total = 0;
        for (int i = 0; i < NUM_THREADS; i++) {
            total += futures[i].get(); // Blocks until thread completes
        }

        System.out.printf("Total sum of squares [0, %d): %d%n", WORK_ITEMS, total);
        executor.shutdown();
    }
}
```

### Process Creation and IPC via Streams (Java)

```java
import java.io.*;

public class ProcessIPC {
    public static void main(String[] args) throws Exception {
        // Create a child process that reads from stdin and prints to stdout
        // This demonstrates IPC via process streams (equivalent to pipe + fork)
        ProcessBuilder pb = new ProcessBuilder("cat");
        pb.redirectErrorStream(true);
        Process child = pb.start();

        long parentPid = ProcessHandle.current().pid();
        long childPid = child.pid();

        // Parent process: write to child's stdin (equivalent to pipe write end)
        String message = "Hello from parent process!";
        try (OutputStream os = child.getOutputStream()) {
            os.write(message.getBytes());
            os.flush();
            System.out.printf("Parent (PID %d) sent message to child (PID %d)%n",
                    parentPid, childPid);
        }

        // Read child's stdout (equivalent to pipe read end)
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(child.getInputStream()))) {
            String line = reader.readLine();
            if (line != null) {
                System.out.printf("Child (PID %d) echoed: %s%n", childPid, line);
            }
        }

        // Wait for child to finish (prevents zombie equivalent)
        int exitCode = child.waitFor();
        System.out.printf("Child exited with status %d%n", exitCode);
    }
}
```

### Thread Pool Implementation (Java)

```java
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;

public class SimpleThreadPool {
    /**Fixed-size thread pool with work queue.*/

    static class TaskFuture<T> {
        private T result;
        private Exception exception;
        private final CountDownLatch done = new CountDownLatch(1);

        void setResult(T result) {
            this.result = result;
            done.countDown();
        }

        void setException(Exception exc) {
            this.exception = exc;
            done.countDown();
        }

        T result(long timeoutMs) throws Exception {
            done.await(timeoutMs, TimeUnit.MILLISECONDS);
            if (exception != null) throw exception;
            return result;
        }

        T result() throws Exception {
            done.await();
            if (exception != null) throw exception;
            return result;
        }
    }

    private static class WorkItem<T> {
        final Callable<T> task;
        final TaskFuture<T> future;

        WorkItem(Callable<T> task, TaskFuture<T> future) {
            this.task = task;
            this.future = future;
        }
    }

    private final BlockingQueue<WorkItem<?>> workQueue;
    private final Thread[] workers;
    private final AtomicBoolean shutdown = new AtomicBoolean(false);

    public SimpleThreadPool(int numWorkers, int queueSize) {
        this.workQueue = new LinkedBlockingQueue<>(queueSize);
        this.workers = new Thread[numWorkers];

        for (int i = 0; i < numWorkers; i++) {
            workers[i] = new Thread(this::workerLoop, "pool-worker-" + i);
            workers[i].setDaemon(true);
            workers[i].start();
        }
    }

    @SuppressWarnings("unchecked")
    private void workerLoop() {
        while (!shutdown.get()) {
            try {
                WorkItem item = workQueue.poll(1, TimeUnit.SECONDS);
                if (item == null) continue;

                try {
                    Object result = item.task.call();
                    item.future.setResult(result);
                } catch (Exception e) {
                    item.future.setException(e);
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            }
        }
    }

    public <T> TaskFuture<T> submit(Callable<T> task) {
        if (shutdown.get()) throw new RejectedExecutionException("Pool is shut down");
        TaskFuture<T> future = new TaskFuture<>();
        try {
            workQueue.put(new WorkItem<>(task, future));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new RejectedExecutionException("Interrupted while submitting", e);
        }
        return future;
    }

    public void shutdown(boolean wait) throws InterruptedException {
        shutdown.set(true);
        if (wait) {
            for (Thread worker : workers) {
                worker.join(5000);
            }
        }
    }

    // Usage
    public static void main(String[] args) throws Exception {
        SimpleThreadPool pool = new SimpleThreadPool(4, 1000);
        TaskFuture<?>[] futures = new TaskFuture[20];
        for (int i = 0; i < 20; i++) {
            futures[i] = pool.submit(() -> {
                Thread.sleep(100);
                return null;
            });
        }
        for (TaskFuture<?> f : futures) {
            f.result();
        }
        pool.shutdown(true);
    }
}
```

## Common Pitfalls

1. **Zombie processes from missing wait()/waitpid()**: When a child process terminates, it remains in the process table as a zombie until the parent calls wait() to collect its exit status. If the parent never waits, zombies accumulate and eventually exhaust the PID space. In long-running daemons, use SIGCHLD handlers with waitpid(-1, &status, WNOHANG) in a loop, or set SIGCHLD to SIG_IGN to auto-reap children. In containerized environments, use an init process (tini, dumb-init) as PID 1 to reap orphaned zombies.

2. **Thread pool sizing mismatch**: Oversized thread pools for CPU-bound work cause excessive context switching — each switch wastes 1-10μs plus cache pollution. Undersized pools for I/O-bound work leave CPUs idle while threads block on I/O. Rule of thumb: CPU-bound pools = number of cores; I/O-bound pools = cores × (1 + wait_time/compute_time). Profile with `vmstat` (cs column) and `/proc/pid/status` (voluntary vs involuntary context switches) to validate sizing.

3. **Race conditions from unsynchronized shared state**: Multiple threads reading and writing shared variables without synchronization leads to torn reads, lost updates, and corrupted data structures. The compiler and CPU reorder memory operations for performance, making bugs non-deterministic and architecture-dependent. Always protect shared mutable state with locks, atomics, or message passing. Use ThreadSanitizer (-fsanitize=thread) during testing to detect races.

4. **Deadlock from fork() in multithreaded programs**: When a multithreaded process calls fork(), only the calling thread exists in the child. If another thread held a lock (malloc's internal lock, for example) at fork time, that lock is permanently held in the child, causing deadlock on the next allocation. Use pthread_atfork() handlers or avoid fork() in multithreaded programs — prefer posix_spawn() which combines fork+exec atomically.

5. **Signal handling in multithreaded programs**: Signals are delivered to an arbitrary thread in the process (except thread-directed signals). If multiple threads have different signal masks or handlers, behavior becomes unpredictable. Best practice: block all signals in worker threads and dedicate one thread to signal handling using sigwait(). This converts asynchronous signals into synchronous events that are easier to reason about.

6. **File descriptor leaks across fork/exec**: After fork(), the child inherits all open file descriptors. If the child calls exec() without closing unnecessary FDs, those resources remain held by the new program. Use O_CLOEXEC flag when opening files, or call fcntl(fd, F_SETFD, FD_CLOEXEC) on existing descriptors. Monitor with `ls /proc/pid/fd | wc -l` and alert when approaching ulimit.

## Real-World Use Cases

- **Web server request handling (Nginx/Apache)**: Nginx uses a multi-process, event-driven architecture — a master process manages worker processes, each handling thousands of connections via epoll without threading. Apache's prefork MPM uses one process per connection (isolation but high memory), while its event MPM uses threads with async I/O. The choice reflects the fundamental process-vs-thread tradeoff: isolation versus efficiency.

- **Container orchestration (Kubernetes)**: Each container runs as a process (or process tree) in isolated namespaces. The kubelet monitors container processes via cgroups, restarts crashed containers (process exit detection), and enforces resource limits. Understanding process hierarchies, signal propagation, and PID namespaces is essential for debugging container lifecycle issues like graceful shutdown failures.

- **Database connection pooling (HikariCP, PgBouncer)**: Connection pools maintain a fixed number of threads/processes with established database connections, amortizing connection setup cost (TCP handshake, TLS negotiation, authentication). Pool sizing follows Little's Law: pool_size = throughput × average_latency. Oversized pools cause database contention; undersized pools cause application queuing. HikariCP defaults to cores × 2 + 1 for mixed workloads.

- **JVM thread management**: The JVM maps Java threads 1:1 to OS kernel threads. Virtual threads (Project Loom, Java 21+) implement M:N threading — millions of virtual threads multiplexed onto a small carrier thread pool. This eliminates the thread-per-request scalability limit without requiring reactive programming. Understanding the OS threading model explains why virtual threads dramatically reduce memory overhead (no 1MB stack per thread).

- **CI/CD pipeline execution (Jenkins, GitHub Actions)**: Build systems fork child processes for each build step (compile, test, deploy). Process isolation ensures a failing step doesn't corrupt the build environment. Process groups and session leaders enable killing an entire build pipeline (kill -TERM -pgid) on timeout. Cgroups limit resource consumption per build to prevent noisy-neighbor effects on shared build agents.

## Interview Questions

**Q: Explain the difference between a process and a thread. When would you choose one over the other?**

A: A process has its own address space, file descriptors, and signal handlers, providing strong isolation but expensive creation (~10ms) and communication (requires IPC). Threads share the process address space and resources, enabling fast communication through shared memory but requiring explicit synchronization and offering no fault isolation. Choose processes when you need security boundaries (web server handling untrusted code), fault isolation (a crash in one worker shouldn't kill others), or different privilege levels. Choose threads when you need shared state (in-memory caches, connection pools), low-latency communication, or when memory overhead matters (threads share code/data segments). Modern architectures often combine both: multiple processes for fault domains with multiple threads per process for parallelism.

**Q: What is a context switch and what makes it expensive?**

A: A context switch saves the current execution context (registers, program counter, stack pointer, floating-point state) to the process/thread control block and loads another context. The direct cost is 1-5μs for register save/restore and kernel bookkeeping. The indirect costs dominate: TLB flush on process switches invalidates cached address translations (subsequent memory accesses incur page table walks), CPU cache pollution means the new process starts with cold caches (L1/L2/L3 misses), and branch predictor state is lost. For threads within the same process, TLB flush is avoided (shared address space), making thread switches cheaper. Minimize context switches by sizing thread pools appropriately, using I/O multiplexing instead of thread-per-connection, and pinning latency-sensitive threads to dedicated cores.

**Q: How does fork() work and what is copy-on-write?**

A: fork() creates a new process that is an exact copy of the parent — same code, data, heap, stack, and open file descriptors. With copy-on-write (COW), the kernel doesn't actually copy physical memory pages. Instead, both parent and child share the same physical pages marked read-only. When either process writes to a shared page, the MMU triggers a page fault, the kernel allocates a new physical frame, copies the page content, and updates the writer's page table to point to the new frame. This makes fork() nearly O(1) regardless of process memory size (only page table entries are copied, not data). COW is why fork()+exec() is efficient for spawning new programs — most pages are never written before exec() replaces the address space entirely.

**Q: Describe the IPC mechanisms available on Linux and their tradeoffs.**

A: **Pipes** provide unidirectional byte streams between related processes (64KB kernel buffer, simple but limited to parent-child). **Named pipes (FIFOs)** extend pipes to unrelated processes via filesystem paths. **Shared memory** (mmap MAP_SHARED or shm_open) is the fastest IPC — zero-copy data exchange through mapped memory regions, but requires explicit synchronization (semaphores/futexes). **Unix domain sockets** provide bidirectional, connection-oriented communication with the socket API, faster than TCP loopback (no network stack overhead), and support file descriptor passing (SCM_RIGHTS). **Message queues** (POSIX mq_*) provide structured, prioritized messages with built-in synchronization. **Signals** are asynchronous notifications carrying minimal data (signal number only), used for control flow rather than data transfer. Choose shared memory for maximum throughput (databases, multimedia), Unix sockets for general-purpose bidirectional communication, and pipes for simple streaming between related processes.

**Q: What are zombie and orphan processes?**

A: A **zombie** process has terminated but its parent hasn't called wait() to collect its exit status. It occupies a process table entry (storing exit code, resource usage stats) but consumes no CPU or memory. Zombies accumulate if the parent ignores SIGCHLD or never waits, eventually exhausting the PID space. Fix by calling waitpid() in a SIGCHLD handler or setting SIGCHLD to SIG_IGN. An **orphan** process is a running process whose parent has terminated. The kernel re-parents orphans to PID 1 (init/systemd), which periodically calls wait() to reap them. In containers, if PID 1 doesn't reap children (common with application processes as PID 1), zombies accumulate — this is why container init processes (tini) exist.

## Production Tips

- **Monitor context switch rates with vmstat and pidstat**: High involuntary context switches (visible in `vmstat` cs column or `pidstat -w`) indicate CPU contention — more runnable threads than cores. Track per-process switches via `/proc/pid/status` (voluntary_ctxt_switches for I/O waits, nonvoluntary_ctxt_switches for preemption). If involuntary switches are high, reduce thread pool sizes or add CPU capacity. Target: involuntary switches should be less than 10% of voluntary switches for well-tuned services.

- **Use process groups for clean shutdown**: When spawning child processes, create a process group (setpgid) so you can signal the entire group with kill(-pgid, SIGTERM). This ensures all descendants receive the termination signal, preventing orphaned processes. In systemd services, use KillMode=control-group to kill all processes in the service's cgroup on stop. Set TimeoutStopSec to allow graceful drain before SIGKILL.

- **Pin latency-sensitive threads to dedicated cores**: Use taskset or pthread_setaffinity_np() to bind critical threads to specific CPU cores, eliminating migration overhead and improving cache locality. Combine with isolcpus kernel parameter to prevent the scheduler from placing other tasks on those cores. This technique is standard in HFT systems and real-time audio processing where microsecond-level jitter matters.

- **Configure appropriate thread stack sizes**: Default thread stack size is typically 8MB (Linux) but most threads use far less. For applications with thousands of threads, reduce stack size with pthread_attr_setstacksize() or ulimit -s to reduce virtual memory consumption. Java's -Xss flag controls thread stack size (default 512KB-1MB). Monitor actual stack usage with `/proc/pid/maps` to find the right minimum.

## Related Topics

- [Concurrency Primitives](./concurrency-primitives.md) — Synchronization mechanisms for coordinating thread access to shared resources
- [Memory Management](./memory-management.md) — Virtual memory and address space management that enables process isolation
- [I/O and Scheduling](./io-and-scheduling.md) — CPU scheduling algorithms and I/O models that determine how processes share system resources
