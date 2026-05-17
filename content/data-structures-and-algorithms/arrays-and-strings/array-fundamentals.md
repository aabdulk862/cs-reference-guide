# Array Fundamentals

## Quick Reference

- **Access by index**: O(1) constant time due to base address + offset calculation
- **Search (unsorted)**: O(n) linear scan required
- **Search (sorted)**: O(log n) via binary search
- **Insert at end**: O(1) amortized for dynamic arrays, O(1) for fixed if space available
- **Insert at arbitrary index**: O(n) due to element shifting
- **Delete by index**: O(n) due to element shifting
- **Space complexity**: O(n) contiguous allocation
- **Cache line utilization**: Sequential access achieves near-optimal prefetch behavior
- **Java declaration**: `int[] arr = new int[size];` or `int[] arr = {1, 2, 3};`
- **Python declaration**: `arr = [1, 2, 3]` (dynamic list) or `array.array('i', [1, 2, 3])` (typed)
- **TypeScript declaration**: `const arr: number[] = [1, 2, 3];`

## When to Use

Arrays are the correct choice when you need fast random access by position and can predict or bound the collection size. They excel in scenarios where memory locality drives performance, such as numerical computation, image processing, and matrix operations.

Choose arrays when you need O(1) random access to elements by position, when the collection size is known at initialization or grows infrequently, when working with primitive types where boxing overhead matters, when cache performance is critical due to contiguous memory layout, or when building backing stores for other data structures like heaps, hash tables, and ring buffers.

Avoid arrays when the collection size changes frequently and unpredictably (use dynamic arrays or linked lists), when you need key-value associations (use hash maps), when you need fast insertion or deletion in the middle of the collection (use linked lists or balanced trees), or when thread-safe dynamic resizing is required without external synchronization.

Arrays are particularly powerful in systems programming where you control memory allocation. In languages like C and Rust, stack-allocated arrays avoid heap allocation entirely, providing deterministic performance without garbage collection pauses. In managed languages like Java and C#, arrays still provide the best cache behavior among collection types.

The fundamental trade-off with arrays is flexibility versus performance. Fixed-size arrays waste memory when underutilized and require expensive reallocation when full. Dynamic arrays (ArrayList, Vec, std::vector) amortize this cost but introduce occasional O(n) resize operations that can cause latency spikes in real-time systems.

## Code Examples

### Binary Search Implementation

Binary search is the canonical array algorithm, leveraging sorted order to achieve O(log n) search by repeatedly halving the search space. The implementation requires careful handling of integer overflow and boundary conditions.

```java
public class BinarySearch {
    /**
     * Returns the index of target in sorted array, or -1 if not found.
     * Uses overflow-safe midpoint calculation.
     */
    public static int search(int[] arr, int target) {
        int left = 0, right = arr.length - 1;
        while (left <= right) {
            int mid = left + (right - left) / 2;  // Avoids integer overflow
            if (arr[mid] == target) return mid;
            else if (arr[mid] < target) left = mid + 1;
            else right = mid - 1;
        }
        return -1;
    }

    /**
     * Returns the leftmost index where target could be inserted
     * to maintain sorted order (lower bound).
     */
    public static int lowerBound(int[] arr, int target) {
        int left = 0, right = arr.length;
        while (left < right) {
            int mid = left + (right - left) / 2;
            if (arr[mid] < target) left = mid + 1;
            else right = mid;
        }
        return left;
    }
}
```

```typescript
function binarySearch(arr: number[], target: number): number {
  let left = 0;
  let right = arr.length - 1;

  while (left <= right) {
    const mid = left + Math.floor((right - left) / 2);
    if (arr[mid] === target) return mid;
    if (arr[mid] < target) left = mid + 1;
    else right = mid - 1;
  }

  return -1;
}

function lowerBound(arr: number[], target: number): number {
  let left = 0;
  let right = arr.length;

  while (left < right) {
    const mid = left + Math.floor((right - left) / 2);
    if (arr[mid] < target) left = mid + 1;
    else right = mid;
  }

  return left;
}
```

### Dutch National Flag Partition

The Dutch National Flag algorithm partitions an array into three sections in a single pass using three pointers. This technique is used in quicksort variants and problems involving categorization of elements.

```java
public class DutchNationalFlag {
    /**
     * Partitions array into three regions:
     * [< pivot | == pivot | > pivot]
     * Runs in O(n) time with O(1) extra space.
     */
    public static void partition(int[] arr, int pivot) {
        int low = 0, mid = 0, high = arr.length - 1;

        while (mid <= high) {
            if (arr[mid] < pivot) {
                swap(arr, low++, mid++);
            } else if (arr[mid] == pivot) {
                mid++;
            } else {
                swap(arr, mid, high--);
            }
        }
    }

    private static void swap(int[] arr, int i, int j) {
        int temp = arr[i];
        arr[i] = arr[j];
        arr[j] = temp;
    }
}
```

```java
/**
 * Alternative implementation using Comparable for generic types.
 * Partitions array in-place into [< pivot, == pivot, > pivot].
 */
public static <T extends Comparable<T>> void dutchNationalFlag(T[] arr, T pivot) {
    int low = 0, mid = 0, high = arr.length - 1;

    while (mid <= high) {
        int cmp = arr[mid].compareTo(pivot);
        if (cmp < 0) {
            T temp = arr[low];
            arr[low] = arr[mid];
            arr[mid] = temp;
            low++;
            mid++;
        } else if (cmp == 0) {
            mid++;
        } else {
            T temp = arr[mid];
            arr[mid] = arr[high];
            arr[high] = temp;
            high--;
        }
    }
}
```

### Dynamic Array (ArrayList) Internals

Understanding how dynamic arrays grow helps predict amortized performance and memory usage in production systems.

```java
public class DynamicArray<T> {
    private Object[] data;
    private int size;
    private static final int DEFAULT_CAPACITY = 10;
    private static final double GROWTH_FACTOR = 1.5;

    public DynamicArray() {
        this.data = new Object[DEFAULT_CAPACITY];
        this.size = 0;
    }

    @SuppressWarnings("unchecked")
    public T get(int index) {
        if (index < 0 || index >= size) throw new IndexOutOfBoundsException();
        return (T) data[index];
    }

    public void add(T element) {
        if (size == data.length) {
            resize((int) (data.length * GROWTH_FACTOR) + 1);
        }
        data[size++] = element;
    }

    private void resize(int newCapacity) {
        Object[] newData = new Object[newCapacity];
        System.arraycopy(data, 0, newData, 0, size);
        data = newData;
    }

    public int size() { return size; }
}
```

## Common Pitfalls

- **Off-by-one errors in loop bounds**: The most frequent array bug in production code. Valid indices run from 0 to length minus 1. Using `<=` instead of `<` in loop conditions causes out-of-bounds exceptions. In binary search, confusing `left <= right` (inclusive bounds) with `left < right` (exclusive right bound) produces incorrect results. Always clarify whether your bounds are inclusive or exclusive before writing the loop.

- **Integer overflow in midpoint calculation**: Computing `mid = (left + right) / 2` overflows when left and right are large positive integers (above Integer.MAX_VALUE / 2). The safe formula is `mid = left + (right - left) / 2`. This bug famously existed in Java's standard library binary search for nearly a decade before being discovered. In languages without integer overflow (Python), this is not an issue, but in Java, C++, and Rust it is critical.

- **Confusing reference copying with value copying**: Assigning one array variable to another copies the reference, not the contents. Modifying one array affects the other. Use `Arrays.copyOf()` in Java, spread operator in JavaScript, or `slice()` in Python for independent copies. This is especially dangerous when passing arrays to functions that may mutate them, or when storing arrays in collections where the original might change.

- **Assuming arrays are resizable**: Unlike ArrayList or Vec, raw arrays have a fixed size determined at allocation. Attempting to add beyond capacity requires creating a new larger array and copying all elements, an O(n) operation. In performance-critical code, pre-allocating arrays to the expected maximum size avoids repeated resizing.

- **Ignoring cache effects in access patterns**: Random access patterns on large arrays cause cache misses that can make algorithms 10-100x slower than sequential access. When processing 2D arrays, row-major access (iterating columns within rows) is dramatically faster than column-major access in row-major languages (C, Java, Python). Structure algorithms to access memory sequentially whenever possible.

## Real-World Use Cases

Arrays are ubiquitous in production systems. In **database engines**, B-tree nodes store keys in sorted arrays to enable binary search within each node, combining the cache-friendly properties of arrays with the logarithmic depth of trees. PostgreSQL's internal page format stores tuples in array-like structures for efficient sequential scans.

In **real-time systems** like trading platforms, pre-allocated arrays serve as ring buffers for order books and market data feeds. The fixed-size allocation eliminates garbage collection pauses that could cause missed trading opportunities. LMAX Disruptor, a high-performance inter-thread messaging library, uses a pre-allocated array as its core data structure to achieve millions of operations per second.

**Image and video processing** pipelines represent frames as 2D arrays of pixel values. GPU computing frameworks (CUDA, OpenCL) operate on arrays because their memory model maps directly to GPU memory banks. Sequential array access patterns enable SIMD vectorization, processing 4-16 elements per CPU instruction.

In **machine learning**, tensors (multi-dimensional arrays) are the fundamental data type. NumPy, PyTorch, and TensorFlow all build on contiguous array storage to leverage CPU/GPU vectorization. A matrix multiplication of two 1000x1000 arrays involves billions of element accesses where cache behavior determines whether the operation takes milliseconds or seconds.

**Network packet processing** in high-performance routers uses arrays for lookup tables (routing tables, ACL rules) because the predictable access pattern enables hardware prefetching. Linux kernel's networking stack uses arrays for socket buffers and packet queues.

## Interview Questions

**Q: How would you find the kth largest element in an unsorted array?**

A: Use a min-heap of size k. Iterate through the array, maintaining only the k largest elements in the heap. When the heap exceeds size k, remove the minimum. After processing all elements, the heap's root is the kth largest. Time complexity is O(n log k), space is O(k). For better average-case performance, use quickselect (Hoare's selection algorithm) which partitions around a pivot and recurses into only one side, achieving O(n) average time with O(1) extra space. The worst case is O(n squared) but randomized pivot selection makes this extremely unlikely.

**Q: How do you rotate an array by k positions in O(n) time and O(1) space?**

A: Use the three-reversal algorithm. First reverse the entire array, then reverse the first k elements, then reverse the remaining n minus k elements. Each reversal is O(n) with O(1) space, giving O(n) total. For example, rotating [1,2,3,4,5] by 2: reverse all gives [5,4,3,2,1], reverse first 2 gives [4,5,3,2,1], reverse last 3 gives [4,5,1,2,3]. Handle k greater than n by taking k mod n.

**Q: Explain the difference between Arrays.sort() for primitives vs. objects in Java.**

A: For primitives, Java uses dual-pivot quicksort with O(n log n) average time but O(n squared) worst case, and it is not stable. For objects, it uses TimSort which guarantees O(n log n) worst case and is stable (equal elements maintain their relative order). The distinction matters when stability is required, such as sorting by multiple keys sequentially. TimSort also exploits existing order in the data (natural runs), making it faster on partially sorted arrays.

**Q: How would you detect a duplicate in an array of n+1 integers where each integer is between 1 and n?**

A: Use Floyd's cycle detection algorithm. Treat the array as a function mapping index to value, creating an implicit linked list where arr[i] points to the next index. Since there are n+1 values in range 1 to n, a duplicate must exist (pigeonhole principle), creating a cycle. The tortoise-and-hare algorithm finds the cycle entry point in O(n) time and O(1) space without modifying the array.

## Production Tips

- **Pre-allocate arrays in hot paths**: Creating arrays inside frequently-called methods generates garbage collection pressure. In latency-sensitive applications (trading systems, game engines, real-time audio), pre-allocate arrays at startup and reuse them via object pooling or thread-local storage. Java's `-XX:+AlwaysPreTouch` flag pre-faults array memory pages to avoid page faults during execution.

- **Use System.arraycopy for bulk operations**: When copying large arrays, `System.arraycopy()` is a JVM intrinsic that uses optimized memory copy operations (often mapping to `memcpy` or SIMD instructions). It significantly outperforms manual element-by-element copying for arrays larger than a few dozen elements. In JavaScript, `TypedArray.set()` provides similar optimized bulk copying for numeric arrays.

- **Consider memory alignment for SIMD**: Modern CPUs process arrays fastest when data is aligned to cache line boundaries (typically 64 bytes). In performance-critical C/C++ code, use `alignas(64)` or `posix_memalign`. In Java, the JVM handles alignment automatically, but array padding can still affect performance in struct-of-arrays patterns.

## Related Topics

- [Two Pointers and Sliding Window](./two-pointers-and-sliding-window.md) — Core traversal patterns built on array access
- [Prefix Sums and Hashing](./prefix-sums-and-hashing.md) — Precomputation techniques for array range queries
- [Sorting and Searching](../sorting-and-searching/index.md) — Algorithms that operate on array structures
- [Heap](../fundamental-data-structures/heap.md) — Heaps are implemented using arrays with parent-child index relationships
