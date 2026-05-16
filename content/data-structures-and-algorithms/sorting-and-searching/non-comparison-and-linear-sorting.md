# Non-Comparison and Linear Sorting

## Quick Reference

- **Counting Sort**: O(n + k) time, O(k) space — k is the range of values
- **Radix Sort (LSD)**: O(d * (n + b)) time — d digits, base b
- **Radix Sort (MSD)**: O(d * (n + b)) time — recursive, can short-circuit
- **Bucket Sort**: O(n + k) average, O(n²) worst — uniform distribution assumption
- **Pigeonhole Sort**: O(n + k) time — special case of counting sort for dense ranges
- **Key insight**: these algorithms use element values directly, bypassing Ω(n log n) bound
- **Stability**: counting sort and LSD radix sort are stable; bucket sort depends on inner sort
- **When applicable**: integer keys or keys decomposable into digits with bounded range
- **Not applicable**: arbitrary comparison-based ordering, floating point without discretization

## When to Use

Non-comparison sorting algorithms achieve linear O(n) time by exploiting properties of the input values rather than comparing elements pairwise. They bypass the Ω(n log n) lower bound for comparison sorts because they use element values as array indices or digit positions.

Use counting sort when elements are integers (or can be mapped to integers) within a known, bounded range k where k is O(n). It is ideal for sorting characters (k=256), ages (k=150), grades (k=100), or any categorical data with a small number of distinct values. Counting sort is the building block for radix sort.

Use radix sort when elements are integers or strings with a bounded number of digits d and each digit has a bounded range b. It is ideal for sorting 32-bit integers (d=4 bytes, b=256), fixed-length strings, IP addresses, dates, and any data that can be decomposed into a fixed number of bounded components. Radix sort achieves O(n) when d and b are constants.

Use bucket sort when elements are uniformly distributed over a known range (floating-point numbers in [0,1), hash values, uniformly distributed keys). It divides the range into n buckets, distributes elements, sorts each bucket (with insertion sort for small buckets), and concatenates. Average case is O(n) when distribution is uniform.

Avoid non-comparison sorts when the value range k is much larger than n (counting sort wastes space), when elements cannot be decomposed into bounded digits (arbitrary-precision numbers), or when the comparison function is complex and cannot be mapped to integer keys.

## Code Examples

### Counting Sort

The fundamental linear-time sort for bounded integer ranges. Also serves as the stable sort subroutine within radix sort.

```java
public class CountingSort {
    /**
     * Counting sort for non-negative integers in range [0, maxVal].
     * Stable: equal elements maintain their relative order.
     * Time: O(n + k), Space: O(n + k) where k = maxVal + 1
     */
    public static int[] sort(int[] arr, int maxVal) {
        int[] count = new int[maxVal + 1];
        int[] output = new int[arr.length];

        // Count occurrences
        for (int val : arr) {
            count[val]++;
        }

        // Compute cumulative counts (prefix sum)
        for (int i = 1; i <= maxVal; i++) {
            count[i] += count[i - 1];
        }

        // Build output array (iterate in reverse for stability)
        for (int i = arr.length - 1; i >= 0; i--) {
            output[count[arr[i]] - 1] = arr[i];
            count[arr[i]]--;
        }

        return output;
    }

    /**
     * Counting sort on a specific digit (used as subroutine in radix sort).
     * Sorts based on the digit at position 'exp' (1, 10, 100, ...).
     */
    public static void countingSortByDigit(int[] arr, int exp) {
        int n = arr.length;
        int[] output = new int[n];
        int[] count = new int[10];  // Digits 0-9

        for (int val : arr) {
            count[(val / exp) % 10]++;
        }

        for (int i = 1; i < 10; i++) {
            count[i] += count[i - 1];
        }

        for (int i = n - 1; i >= 0; i--) {
            int digit = (arr[i] / exp) % 10;
            output[count[digit] - 1] = arr[i];
            count[digit]--;
        }

        System.arraycopy(output, 0, arr, 0, n);
    }
}
```

```typescript
function countingSort(arr: number[], maxVal: number): number[] {
  const count = new Array(maxVal + 1).fill(0);
  const output = new Array(arr.length);

  for (const val of arr) count[val]++;
  for (let i = 1; i <= maxVal; i++) count[i] += count[i - 1];

  // Reverse iteration for stability
  for (let i = arr.length - 1; i >= 0; i--) {
    output[count[arr[i]] - 1] = arr[i];
    count[arr[i]]--;
  }

  return output;
}
```

### Radix Sort (LSD and MSD)

Radix sort processes digits from least significant to most significant (LSD) or vice versa (MSD), using counting sort as a stable subroutine for each digit position.

```java
public class RadixSort {
    /**
     * LSD Radix Sort: process digits from least significant to most significant.
     * Stable, O(d * (n + b)) where d = number of digits, b = base.
     * For 32-bit integers with base 256: O(4 * (n + 256)) = O(n).
     */
    public static void lsdRadixSort(int[] arr) {
        int max = Arrays.stream(arr).max().orElse(0);

        // Sort by each digit position (1s, 10s, 100s, ...)
        for (int exp = 1; max / exp > 0; exp *= 10) {
            CountingSort.countingSortByDigit(arr, exp);
        }
    }

    /**
     * Byte-based radix sort: uses base 256 for better performance.
     * Processes 4 bytes for 32-bit integers (4 passes).
     * Significantly faster than decimal radix sort due to fewer passes.
     */
    public static void byteRadixSort(int[] arr) {
        int n = arr.length;
        int[] aux = new int[n];

        for (int shift = 0; shift < 32; shift += 8) {
            int[] count = new int[257];  // 256 buckets + 1 for prefix sum

            // Count occurrences of each byte value
            for (int val : arr) {
                int bucket = ((val >> shift) & 0xFF) + 1;
                count[bucket]++;
            }

            // Prefix sum
            for (int i = 1; i < 257; i++) {
                count[i] += count[i - 1];
            }

            // Distribute
            for (int val : arr) {
                int bucket = (val >> shift) & 0xFF;
                aux[count[bucket]++] = val;
            }

            System.arraycopy(aux, 0, arr, 0, n);
        }
    }

    /**
     * MSD Radix Sort for strings: sorts strings lexicographically.
     * Recursive, can short-circuit when bucket has single element.
     * Time: O(n * maxLen) for strings of maximum length maxLen.
     */
    public static void msdRadixSort(String[] arr) {
        msdSort(arr, new String[arr.length], 0, arr.length - 1, 0);
    }

    private static void msdSort(String[] arr, String[] aux, int lo, int hi, int d) {
        if (lo >= hi) return;

        int R = 256;  // ASCII alphabet size
        int[] count = new int[R + 2];

        // Count frequencies (charAt returns -1 for end-of-string)
        for (int i = lo; i <= hi; i++) {
            int c = d < arr[i].length() ? arr[i].charAt(d) + 2 : 1;
            count[c]++;
        }

        // Prefix sums
        for (int r = 0; r < R + 1; r++) count[r + 1] += count[r];

        // Distribute
        for (int i = lo; i <= hi; i++) {
            int c = d < arr[i].length() ? arr[i].charAt(d) + 2 : 1;
            aux[count[c - 1]++] = arr[i];
        }

        // Copy back
        System.arraycopy(aux, 0, arr, lo, hi - lo + 1);

        // Recursively sort each bucket
        for (int r = 0; r < R; r++) {
            msdSort(arr, aux, lo + count[r], lo + count[r + 1] - 1, d + 1);
        }
    }
}
```

### Bucket Sort

Distributes elements into buckets based on value, sorts each bucket, and concatenates. Achieves O(n) when elements are uniformly distributed.

```java
public class BucketSort {
    /**
     * Bucket sort for floating-point numbers in [0, 1).
     * Average: O(n) when uniformly distributed.
     * Worst: O(n²) when all elements fall in one bucket.
     */
    public static void sort(float[] arr) {
        int n = arr.length;
        @SuppressWarnings("unchecked")
        List<Float>[] buckets = new ArrayList[n];

        for (int i = 0; i < n; i++) {
            buckets[i] = new ArrayList<>();
        }

        // Distribute elements into buckets
        for (float val : arr) {
            int bucketIdx = (int) (val * n);
            buckets[bucketIdx].add(val);
        }

        // Sort each bucket (insertion sort for small buckets)
        int idx = 0;
        for (List<Float> bucket : buckets) {
            Collections.sort(bucket);  // O(k log k) per bucket, O(1) average
            for (float val : bucket) {
                arr[idx++] = val;
            }
        }
    }

    /**
     * Bucket sort for integers with known range.
     * Divides range into n buckets of equal width.
     */
    public static void sortIntegers(int[] arr, int minVal, int maxVal) {
        int n = arr.length;
        int range = maxVal - minVal + 1;
        int bucketSize = Math.max(1, range / n);
        int numBuckets = range / bucketSize + 1;

        @SuppressWarnings("unchecked")
        List<Integer>[] buckets = new ArrayList[numBuckets];
        for (int i = 0; i < numBuckets; i++) buckets[i] = new ArrayList<>();

        for (int val : arr) {
            int idx = (val - minVal) / bucketSize;
            buckets[idx].add(val);
        }

        int pos = 0;
        for (List<Integer> bucket : buckets) {
            Collections.sort(bucket);
            for (int val : bucket) arr[pos++] = val;
        }
    }
}
```

```python
def counting_sort(arr: list[int]) -> list[int]:
    """Counting sort for non-negative integers. O(n + k) time."""
    if not arr:
        return []
    max_val = max(arr)
    count = [0] * (max_val + 1)

    for val in arr:
        count[val] += 1

    result = []
    for val, cnt in enumerate(count):
        result.extend([val] * cnt)

    return result

def radix_sort(arr: list[int]) -> list[int]:
    """LSD radix sort for non-negative integers. O(d * n) time."""
    if not arr:
        return []
    max_val = max(arr)
    exp = 1

    while max_val // exp > 0:
        # Stable counting sort on current digit
        buckets: list[list[int]] = [[] for _ in range(10)]
        for val in arr:
            digit = (val // exp) % 10
            buckets[digit].append(val)
        arr = [val for bucket in buckets for val in bucket]
        exp *= 10

    return arr
```

## Common Pitfalls

- **Applying counting sort when the range k is much larger than n**: Counting sort allocates an array of size k. If sorting 1000 elements with values up to 10^9, the count array requires 4GB of memory. Counting sort is only practical when k is O(n) or at most O(n log n). For large ranges with small n, use comparison-based sorting or radix sort (which decomposes large values into bounded digits).

- **Forgetting that radix sort requires a stable subroutine**: LSD radix sort processes digits from least significant to most significant. Each digit-level sort must be stable (preserve relative order of elements with equal digits) for the overall sort to be correct. Using an unstable sort (like quicksort) as the digit-level subroutine produces incorrect results because earlier digit orderings are destroyed.

- **Not handling negative numbers in radix sort**: Standard radix sort assumes non-negative integers. For arrays with negative numbers, either separate negatives and positives (sort each group, concatenate with negatives reversed), or use offset-based approaches (add the minimum value to make all elements non-negative, sort, subtract back). The byte-based approach with sign bit handling is more elegant but requires careful implementation.

- **Assuming bucket sort is always O(n)**: Bucket sort achieves O(n) only when elements are uniformly distributed across buckets. If all elements fall into one bucket, the inner sort dominates at O(n²) or O(n log n). Adversarial inputs (all equal values, clustered distributions) degrade bucket sort to comparison-sort performance. Always verify the distribution assumption before choosing bucket sort.

- **Using decimal radix (base 10) instead of power-of-two radix**: Decimal radix sort requires 10 buckets per pass and ceil(log10(max)) passes. Byte-based radix (base 256) requires 256 buckets but only 4 passes for 32-bit integers, and 8 passes for 64-bit integers. The larger base reduces the number of passes, and powers of two enable bit shifting instead of division, making byte-based radix 3-5x faster in practice.

## Real-World Use Cases

**Database index construction** uses radix sort to build sorted indexes on integer columns (timestamps, IDs, zip codes). When building a B-Tree index on a million-row table with integer keys, radix sort constructs the sorted key sequence in O(n) time versus O(n log n) for comparison sort. Column-oriented databases (ClickHouse, Apache Parquet) use radix sort extensively because their columnar storage naturally groups values of the same type.

**Network packet classification** in high-speed routers uses radix-based lookup structures (tries) to match packets against routing rules. IP addresses are naturally decomposed into bytes, making radix-based approaches ideal. Longest prefix matching for IPv4 routing uses a 256-way trie (one level per byte of the IP address) to achieve O(1) lookup with respect to the number of routing rules.

**Suffix array construction** for text indexing uses radix sort as a subroutine. The DC3/skew algorithm and SA-IS algorithm both use radix sort to sort suffixes by their first few characters in linear time. Since suffixes are strings over a bounded alphabet, radix sort applies directly. This enables O(n) suffix array construction, which is the foundation of compressed full-text indexes (FM-index, used in bioinformatics tools like BWA).

**Graphics rendering pipelines** use radix sort to sort primitives (triangles, particles) by depth for correct transparency rendering. GPU radix sort implementations achieve billions of keys per second by exploiting the massive parallelism of graphics hardware. The fixed-size key (32-bit or 64-bit depth value) makes radix sort ideal, and the parallel prefix sum operation maps naturally to GPU architecture.

**Large-scale data processing** in MapReduce and Spark uses external radix sort for the shuffle phase, where intermediate key-value pairs must be sorted by key before the reduce step. The bounded key space (hash values, partition IDs) makes radix sort applicable. Google's original MapReduce paper describes using multi-pass radix sort for the terabyte-scale sort benchmark.

## Interview Questions

**Q: When would you use counting sort instead of quicksort?**

A: Use counting sort when elements are integers within a bounded range k where k is O(n). Counting sort achieves O(n + k) time versus O(n log n) for quicksort. For example, sorting 1 million exam scores (range 0-100) takes O(n) with counting sort versus O(n log n) with quicksort. However, if k is much larger than n (sorting 100 elements with values up to 10^9), counting sort wastes memory and time on the count array. The crossover point is roughly when k exceeds n * log(n).

**Q: Explain how radix sort achieves O(n) time. Does it violate the Ω(n log n) lower bound?**

A: Radix sort achieves O(d * (n + b)) time where d is the number of digits and b is the base. For fixed-width integers (d and b are constants), this is O(n). It does not violate the Ω(n log n) lower bound because that bound applies only to comparison-based sorts. Radix sort uses element values directly (as array indices via counting sort), not comparisons. The information-theoretic argument (n! permutations requiring log(n!) = Ω(n log n) binary decisions) does not apply because radix sort extracts more than one bit of information per operation.

**Q: How would you sort 1 billion 32-bit integers with limited memory?**

A: Use external radix sort with 4 passes (one per byte). In each pass, distribute elements into 256 buckets based on the current byte, writing buckets to disk. After all elements are distributed, concatenate buckets in order. Each pass reads and writes all data once (O(n) I/O). Total: 4 passes * 2 I/O operations = 8n disk reads/writes. This is faster than external merge sort which requires O(n log(n/M)) I/O where M is memory size. With 1GB memory and 4GB data, merge sort needs about 4 passes while radix sort always needs exactly 4.

**Q: What is the difference between LSD and MSD radix sort?**

A: LSD (Least Significant Digit) processes digits from right to left, using a stable sort at each level. It is non-recursive, processes all elements at every level, and naturally handles variable-length integers (shorter numbers are implicitly zero-padded on the left). MSD (Most Significant Digit) processes digits from left to right recursively, partitioning into buckets and recursing within each bucket. MSD can short-circuit (stop recursing when a bucket has one element) and handles variable-length strings naturally (shorter strings sort before longer ones with the same prefix). LSD is simpler and better for fixed-width keys; MSD is better for strings and can be faster when many elements share long common prefixes.

## Production Tips

- **Use byte-based radix sort with SIMD for maximum throughput**: Modern implementations of radix sort use base-256 (one byte per pass) combined with SIMD instructions for the counting and distribution phases. Intel's IPP library and the Boost.Sort library provide optimized radix sort implementations that achieve 500M+ keys/second on modern CPUs. For 32-bit integers, 4 passes of byte-level radix sort with prefetching outperforms comparison sorts by 3-5x for arrays larger than 10,000 elements.

- **Consider hybrid approaches for real-world data**: Production sorting libraries often combine radix sort for the initial passes (separating elements into coarse buckets) with comparison sort for the final pass (sorting within small buckets). This hybrid approach handles non-uniform distributions better than pure radix sort while still benefiting from the linear-time coarse partitioning. Java's Arrays.sort for byte arrays uses counting sort directly.

- **Profile the distribution before choosing bucket sort**: Bucket sort's O(n) guarantee depends on uniform distribution. In production, add a distribution check (compute variance of bucket sizes after distribution) and fall back to comparison sort if the distribution is skewed. Alternatively, use adaptive bucket boundaries based on a sample of the data (quantile-based bucketing) to handle non-uniform distributions.

## Related Topics

- [Comparison-Based Sorting](./comparison-based-sorting.md) — General-purpose sorting when value-based approaches do not apply
- [Binary Search Patterns](./binary-search-patterns.md) — Searching in sorted output from these algorithms
- [Arrays and Strings](../arrays-and-strings/index.md) — Array operations underlying sort implementations
- [Prefix Sums and Hashing](../arrays-and-strings/prefix-sums-and-hashing.md) — Prefix sum used in counting sort distribution
