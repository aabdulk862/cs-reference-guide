# Comparison-Based Sorting

## Quick Reference

- **Merge Sort**: O(n log n) guaranteed, O(n) space, stable — divide-and-conquer
- **Quick Sort**: O(n log n) average, O(n²) worst, O(log n) space, unstable — partition-based
- **Heap Sort**: O(n log n) guaranteed, O(1) space, unstable — selection-based
- **Tim Sort**: O(n log n) worst, O(n) space, stable, adaptive — hybrid merge+insertion
- **Insertion Sort**: O(n²) worst, O(n) best (nearly sorted), O(1) space, stable
- **Comparison lower bound**: Ω(n log n) — no comparison sort can do better
- **Java Arrays.sort (primitives)**: Dual-pivot quicksort, unstable
- **Java Arrays.sort (objects)**: TimSort, stable
- **Python sorted()**: TimSort, stable
- **C++ std::sort**: Introsort (quicksort + heapsort fallback), unstable

## When to Use

Comparison-based sorting algorithms work on any data type that supports a total ordering (comparisons). They are the default choice when you cannot make assumptions about the data distribution or value range.

Use merge sort when stability is required (equal elements must maintain their relative order), when sorting linked lists (merge sort is naturally suited to linked structures with O(1) merge), when external sorting is needed (data exceeds memory, must sort on disk), or when worst-case O(n log n) guarantee is critical (real-time systems, SLA-bound operations).

Use quicksort when average-case performance matters more than worst-case guarantees, when in-place sorting is preferred (O(log n) stack space versus O(n) for merge sort), or when cache performance is important (quicksort has better locality than merge sort due to in-place partitioning). Randomized pivot selection makes worst-case extremely unlikely.

Use heapsort when you need guaranteed O(n log n) with O(1) extra space (the only comparison sort achieving both), when memory is severely constrained, or when you need a partial sort (find k largest elements in O(n + k log n)).

Use insertion sort for small arrays (under 20-50 elements) where its low overhead beats the recursive overhead of merge/quick sort, for nearly-sorted data where it achieves O(n) time, or as the base case in hybrid algorithms (TimSort uses insertion sort for small runs).

## Code Examples

### Merge Sort with Optimization

A production-quality merge sort with small-array optimization and in-place merge for reduced allocation.

```java
public class MergeSort {
    private static final int INSERTION_THRESHOLD = 32;

    /**
     * Merge sort with insertion sort for small subarrays.
     * Stable, O(n log n) guaranteed, O(n) auxiliary space.
     */
    public static void sort(int[] arr) {
        int[] aux = new int[arr.length];
        mergeSort(arr, aux, 0, arr.length - 1);
    }

    private static void mergeSort(int[] arr, int[] aux, int lo, int hi) {
        if (hi - lo < INSERTION_THRESHOLD) {
            insertionSort(arr, lo, hi);
            return;
        }

        int mid = lo + (hi - lo) / 2;
        mergeSort(arr, aux, lo, mid);
        mergeSort(arr, aux, mid + 1, hi);

        // Skip merge if already sorted (optimization for partially sorted data)
        if (arr[mid] <= arr[mid + 1]) return;

        merge(arr, aux, lo, mid, hi);
    }

    private static void merge(int[] arr, int[] aux, int lo, int mid, int hi) {
        System.arraycopy(arr, lo, aux, lo, hi - lo + 1);

        int i = lo, j = mid + 1;
        for (int k = lo; k <= hi; k++) {
            if (i > mid) arr[k] = aux[j++];
            else if (j > hi) arr[k] = aux[i++];
            else if (aux[j] < aux[i]) arr[k] = aux[j++];
            else arr[k] = aux[i++];  // Stable: take from left on equality
        }
    }

    private static void insertionSort(int[] arr, int lo, int hi) {
        for (int i = lo + 1; i <= hi; i++) {
            int key = arr[i];
            int j = i - 1;
            while (j >= lo && arr[j] > key) {
                arr[j + 1] = arr[j];
                j--;
            }
            arr[j + 1] = key;
        }
    }
}
```

```typescript
function mergeSort(arr: number[]): number[] {
  if (arr.length <= 1) return arr;

  const mid = Math.floor(arr.length / 2);
  const left = mergeSort(arr.slice(0, mid));
  const right = mergeSort(arr.slice(mid));

  return merge(left, right);
}

function merge(left: number[], right: number[]): number[] {
  const result: number[] = [];
  let i = 0, j = 0;

  while (i < left.length && j < right.length) {
    if (left[i] <= right[j]) {
      result.push(left[i++]);
    } else {
      result.push(right[j++]);
    }
  }

  return [...result, ...left.slice(i), ...right.slice(j)];
}
```

### Quicksort with Randomized Pivot and Three-Way Partition

Production quicksort using randomized pivot selection to avoid worst-case and three-way partitioning for arrays with many duplicates.

```java
public class QuickSort {
    private static final Random random = new Random();

    /**
     * Quicksort with randomized pivot and three-way partition.
     * Handles duplicates efficiently (O(n) for all-equal arrays).
     * Average: O(n log n), Worst: O(n²) extremely unlikely with random pivot.
     */
    public static void sort(int[] arr) {
        quickSort(arr, 0, arr.length - 1);
    }

    private static void quickSort(int[] arr, int lo, int hi) {
        if (lo >= hi) return;

        // Randomized pivot selection
        int pivotIdx = lo + random.nextInt(hi - lo + 1);
        swap(arr, pivotIdx, hi);
        int pivot = arr[hi];

        // Three-way partition: [< pivot | == pivot | > pivot]
        int lt = lo, gt = hi, i = lo;
        while (i <= gt) {
            if (arr[i] < pivot) {
                swap(arr, lt++, i++);
            } else if (arr[i] > pivot) {
                swap(arr, i, gt--);
            } else {
                i++;
            }
        }

        // Recurse on partitions excluding equal elements
        quickSort(arr, lo, lt - 1);
        quickSort(arr, gt + 1, hi);
    }

    private static void swap(int[] arr, int i, int j) {
        int temp = arr[i];
        arr[i] = arr[j];
        arr[j] = temp;
    }

    /**
     * Quickselect: find kth smallest element in O(n) average time.
     * Same partition logic but only recurse into one side.
     */
    public static int quickSelect(int[] arr, int k) {
        return quickSelect(arr, 0, arr.length - 1, k - 1);
    }

    private static int quickSelect(int[] arr, int lo, int hi, int k) {
        if (lo == hi) return arr[lo];

        int pivotIdx = lo + random.nextInt(hi - lo + 1);
        swap(arr, pivotIdx, hi);
        int pivot = arr[hi];

        int lt = lo, gt = hi, i = lo;
        while (i <= gt) {
            if (arr[i] < pivot) swap(arr, lt++, i++);
            else if (arr[i] > pivot) swap(arr, i, gt--);
            else i++;
        }

        if (k < lt) return quickSelect(arr, lo, lt - 1, k);
        if (k > gt) return quickSelect(arr, gt + 1, hi, k);
        return arr[k];  // k is in the equal partition
    }
}
```

### Heapsort Implementation

In-place O(n log n) sort using a max-heap built in the array itself.

```java
public class HeapSort {
    /**
     * Heapsort: build max-heap, then repeatedly extract maximum.
     * O(n log n) guaranteed, O(1) extra space, unstable.
     */
    public static void sort(int[] arr) {
        int n = arr.length;

        // Build max-heap (bottom-up, O(n))
        for (int i = n / 2 - 1; i >= 0; i--) {
            heapify(arr, n, i);
        }

        // Extract elements from heap one by one
        for (int i = n - 1; i > 0; i--) {
            swap(arr, 0, i);      // Move max to end
            heapify(arr, i, 0);   // Restore heap property
        }
    }

    private static void heapify(int[] arr, int size, int root) {
        int largest = root;
        int left = 2 * root + 1;
        int right = 2 * root + 2;

        if (left < size && arr[left] > arr[largest]) largest = left;
        if (right < size && arr[right] > arr[largest]) largest = right;

        if (largest != root) {
            swap(arr, root, largest);
            heapify(arr, size, largest);
        }
    }

    private static void swap(int[] arr, int i, int j) {
        int temp = arr[i]; arr[i] = arr[j]; arr[j] = temp;
    }
}
```

## Common Pitfalls

- **Using quicksort without randomized pivot on adversarial input**: Deterministic pivot selection (always first, last, or middle element) is vulnerable to adversarial inputs that force O(n²) behavior. Sorted arrays cause worst-case for first/last pivot. Median-of-three can be defeated with specific patterns. Always use randomized pivot selection in production code, or use introsort (quicksort with heapsort fallback after recursion depth exceeds 2*log(n)).

- **Assuming stability when the algorithm is unstable**: Quicksort and heapsort are unstable (equal elements may be reordered). If you sort records by last name and then by first name, an unstable sort on first name may scramble the last-name ordering among people with the same first name. Use merge sort or TimSort when stability matters, or include a tiebreaker in the comparison.

- **Stack overflow from quicksort on large sorted arrays**: Without tail-call optimization, quicksort on a sorted array with first-element pivot creates O(n) recursion depth. Even with random pivot, worst-case depth is O(n). Limit recursion depth and switch to heapsort when exceeded (introsort pattern). Alternatively, always recurse into the smaller partition first and iterate on the larger one (tail-call elimination).

- **Allocating auxiliary arrays inside recursive merge sort calls**: Creating a new auxiliary array at each recursive level of merge sort wastes memory and time on allocation. Allocate a single auxiliary array at the top level and pass it through all recursive calls. This reduces memory usage from O(n log n) to O(n) and eliminates GC pressure from repeated allocations.

- **Ignoring the constant factors for small arrays**: For arrays under 20-50 elements, insertion sort outperforms merge sort and quicksort due to lower overhead (no recursion, no auxiliary arrays, simple inner loop). Production sorting algorithms (TimSort, introsort) switch to insertion sort for small subarrays. Failing to do this leaves 10-20% performance on the table.

## Real-World Use Cases

**Database query execution** relies on sorting for ORDER BY clauses, merge joins, duplicate elimination (DISTINCT), and grouping (GROUP BY). PostgreSQL uses external merge sort for large result sets that exceed work_mem, writing sorted runs to temporary files and merging them. The sort operation is often the most expensive step in query execution, and databases invest heavily in sort optimization (sort key compression, abbreviated keys, parallel sort).

**Search engine indexing** sorts posting lists (document IDs containing each term) to enable efficient intersection and union operations during query processing. Building an inverted index requires sorting billions of (term, document_id) pairs. External merge sort handles this at scale, with MapReduce frameworks (Hadoop) providing distributed sorting for web-scale indexes.

**Operating system process scheduling** uses priority queues (heap-based) to select the next process to run. The Linux CFS (Completely Fair Scheduler) maintains processes in a Red-Black tree sorted by virtual runtime. When a process's time slice expires, it is reinserted at its new position, and the leftmost (minimum virtual runtime) process runs next.

**Financial trading systems** sort order books by price to match buyers with sellers. The order book is a sorted structure where buy orders are sorted descending by price and sell orders ascending. When a new order arrives, binary search finds the matching price level. High-frequency trading systems use specialized sorting networks and SIMD-optimized sorts to process millions of orders per second.

**Machine learning data pipelines** sort training examples for curriculum learning (presenting easy examples first), shuffle data for stochastic gradient descent (random permutation is a special case of sorting), and sort predictions for evaluation metrics (AUC-ROC requires sorting by predicted probability). Large-scale ML systems sort terabytes of training data using distributed sorting frameworks.

## Interview Questions

**Q: Compare merge sort and quicksort. When would you choose one over the other?**

A: Merge sort guarantees O(n log n) worst case and is stable, but requires O(n) extra space. Quicksort averages O(n log n) with O(log n) space (in-place) but has O(n²) worst case (mitigated by random pivot). Choose merge sort when stability is required, when sorting linked lists (O(1) merge without extra space), or when worst-case guarantee is needed. Choose quicksort when average-case performance and memory efficiency matter, when sorting arrays in-place, or when cache performance is important (quicksort has better locality).

**Q: Why is the lower bound for comparison-based sorting Ω(n log n)?**

A: Any comparison-based sort must distinguish between all n! possible permutations of the input. Each comparison has two outcomes (less/greater), creating a binary decision tree. A binary tree with n! leaves has height at least log₂(n!) = Ω(n log n) by Stirling's approximation. Therefore, any comparison sort must make at least Ω(n log n) comparisons in the worst case. This does not apply to non-comparison sorts (counting sort, radix sort) that use element values directly.

**Q: Explain how TimSort works and why it is used in Java and Python.**

A: TimSort is a hybrid stable sort that combines merge sort with insertion sort. It identifies existing sorted runs in the data (ascending or descending sequences), extends short runs to a minimum length using insertion sort, then merges runs using a merge strategy that maintains balance (similar to merge sort but adaptive). It achieves O(n) on already-sorted data, O(n log n) worst case, and is stable. It is used because real-world data often has existing order (partially sorted, concatenated sorted sequences) that TimSort exploits for better-than-n-log-n performance.

**Q: How does quickselect find the kth element in O(n) average time?**

A: Quickselect uses the same partition step as quicksort but only recurses into the partition containing the kth element. After partitioning around a random pivot, if k falls in the left partition, recurse left; if in the right partition, recurse right; if in the equal partition, return the pivot. Expected time is O(n) because each level processes a geometrically decreasing fraction of elements: n + n/2 + n/4 + ... = 2n. Worst case is O(n²) but extremely unlikely with random pivot. Median-of-medians guarantees O(n) worst case but has large constants.

## Production Tips

- **Use the language's built-in sort for general-purpose sorting**: Java's Arrays.sort, Python's sorted(), and C++'s std::sort are highly optimized with decades of engineering. They use hybrid algorithms (TimSort, introsort, dual-pivot quicksort) that adapt to input characteristics. Rolling your own sort is only justified for specialized requirements (external sort, parallel sort, sort with custom memory allocation).

- **Consider parallel sort for large arrays on multi-core systems**: Java's Arrays.parallelSort uses a parallel merge sort that splits work across available cores, providing 2-4x speedup on arrays larger than 8192 elements. C++ has std::execution::par policy for parallel algorithms. The threshold for parallel sort benefit depends on element size and comparison cost — profile with realistic data.

- **Use partial sorting when you only need the top-k elements**: If you need the k largest elements from n total, use a min-heap of size k (O(n log k)) or quickselect (O(n) average). Full sorting (O(n log n)) is wasteful when k is much smaller than n. Java's PriorityQueue and Python's heapq.nlargest implement this pattern efficiently.

## Related Topics

- [Non-Comparison and Linear Sorting](./non-comparison-and-linear-sorting.md) — Breaking the Ω(n log n) barrier with value-based sorting
- [Binary Search Patterns](./binary-search-patterns.md) — Searching in sorted arrays produced by these algorithms
- [Arrays and Strings](../arrays-and-strings/index.md) — Array manipulation techniques used in sorting
- [Heap](../fundamental-data-structures/heap.md) — Heap data structure underlying heapsort and partial sort
