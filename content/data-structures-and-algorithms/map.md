# Map

A **map** (or **dictionary**) is a data structure used to store key-value pairs. It allows for efficient lookups, insertions, and deletions of values based on their associated keys. Maps are essential for fast, direct access to data and are widely used in applications such as database indexing, network routing, caching, and web programming. In Java, the Map interface is one of the most frequently used abstractions in production code.

---

## Quick Reference

- **HashMap get/put/remove**: O(1) average, O(n) worst case (hash collisions)
- **TreeMap get/put/remove**: O(log n) guaranteed
- **LinkedHashMap get/put/remove**: O(1) average, maintains insertion order
- **ConcurrentHashMap**: thread-safe, O(1) average, lock-striping
- **Null keys**: HashMap allows one null key; TreeMap and ConcurrentHashMap do not
- **Null values**: HashMap and LinkedHashMap allow null values; Hashtable does not
- **Iteration order**: HashMap (undefined), LinkedHashMap (insertion/access order), TreeMap (sorted)
- **Default load factor**: 0.75 (HashMap resizes when 75% full)
- **Initial capacity**: 16 buckets (HashMap default)
- **Java 8+ optimization**: HashMap uses red-black trees for buckets with 8+ collisions
- **Thread-safe options**: ConcurrentHashMap, Collections.synchronizedMap()

---

## When to Use

Maps are the right choice when you need to associate keys with values and perform fast lookups by key. They are the most commonly used data structure in application-level code after lists.

**Choose HashMap when:**
- You need O(1) average-case lookup, insertion, and deletion
- Key ordering does not matter
- You are working in a single-threaded context or can synchronize externally

**Choose TreeMap when:**
- You need keys in sorted order
- You need range queries (subMap, headMap, tailMap)
- You need floor/ceiling operations (nearest key lookup)

**Choose LinkedHashMap when:**
- You need predictable iteration order (insertion order or access order)
- You are implementing an LRU cache (access-order mode with removeEldestEntry)

**Choose ConcurrentHashMap when:**
- Multiple threads read and write concurrently
- You need high throughput without global locking

**Avoid maps when:**
- You only need to check membership (use Set)
- You need indexed access by position (use List)
- Keys are sequential integers (use an array)

---

## Key Characteristics of Maps

- **Stores pairs**: A map stores pairs of keys and values, where each key is unique.
- **Efficient operations**: Operations like inserting, retrieving, or deleting values are efficient, often O(1) for many map types.
- **No duplicates**: Maps do not allow duplicate keys, but values can be duplicated.

### Big O Complexity:

- **Put**: O(1) for most maps (except TreeMap, which is O(log n)).
- **Get**: O(1) for most maps (except TreeMap, which is O(log n)).
- **Remove**: O(1) for most maps (except TreeMap, which is O(log n)).
- **Iteration**: O(n), where n is the number of entries in the map.

---

## HashMap

A **HashMap** uses a **hash function** to map keys to indices in an internal array, which allows for fast retrieval of values based on their associated keys.

### Characteristics:

- **Unordered storage**: HashMap does not maintain any order of the keys.
- **Null keys**: HashMap allows one null key and multiple null values.
- **Thread safety**: HashMap is **not thread-safe**. If used in a multi-threaded environment, consider using `ConcurrentHashMap` or manually synchronizing access.
- **Performance**: O(1) on average for get, put, and remove operations. In the worst case, it can degrade to O(n) if many keys hash to the same index.

### Example:

```java
import java.util.HashMap;

public class HashMapExample {
    public static void main(String[] args) {
        HashMap<String, Integer> map = new HashMap<>();

        map.put("Apple", 1);
        map.put("Banana", 2);
        map.put("Orange", 3);

        System.out.println(map.get("Apple"));  // Output: 1

        map.remove("Banana");

        System.out.println(map);  // Output: {Apple=1, Orange=3}
    }
}
```

### Big O Analysis:

- **Put**: O(1) on average.
- **Get**: O(1) on average.
- **Remove**: O(1) on average.
- **Iteration**: O(n).

---

## Hashtable

A **Hashtable** is a legacy map implementation that also uses a hash function for mapping keys to values. It is very similar to HashMap, but has some important differences.

### Characteristics:

- **Thread safety**: Unlike HashMap, Hashtable is **synchronized** and thread-safe.
- **Null keys/values**: Hashtable does not allow null keys or null values.
- **Performance**: Similar to HashMap, O(1) for get, put, and remove. Slightly slower due to synchronization overhead.

### Example:

```java
import java.util.Hashtable;

public class HashtableExample {
    public static void main(String[] args) {
        Hashtable<String, Integer> table = new Hashtable<>();

        table.put("Apple", 1);
        table.put("Banana", 2);
        table.put("Orange", 3);

        System.out.println(table.get("Apple"));  // Output: 1

        table.remove("Banana");

        System.out.println(table);  // Output: {Apple=1, Orange=3}
    }
}
```

### Differences Between HashMap and Hashtable:

- **Thread Safety**: Hashtable is synchronized; HashMap is not.
- **Null Keys and Values**: HashMap allows one null key and multiple null values; Hashtable does not allow null keys or values.
- **Legacy**: Hashtable is part of the legacy collection classes; HashMap is part of the modern Java collections framework.

---

## LinkedHashMap

A **LinkedHashMap** maintains a doubly-linked list of the entries in the map, preserving the order in which they were inserted, while still providing fast lookups.

### Characteristics:

- **Order**: Maintains the **insertion order** of keys.
- **Null keys**: Allows one null key and multiple null values.
- **Thread safety**: Not thread-safe.
- **Performance**: O(1) for get, put, and remove on average, with slightly higher overhead due to maintaining the order.

### Example:

```java
import java.util.LinkedHashMap;

public class LinkedHashMapExample {
    public static void main(String[] args) {
        LinkedHashMap<String, Integer> map = new LinkedHashMap<>();

        map.put("Apple", 1);
        map.put("Banana", 2);
        map.put("Orange", 3);

        System.out.println(map);  // Output: {Apple=1, Banana=2, Orange=3}

        System.out.println(map.get("Banana"));  // Output: 2

        map.remove("Apple");

        System.out.println(map);  // Output: {Banana=2, Orange=3}
    }
}
```

---

## TreeMap

A **TreeMap** is a map that stores keys in **sorted order** using a **red-black tree**.

### Characteristics:

- **Order**: Maintains keys in ascending order (or according to a comparator if provided).
- **Null keys**: Does not allow null keys, but allows null values.
- **Thread safety**: Not thread-safe.
- **Performance**: O(log n) for get, put, and remove operations. Efficient for range queries and navigating between keys.

### Example:

```java
import java.util.TreeMap;

public class TreeMapExample {
    public static void main(String[] args) {
        TreeMap<String, Integer> map = new TreeMap<>();

        map.put("Apple", 1);
        map.put("Banana", 2);
        map.put("Orange", 3);

        System.out.println(map);  // Output: {Apple=1, Banana=2, Orange=3}

        System.out.println(map.get("Banana"));  // Output: 2

        map.remove("Apple");

        System.out.println(map);  // Output: {Banana=2, Orange=3}
    }
}
```

### Big O Analysis:

- **Put**: O(log n), as the red-black tree needs to maintain balance.
- **Get**: O(log n).
- **Remove**: O(log n).
- **Iteration**: O(n), traversing the tree in sorted order.

---

## The Map Interface

The **Map** interface in Java defines methods for associating keys with values, including:

- **put(K key, V value)**: Inserts a key-value pair into the map.
- **get(Object key)**: Retrieves the value associated with the key.
- **remove(Object key)**: Removes the key-value pair.
- **containsKey(Object key)**: Checks if a key exists in the map.
- **containsValue(Object value)**: Checks if a value exists in the map.
- **size()**: Returns the number of key-value pairs in the map.
- **clear()**: Removes all key-value pairs.

---

## Summary

Maps are essential data structures for efficiently storing key-value pairs. The choice of map implementation depends on the use case:

- **HashMap**: Best for unordered, fast lookups with average O(1) performance.
- **Hashtable**: Thread-safe version of HashMap, but with slight performance overhead and does not allow null keys.
- **LinkedHashMap**: Maintains insertion order, with O(1) performance for basic operations.
- **TreeMap**: Best for sorted key storage with O(log n) performance, ideal for range queries and key navigation.

Each implementation provides unique benefits suited to different types of applications, making maps highly versatile.

---

## Code Examples

### Frequency Counter Pattern

One of the most common map patterns: counting occurrences of elements. This is used in anagram detection, word frequency analysis, and voting systems.

```java
public Map<Character, Integer> charFrequency(String s) {
    Map<Character, Integer> freq = new HashMap<>();
    for (char c : s.toCharArray()) {
        freq.merge(c, 1, Integer::sum);  // Java 8+ merge
    }
    return freq;
}
```

### Two-Sum with HashMap

The classic interview problem solved in O(n) time using a map to store complements.

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

### LRU Cache with LinkedHashMap

A production-ready LRU cache using LinkedHashMap's access-order mode with automatic eviction of the least recently used entry.

```java
public class LRUCache<K, V> extends LinkedHashMap<K, V> {
    private final int maxSize;

    public LRUCache(int maxSize) {
        super(maxSize, 0.75f, true);  // accessOrder = true
        this.maxSize = maxSize;
    }

    @Override
    protected boolean removeEldestEntry(Map.Entry<K, V> eldest) {
        return size() > maxSize;
    }
}
```

### Grouping with computeIfAbsent

Java 8's computeIfAbsent simplifies the pattern of building multi-value maps without null checks.

```java
// Group words by their first letter
Map<Character, List<String>> grouped = new HashMap<>();
for (String word : words) {
    grouped.computeIfAbsent(word.charAt(0), k -> new ArrayList<>()).add(word);
}
```

---

## Common Pitfalls

1. **Mutable keys in HashMap**: If you use a mutable object as a HashMap key and modify it after insertion, the hash code changes and the entry becomes unreachable. Always use immutable objects (String, Integer, or custom immutable classes) as map keys.

2. **Forgetting to override both hashCode() and equals()**: If you override equals() without hashCode(), objects that are logically equal may hash to different buckets, causing duplicate keys and lookup failures. Always override both methods together.

3. **ConcurrentModificationException during iteration**: Modifying a HashMap while iterating with a for-each loop throws ConcurrentModificationException. Use `Iterator.remove()`, `entrySet().removeIf()`, or iterate over a copy of the entry set.

4. **Assuming HashMap preserves insertion order**: HashMap makes no guarantees about iteration order. If you need predictable order, use LinkedHashMap (insertion order) or TreeMap (sorted order).

5. **Using getOrDefault incorrectly with mutable defaults**: `map.getOrDefault(key, new ArrayList<>())` creates a new list on every call but does not store it in the map. Use `computeIfAbsent` instead when you want the default to be stored.

6. **Performance degradation with poor hash functions**: If many keys hash to the same bucket, HashMap degrades from O(1) to O(n) for lookups. Java 8+ mitigates this by converting long chains to red-black trees (O(log n)), but good hash distribution is still important.

---

## Interview Questions

**Q1: How does HashMap handle collisions in Java 8+?**
HashMap uses separate chaining. When multiple keys hash to the same bucket, they are stored in a linked list. In Java 8+, when a bucket exceeds 8 entries (treeify threshold), the linked list is converted to a red-black tree for O(log n) worst-case lookup instead of O(n).

**Q2: What happens when a HashMap exceeds its load factor?**
When the number of entries exceeds capacity × load factor (default 0.75), the HashMap doubles its internal array size and rehashes all entries into new bucket positions. This resize operation is O(n) but happens infrequently enough that amortized put remains O(1).

**Q3: How would you implement a thread-safe cache with expiration?**
Use ConcurrentHashMap with a scheduled executor that periodically removes expired entries, or use Guava's CacheBuilder which provides expireAfterWrite, expireAfterAccess, and maximum size with LRU eviction. For production systems, Caffeine cache offers superior performance.

**Q4: What is the difference between HashMap and ConcurrentHashMap?**
ConcurrentHashMap uses lock striping (segmented locking in Java 7, CAS operations in Java 8+) to allow concurrent reads and writes without blocking the entire map. It does not allow null keys or values. It provides atomic operations like putIfAbsent, compute, and merge.

---

## Production Tips

1. **Size your HashMaps appropriately**: If you know the expected number of entries, initialize with `new HashMap<>(expectedSize / 0.75 + 1)` to avoid resizing. Each resize copies all entries and rehashes them, causing latency spikes in high-throughput systems.

2. **Use ConcurrentHashMap over synchronized HashMap**: `Collections.synchronizedMap()` locks the entire map for every operation. ConcurrentHashMap provides much higher throughput under contention by allowing concurrent reads and segmented writes.

3. **Prefer Map.of() for small immutable maps**: Java 9+ provides `Map.of(k1, v1, k2, v2)` for creating compact, immutable maps. These use less memory than HashMap for small fixed mappings and communicate immutability intent.

4. **Use EnumMap for enum keys**: When keys are enum values, `EnumMap` uses an array internally (indexed by ordinal), providing O(1) operations with minimal memory overhead and excellent cache performance. It is significantly faster than HashMap for enum keys.

5. **Monitor HashMap size in long-running services**: HashMaps that grow unboundedly (e.g., caches without eviction) are a common source of memory leaks in production. Use bounded caches (Caffeine, Guava Cache) with size limits and TTL-based eviction.

---

## Related Topics

- [Sets](./sets.md) — Sets are maps where only keys matter (HashSet is backed by HashMap)
- [Tree](./tree.md) — TreeMap uses a red-black tree for sorted key storage
- [Array](./array.md) — HashMap's internal bucket array and hash-to-index mapping
- [List](./list.md) — LinkedHashMap maintains a doubly-linked list for order preservation
- [Big O Notation](./big-o-notation.md) — Understanding amortized O(1) vs. worst-case O(n) in hash maps
