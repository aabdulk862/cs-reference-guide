# Concurrency Primitives

## Quick Reference

- **Mutex** (mutual exclusion) provides exclusive access to a critical section — only one thread can hold it at a time; others block until released
- **Semaphore** generalizes mutex with a counter allowing up to N concurrent accesses — useful for resource pools (connection pools, thread pools)
- **Condition variables** enable threads to wait for a specific condition without busy-waiting, atomically releasing the associated mutex while sleeping
- **Read-write locks** (rwlock) allow multiple concurrent readers OR one exclusive writer — optimizes read-heavy workloads but can starve writers
- **Spinlocks** busy-wait instead of sleeping — appropriate only for very short critical sections (< 1μs) where sleep/wake overhead exceeds spin time
- **Lock-free** algorithms use atomic operations (CAS, fetch-and-add) guaranteeing system-wide progress without locks; **wait-free** guarantees per-thread bounded progress
- **Deadlock** requires four simultaneous conditions: mutual exclusion, hold-and-wait, no preemption, circular wait — break any one to prevent deadlock
- **Memory ordering** (acquire/release semantics, memory barriers) ensures visibility of shared state changes across cores — critical for correct lock-free code
- **Futex** (fast userspace mutex) is Linux's hybrid synchronization primitive — fast path in userspace (atomic CAS), slow path via kernel (sleep/wake)

## When to Use

Concurrency primitives are essential when:

- **Protecting shared mutable state** — any data structure accessed by multiple threads requires synchronization to prevent torn reads, lost updates, and corruption
- **Implementing producer-consumer patterns** — bounded queues, work-stealing schedulers, and event buses require coordination between producers and consumers
- **Building connection pools and resource managers** — semaphores naturally model fixed-capacity resources (database connections, file handles, network sockets)
- **Designing high-throughput data structures** — lock-free queues and hash maps eliminate lock contention for latency-sensitive paths (trading complexity for performance)
- **Coordinating thread lifecycle** — barriers synchronize thread groups at checkpoints, latches signal one-time events, and phasers coordinate multi-phase computations
- **Implementing rate limiters and throttles** — token bucket algorithms use atomic operations or mutexes to control concurrent access rates

## Code Examples

### Mutex and Condition Variable: Bounded Queue (C/pthreads)

```c
#include <pthread.h>
#include <stdlib.h>
#include <stdio.h>
#include <stdbool.h>

#define QUEUE_CAPACITY 64

typedef struct {
    void *items[QUEUE_CAPACITY];
    int head;
    int tail;
    int count;
    pthread_mutex_t mutex;
    pthread_cond_t not_full;
    pthread_cond_t not_empty;
    bool shutdown;
} BoundedQueue;

BoundedQueue *queue_create() {
    BoundedQueue *q = calloc(1, sizeof(BoundedQueue));
    pthread_mutex_init(&q->mutex, NULL);
    pthread_cond_init(&q->not_full, NULL);
    pthread_cond_init(&q->not_empty, NULL);
    q->shutdown = false;
    return q;
}

// Blocking put - waits if queue is full
int queue_put(BoundedQueue *q, void *item) {
    pthread_mutex_lock(&q->mutex);
    
    while (q->count == QUEUE_CAPACITY && !q->shutdown) {
        // Atomically release mutex and wait on condition
        // Re-acquires mutex when signaled (may be spurious)
        pthread_cond_wait(&q->not_full, &q->mutex);
    }
    
    if (q->shutdown) {
        pthread_mutex_unlock(&q->mutex);
        return -1;
    }
    
    q->items[q->tail] = item;
    q->tail = (q->tail + 1) % QUEUE_CAPACITY;
    q->count++;
    
    // Signal one waiting consumer
    pthread_cond_signal(&q->not_empty);
    pthread_mutex_unlock(&q->mutex);
    return 0;
}

// Blocking take - waits if queue is empty
void *queue_take(BoundedQueue *q) {
    pthread_mutex_lock(&q->mutex);
    
    while (q->count == 0 && !q->shutdown) {
        pthread_cond_wait(&q->not_empty, &q->mutex);
    }
    
    if (q->shutdown && q->count == 0) {
        pthread_mutex_unlock(&q->mutex);
        return NULL;
    }
    
    void *item = q->items[q->head];
    q->head = (q->head + 1) % QUEUE_CAPACITY;
    q->count--;
    
    pthread_cond_signal(&q->not_full);
    pthread_mutex_unlock(&q->mutex);
    return item;
}

// Graceful shutdown: wake all waiters
void queue_shutdown(BoundedQueue *q) {
    pthread_mutex_lock(&q->mutex);
    q->shutdown = true;
    pthread_cond_broadcast(&q->not_full);
    pthread_cond_broadcast(&q->not_empty);
    pthread_mutex_unlock(&q->mutex);
}

void queue_destroy(BoundedQueue *q) {
    pthread_mutex_destroy(&q->mutex);
    pthread_cond_destroy(&q->not_full);
    pthread_cond_destroy(&q->not_empty);
    free(q);
}
```

### Lock-Free Stack (Treiber Stack) with CAS (C)

```c
#include <stdatomic.h>
#include <stdlib.h>
#include <stdbool.h>

typedef struct Node {
    void *data;
    struct Node *next;
} Node;

typedef struct {
    _Atomic(Node *) top;
    _Atomic(size_t) size;
} LockFreeStack;

void stack_init(LockFreeStack *stack) {
    atomic_store(&stack->top, NULL);
    atomic_store(&stack->size, 0);
}

void stack_push(LockFreeStack *stack, void *data) {
    Node *new_node = malloc(sizeof(Node));
    new_node->data = data;
    
    Node *old_top;
    do {
        old_top = atomic_load_explicit(&stack->top, memory_order_relaxed);
        new_node->next = old_top;
        // CAS: if top still equals old_top, set it to new_node
        // If another thread pushed/popped, old_top changed, CAS fails, retry
    } while (!atomic_compare_exchange_weak_explicit(
        &stack->top, &old_top, new_node,
        memory_order_release,  // Ensure new_node writes visible before top update
        memory_order_relaxed
    ));
    
    atomic_fetch_add(&stack->size, 1);
}

void *stack_pop(LockFreeStack *stack) {
    Node *old_top;
    Node *new_top;
    
    do {
        old_top = atomic_load_explicit(&stack->top, memory_order_acquire);
        if (old_top == NULL) return NULL;  // Stack empty
        new_top = old_top->next;
        // CAS: if top still equals old_top, set it to new_top
    } while (!atomic_compare_exchange_weak_explicit(
        &stack->top, &old_top, new_top,
        memory_order_release,
        memory_order_relaxed
    ));
    
    atomic_fetch_sub(&stack->size, 1);
    
    void *data = old_top->data;
    // Note: In production, use hazard pointers or epoch-based reclamation
    // to safely free old_top (another thread might still be reading it)
    free(old_top);
    return data;
}
```

### Read-Write Lock with Writer Priority (Java)

```java
import java.util.concurrent.locks.Condition;
import java.util.concurrent.locks.ReentrantLock;

public class WriterPriorityRWLock {
    private final ReentrantLock lock = new ReentrantLock();
    private final Condition canRead = lock.newCondition();
    private final Condition canWrite = lock.newCondition();
    
    private int activeReaders = 0;
    private int activeWriters = 0;
    private int waitingWriters = 0;
    
    public void readLock() throws InterruptedException {
        lock.lock();
        try {
            // Wait if there's an active writer OR waiting writers (writer priority)
            while (activeWriters > 0 || waitingWriters > 0) {
                canRead.await();
            }
            activeReaders++;
        } finally {
            lock.unlock();
        }
    }
    
    public void readUnlock() {
        lock.lock();
        try {
            activeReaders--;
            if (activeReaders == 0 && waitingWriters > 0) {
                canWrite.signal();  // Wake one waiting writer
            }
        } finally {
            lock.unlock();
        }
    }
    
    public void writeLock() throws InterruptedException {
        lock.lock();
        try {
            waitingWriters++;
            while (activeReaders > 0 || activeWriters > 0) {
                canWrite.await();
            }
            waitingWriters--;
            activeWriters++;
        } finally {
            lock.unlock();
        }
    }
    
    public void writeUnlock() {
        lock.lock();
        try {
            activeWriters--;
            if (waitingWriters > 0) {
                canWrite.signal();  // Prefer writers
            } else {
                canRead.signalAll();  // Wake all waiting readers
            }
        } finally {
            lock.unlock();
        }
    }
}
```

### Deadlock Detection with Wait-For Graph (Python)

```python
from collections import defaultdict, deque
from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, Set, Optional, List, Tuple
import threading
import time

class LockState(Enum):
    FREE = "free"
    HELD = "held"

@dataclass
class LockInfo:
    name: str
    state: LockState = LockState.FREE
    holder: Optional[int] = None  # Thread ID
    waiters: Set[int] = field(default_factory=set)

class DeadlockDetector:
    """Detects deadlocks using wait-for graph cycle detection."""
    
    def __init__(self):
        self.locks: Dict[str, LockInfo] = {}
        self.thread_holds: Dict[int, Set[str]] = defaultdict(set)
        self._monitor_lock = threading.Lock()
    
    def register_lock(self, name: str):
        self.locks[name] = LockInfo(name=name)
    
    def acquire(self, thread_id: int, lock_name: str) -> bool:
        """Attempt to acquire lock. Returns False if deadlock detected."""
        with self._monitor_lock:
            lock = self.locks[lock_name]
            
            if lock.state == LockState.FREE:
                lock.state = LockState.HELD
                lock.holder = thread_id
                self.thread_holds[thread_id].add(lock_name)
                return True
            
            # Lock is held by another thread - check for deadlock
            lock.waiters.add(thread_id)
            
            cycle = self._detect_cycle(thread_id)
            if cycle:
                lock.waiters.discard(thread_id)
                print(f"DEADLOCK DETECTED! Cycle: {' -> '.join(map(str, cycle))}")
                return False
            
            return True  # Safe to wait (no deadlock)
    
    def release(self, thread_id: int, lock_name: str):
        with self._monitor_lock:
            lock = self.locks[lock_name]
            lock.state = LockState.FREE
            lock.holder = None
            self.thread_holds[thread_id].discard(lock_name)
    
    def _detect_cycle(self, start_thread: int) -> Optional[List[int]]:
        """BFS/DFS on wait-for graph to find cycles."""
        # Build wait-for graph: thread A waits-for thread B
        # if A is waiting for a lock held by B
        wait_for: Dict[int, Set[int]] = defaultdict(set)
        
        for lock in self.locks.values():
            if lock.holder is not None:
                for waiter in lock.waiters:
                    wait_for[waiter].add(lock.holder)
        
        # DFS from start_thread looking for cycle back to start
        visited = set()
        path = [start_thread]
        
        def dfs(node: int) -> bool:
            if node in visited:
                if node == start_thread:
                    return True  # Cycle found
                return False
            visited.add(node)
            path.append(node)
            
            for neighbor in wait_for.get(node, set()):
                if dfs(neighbor):
                    return True
            
            path.pop()
            return False
        
        for neighbor in wait_for.get(start_thread, set()):
            if dfs(neighbor):
                return path
        
        return None

# Usage example
detector = DeadlockDetector()
detector.register_lock("mutex_A")
detector.register_lock("mutex_B")

# Thread 1 holds A, wants B
detector.acquire(1, "mutex_A")
# Thread 2 holds B, wants A
detector.acquire(2, "mutex_B")

# This would detect deadlock:
# detector.acquire(1, "mutex_B")  # Thread 1 waits for B (held by 2)
# detector.acquire(2, "mutex_A")  # Thread 2 waits for A (held by 1) -> CYCLE
```

### Semaphore-Based Connection Pool (Java)

```java
import java.util.concurrent.Semaphore;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

public class ConnectionPool<T> {
    private final Semaphore available;
    private final ConcurrentLinkedQueue<T> pool;
    private final ConnectionFactory<T> factory;
    private final AtomicInteger totalCreated;
    private final int maxSize;
    private final long acquireTimeoutMs;

    @FunctionalInterface
    public interface ConnectionFactory<T> {
        T create() throws Exception;
    }

    public ConnectionPool(int maxSize, long acquireTimeoutMs, ConnectionFactory<T> factory) {
        this.maxSize = maxSize;
        this.acquireTimeoutMs = acquireTimeoutMs;
        this.factory = factory;
        this.available = new Semaphore(maxSize, true);  // Fair ordering
        this.pool = new ConcurrentLinkedQueue<>();
        this.totalCreated = new AtomicInteger(0);
    }

    public T acquire() throws Exception {
        // Semaphore limits concurrent checkouts to maxSize
        if (!available.tryAcquire(acquireTimeoutMs, TimeUnit.MILLISECONDS)) {
            throw new RuntimeException("Connection pool exhausted (timeout: " 
                + acquireTimeoutMs + "ms, pool size: " + maxSize + ")");
        }

        // Try to reuse existing connection
        T conn = pool.poll();
        if (conn != null) {
            return conn;
        }

        // Create new connection (lazy initialization)
        totalCreated.incrementAndGet();
        return factory.create();
    }

    public void release(T connection) {
        if (connection == null) return;
        pool.offer(connection);
        available.release();  // Increment semaphore, unblock one waiter
    }

    public int getAvailableCount() {
        return available.availablePermits();
    }

    public int getTotalCreated() {
        return totalCreated.get();
    }
}
```

## Common Pitfalls

1. **Deadlock from inconsistent lock ordering**: When multiple threads acquire multiple locks in different orders, circular wait occurs. Thread A holds lock1 and waits for lock2, while Thread B holds lock2 and waits for lock1. Always establish a global lock ordering (e.g., by lock address or assigned ID) and acquire in that order. Use try-lock with backoff as an alternative: attempt to acquire, and if it fails, release all held locks, back off, and retry. Tools like ThreadSanitizer and Java's jstack detect lock ordering violations.

2. **Priority inversion without priority inheritance**: A high-priority thread blocked on a mutex held by a low-priority thread can be starved indefinitely if medium-priority threads preempt the lock holder. The low-priority thread never runs to release the lock. Solution: priority inheritance protocols temporarily boost the lock holder's priority to the highest waiter's priority. This famously caused the Mars Pathfinder mission reset until the mutex was reconfigured. Use `PTHREAD_PRIO_INHERIT` on Linux or `ReentrantLock` with fair ordering in Java.

3. **Spurious wakeups breaking condition variable logic**: Condition variables can wake threads without an explicit signal (spurious wakeups are permitted by POSIX and Java specifications). Code that uses `if` instead of `while` to check the condition after waking will proceed with an unsatisfied condition, causing logic errors. Always use a while loop: `while (!condition) { cond_wait(&cv, &mutex); }`. This also handles the case where multiple threads are woken by broadcast but only one should proceed.

4. **False sharing destroying parallel performance**: When threads modify different variables that reside on the same cache line (64 bytes on x86), the CPU's cache coherency protocol (MESI) bounces the cache line between cores on every write, serializing what should be parallel operations. Pad structures to cache line boundaries: use `alignas(64)` in C++, `@Contended` in Java, or manual padding. Profile with `perf stat -e cache-misses` to detect. A single false-sharing instance can reduce throughput by 10-100x.

5. **ABA problem in lock-free algorithms**: A CAS operation succeeds if the value equals the expected value, but another thread might have changed it from A to B and back to A between the read and CAS. The CAS succeeds despite the value having changed. This corrupts lock-free data structures (e.g., a popped node being reused while another thread still references it). Solutions: tagged pointers (pack a version counter with the pointer), hazard pointers, or epoch-based reclamation to prevent premature memory reuse.

6. **Holding locks during I/O or blocking operations**: Acquiring a mutex and then performing network I/O, disk reads, or sleeping while holding the lock serializes all other threads waiting for that lock. If the I/O takes 10ms and 100 threads need the lock, total wait time is 1 second. Minimize critical section duration: copy data under the lock, release the lock, then perform I/O on the local copy. Use async I/O or separate I/O threads to avoid blocking while holding locks.

## Real-World Use Cases

- **Java's ConcurrentHashMap**: Uses lock striping — the map is divided into segments, each with its own lock. Threads accessing different segments proceed in parallel. Java 8+ replaced segments with per-bucket CAS operations and synchronized blocks only for bucket chains longer than a threshold (tree bins). This achieves near-linear scalability for concurrent reads and writes without global locking.

- **Linux kernel's RCU (Read-Copy-Update)**: RCU provides extremely fast read-side access (no locks, no atomics, no memory barriers on read path) for read-mostly data structures. Writers create a new version of the data structure, atomically swap the pointer, and defer freeing the old version until all pre-existing readers have finished (grace period). Used extensively in the kernel for routing tables, file system caches, and module lists where reads vastly outnumber writes.

- **Database transaction isolation**: Database engines use multi-version concurrency control (MVCC) — readers see a consistent snapshot without blocking writers, and writers create new versions without blocking readers. This is implemented using read-write locks at the page level, optimistic concurrency control with validation at commit time, or lock-free techniques for in-memory databases. Understanding these primitives explains isolation level behavior (read committed vs serializable).

- **Go's channel-based concurrency**: Go channels implement CSP (Communicating Sequential Processes) — goroutines communicate by sending values through typed channels rather than sharing memory. Internally, channels use a mutex protecting a circular buffer (buffered channels) or direct goroutine-to-goroutine handoff (unbuffered channels). The runtime's scheduler multiplexes goroutines onto OS threads, parking blocked goroutines without consuming a thread.

- **High-frequency trading order books**: HFT systems use lock-free data structures for order book management — millions of price updates per second cannot tolerate mutex contention. LMAX Disruptor uses a lock-free ring buffer with sequence barriers, achieving 6 million transactions per second on a single thread. The key insight: single-writer principle eliminates the need for CAS on the write path, and memory barriers ensure readers see consistent state.

## Interview Questions

**Q: What is a deadlock? What are the four necessary conditions and how do you prevent each?**

A: Deadlock occurs when two or more threads are permanently blocked, each waiting for a resource held by another. Four conditions must hold simultaneously: (1) **Mutual exclusion** — resources are non-sharable (prevent by using sharable resources like read-write locks or lock-free structures). (2) **Hold-and-wait** — threads hold resources while waiting for others (prevent by acquiring all locks atomically or using try-lock with release-and-retry). (3) **No preemption** — resources cannot be forcibly taken (prevent by allowing lock timeout and forced release). (4) **Circular wait** — a cycle exists in the wait graph (prevent by imposing a total ordering on lock acquisition). In practice, consistent lock ordering is the most common prevention strategy. Detection uses periodic wait-for graph analysis with cycle detection (DFS), selecting a victim thread to abort and break the cycle.

**Q: Explain the difference between a mutex and a semaphore. When would you use each?**

A: A mutex provides exclusive access with ownership semantics — only the thread that locked it can unlock it, enabling priority inheritance and recursive locking. A semaphore maintains a counter allowing up to N concurrent accesses without ownership — any thread can signal (increment) regardless of which thread waited (decremented). Use a mutex for protecting critical sections (shared data structures, configuration state). Use a counting semaphore for resource pools (limiting concurrent database connections to N, bounding thread pool queue depth). Binary semaphores (N=1) resemble mutexes but lack ownership, making them suitable for signaling between threads (producer signals consumer) but prone to misuse (accidental double-signal).

**Q: What are lock-free data structures and when should you use them?**

A: Lock-free data structures use atomic operations (compare-and-swap, fetch-and-add) instead of locks, guaranteeing that at least one thread makes progress in any execution (no deadlock, no priority inversion). Common examples: Treiber stack (CAS on top pointer), Michael-Scott queue (CAS on head/tail), and concurrent skip lists. Use them when: lock contention is a measured bottleneck, you need guaranteed progress (real-time systems), or you need to avoid priority inversion. Avoid them when: the data structure is complex (correctness is extremely hard to verify), contention is low (locks are simpler and fast enough), or memory reclamation is difficult (the ABA problem requires hazard pointers or epoch-based reclamation, adding significant complexity).

**Q: How do condition variables work and why must you use a while loop when waiting?**

A: A condition variable allows a thread to atomically release a mutex and sleep until signaled by another thread. The workflow: (1) acquire mutex, (2) check condition, (3) if false, call cond_wait which atomically releases mutex and sleeps, (4) when signaled, cond_wait re-acquires mutex and returns, (5) re-check condition. The while loop is necessary for three reasons: **spurious wakeups** (POSIX permits implementations to wake threads without signal), **stolen wakeups** (between signal and the thread re-acquiring the mutex, another thread may have consumed the resource), and **broadcast semantics** (cond_broadcast wakes all waiters but only one may proceed). Without the loop, a thread may proceed with an unsatisfied condition, causing data corruption or logic errors.

**Q: What is false sharing and how do you detect and fix it?**

A: False sharing occurs when threads on different cores modify independent variables that happen to reside on the same CPU cache line (typically 64 bytes). The hardware cache coherency protocol (MESI) invalidates the entire cache line on any write, forcing other cores to reload it from a shared cache level or main memory. This serializes what should be independent parallel operations, reducing throughput by 10-100x. Detect with hardware performance counters: `perf stat -e cache-misses,L1-dcache-load-misses` showing unexpectedly high cache miss rates for simple operations. Fix by padding structures to cache line boundaries: `alignas(64)` in C++, `@jdk.internal.vm.annotation.Contended` in Java, or inserting dummy fields between hot variables.

## Production Tips

- **Use lock-free structures only after profiling proves contention**: Lock-free code is 5-10x harder to write correctly and debug. Most applications don't have enough contention to justify the complexity. Profile first with `perf lock` or Java Flight Recorder to identify actual lock contention hotspots. Often, reducing critical section duration or using finer-grained locking (lock striping) eliminates contention without lock-free complexity.

- **Set lock acquisition timeouts to detect deadlocks early**: Instead of blocking indefinitely on lock acquisition, use timed try-lock (pthread_mutex_timedlock, ReentrantLock.tryLock(timeout)). If acquisition fails after a reasonable timeout (e.g., 30 seconds), log the thread state, dump stack traces of all threads, and either retry with backoff or fail the operation. This converts silent deadlocks into actionable alerts. In Java, enable deadlock detection with ThreadMXBean.findDeadlockedThreads() on a periodic health check thread.

- **Monitor lock contention metrics in production**: Track lock wait times and contention rates. In Java, use JFR (Java Flight Recorder) events for lock contention. In C/C++, use eBPF tools (futex tracer) or mutex profiling libraries. High contention on a single lock indicates a scalability bottleneck — consider lock splitting, read-write locks, or redesigning the data access pattern. Alert when p99 lock wait time exceeds your latency SLO.

- **Prefer higher-level concurrency abstractions when possible**: Raw mutexes and condition variables are error-prone. Use concurrent collections (ConcurrentHashMap, ConcurrentLinkedQueue), executor frameworks (ThreadPoolExecutor), and structured concurrency (Java 21 StructuredTaskScope, Go goroutines with channels) that encapsulate synchronization correctly. Reserve low-level primitives for performance-critical paths where you've measured that the abstraction overhead matters.

## Related Topics

- [Processes and Threads](./processes-and-threads.md) — Threading models and thread pools that use concurrency primitives for coordination
- [I/O and Scheduling](./io-and-scheduling.md) — I/O multiplexing reduces the need for thread-per-connection and associated lock contention
- [Memory Management](./memory-management.md) — Memory ordering and cache coherency underpin correct concurrent memory access
