# Concurrency and Multithreading

## Quick Reference

- Thread creation: `Thread` class, `Runnable` interface, `Callable<V>` (returns value), `ExecutorService`
- Synchronization primitives: `synchronized` keyword, `ReentrantLock`, `ReadWriteLock`, `StampedLock`
- `volatile` guarantees visibility across threads but not atomicity of compound operations
- `java.util.concurrent` provides ExecutorService, CountDownLatch, CyclicBarrier, Semaphore, Phaser
- Atomic classes: `AtomicInteger`, `AtomicLong`, `AtomicReference` — lock-free thread-safe operations via CAS
- `CompletableFuture` enables async composition with `thenApply`, `thenCompose`, `exceptionally`, `allOf`
- Virtual threads (Java 21+): lightweight threads managed by the JVM, ideal for I/O-bound workloads
- Happens-before relationship defines memory visibility guarantees between threads

## When to Use

Concurrency is essential when building high-throughput server applications, parallel data processing systems, or responsive user interfaces. Use thread pools (ExecutorService) when handling concurrent requests in web servers, processing batch jobs in parallel, or performing background tasks without blocking the main thread. Use synchronization when multiple threads access shared mutable state that must remain consistent. Use CompletableFuture when orchestrating multiple asynchronous operations with dependencies (call service A, then use its result to call service B, combine with service C). Use virtual threads (Java 21+) when you have thousands of concurrent I/O-bound tasks where platform threads would be wasteful. Understanding concurrency is critical for system design interviews involving scalability, for debugging production race conditions, and for designing thread-safe libraries and frameworks.

## Code Examples

### ExecutorService and Thread Pools

```java
// Fixed thread pool for CPU-bound work
ExecutorService cpuPool = Executors.newFixedThreadPool(
    Runtime.getRuntime().availableProcessors()
);

// Cached thread pool for short-lived I/O tasks
ExecutorService ioPool = Executors.newCachedThreadPool();

// Custom thread pool with bounded queue and rejection policy
ThreadPoolExecutor customPool = new ThreadPoolExecutor(
    4,                          // Core pool size
    16,                         // Maximum pool size
    60L, TimeUnit.SECONDS,      // Keep-alive time for idle threads
    new LinkedBlockingQueue<>(1000),  // Bounded work queue
    new ThreadPoolExecutor.CallerRunsPolicy()  // Backpressure: caller executes task
);

// Submit tasks and collect results
List<Future<ProcessingResult>> futures = orders.stream()
    .map(order -> cpuPool.submit(() -> processOrder(order)))
    .toList();

// Gather results with timeout
List<ProcessingResult> results = new ArrayList<>();
for (Future<ProcessingResult> future : futures) {
    try {
        results.add(future.get(5, TimeUnit.SECONDS));
    } catch (TimeoutException e) {
        future.cancel(true);
        log.warn("Order processing timed out");
    } catch (ExecutionException e) {
        log.error("Order processing failed", e.getCause());
    }
}

// Graceful shutdown
cpuPool.shutdown();
if (!cpuPool.awaitTermination(30, TimeUnit.SECONDS)) {
    cpuPool.shutdownNow();
}
```

### CompletableFuture Composition

```java
// Async pipeline with error handling
public CompletableFuture<OrderResult> processOrderAsync(Order order) {
    return CompletableFuture
        .supplyAsync(() -> validateOrder(order), validationPool)
        .thenComposeAsync(validated -> processPayment(validated), paymentPool)
        .thenComposeAsync(paid -> reserveInventory(paid), inventoryPool)
        .thenApplyAsync(reserved -> createShipment(reserved), shippingPool)
        .exceptionally(ex -> {
            log.error("Order processing failed for {}", order.getId(), ex);
            compensate(order);  // Saga compensation
            return OrderResult.failed(order.getId(), ex.getMessage());
        });
}

// Combining multiple independent async operations
public CompletableFuture<DashboardData> loadDashboard(UUID userId) {
    CompletableFuture<UserProfile> profileFuture =
        CompletableFuture.supplyAsync(() -> userService.getProfile(userId));
    CompletableFuture<List<Order>> ordersFuture =
        CompletableFuture.supplyAsync(() -> orderService.getRecent(userId));
    CompletableFuture<AccountBalance> balanceFuture =
        CompletableFuture.supplyAsync(() -> accountService.getBalance(userId));

    return CompletableFuture.allOf(profileFuture, ordersFuture, balanceFuture)
        .thenApply(v -> new DashboardData(
            profileFuture.join(),
            ordersFuture.join(),
            balanceFuture.join()
        ));
}

// Timeout and fallback
public CompletableFuture<Price> getPriceWithFallback(String productId) {
    return CompletableFuture
        .supplyAsync(() -> pricingService.getPrice(productId))
        .orTimeout(2, TimeUnit.SECONDS)
        .exceptionally(ex -> {
            log.warn("Pricing service timeout, using cached price");
            return priceCache.getCachedPrice(productId);
        });
}
```

### Synchronization and Lock Patterns

```java
// ReentrantLock with try-finally for guaranteed release
public class BankAccount {
    private final ReentrantLock lock = new ReentrantLock();
    private BigDecimal balance;

    public void transfer(BankAccount target, BigDecimal amount) {
        // Acquire locks in consistent order to prevent deadlock
        BankAccount first = System.identityHashCode(this) < System.identityHashCode(target)
            ? this : target;
        BankAccount second = (first == this) ? target : this;

        first.lock.lock();
        try {
            second.lock.lock();
            try {
                if (this.balance.compareTo(amount) < 0) {
                    throw new InsufficientFundsException(amount, this.balance);
                }
                this.balance = this.balance.subtract(amount);
                target.balance = target.balance.add(amount);
            } finally {
                second.lock.unlock();
            }
        } finally {
            first.lock.unlock();
        }
    }
}

// ReadWriteLock for read-heavy workloads
public class ConfigurationStore {
    private final ReadWriteLock rwLock = new ReentrantReadWriteLock();
    private final Map<String, String> config = new HashMap<>();

    public String get(String key) {
        rwLock.readLock().lock();
        try {
            return config.get(key);
        } finally {
            rwLock.readLock().unlock();
        }
    }

    public void update(Map<String, String> newConfig) {
        rwLock.writeLock().lock();
        try {
            config.clear();
            config.putAll(newConfig);
        } finally {
            rwLock.writeLock().unlock();
        }
    }
}

// ConcurrentHashMap atomic operations (no external locking needed)
ConcurrentHashMap<String, AtomicLong> counters = new ConcurrentHashMap<>();
counters.computeIfAbsent("requests", k -> new AtomicLong()).incrementAndGet();
counters.compute("active", (k, v) -> v == null ? new AtomicLong(1) : v);
```

### Virtual Threads (Java 21+)

```java
// Virtual threads for I/O-bound workloads
try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
    List<Future<Response>> futures = urls.stream()
        .map(url -> executor.submit(() -> httpClient.send(url)))
        .toList();

    List<Response> responses = futures.stream()
        .map(f -> {
            try { return f.get(); }
            catch (Exception e) { return Response.error(e); }
        })
        .toList();
}

// Structured concurrency (Preview in Java 21+)
try (var scope = new StructuredTaskScope.ShutdownOnFailure()) {
    Subtask<UserProfile> profileTask = scope.fork(() -> fetchProfile(userId));
    Subtask<List<Order>> ordersTask = scope.fork(() -> fetchOrders(userId));
    Subtask<Preferences> prefsTask = scope.fork(() -> fetchPreferences(userId));

    scope.join();           // Wait for all tasks
    scope.throwIfFailed();  // Propagate first failure

    return new UserDashboard(
        profileTask.get(),
        ordersTask.get(),
        prefsTask.get()
    );
}

// Virtual thread per request in HTTP server
var server = HttpServer.create(new InetSocketAddress(8080), 0);
server.setExecutor(Executors.newVirtualThreadPerTaskExecutor());
server.createContext("/api", exchange -> {
    // Each request runs on its own virtual thread
    // Blocking I/O is fine — virtual thread yields automatically
    String result = databaseQuery(exchange.getRequestURI());
    exchange.sendResponseHeaders(200, result.length());
    exchange.getResponseBody().write(result.getBytes());
});
```

## Common Pitfalls

- **Race conditions with check-then-act**: Code like `if (!map.containsKey(key)) map.put(key, value)` is not atomic even with ConcurrentHashMap. Between the check and the put, another thread can insert the same key. Use atomic operations like `putIfAbsent()`, `computeIfAbsent()`, or `merge()` that perform the check and modification as a single atomic operation.

- **Deadlocks from inconsistent lock ordering**: When two threads acquire multiple locks in different orders, they can deadlock waiting for each other. Always acquire locks in a globally consistent order (e.g., by object hash code or a natural ordering). Use `tryLock()` with timeout to detect and recover from potential deadlocks rather than blocking indefinitely.

- **Thread pool exhaustion**: Using unbounded thread pools (newCachedThreadPool) under load creates thousands of threads, causing excessive context switching and OOM. Using bounded pools with unbounded queues hides backpressure. Use bounded pools with bounded queues and an appropriate rejection policy (CallerRunsPolicy provides natural backpressure by making the submitting thread do the work).

- **Visibility without volatile or synchronization**: Without `volatile`, `synchronized`, or atomic classes, changes made by one thread may never be visible to another thread due to CPU caching and compiler optimizations. The JVM is allowed to reorder instructions and cache values in registers. Every shared mutable variable must be protected by a happens-before relationship.

- **Virtual thread pinning**: Virtual threads pin to their carrier thread when executing inside `synchronized` blocks or native methods, preventing other virtual threads from using that carrier. Use `ReentrantLock` instead of `synchronized` in code that will run on virtual threads. Monitor pinning events with `-Djdk.tracePinnedThreads=full` during testing.

## Real-World Use Cases

- **HTTP request handling in web servers**: Application servers like Tomcat and Netty use thread pools to handle concurrent HTTP requests. Each request is processed on a thread from the pool, with the pool size tuned based on expected concurrency and whether the workload is CPU-bound or I/O-bound. Virtual threads (Java 21+) enable the thread-per-request model at massive scale without the memory overhead of platform threads.

- **Parallel data processing pipelines**: Batch processing systems use ForkJoinPool to parallelize CPU-intensive transformations across large datasets. The work-stealing algorithm ensures efficient utilization when tasks have variable processing times. CompletableFuture orchestrates multi-stage pipelines where each stage may involve different thread pools optimized for their workload characteristics.

- **Rate limiting and throttling**: Semaphore controls concurrent access to limited resources (database connections, external API calls). A Semaphore with 10 permits ensures no more than 10 concurrent requests hit a downstream service, preventing overload while allowing maximum throughput within the limit. Combined with a timeout, this provides graceful degradation under load.

- **Distributed lock coordination**: Systems use CountDownLatch for one-time synchronization barriers (wait for all services to initialize before accepting traffic) and CyclicBarrier for repeated synchronization points (process data in phases where all workers must complete phase N before any starts phase N+1). These patterns are fundamental to MapReduce-style parallel algorithms.

- **Event-driven architectures**: Producer-consumer patterns using BlockingQueue decouple event generation from processing. Multiple producer threads enqueue events while a pool of consumer threads processes them at their own pace. LinkedBlockingQueue provides unbounded buffering while ArrayBlockingQueue provides bounded buffering with natural backpressure when the queue is full.

## Interview Questions

**Q: Explain the Java Memory Model and the happens-before relationship.**

A: The Java Memory Model (JMM) defines how threads interact through memory and what behaviors are allowed by the JVM and hardware. The happens-before relationship guarantees that memory writes by one thread are visible to reads by another thread. Key happens-before edges include: program order within a single thread, monitor unlock happens-before subsequent lock of the same monitor, volatile write happens-before subsequent volatile read of the same variable, thread start happens-before any action in the started thread, and thread termination happens-before join() returning. Without a happens-before relationship, the JVM may reorder operations and cache values, making changes invisible across threads.

**Q: What is the difference between `synchronized` and `ReentrantLock`?**

A: `synchronized` is a language keyword that automatically acquires and releases a monitor lock, is reentrant, and cannot be interrupted while waiting. `ReentrantLock` is an explicit lock class that provides additional features: `tryLock()` with timeout for non-blocking acquisition, `lockInterruptibly()` for interruptible waiting, `newCondition()` for multiple wait sets, and fair ordering option. ReentrantLock requires explicit unlock in a finally block (error-prone if forgotten). Use `synchronized` for simple cases; use ReentrantLock when you need timeout, interruptibility, fairness, or multiple conditions. For virtual threads, prefer ReentrantLock to avoid pinning.

**Q: How do virtual threads differ from platform threads?**

A: Platform threads are thin wrappers around OS threads, limited to thousands due to memory overhead (typically 1MB stack each) and OS scheduling costs. Virtual threads are lightweight threads managed by the JVM runtime, with stacks that grow and shrink dynamically (starting at a few hundred bytes). Millions of virtual threads can exist simultaneously. When a virtual thread blocks on I/O, it unmounts from its carrier platform thread, allowing other virtual threads to run. Virtual threads are ideal for I/O-bound workloads (HTTP clients, database queries) but provide no benefit for CPU-bound work since they still need platform threads for actual execution.

**Q: What is a CompletableFuture and how does it differ from Future?**

A: `Future` represents a pending result that can only be retrieved by blocking with `get()`. `CompletableFuture` extends Future with a rich composition API: `thenApply` (transform result), `thenCompose` (chain async operations), `thenCombine` (combine two futures), `exceptionally` (handle errors), and `allOf`/`anyOf` (coordinate multiple futures). CompletableFuture supports non-blocking callbacks, can be completed manually (`complete(value)`), and enables building complex async pipelines without blocking threads. It is Java's equivalent of JavaScript Promises or Scala Futures.

## Production Tips

- **Thread pool sizing formula**: For CPU-bound tasks, use `Runtime.getRuntime().availableProcessors()` threads. For I/O-bound tasks, use `processors * (1 + waitTime/computeTime)`. For mixed workloads, separate CPU-bound and I/O-bound work into different pools. Always use bounded thread pools with bounded queues in production to prevent resource exhaustion under load spikes.

- **Monitor thread pool health**: Expose thread pool metrics via Micrometer: active threads, queue size, completed task count, and rejected task count. Alert when queue size exceeds 80% capacity or when rejection rate increases. Use custom ThreadFactory to name threads for easier debugging in thread dumps and monitoring dashboards.

- **Use virtual threads for I/O-heavy services**: In Java 21+, replace thread-per-request pools with virtual thread executors for services that primarily wait on I/O (database queries, HTTP calls, file operations). This eliminates thread pool sizing as a concern and allows natural scaling to thousands of concurrent requests without tuning. Ensure your code avoids `synchronized` blocks on hot paths to prevent carrier thread pinning.

## Related Topics

- [JVM Internals and Performance](./jvm-internals.md) — Memory model, thread scheduling, and garbage collection impact on concurrent code
- [Streams and Lambdas](./streams-and-lambdas.md) — Parallel streams and CompletableFuture use functional composition patterns
