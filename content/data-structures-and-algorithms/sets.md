# Sets

A **set** is a collection of distinct elements, ensuring no duplicates are stored. It provides an efficient way to check for the presence of an element, and its operations generally run in constant or logarithmic time. Sets are fundamental to computer science, used for membership testing, deduplication, mathematical set operations (union, intersection, difference), and maintaining unique constraints in databases and applications.

---

## Quick Reference

- **HashSet add/remove/contains**: O(1) average
- **TreeSet add/remove/contains**: O(log n) guaranteed
- **LinkedHashSet add/remove/contains**: O(1) average, maintains insertion order
- **EnumSet**: O(1) for all operations, uses bit vector internally
- **Set.of() (Java 9+)**: creates immutable set, O(1) contains
- **Union**: `setA.addAll(setB)`
- **Intersection**: `setA.retainAll(setB)`
- **Difference**: `setA.removeAll(setB)`
- **Subset check**: `setB.containsAll(setA)`
- **Null elements**: HashSet allows one null; TreeSet does not
- **Thread-safe**: `ConcurrentHashMap.newKeySet()` or `Collections.synchronizedSet()`

---

## When to Use

Sets are the right choice when you need to maintain a collection of unique elements and perform fast membership testing. They are the natural choice for deduplication, tracking visited states, and implementing mathematical set operations.

**Choose HashSet when:**
- You need O(1) membership testing and deduplication
- Element ordering does not matter
- You are filtering duplicates from a stream of data

**Choose TreeSet when:**
- You need elements in sorted order
- You need range queries (subSet, headSet, tailSet)
- You need floor/ceiling operations (nearest element lookup)

**Choose LinkedHashSet when:**
- You need O(1) operations with predictable iteration order
- You want to preserve the order elements were first added

**Choose EnumSet when:**
- Elements are enum constants (extremely fast, compact bit-vector representation)

**Avoid sets when:**
- You need to associate values with keys (use Map)
- You need indexed access by position (use List)
- You need to count occurrences (use Map with frequency counts)
- You need duplicate elements (use List or Multiset)

---

- **Key Properties**:
    - No duplicate elements allowed.
    - Provides fast lookup, insertion, and deletion.
    - Operations are optimized for quick searches and element comparisons.
- **Big O Complexity**:
    - **Add**: O(1) for unordered sets (with good hash functions), O(log n) for ordered sets.
    - **Remove**: O(1) for unordered sets, O(log n) for ordered sets.
    - **Contains**: O(1) for unordered sets, O(log n) for ordered sets.
    - **Size**: O(1) for unordered sets, O(n) for ordered sets (due to traversal in some cases).

---

## Unordered Set

An **unordered set** does not maintain the order of its elements. It typically uses a **hash table** for storing elements, and operations like insertion, deletion, and membership checking are fast, assuming a good hash function.

### HashSet

- **Characteristics**:
    - Stores elements using a hash table.
    - Operations like add, remove, contains, and size have average time complexity of O(1).
    - Elements are stored in no particular order.
    - One **null** element is allowed.

### Example:

```java
import java.util.HashSet;

public class HashSetExample {
    public static void main(String[] args) {
        HashSet<Integer> set = new HashSet<>();

        set.add(1);
        set.add(2);
        set.add(3);

        // Try adding a duplicate (won't be added)
        set.add(2);

        System.out.println(set); // Output: [1, 2, 3] (order is not guaranteed)

        System.out.println(set.contains(2));  // Output: true

        set.remove(2);

        System.out.println(set); // Output: [1, 3]
    }
}
```

### Big O Analysis:

- **Add**: O(1) on average.
- **Remove**: O(1) on average.
- **Contains**: O(1) on average.
- **Size**: O(1), as the size is tracked internally.

---

## Ordered Set

An **ordered set** maintains its elements in a specific order, typically sorted. This allows operations that depend on ordering, like range queries, while also ensuring unique elements.

### LinkedHashSet:

- **Characteristics**:
    - Maintains the **insertion order** of elements.
    - Internally uses a hash table along with a **doubly-linked list** to preserve the order in which elements are added.
    - Basic operations are O(1) on average.
    - One **null** element is allowed.

### Example:

```java
import java.util.LinkedHashSet;

public class LinkedHashSetExample {
    public static void main(String[] args) {
        LinkedHashSet<Integer> set = new LinkedHashSet<>();

        set.add(1);
        set.add(2);
        set.add(3);

        set.add(2);  // Duplicate, won't be added

        System.out.println(set); // Output: [1, 2, 3]

        set.remove(2);

        System.out.println(set); // Output: [1, 3]
    }
}
```

### Big O Analysis:

- **Add**: O(1) on average, with additional overhead to maintain the linked list.
- **Remove**: O(1) on average.
- **Contains**: O(1) on average.
- **Size**: O(1).

### TreeSet:

- **Characteristics**:
    - Stores elements in **sorted order** using a **red-black tree** (a type of balanced binary search tree).
    - Operations like add, remove, and contains are O(log n), because the tree structure is balanced.
    - Does **not** allow **null** elements, as elements need to be compared for sorting.
    - **NavigableSet** interface is supported, providing range operations like subSet, headSet, and tailSet.

### Example:

```java
import java.util.TreeSet;

public class TreeSetExample {
    public static void main(String[] args) {
        TreeSet<Integer> set = new TreeSet<>();

        set.add(3);
        set.add(1);
        set.add(2);

        System.out.println(set); // Output: [1, 2, 3]

        set.remove(2);

        System.out.println(set); // Output: [1, 3]
    }
}
```

### Big O Analysis:

- **Add**: O(log n), because inserting involves finding the correct position and potentially rebalancing the tree.
- **Remove**: O(log n), as it requires finding and deleting an element, and potentially rebalancing.
- **Contains**: O(log n), as it requires a search through the tree.
- **Size**: O(n), because traversal of the tree to count elements can take linear time.

---

## The Set Interface in Java

The **Set** interface extends the **Collection** interface and represents a collection of distinct elements. It provides several key methods:

- **add()**: Adds an element to the set if not already present.
- **remove()**: Removes an element from the set.
- **contains()**: Checks if an element is in the set.
- **size()**: Returns the number of elements in the set.
- **clear()**: Removes all elements from the set.

---

## Summary

Sets are crucial data structures for maintaining collections of unique elements, allowing efficient checking, adding, and removing of items. The choice of implementation depends on the need for ordering:

- **HashSet**: Provides fast, unordered storage.
- **LinkedHashSet**: Provides fast, ordered storage (maintains insertion order).
- **TreeSet**: Provides sorted storage with logarithmic time complexity for operations.

Each implementation provides unique benefits in terms of performance, ordering, and use cases.

---

## Code Examples

### Deduplication and Set Operations

Sets provide natural deduplication and mathematical set operations that would require complex logic with other data structures.

```java
// Deduplication
List<String> withDuplicates = Arrays.asList("apple", "banana", "apple", "cherry", "banana");
Set<String> unique = new LinkedHashSet<>(withDuplicates);
// Result: [apple, banana, cherry] - preserves first occurrence order

// Union
Set<Integer> setA = new HashSet<>(Arrays.asList(1, 2, 3, 4));
Set<Integer> setB = new HashSet<>(Arrays.asList(3, 4, 5, 6));
Set<Integer> union = new HashSet<>(setA);
union.addAll(setB);  // {1, 2, 3, 4, 5, 6}

// Intersection
Set<Integer> intersection = new HashSet<>(setA);
intersection.retainAll(setB);  // {3, 4}

// Difference (A - B)
Set<Integer> difference = new HashSet<>(setA);
difference.removeAll(setB);  // {1, 2}
```

### Using Sets for Graph Visited Tracking

Sets are essential in graph algorithms for tracking visited nodes and preventing infinite loops in cyclic graphs.

```java
public List<Integer> bfs(Map<Integer, List<Integer>> graph, int start) {
    Set<Integer> visited = new HashSet<>();
    Queue<Integer> queue = new ArrayDeque<>();
    List<Integer> result = new ArrayList<>();

    visited.add(start);
    queue.offer(start);

    while (!queue.isEmpty()) {
        int node = queue.poll();
        result.add(node);
        for (int neighbor : graph.getOrDefault(node, Collections.emptyList())) {
            if (visited.add(neighbor)) {  // add() returns true if element was new
                queue.offer(neighbor);
            }
        }
    }
    return result;
}
```

### Efficient Substring Detection with Set

Using a set to check if a string contains all required characters in O(n) time.

```java
public boolean containsAllVowels(String s) {
    Set<Character> vowels = new HashSet<>(Arrays.asList('a', 'e', 'i', 'o', 'u'));
    Set<Character> found = new HashSet<>();
    for (char c : s.toLowerCase().toCharArray()) {
        if (vowels.contains(c)) {
            found.add(c);
            if (found.size() == 5) return true;
        }
    }
    return false;
}
```

---

## Common Pitfalls

1. **Mutable elements in HashSet**: If you add a mutable object to a HashSet and then modify it, the hash code changes and the element becomes unreachable (cannot be found or removed). Always use immutable objects as set elements, or never modify elements after adding them.

2. **Assuming HashSet preserves insertion order**: HashSet makes no ordering guarantees. If you iterate over a HashSet, elements may appear in any order and the order may change after rehashing. Use LinkedHashSet if you need insertion order.

3. **Using contains() on a List instead of a Set**: Calling `list.contains(x)` is O(n). If you check membership repeatedly, convert to a HashSet first for O(1) lookups. This is one of the most common performance improvements in Java code.

4. **Forgetting that TreeSet requires Comparable elements**: TreeSet uses natural ordering (Comparable) or a provided Comparator. Adding elements that don't implement Comparable and without a Comparator throws ClassCastException at runtime.

5. **Not overriding hashCode() with equals()**: If your custom class overrides equals() but not hashCode(), two logically equal objects may be stored as duplicates in a HashSet because they hash to different buckets.

6. **Using Set.of() and expecting mutability**: Java 9+ `Set.of()` creates an immutable set. Calling add() or remove() throws UnsupportedOperationException. Use `new HashSet<>(Set.of(...))` if you need a mutable copy.

---

## Interview Questions

**Q1: How would you find the first non-repeating character in a string?**
Use a LinkedHashSet to track characters seen once and a HashSet for characters seen more than once. Iterate through the string: if a character is in the duplicates set, skip it; if it is in the singles set, move it to duplicates; otherwise add to singles. The first element of the singles set is the answer. Alternatively, use a LinkedHashMap with frequency counts.

**Q2: How does HashSet achieve O(1) operations internally?**
HashSet is backed by a HashMap where elements are stored as keys with a dummy value. The hash code determines the bucket, and equals() resolves collisions within a bucket. Java 8+ converts long chains to red-black trees (O(log n) worst case instead of O(n)).

**Q3: How would you find the intersection of two large sorted arrays efficiently?**
Use two pointers advancing through both arrays simultaneously. If elements are equal, add to result and advance both. If one is smaller, advance that pointer. This runs in O(n + m) time with O(1) extra space, better than converting to sets for sorted inputs.

**Q4: What is the time complexity of retainAll() on a HashSet?**
`setA.retainAll(setB)` iterates over setA and checks membership in setB for each element. If setA has n elements and setB provides O(1) contains, the total is O(n). If setB is a List, it degrades to O(n × m).

---

## Production Tips

1. **Pre-size HashSet to avoid rehashing**: If you know the expected number of elements, initialize with `new HashSet<>((int)(expectedSize / 0.75) + 1)` to avoid expensive rehashing. Each rehash doubles the internal array and re-inserts all elements.

2. **Use EnumSet for flag combinations**: When you need to track a combination of enum flags (permissions, features, states), EnumSet uses a single long (or long array) as a bit vector. It is orders of magnitude faster and more memory-efficient than HashSet for enum elements.

3. **Use Set.copyOf() for defensive copies**: When receiving a Set parameter in a public API, use `Set.copyOf(input)` to create an immutable snapshot. This prevents callers from modifying your internal state through the original reference.

4. **Consider Bloom filters for approximate membership**: When you need to test membership in a very large set (millions of elements) and can tolerate false positives, a Bloom filter uses far less memory than a HashSet. Guava provides `BloomFilter` for this purpose.

5. **Use ConcurrentHashMap.newKeySet() for concurrent sets**: Java does not have a ConcurrentHashSet class. Use `ConcurrentHashMap.newKeySet()` or `Collections.newSetFromMap(new ConcurrentHashMap<>())` for thread-safe set operations without global locking.

---

## Related Topics

- [Map](./map.md) — HashSet is internally backed by a HashMap with dummy values
- [Tree](./tree.md) — TreeSet uses a red-black tree for sorted element storage
- [Array](./array.md) — Sets can be used to deduplicate array elements efficiently
- [Graph](./graph.md) — Sets track visited nodes in graph traversal algorithms
- [Big O Notation](./big-o-notation.md) — Understanding O(1) amortized vs. O(log n) guaranteed complexity
