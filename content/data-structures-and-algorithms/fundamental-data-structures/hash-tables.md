# Hash Tables

A **hash table** is a data structure that implements an associative array, mapping keys to values through a deterministic hash function. The hash function computes an index into an array of buckets or slots, from which the desired value can be found. Hash tables provide average-case O(1) time complexity for insertions, deletions, and lookups, making them one of the most practically important data structures in computer science. They underpin implementations of sets, caches, symbol tables, database indexes, and countless other systems where fast key-based access is critical.

The fundamental insight behind hash tables is that by converting a key into a numeric index through a hash function, you can achieve near-constant-time access to stored values without needing to search through the entire collection. This contrasts sharply with linear data structures like arrays or linked lists, where searching for a specific element requires O(n) time in the worst case. The trade-off is that hash tables sacrifice ordering guarantees and require careful management of collisions — situations where two distinct keys map to the same index.

---

## Quick Reference

- **Average-case complexity**: O(1) for insert, lookup, and delete operations
- **Worst-case complexity**: O(n) when all keys collide into a single bucket (degenerate case)
- **Space complexity**: O(n) where n is the number of stored key-value pairs
- **Load factor**: ratio of stored entries to total bucket count; typical threshold is 0.75 before resizing
- **Hash function requirements**: deterministic, uniform distribution, fast computation
- **Collision resolution**: separate chaining (linked lists per bucket) or open addressing (probing)
- **Java 8+ optimization**: HashMap converts chains of 8+ entries to red-black trees for O(log n) worst-case per bucket
- **Resizing cost**: O(n) rehash when load factor threshold is exceeded; amortized O(1) per insertion
- **Not ordered**: standard hash tables provide no guarantees about iteration order
- **Key immutability**: keys must not be mutated after insertion, or the entry becomes unreachable

---

## When to Use

Hash tables are the right choice whenever you need fast key-based access and do not require ordering. They are the most frequently used data structure in application-level code for lookups, deduplication, and caching.

**Choose a hash table when:**
- You need O(1) average-case lookup by key
- You are building a cache, index, or symbol table
- You need to count frequencies or detect duplicates
- You are implementing a set (membership testing)
- Key ordering is not required

**Choose a tree-based map (e.g., TreeMap, red-black tree) instead when:**
- You need keys in sorted order
- You need range queries (all keys between A and B)
- You need floor/ceiling operations (nearest key lookup)
- Worst-case O(log n) guarantees are required regardless of hash quality

**Choose a direct-address table (array) instead when:**
- Keys are small integers in a known range
- You can afford O(max_key) space for O(1) guaranteed access

**Avoid hash tables when:**
- You need ordered iteration over keys
- Your hash function produces many collisions (poor distribution)
- Memory is extremely constrained and the load factor overhead is unacceptable

---

## Code Examples

### Basic Hash Table Implementation (Separate Chaining)

This implementation demonstrates the core mechanics of a hash table: hashing keys to bucket indices, handling collisions with linked lists, and resizing when the load factor is exceeded.

```java
public class HashTable<K, V> {
    private static final int INITIAL_CAPACITY = 16;
    private static final double LOAD_FACTOR = 0.75;

    private LinkedList<Entry<K, V>>[] buckets;
    private int size;

    @SuppressWarnings("unchecked")
    public HashTable() {
        buckets = new LinkedList[INITIAL_CAPACITY];
        for (int i = 0; i < INITIAL_CAPACITY; i++) {
            buckets[i] = new LinkedList<>();
        }
        size = 0;
    }

    public void put(K key, V value) {
        if ((double) size / buckets.length >= LOAD_FACTOR) {
            resize();
        }
        int index = getBucketIndex(key);
        for (Entry<K, V> entry : buckets[index]) {
            if (entry.key.equals(key)) {
                entry.value = value;
                return;
            }
        }
        buckets[index].add(new Entry<>(key, value));
        size++;
    }

    public V get(K key) {
        int index = getBucketIndex(key);
        for (Entry<K, V> entry : buckets[index]) {
            if (entry.key.equals(key)) {
                return entry.value;
            }
        }
        return null;
    }

    private int getBucketIndex(K key) {
        return Math.abs(key.hashCode() % buckets.length);
    }

    @SuppressWarnings("unchecked")
    private void resize() {
        LinkedList<Entry<K, V>>[] oldBuckets = buckets;
        buckets = new LinkedList[oldBuckets.length * 2];
        for (int i = 0; i < buckets.length; i++) {
            buckets[i] = new LinkedList<>();
        }
        size = 0;
        for (LinkedList<Entry<K, V>> bucket : oldBuckets) {
            for (Entry<K, V> entry : bucket) {
                put(entry.key, entry.value);
            }
        }
    }

    private static class Entry<K, V> {
        K key;
        V value;
        Entry(K key, V value) {
            this.key = key;
            this.value = value;
        }
    }
}
```

### Open Addressing with Linear Probing (Python)

Open addressing stores all entries directly in the bucket array. When a collision occurs, the algorithm probes subsequent slots until an empty one is found. This approach has better cache locality than chaining but is more sensitive to clustering.

```python
class LinearProbingHashTable:
    def __init__(self, capacity=16):
        self.capacity = capacity
        self.size = 0
        self.keys = [None] * capacity
        self.values = [None] * capacity
        self.DELETED = object()  # Tombstone marker

    def _hash(self, key):
        return hash(key) % self.capacity

    def put(self, key, value):
        if self.size >= self.capacity * 0.7:
            self._resize()
        index = self._hash(key)
        while self.keys[index] is not None and self.keys[index] is not self.DELETED:
            if self.keys[index] == key:
                self.values[index] = value
                return
            index = (index + 1) % self.capacity
        self.keys[index] = key
        self.values[index] = value
        self.size += 1

    def get(self, key):
        index = self._hash(key)
        while self.keys[index] is not None:
            if self.keys[index] == key:
                return self.values[index]
            index = (index + 1) % self.capacity
        return None

    def delete(self, key):
        index = self._hash(key)
        while self.keys[index] is not None:
            if self.keys[index] == key:
                self.keys[index] = self.DELETED
                self.values[index] = None
                self.size -= 1
                return True
            index = (index + 1) % self.capacity
        return False

    def _resize(self):
        old_keys, old_values = self.keys, self.values
        self.capacity *= 2
        self.keys = [None] * self.capacity
        self.values = [None] * self.capacity
        self.size = 0
        for i in range(len(old_keys)):
            if old_keys[i] is not None and old_keys[i] is not self.DELETED:
                self.put(old_keys[i], old_values[i])
```

### Two-Sum Problem Using Hash Table

The classic interview problem demonstrating how hash tables convert an O(n²) brute-force search into O(n) by storing complements.

```java
public int[] twoSum(int[] nums, int target) {
    Map<Integer, Integer> seen = new HashMap<>();
    for (int i = 0; i < nums.length; i++) {
        int complement = target - nums[i];
        if (seen.containsKey(complement)) {
            return new int[]{seen.get(complement), i};
        }
        seen.put(nums[i], i);
    }
    return new int[]{-1, -1};
}
```

### Consistent Hashing (Distributed Systems)

Consistent hashing distributes keys across nodes in a ring, minimizing redistribution when nodes are added or removed. This is foundational to distributed caches like Memcached and databases like DynamoDB.

```python
import hashlib
import bisect

class ConsistentHashRing:
    def __init__(self, nodes=None, virtual_nodes=150):
        self.virtual_nodes = virtual_nodes
        self.ring = {}
        self.sorted_keys = []
        if nodes:
            for node in nodes:
                self.add_node(node)

    def _hash(self, key):
        return int(hashlib.md5(key.encode()).hexdigest(), 16)

    def add_node(self, node):
        for i in range(self.virtual_nodes):
            virtual_key = f"{node}:{i}"
            hash_val = self._hash(virtual_key)
            self.ring[hash_val] = node
            bisect.insort(self.sorted_keys, hash_val)

    def get_node(self, key):
        if not self.ring:
            return None
        hash_val = self._hash(key)
        idx = bisect.bisect_right(self.sorted_keys, hash_val)
        if idx == len(self.sorted_keys):
            idx = 0
        return self.ring[self.sorted_keys[idx]]
```

---

## Common Pitfalls

1. **Mutable keys causing lost entries**: If you use a mutable object as a hash table key and modify it after insertion, the hash code changes and the entry becomes unreachable through normal lookup. The entry still occupies memory but cannot be found or removed. Always use immutable objects (strings, numbers, frozen sets, or custom immutable classes) as keys. In Java, override `hashCode()` and `equals()` on immutable fields only.

2. **Forgetting to override both hashCode() and equals()**: In Java, if you override `equals()` without `hashCode()`, objects that are logically equal may hash to different buckets. This causes duplicate keys, lookup failures, and subtle bugs that are extremely difficult to diagnose. The contract requires that equal objects must have equal hash codes. Always override both methods together, and use `Objects.hash()` for consistent implementation.

3. **Poor hash function causing clustering**: A hash function that produces non-uniform distribution leads to many collisions, degrading performance from O(1) to O(n). Common mistakes include using only part of the key (e.g., hashing only the first character of a string) or using modulo with a non-prime table size. Use well-tested hash functions like MurmurHash3, xxHash, or the built-in implementations in your language's standard library.

4. **Unbounded growth without eviction**: Hash tables used as caches that grow without bounds are one of the most common sources of memory leaks in production services. Every cache needs a size limit and an eviction policy (LRU, LFU, TTL-based). Use bounded implementations like Caffeine, Guava Cache, or LinkedHashMap with `removeEldestEntry`.

5. **Assuming iteration order**: Standard hash tables (HashMap in Java, dict in Python 3.6 and earlier semantics, unordered_map in C++) do not guarantee iteration order. Code that depends on insertion order will break unpredictably. If you need ordered iteration, use LinkedHashMap (Java), OrderedDict (Python), or a tree-based map.

6. **Thread-safety assumptions**: HashMap and most hash table implementations are not thread-safe. Concurrent reads and writes without synchronization cause infinite loops (during resize), lost updates, and corrupted state. Use ConcurrentHashMap (Java), concurrent.futures (Python), or explicit locking for multi-threaded access.

7. **Resizing latency spikes**: When a hash table exceeds its load factor, it must allocate a new array and rehash all entries. For a table with millions of entries, this pause can be hundreds of milliseconds. In latency-sensitive systems, pre-size your tables or use incremental resizing strategies (e.g., linear hashing, extendible hashing).

---

## Real-World Use Cases

**Database indexing**: Most relational databases use hash indexes for equality lookups on primary keys. PostgreSQL's hash index type provides O(1) point queries, while B-tree indexes handle range queries. Hash indexes are ideal for columns queried exclusively with equality predicates.

**Distributed caching (Memcached, Redis)**: Distributed caches use consistent hashing to partition keys across nodes. Each cache node is essentially a large hash table in memory. Memcached stores key-value pairs in a slab allocator with hash-based lookup, serving millions of requests per second with sub-millisecond latency.

**DNS resolution**: DNS resolvers maintain hash tables mapping domain names to IP addresses. The resolver cache uses TTL-based expiration to evict stale entries. At scale, DNS caches handle hundreds of thousands of lookups per second using hash tables optimized for string keys.

**Compiler symbol tables**: Compilers use hash tables to store variable names, function signatures, and type information during parsing and semantic analysis. The symbol table must support fast insertion during declaration and fast lookup during reference resolution, making hash tables the natural choice.

**Load balancer session affinity**: Application load balancers use hash tables to map session IDs to backend servers, ensuring that requests from the same client are routed to the same server. This enables stateful applications to work behind a load balancer without shared session storage.

**Deduplication in data pipelines**: Stream processing systems like Apache Kafka Streams and Apache Flink use hash-based state stores to detect and eliminate duplicate events. A hash set of recently seen event IDs provides O(1) duplicate detection with bounded memory through windowed expiration.

---

## Interview Questions

**Q: How does a hash table handle collisions, and what are the trade-offs between chaining and open addressing?**

A: Collisions occur when two keys hash to the same bucket index. Separate chaining stores colliding entries in a linked list (or tree) at each bucket, allowing unlimited entries per bucket at the cost of pointer overhead and cache misses. Open addressing stores all entries in the array itself, probing subsequent slots on collision (linear, quadratic, or double hashing). Open addressing has better cache locality and lower memory overhead but degrades rapidly as load factor approaches 1.0 and requires tombstone markers for deletion. In practice, chaining is simpler to implement correctly and handles high load factors gracefully, while open addressing (used by Python's dict and Rust's HashMap) offers better performance at moderate load factors.

**Q: What happens when a HashMap exceeds its load factor, and how does this affect performance?**

A: When the number of entries exceeds capacity multiplied by the load factor (default 0.75 in Java), the HashMap allocates a new internal array of double the size and rehashes every existing entry into the new array. This resize operation is O(n) but occurs infrequently enough that the amortized cost per insertion remains O(1). The resize causes a latency spike proportional to the table size. To avoid this in latency-sensitive code, pre-size the HashMap with `new HashMap<>((int)(expectedSize / 0.75) + 1)`. Java 8+ also converts long chains (8+ entries) to red-black trees during resize, improving worst-case lookup from O(n) to O(log n) per bucket.

**Q: How would you design a hash table that supports O(1) worst-case lookups?**

A: Use cuckoo hashing, which maintains two hash tables with independent hash functions. Each key has exactly two possible positions (one in each table). On insertion, if both positions are occupied, the new key displaces an existing key, which is then re-inserted into its alternate position. This cascading displacement guarantees that lookup always checks exactly two positions — O(1) worst case. The trade-off is that insertion can trigger a chain of displacements and may require table rebuilding if a cycle is detected. Cuckoo hashing works well at load factors below 0.5 and is used in network hardware (TCAM alternatives) and high-performance systems where predictable latency matters more than space efficiency.

**Q: Explain consistent hashing and why it matters for distributed systems.**

A: Consistent hashing maps both keys and nodes onto a circular hash space (ring). Each key is assigned to the first node encountered clockwise from its hash position. When a node is added or removed, only keys that map to the affected arc of the ring need redistribution — approximately 1/n of total keys for n nodes. This contrasts with naive modular hashing where adding a node redistributes nearly all keys. Virtual nodes (multiple hash positions per physical node) improve load balance. Consistent hashing is used in DynamoDB, Cassandra, Memcached, and content delivery networks to minimize data movement during scaling events.

**Q: What is the difference between HashMap and ConcurrentHashMap in Java?**

A: HashMap is not thread-safe; concurrent modification causes infinite loops, lost updates, and corrupted state. ConcurrentHashMap uses fine-grained locking (lock striping in Java 7, CAS operations with synchronized blocks on individual bins in Java 8+) to allow concurrent reads and writes without blocking the entire map. ConcurrentHashMap does not allow null keys or values (to disambiguate "key not found" from "value is null" without locking). It provides atomic compound operations like `putIfAbsent`, `compute`, and `merge` that are impossible to implement safely with external synchronization on HashMap.

---

## Production Tips

1. **Pre-size hash tables for known workloads**: In high-throughput services, the O(n) resize operation causes latency spikes that violate SLOs. If you know the approximate number of entries, initialize with sufficient capacity to avoid resizing entirely. For Java HashMap, use `new HashMap<>((int)(expectedEntries / 0.75) + 1)`. For Python dicts, pre-population with `dict.fromkeys()` can help the interpreter allocate appropriately.

2. **Use bounded caches with eviction policies**: Every hash table used as a cache in a long-running service must have a maximum size and eviction strategy. Unbounded caches are the number one cause of memory leaks in production Java services. Use Caffeine (Java) with `maximumSize` and `expireAfterWrite`, or implement LRU eviction with LinkedHashMap's `removeEldestEntry`. Monitor cache hit rates and eviction counts to tune sizing.

3. **Monitor hash distribution in production**: Poor hash distribution causes hot buckets that degrade to O(n) lookup. Instrument your hash tables to track maximum chain length and bucket utilization. In Java, you can use JMX or custom metrics to expose HashMap internals. If you observe chains longer than 8 entries frequently, investigate your key distribution or hash function quality.

4. **Choose ConcurrentHashMap over synchronized wrappers**: `Collections.synchronizedMap()` acquires a global lock for every operation, serializing all access. ConcurrentHashMap allows concurrent reads without locking and uses fine-grained locks for writes, providing 10-100x higher throughput under contention. The only reason to use synchronizedMap is when you need to synchronize compound operations that span multiple method calls.

5. **Use specialized hash maps for primitive types**: Standard HashMap in Java boxes primitives into objects (Integer, Long), consuming 16+ bytes per entry in overhead. For large maps with primitive keys or values, use Eclipse Collections (IntObjectHashMap, LongIntHashMap) or Koloboke, which store primitives directly and reduce memory usage by 50-70% while improving cache performance.

---

## Related Topics

- [Arrays and Strings](../arrays-and-strings/index.md) — Hash tables use arrays internally for bucket storage and are essential for string-based problems
- [Linked Lists](./linked-lists.md) — Separate chaining collision resolution uses linked lists within each bucket
- [Big O Notation](./big-o-notation.md) — Understanding amortized O(1) analysis and worst-case degradation in hash tables
- [Sets](./sets.md) — Sets are implemented as hash tables where only keys matter (HashSet wraps HashMap)
