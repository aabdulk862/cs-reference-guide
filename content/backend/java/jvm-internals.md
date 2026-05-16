# JVM Internals and Performance

## Quick Reference

- The JVM executes bytecode through a combination of interpretation and Just-In-Time (JIT) compilation
- Memory is divided into Heap (objects), Stack (frames/primitives), Metaspace (class metadata), and native memory
- Garbage collectors: Serial, Parallel, G1 (default since Java 9), ZGC (low-latency), Shenandoah (concurrent)
- JIT compilation uses tiered compilation: C1 (fast compile, moderate optimization) → C2 (slow compile, aggressive optimization)
- Class loading follows delegation model: Bootstrap → Platform → Application class loaders
- JVM flags: `-Xms` (initial heap), `-Xmx` (max heap), `-XX:+UseG1GC`, `-XX:MaxGCPauseMillis`
- Java Flight Recorder (JFR) provides low-overhead production profiling with event-based data collection
- Escape analysis enables scalar replacement and lock elision for objects that do not escape method scope

## When to Use

Understanding JVM internals is essential when diagnosing production performance issues, tuning garbage collection for latency-sensitive applications, or optimizing memory usage in resource-constrained environments. These concepts become critical when your application experiences unexpected GC pauses affecting response time SLAs, when memory leaks cause gradual heap growth leading to OutOfMemoryError, or when startup time matters for serverless and containerized deployments. Senior engineers need JVM knowledge to make informed decisions about garbage collector selection, heap sizing, and thread pool configuration. This knowledge is also fundamental for understanding why certain code patterns perform better than others, how the JIT compiler optimizes hot paths, and how to interpret profiling data from tools like JFR, async-profiler, and VisualVM. In interview settings, JVM internals questions assess whether a candidate can reason about system behavior under load and troubleshoot production issues methodically rather than relying on trial-and-error tuning.

## Code Examples

### GC Tuning and JVM Configuration

```bash
# G1GC configuration for a typical microservice (4GB heap)
java -Xms4g -Xmx4g \
  -XX:+UseG1GC \
  -XX:MaxGCPauseMillis=200 \
  -XX:G1HeapRegionSize=16m \
  -XX:InitiatingHeapOccupancyPercent=45 \
  -XX:G1ReservePercent=15 \
  -XX:+ParallelRefProcEnabled \
  -Xlog:gc*:file=/var/log/app/gc.log:time,uptime,level,tags:filecount=10,filesize=50m \
  -jar application.jar

# ZGC for ultra-low-latency requirements (sub-millisecond pauses)
java -Xms8g -Xmx8g \
  -XX:+UseZGC \
  -XX:+ZGenerational \
  -XX:SoftMaxHeapSize=6g \
  -Xlog:gc*:file=/var/log/app/gc.log:time,uptime,level,tags \
  -jar trading-engine.jar

# Container-aware JVM settings
java -XX:+UseContainerSupport \
  -XX:MaxRAMPercentage=75.0 \
  -XX:InitialRAMPercentage=75.0 \
  -XX:+UseG1GC \
  -XX:+ExitOnOutOfMemoryError \
  -jar application.jar
```

### Java Flight Recorder Profiling

```java
// Programmatic JFR event recording
import jdk.jfr.*;

@Category("Application")
@Label("Order Processing")
@Description("Records order processing duration and outcome")
public class OrderProcessingEvent extends Event {
    @Label("Order ID")
    String orderId;

    @Label("Processing Duration (ms)")
    @Timespan(Timespan.MILLISECONDS)
    long duration;

    @Label("Success")
    boolean success;

    @Label("Item Count")
    int itemCount;
}

// Usage in application code
public OrderResult processOrder(Order order) {
    OrderProcessingEvent event = new OrderProcessingEvent();
    event.begin();
    try {
        OrderResult result = doProcessing(order);
        event.orderId = order.getId();
        event.success = true;
        event.itemCount = order.getItems().size();
        return result;
    } catch (Exception e) {
        event.success = false;
        throw e;
    } finally {
        event.duration = event.getDuration().toMillis();
        event.commit();
    }
}

// Starting JFR recording programmatically
Configuration config = Configuration.getConfiguration("profile");
Recording recording = new Recording(config);
recording.setDestination(Path.of("/tmp/app-recording.jfr"));
recording.setMaxSize(100 * 1024 * 1024); // 100MB max
recording.setMaxAge(Duration.ofMinutes(30));
recording.start();
```

### Memory Analysis and Leak Detection

```java
// Weak references for cache implementations that respect GC pressure
import java.lang.ref.*;

public class WeakCache<K, V> {
    private final Map<K, WeakReference<V>> cache = new ConcurrentHashMap<>();
    private final ReferenceQueue<V> refQueue = new ReferenceQueue<>();

    public void put(K key, V value) {
        cleanStaleEntries();
        cache.put(key, new KeyedWeakReference<>(key, value, refQueue));
    }

    public Optional<V> get(K key) {
        WeakReference<V> ref = cache.get(key);
        if (ref == null) return Optional.empty();
        V value = ref.get();
        if (value == null) {
            cache.remove(key);
            return Optional.empty();
        }
        return Optional.of(value);
    }

    private void cleanStaleEntries() {
        Reference<? extends V> ref;
        while ((ref = refQueue.poll()) != null) {
            if (ref instanceof KeyedWeakReference) {
                cache.remove(((KeyedWeakReference<K, V>) ref).key);
            }
        }
    }

    private static class KeyedWeakReference<K, V> extends WeakReference<V> {
        final K key;
        KeyedWeakReference(K key, V value, ReferenceQueue<V> queue) {
            super(value, queue);
            this.key = key;
        }
    }
}

// Detecting memory leaks with heap dump analysis triggers
public class MemoryMonitor {
    private static final long HEAP_THRESHOLD = (long) (Runtime.getRuntime().maxMemory() * 0.85);

    public void checkMemoryPressure() {
        long usedMemory = Runtime.getRuntime().totalMemory() - Runtime.getRuntime().freeMemory();
        if (usedMemory > HEAP_THRESHOLD) {
            // Trigger heap dump for analysis
            triggerHeapDump("/tmp/heapdump-" + System.currentTimeMillis() + ".hprof");
            log.warn("Memory pressure detected: {}MB used of {}MB max",
                usedMemory / (1024 * 1024),
                Runtime.getRuntime().maxMemory() / (1024 * 1024));
        }
    }

    private void triggerHeapDump(String path) {
        try {
            MBeanServer server = ManagementFactory.getPlatformMBeanServer();
            HotSpotDiagnosticMXBean bean = ManagementFactory.newPlatformMXBeanProxy(
                server, "com.sun.management:type=HotSpotDiagnostic",
                HotSpotDiagnosticMXBean.class);
            bean.dumpHeap(path, true);
        } catch (Exception e) {
            log.error("Failed to trigger heap dump", e);
        }
    }
}
```

### Class Loading and Module System

```java
// Custom class loader for plugin architecture
public class PluginClassLoader extends URLClassLoader {
    private final ClassLoader parentLoader;
    private final Set<String> parentDelegationPackages;

    public PluginClassLoader(URL[] urls, ClassLoader parent, Set<String> delegatePackages) {
        super(urls, null); // null parent breaks delegation for isolation
        this.parentLoader = parent;
        this.parentDelegationPackages = delegatePackages;
    }

    @Override
    protected Class<?> loadClass(String name, boolean resolve) throws ClassNotFoundException {
        synchronized (getClassLoadingLock(name)) {
            Class<?> loaded = findLoadedClass(name);
            if (loaded != null) return loaded;

            // Delegate java.* and shared API packages to parent
            if (name.startsWith("java.") || shouldDelegateToParent(name)) {
                return parentLoader.loadClass(name);
            }

            // Try loading from plugin JARs first (child-first)
            try {
                Class<?> clazz = findClass(name);
                if (resolve) resolveClass(clazz);
                return clazz;
            } catch (ClassNotFoundException e) {
                return parentLoader.loadClass(name);
            }
        }
    }

    private boolean shouldDelegateToParent(String className) {
        return parentDelegationPackages.stream()
            .anyMatch(className::startsWith);
    }
}
```

## Common Pitfalls

1. **Setting -Xms different from -Xmx in production**: When initial heap size differs from maximum, the JVM must resize the heap during operation, causing GC pauses and memory fragmentation. In production, always set `-Xms` equal to `-Xmx` to pre-allocate the full heap at startup, eliminating resize overhead and ensuring predictable memory behavior. This also prevents the operating system from reclaiming unused heap pages that the JVM will need later.

2. **Ignoring Metaspace in container memory limits**: Metaspace (class metadata) lives outside the Java heap and is not bounded by `-Xmx`. In containerized environments, Metaspace growth can push total process memory beyond container limits, triggering OOM kills. Set `-XX:MaxMetaspaceSize` explicitly and account for native memory, thread stacks, and direct buffers when calculating container memory limits. A safe formula is: container limit = Xmx + MaxMetaspaceSize + (thread count × Xss) + 256MB buffer for native allocations.

3. **Premature GC tuning without profiling data**: Adjusting GC parameters without first collecting GC logs and profiling data often makes performance worse. The default G1GC configuration works well for most workloads. Always collect baseline metrics with `-Xlog:gc*` before making changes, and tune one parameter at a time while measuring the impact on both throughput and latency percentiles.

4. **Thread stack overflow from deep recursion**: Each thread allocates a fixed stack size (default 512KB-1MB depending on platform). Deep recursion or large stack frames exhaust this space, throwing StackOverflowError. Convert recursive algorithms to iterative ones using explicit stacks for production code, or increase `-Xss` if recursion depth is bounded and predictable. Note that increasing stack size multiplied by thread count significantly increases total memory consumption.

5. **Direct ByteBuffer leaks**: Direct buffers allocated via `ByteBuffer.allocateDirect()` live in native memory outside the heap. They are only reclaimed when their associated Java object is garbage collected, but GC may not run frequently enough if heap pressure is low. This creates a paradox where native memory grows while heap usage remains comfortable. Use `-XX:MaxDirectMemorySize` to bound direct buffer allocation and explicitly clean buffers using `sun.misc.Unsafe` or the cleaner API when immediate deallocation is needed.

6. **Class loader leaks in application servers**: When redeploying applications in containers like Tomcat, the old class loader and all classes it loaded should be garbage collected. However, if any reference chain from a GC root reaches the old class loader (through ThreadLocal values, JDBC driver registrations, or shutdown hooks), the entire class hierarchy remains in memory. Each redeployment leaks an entire copy of the application's classes into Metaspace until the server runs out of memory.

## Real-World Use Cases

- **Low-latency trading systems**: Financial trading platforms use ZGC or Shenandoah to achieve sub-millisecond GC pauses on heaps of 32GB or more. The JIT compiler's escape analysis eliminates object allocations on hot paths, while careful avoidance of boxing and object creation in the critical trading loop keeps allocation rates near zero. These systems typically pre-warm the JIT by replaying market data during startup to ensure all hot methods are compiled before live trading begins, avoiding the latency spikes that occur during initial compilation.

- **Containerized microservices with CDS**: Cloud-native Java applications use Class Data Sharing (CDS) archives to reduce startup time from 5-10 seconds to under 2 seconds. The CDS archive pre-processes class loading and verification work, sharing it across multiple JVM instances on the same host. Combined with Application CDS (AppCDS) that includes application classes, and GraalVM native images for the most startup-sensitive services, organizations achieve the fast scaling required for Kubernetes horizontal pod autoscaling to respond to traffic spikes within seconds.

- **Big data processing with off-heap memory**: Apache Spark and Apache Flink use direct ByteBuffers and memory-mapped files to manage data outside the Java heap, avoiding GC pressure when processing terabytes of data. The JVM's native memory tracking (`-XX:NativeMemoryTracking=summary`) helps operators understand total memory consumption including off-heap allocations, thread stacks, and JIT code cache, ensuring container memory limits are set correctly to prevent OOM kills.

- **Plugin architectures with isolated class loaders**: IDEs like IntelliJ IDEA and application servers like Tomcat use custom class loader hierarchies to isolate plugins from each other and from the host application. Each plugin gets its own class loader that can load different versions of the same library without conflicts. Understanding class loader delegation, visibility rules, and the common pitfalls of class loader leaks is essential for building and maintaining these architectures.

- **GraalVM native image compilation**: Organizations building serverless functions and CLI tools use GraalVM's ahead-of-time compilation to produce native executables with instant startup (under 50ms) and minimal memory footprint (30-50MB vs 200-500MB for JVM). The trade-off is longer build times, restricted reflection usage (requiring explicit configuration), and reduced peak throughput compared to JIT-compiled code that benefits from runtime profiling and speculative optimizations.

## Interview Questions

**Q: Explain the difference between G1GC and ZGC. When would you choose each?**

A: G1GC divides the heap into regions and performs incremental collection with a target pause time (default 200ms). It balances throughput and latency for general workloads. ZGC performs almost all GC work concurrently with application threads, achieving sub-millisecond pauses regardless of heap size (tested up to 16TB). Choose G1GC for typical microservices where 50-200ms pauses are acceptable and maximum throughput matters. Choose ZGC when your SLA requires sub-10ms tail latency (P99.9), when heap sizes exceed 8GB where G1 pauses become noticeable, or for applications where consistent response times matter more than raw throughput. ZGC uses colored pointers and load barriers, trading approximately 5-15% throughput for dramatically better latency characteristics.

**Q: What is the Java Memory Model and why does it matter for concurrent programming?**

A: The Java Memory Model (JMM) defines how threads interact through memory and what behaviors are guaranteed in concurrent programs. Without the JMM, compiler reordering, CPU instruction reordering, and CPU cache hierarchies could make concurrent programs behave unpredictably. The JMM establishes happens-before relationships that guarantee visibility: if action A happens-before action B, then B sees all memory effects of A. Key happens-before edges include volatile write → volatile read, monitor unlock → monitor lock, thread start → first action in started thread, and final field write in constructor → reading that field after construction. Understanding the JMM is essential for writing correct lock-free algorithms and understanding why `volatile` and `synchronized` are necessary even on single-processor systems where cache coherence is not an issue.

**Q: How does JIT compilation work and what is tiered compilation?**

A: The JVM starts by interpreting bytecode, then identifies frequently executed methods (hot spots) for compilation to native machine code. Tiered compilation uses multiple compilation levels: Level 0 (interpreter), Level 1-3 (C1 compiler with increasing profiling), and Level 4 (C2 compiler with aggressive optimizations). C1 compiles quickly with basic optimizations for fast warmup. C2 uses profiling data collected during interpretation and C1 execution to apply speculative optimizations like inlining, escape analysis, loop unrolling, and dead code elimination. If a speculative optimization proves wrong (e.g., a devirtualized call encounters a new subclass), the JVM deoptimizes back to interpreted code and recompiles with updated assumptions. This adaptive approach achieves near-native performance for long-running applications while maintaining the flexibility of dynamic dispatch.

**Q: Explain escape analysis and its impact on performance.**

A: Escape analysis determines whether an object allocated inside a method can be accessed outside that method's scope. If an object does not escape (is not stored in a field, returned, or passed to another method that might store it), the JIT compiler can apply three optimizations: scalar replacement (decomposing the object into its fields stored in registers or on the stack, eliminating heap allocation entirely), lock elision (removing synchronization on objects that are thread-local), and stack allocation (allocating the object on the stack frame instead of the heap). These optimizations dramatically reduce GC pressure for short-lived objects. For example, an iterator created in a for-each loop that does not escape the loop body can be scalar-replaced, eliminating the allocation entirely. This is why microbenchmarks must use JMH with blackhole consumption to prevent escape analysis from eliminating the measured allocations.

**Q: How do you diagnose and fix a memory leak in a production Java application?**

A: First, confirm the leak by monitoring heap usage over time with metrics (Micrometer/Prometheus) looking for a sawtooth pattern where the baseline after each GC cycle gradually increases. Enable GC logging to observe Old Generation growth. Take a heap dump during high memory usage with `jmap -dump:live,format=b,file=heap.hprof <pid>` or trigger automatically with `-XX:+HeapDumpOnOutOfMemoryError`. Analyze the dump with Eclipse MAT or VisualVM, focusing on the Dominator Tree to find objects retaining the most memory, and the Leak Suspects report. Common causes include unbounded caches (use WeakHashMap or size-limited caches), unclosed resources (streams, connections), static collections that grow without eviction, and class loader leaks from ThreadLocal values surviving redeployment. Fix by adding proper resource cleanup (try-with-resources), bounding collection sizes, using weak references for caches, and ensuring ThreadLocal values are removed in finally blocks.

## Production Tips

- **Heap dump on OOM**: Always configure `-XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/var/log/app/` in production. When an OutOfMemoryError occurs, you get a snapshot of memory state at the exact moment of failure. Without this, diagnosing memory issues requires reproducing the problem, which may take days or weeks in production-like conditions. Combine with `-XX:+ExitOnOutOfMemoryError` to restart the process immediately after dumping, preventing the application from running in a degraded state with unpredictable behavior.

- **GC log analysis for capacity planning**: Collect GC logs continuously in production using `-Xlog:gc*:file=gc.log:time,uptime,level,tags:filecount=10,filesize=50m`. Analyze with GCViewer or GCEasy to understand allocation rates, promotion rates, and pause time distributions. Use this data for capacity planning: if allocation rate is 500MB/s and young generation is 2GB, you will have minor GCs every 4 seconds. If promotion rate is high, the old generation fills faster, triggering more expensive mixed or full GCs. Adjust young generation size and G1 region size based on observed allocation patterns rather than arbitrary percentages.

- **Native memory tracking for containers**: Enable `-XX:NativeMemoryTracking=summary` and periodically check with `jcmd <pid> VM.native_memory summary`. This reveals memory consumed by thread stacks, code cache (JIT compiled code), GC overhead, internal JVM structures, and direct buffers that are invisible to heap monitoring. In containers, total RSS (Resident Set Size) must stay within the container memory limit. A common formula: container_limit = heap_max + metaspace_max + (thread_count × stack_size) + code_cache + direct_buffers + 200MB_overhead. Monitor RSS with `ps` or container metrics to validate your calculations match reality.

- **Warm-up strategies for latency-sensitive services**: JIT compilation during the first minutes of application life causes latency spikes as methods transition from interpreted to compiled code. For latency-sensitive services, implement warm-up by replaying representative traffic during startup before the service is added to the load balancer. Alternatively, use CDS/AppCDS to reduce class loading time, or AOT compilation (jaotc or GraalVM) to pre-compile critical paths. Monitor the `jit_compilation_time` metric and delay health check readiness until compilation activity stabilizes.

## Related Topics

- [Core Language Fundamentals](./core-language.md) — Understanding language semantics that the JVM must implement and optimize
- [Concurrency and Multithreading](./concurrency.md) — Thread management relies on JVM thread scheduling and memory model guarantees
- [Spring Framework](../spring-framework/index.md) — Spring Boot applications require JVM tuning for production deployment
