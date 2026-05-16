# Collections Framework

## Quick Reference

- The Collections Framework provides unified architecture for storing and manipulating groups of objects
- Core interfaces: `Collection` (List, Set, Queue) and `Map` — all support generics for type safety
- `ArrayList` — O(1) random access, O(n) insert/delete in middle, backed by resizable array
- `LinkedList` — O(1) insert/delete at ends, O(n) random access, implements both List and Deque
- `HashMap` — O(1) average get/put, uses hash buckets with linked lists (trees after 8 collisions in Java 8+)
- `TreeMap` — O(log n) operations, maintains sorted key order via red-black tree
- `ConcurrentHashMap` — Thread-safe with lock striping (Java 7) / CAS operations (Java 8+), no global lock
- `Collections.unmodifiableList()` returns a view; `List.of()` (Java 9+) returns a truly immutable list

## When to Use

The Collections Framework is used in virtually every Java application for managing groups of objects. Choosing the right collection implementation is a critical performance decision that depends on access patterns, ordering requirements, thread safety needs, and memory constraints. Use ArrayList when you need fast random access and iterate frequently but rarely insert in the middle. Use LinkedList when you primarily add and remove from the ends (as a Deque). Use HashMap for fast key-value lookups without ordering requirements. Use TreeMap when you need sorted iteration or range queries on keys. Use LinkedHashMap when you need HashMap performance with insertion-order or access-order iteration. Understanding these trade-offs is essential for system design interviews and production performance optimization, where choosing the wrong collection can mean the difference between O(1) and O(n) operations on hot paths.

## Code Examples

### List Implementations and Operations

```java
// ArrayList: best for random access and iteration
List<Order> orders = new ArrayList<>(1000); // Pre-size to avoid resizing
orders.add(new Order("ORD-001", BigDecimal.valueOf(99.99)));
orders.add(new Order("ORD-002", BigDecimal.valueOf(149.99)));

// Binary search on sorted list (O(log n) vs O(n) linear search)
orders.sort(Comparator.comparing(Order::getAmount));
int index = Collections.binarySearch(orders, targetOrder,
    Comparator.comparing(Order::getAmount));

// Sublist view (changes reflect in original list)
List<Order> topOrders = orders.subList(0, Math.min(10, orders.size()));

// Immutable list creation (Java 9+)
List<String> statuses = List.of("PENDING", "PROCESSING", "SHIPPED", "DELIVERED");

// List.copyOf creates immutable copy (Java 10+)
List<Order> snapshot = List.copyOf(orders);
```

### Map Implementations and Patterns

```java
// HashMap with computeIfAbsent for lazy initialization
Map<String, List<Order>> ordersByCustomer = new HashMap<>();
for (Order order : allOrders) {
    ordersByCustomer.computeIfAbsent(order.getCustomerId(), k -> new ArrayList<>())
        .add(order);
}

// LinkedHashMap as LRU cache (access-order mode)
Map<String, CachedResponse> cache = new LinkedHashMap<>(16, 0.75f, true) {
    @Override
    protected boolean removeEldestEntry(Map.Entry<String, CachedResponse> eldest) {
        return size() > MAX_CACHE_SIZE;
    }
};

// TreeMap for range queries
TreeMap<LocalDate, List<Transaction>> transactionsByDate = new TreeMap<>();
// Get all transactions in a date range
SortedMap<LocalDate, List<Transaction>> q1Transactions =
    transactionsByDate.subMap(LocalDate.of(2024, 1, 1), LocalDate.of(2024, 4, 1));

// Map.of for small immutable maps (Java 9+)
Map<String, Integer> httpCodes = Map.of(
    "OK", 200,
    "NOT_FOUND", 404,
    "SERVER_ERROR", 500
);

// EnumMap for enum keys (faster than HashMap, uses array internally)
Map<OrderStatus, List<Order>> ordersByStatus = new EnumMap<>(OrderStatus.class);
for (OrderStatus status : OrderStatus.values()) {
    ordersByStatus.put(status, new ArrayList<>());
}
```

### Set Operations and Thread-Safe Collections

```java
// HashSet for O(1) membership testing
Set<String> processedIds = new HashSet<>(expectedSize);
for (Event event : events) {
    if (processedIds.add(event.getId())) {
        // First time seeing this event — process it
        processEvent(event);
    }
    // Duplicate — skip silently
}

// TreeSet for sorted unique elements with range operations
TreeSet<Integer> scores = new TreeSet<>(allScores);
int median = scores.stream().skip(scores.size() / 2).findFirst().orElse(0);
SortedSet<Integer> aboveMedian = scores.tailSet(median);

// ConcurrentHashMap for thread-safe operations without external synchronization
ConcurrentHashMap<String, AtomicLong> metrics = new ConcurrentHashMap<>();
// Multiple threads can safely increment counters
metrics.computeIfAbsent("requests", k -> new AtomicLong()).incrementAndGet();
metrics.computeIfAbsent("errors", k -> new AtomicLong()).incrementAndGet();

// CopyOnWriteArrayList for read-heavy, write-rare scenarios
List<EventListener> listeners = new CopyOnWriteArrayList<>();
// Iteration never throws ConcurrentModificationException
for (EventListener listener : listeners) {
    listener.onEvent(event); // Safe even if another thread adds/removes listeners
}

// Collections.unmodifiableMap wraps existing map (view, not copy)
Map<String, Config> configView = Collections.unmodifiableMap(mutableConfig);
```

## Common Pitfalls

- **ConcurrentModificationException during iteration**: Modifying a collection while iterating over it with a for-each loop throws ConcurrentModificationException. Use `Iterator.remove()` for safe removal during iteration, or collect items to remove in a separate list and call `removeAll()` after iteration. For concurrent access, use ConcurrentHashMap or CopyOnWriteArrayList instead of synchronizing on the collection.

- **HashMap with mutable keys**: If an object used as a HashMap key is mutated after insertion (changing fields used in hashCode), the entry becomes unretrievable because it now hashes to a different bucket. Always use immutable objects as map keys. If you must use mutable objects, ensure the fields used in equals/hashCode are never modified after the object is used as a key.

- **ArrayList vs LinkedList misconception**: Developers often choose LinkedList for frequent insertions, but ArrayList is faster for most real-world workloads due to CPU cache locality. LinkedList only wins when you hold a reference to a node and insert/remove at that position. For queue operations, ArrayDeque outperforms LinkedList in both memory usage and throughput.

- **Autoboxing overhead in collections**: Collections cannot hold primitives, so `List<Integer>` autoboxes every int, creating object overhead (16 bytes per Integer vs 4 bytes per int). For performance-critical code with large primitive collections, use specialized libraries like Eclipse Collections (`IntArrayList`) or arrays directly. Java's Project Valhalla aims to address this with value types.

- **Not specifying initial capacity**: ArrayList and HashMap resize by copying to larger backing arrays when capacity is exceeded. If you know the approximate size, specify initial capacity to avoid repeated resizing. For HashMap, account for load factor: to hold 1000 entries without resizing, initialize with capacity `(int)(1000 / 0.75) + 1 = 1334`.

## Real-World Use Cases

- **In-memory caching with LinkedHashMap**: Application-level caches use LinkedHashMap in access-order mode with a size limit enforced by `removeEldestEntry()`. This provides O(1) LRU eviction without external libraries. Production systems at companies like Twitter use this pattern for session caches and frequently-accessed configuration data, with the cache warmed on startup from a persistent store.

- **Event deduplication with HashSet**: Distributed systems receiving events from multiple sources use HashSet (or ConcurrentHashMap as a set) to track processed event IDs within a time window. This ensures idempotent processing even when the same event arrives multiple times due to at-least-once delivery guarantees in messaging systems like Kafka.

- **Priority-based task scheduling with PriorityQueue**: Job schedulers use PriorityQueue to order tasks by priority and deadline. The heap-based implementation provides O(log n) insertion and O(1) peek at the highest-priority element. Combined with a Comparator that considers both priority level and submission time, this ensures fair scheduling with priority preemption.

- **Inverted index construction with HashMap**: Search engines build inverted indexes mapping terms to document lists using `HashMap<String, List<DocumentId>>`. The `computeIfAbsent` pattern efficiently handles first-occurrence initialization. TreeMap variants maintain sorted term order for range prefix queries, enabling autocomplete functionality.

- **Graph adjacency representation**: Graph algorithms represent adjacency lists as `Map<Node, Set<Node>>` for O(1) neighbor lookup and edge existence checking. For weighted graphs, `Map<Node, Map<Node, Weight>>` provides efficient edge weight retrieval. ConcurrentHashMap enables parallel graph traversal algorithms like parallel BFS.

## Interview Questions

**Q: What is the difference between HashMap and TreeMap? When would you choose each?**

A: HashMap provides O(1) average-case get/put operations using hash buckets but does not maintain any ordering of keys. TreeMap provides O(log n) operations using a red-black tree and maintains keys in sorted order. Choose HashMap when you need fast lookups without ordering requirements (the common case). Choose TreeMap when you need sorted iteration, range queries (subMap, headMap, tailMap), or operations like finding the nearest key (floorKey, ceilingKey). TreeMap also guarantees worst-case O(log n) performance, while HashMap can degrade to O(n) with pathological hash collisions (though Java 8+ mitigates this by converting long chains to trees).

**Q: How does HashMap handle collisions internally in Java 8+?**

A: In Java 8+, HashMap uses an array of buckets where each bucket starts as a linked list of entries with the same hash. When a bucket accumulates more than 8 entries (TREEIFY_THRESHOLD), it converts the linked list to a balanced red-black tree, improving worst-case lookup from O(n) to O(log n). When the tree shrinks below 6 entries (UNTREEIFY_THRESHOLD), it converts back to a linked list. This treeification requires keys to implement Comparable or uses identity hash code as a tiebreaker. The load factor (default 0.75) triggers resizing when the number of entries exceeds capacity × load factor.

**Q: What is the difference between `Collections.synchronizedMap()` and `ConcurrentHashMap`?**

A: `Collections.synchronizedMap()` wraps a HashMap with a single mutex lock on every operation, meaning only one thread can access the map at a time (even for reads). `ConcurrentHashMap` uses fine-grained locking (lock striping in Java 7, CAS operations with synchronized blocks on individual bins in Java 8+), allowing concurrent reads without locking and concurrent writes to different segments. ConcurrentHashMap provides much higher throughput under contention. However, compound operations (check-then-act) on synchronizedMap are atomic if you synchronize on the map, while ConcurrentHashMap requires using atomic methods like `computeIfAbsent`, `putIfAbsent`, or `merge` for compound atomicity.

**Q: Explain the fail-fast behavior of Java iterators.**

A: Java collection iterators are fail-fast: they throw ConcurrentModificationException if the collection is structurally modified (elements added or removed) after the iterator is created, except through the iterator's own remove method. This is implemented via a modification counter (modCount) that the iterator checks on each operation. Fail-fast behavior is a best-effort detection mechanism, not a guarantee. Concurrent collections (ConcurrentHashMap, CopyOnWriteArrayList) use weakly consistent iterators that never throw ConcurrentModificationException but may or may not reflect concurrent modifications.

## Production Tips

- **Size your collections appropriately**: For HashMap, calculate initial capacity as `expectedEntries / loadFactor + 1` to avoid resizing. For ArrayList, use the constructor that accepts initial capacity when you know the approximate size. In hot paths processing millions of elements, avoiding a single resize operation can save significant GC pressure from the discarded backing array.

- **Prefer specialized collections for primitives**: When working with large collections of primitive values (counters, IDs, scores), the autoboxing overhead of standard collections is substantial. Eclipse Collections provides `IntArrayList`, `LongHashSet`, and `IntIntHashMap` that avoid boxing entirely. For smaller datasets, simple arrays with utility methods are often the best choice.

- **Use EnumMap and EnumSet for enum keys**: EnumMap uses a simple array indexed by enum ordinal, providing O(1) operations with minimal memory overhead and excellent cache locality. EnumSet uses a bit vector internally, making set operations (union, intersection) extremely fast. Always prefer these over HashMap/HashSet when keys are enum values.

## Related Topics

- [Core Language Fundamentals](./core-language.md) — Type system and generics that underpin the Collections Framework
- [Concurrency and Multithreading](./concurrency.md) — Thread-safe collection variants and concurrent data structures
