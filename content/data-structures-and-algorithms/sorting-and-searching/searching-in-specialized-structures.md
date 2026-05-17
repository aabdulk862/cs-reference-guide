# Searching in Specialized Structures

## Quick Reference

- **Search in sorted matrix (row+col sorted)**: O(m + n) — staircase search from corner
- **Search in row-sorted matrix**: O(m * log n) — binary search each row
- **Search in fully sorted matrix**: O(log(m*n)) — treat as flattened sorted array
- **Search in infinite sorted array**: O(log k) where k is target position — exponential expansion
- **Kth smallest in sorted matrix**: O(n * log(max-min)) — binary search on value
- **Median of two sorted arrays**: O(log(min(m,n))) — binary search on partition
- **Search with unknown comparator**: O(log n) — determine order then search
- **Exponential search**: O(log k) — find range then binary search within
- **Ternary search**: O(log n) — find peak/valley in unimodal function
- **Key insight**: exploit structural properties to reduce search space efficiently

## When to Use

Searching in specialized structures extends binary search principles to non-standard data organizations. The key insight remains the same — exploit structural properties to eliminate large portions of the search space — but the specific technique varies with the structure.

Use staircase search (O(m+n)) when the matrix is sorted both row-wise and column-wise (each row sorted left-to-right, each column sorted top-to-bottom). Start from the top-right or bottom-left corner and eliminate one row or column at each step.

Use binary search on value when finding the kth element in a structure where you can efficiently count elements less than a given value (kth smallest in sorted matrix, kth smallest pair sum). Binary search on the answer value, using the count as the feasibility predicate.

Use exponential search when the array is unbounded or the target position is unknown. Double the search range until you overshoot, then binary search within the last range. This achieves O(log k) where k is the target position, which is optimal when k is much smaller than n.

Use the median of two sorted arrays technique when you need to find a partition point that divides two arrays into equal halves with all left elements smaller than all right elements. This is one of the most elegant binary search applications.

## Code Examples

### Search in Sorted Matrix

Three variants depending on the matrix's sorting properties: fully sorted (flattened), row-and-column sorted (staircase), and row-sorted (per-row binary search).

```java
public class MatrixSearch {
    /**
     * Search in matrix where rows and columns are individually sorted.
     * Start from top-right corner:
     * - If target < current: move left (eliminate column)
     * - If target > current: move down (eliminate row)
     * Time: O(m + n), Space: O(1)
     */
    public static boolean searchMatrix(int[][] matrix, int target) {
        if (matrix.length == 0) return false;
        int row = 0, col = matrix[0].length - 1;

        while (row < matrix.length && col >= 0) {
            if (matrix[row][col] == target) return true;
            if (matrix[row][col] > target) col--;  // Too large, go left
            else row++;  // Too small, go down
        }
        return false;
    }

    /**
     * Search in matrix where each row is sorted AND first element of each row
     * is greater than last element of previous row (fully sorted when flattened).
     * Treat as 1D sorted array of m*n elements.
     * Time: O(log(m*n))
     */
    public static boolean searchFullySorted(int[][] matrix, int target) {
        int m = matrix.length, n = matrix[0].length;
        int left = 0, right = m * n - 1;

        while (left <= right) {
            int mid = left + (right - left) / 2;
            int val = matrix[mid / n][mid % n];  // Convert 1D index to 2D
            if (val == target) return true;
            if (val < target) left = mid + 1;
            else right = mid - 1;
        }
        return false;
    }

    /**
     * Kth smallest element in a sorted matrix (rows and columns sorted).
     * Binary search on the value: find smallest value with at least k elements <= it.
     * Time: O(n * log(max - min)), Space: O(1)
     */
    public static int kthSmallest(int[][] matrix, int k) {
        int n = matrix.length;
        int left = matrix[0][0], right = matrix[n - 1][n - 1];

        while (left < right) {
            int mid = left + (right - left) / 2;
            int count = countLessOrEqual(matrix, mid);
            if (count < k) left = mid + 1;
            else right = mid;
        }
        return left;
    }

    private static int countLessOrEqual(int[][] matrix, int target) {
        int n = matrix.length;
        int count = 0, col = n - 1;

        for (int row = 0; row < n; row++) {
            while (col >= 0 && matrix[row][col] > target) col--;
            count += col + 1;
        }
        return count;
    }
}
```

```typescript
function searchSortedMatrix(matrix: number[][], target: number): boolean {
  if (matrix.length === 0) return false;
  let row = 0;
  let col = matrix[0].length - 1;

  while (row < matrix.length && col >= 0) {
    if (matrix[row][col] === target) return true;
    if (matrix[row][col] > target) col--;
    else row++;
  }
  return false;
}

function kthSmallest(matrix: number[][], k: number): number {
  const n = matrix.length;
  let left = matrix[0][0];
  let right = matrix[n - 1][n - 1];

  while (left < right) {
    const mid = left + Math.floor((right - left) / 2);
    let count = 0;
    let col = n - 1;
    for (let row = 0; row < n; row++) {
      while (col >= 0 && matrix[row][col] > mid) col--;
      count += col + 1;
    }
    if (count < k) left = mid + 1;
    else right = mid;
  }
  return left;
}
```

### Median of Two Sorted Arrays

One of the most elegant binary search applications: finding the median by binary searching on the partition point of the shorter array.

```java
public class MedianSortedArrays {
    /**
     * Find median of two sorted arrays in O(log(min(m,n))) time.
     * Binary search on partition of shorter array.
     * Partition divides both arrays into left and right halves
     * such that all left elements <= all right elements.
     */
    public static double findMedianSortedArrays(int[] nums1, int[] nums2) {
        // Ensure nums1 is the shorter array
        if (nums1.length > nums2.length) {
            return findMedianSortedArrays(nums2, nums1);
        }

        int m = nums1.length, n = nums2.length;
        int left = 0, right = m;

        while (left <= right) {
            int partition1 = left + (right - left) / 2;
            int partition2 = (m + n + 1) / 2 - partition1;

            int maxLeft1 = partition1 == 0 ? Integer.MIN_VALUE : nums1[partition1 - 1];
            int minRight1 = partition1 == m ? Integer.MAX_VALUE : nums1[partition1];
            int maxLeft2 = partition2 == 0 ? Integer.MIN_VALUE : nums2[partition2 - 1];
            int minRight2 = partition2 == n ? Integer.MAX_VALUE : nums2[partition2];

            if (maxLeft1 <= minRight2 && maxLeft2 <= minRight1) {
                // Found correct partition
                if ((m + n) % 2 == 0) {
                    return (Math.max(maxLeft1, maxLeft2) +
                            Math.min(minRight1, minRight2)) / 2.0;
                } else {
                    return Math.max(maxLeft1, maxLeft2);
                }
            } else if (maxLeft1 > minRight2) {
                right = partition1 - 1;  // Move partition1 left
            } else {
                left = partition1 + 1;   // Move partition1 right
            }
        }
        throw new IllegalArgumentException("Input arrays are not sorted");
    }
}
```

### Exponential Search and Infinite Array Search

Searching in unbounded or very large arrays where the target position is unknown, using exponential range expansion followed by binary search.

```java
public class ExponentialSearch {
    /**
     * Exponential search: find target in sorted array.
     * First find range [i/2, i] containing target by doubling i.
     * Then binary search within that range.
     * Time: O(log k) where k is target's position.
     * Better than binary search when target is near the beginning.
     */
    public static int exponentialSearch(int[] arr, int target) {
        if (arr[0] == target) return 0;

        int i = 1;
        while (i < arr.length && arr[i] <= target) {
            i *= 2;
        }

        // Binary search in range [i/2, min(i, n-1)]
        int left = i / 2, right = Math.min(i, arr.length - 1);
        while (left <= right) {
            int mid = left + (right - left) / 2;
            if (arr[mid] == target) return mid;
            if (arr[mid] < target) left = mid + 1;
            else right = mid - 1;
        }
        return -1;
    }

    /**
     * Search in an "infinite" sorted array (ArrayReader interface).
     * Cannot use .length; out-of-bounds returns Integer.MAX_VALUE.
     * Use exponential search to find bounds, then binary search.
     */
    public static int searchInfinite(InfiniteArray reader, int target) {
        // Find range containing target
        int left = 0, right = 1;
        while (reader.get(right) < target) {
            left = right;
            right *= 2;
        }

        // Binary search within range
        while (left <= right) {
            int mid = left + (right - left) / 2;
            int val = reader.get(mid);
            if (val == target) return mid;
            if (val < target) left = mid + 1;
            else right = mid - 1;
        }
        return -1;
    }

    interface InfiniteArray {
        int get(int index);  // Returns MAX_VALUE for out-of-bounds
    }

    /**
     * Ternary search: find maximum of unimodal function.
     * Divides range into thirds, eliminates one third each step.
     * Time: O(log n) with base 3/2
     */
    public static double ternarySearchMax(DoubleUnaryOperator f, double left, double right) {
        for (int i = 0; i < 200; i++) {  // Sufficient iterations for precision
            double m1 = left + (right - left) / 3;
            double m2 = right - (right - left) / 3;
            if (f.applyAsDouble(m1) < f.applyAsDouble(m2)) {
                left = m1;
            } else {
                right = m2;
            }
        }
        return (left + right) / 2;
    }
}
```

```java
public class SpecializedSearch {
    /**
     * Exponential search: find target using exponential expansion + binary search.
     * O(log k) time where k is the position of the target.
     * Useful when target is near the beginning of a large sorted array.
     */
    public static int exponentialSearch(int[] arr, int target) {
        if (arr[0] == target) return 0;

        int i = 1;
        while (i < arr.length && arr[i] <= target) {
            i *= 2;
        }

        // Binary search in [i/2, min(i, n-1)]
        int left = i / 2, right = Math.min(i, arr.length - 1);
        while (left <= right) {
            int mid = left + (right - left) / 2;
            if (arr[mid] == target) return mid;
            if (arr[mid] < target) left = mid + 1;
            else right = mid - 1;
        }
        return -1;
    }

    /**
     * Median of two sorted arrays. O(log(min(m,n))) time.
     * Uses binary search on the shorter array's partition point.
     */
    public static double findMedianSortedArrays(int[] nums1, int[] nums2) {
        // Ensure nums1 is the shorter array
        if (nums1.length > nums2.length) {
            int[] temp = nums1; nums1 = nums2; nums2 = temp;
        }

        int m = nums1.length, n = nums2.length;
        int left = 0, right = m;

        while (left <= right) {
            int p1 = (left + right) / 2;
            int p2 = (m + n + 1) / 2 - p1;

            int maxLeft1 = (p1 == 0) ? Integer.MIN_VALUE : nums1[p1 - 1];
            int minRight1 = (p1 == m) ? Integer.MAX_VALUE : nums1[p1];
            int maxLeft2 = (p2 == 0) ? Integer.MIN_VALUE : nums2[p2 - 1];
            int minRight2 = (p2 == n) ? Integer.MAX_VALUE : nums2[p2];

            if (maxLeft1 <= minRight2 && maxLeft2 <= minRight1) {
                if ((m + n) % 2 == 0) {
                    return (Math.max(maxLeft1, maxLeft2)
                          + Math.min(minRight1, minRight2)) / 2.0;
                }
                return Math.max(maxLeft1, maxLeft2);
            } else if (maxLeft1 > minRight2) {
                right = p1 - 1;
            } else {
                left = p1 + 1;
            }
        }
        throw new IllegalArgumentException("Arrays not sorted");
    }
}
```

## Common Pitfalls

- **Using the wrong corner for staircase search**: The staircase search on a row-and-column sorted matrix must start from the top-right or bottom-left corner. Starting from top-left or bottom-right does not work because both directions (right and down from top-left) increase values, providing no way to eliminate a row or column. The correct corners have one increasing and one decreasing direction.

- **Incorrect partition calculation in median of two sorted arrays**: The partition of the second array must be calculated as `(m + n + 1) / 2 - partition1` to ensure the left half has the correct number of elements. Using `(m + n) / 2` instead of `(m + n + 1) / 2` produces wrong results for odd total lengths. The +1 ensures the left half gets the extra element when the total is odd.

- **Not handling edge cases in matrix search**: Empty matrices, single-element matrices, and matrices where the target is outside the value range all need explicit handling. The staircase search naturally handles these (the while loop condition fails immediately), but the fully-sorted binary search needs bounds checking on the flattened index conversion.

- **Exponential search overshooting into invalid memory**: When doubling the search range, the index can exceed array bounds. Always cap the right boundary at `min(i, arr.length - 1)` before performing binary search. For the infinite array variant, the interface must handle out-of-bounds gracefully (returning MAX_VALUE or throwing).

- **Confusing row-and-column sorted with fully sorted matrices**: A matrix where each row is sorted and each column is sorted is NOT the same as a matrix that is fully sorted when flattened. In a row-and-column sorted matrix, the first element of row i+1 may be less than the last element of row i. Using the flattened binary search on a row-and-column sorted matrix produces incorrect results.

## Real-World Use Cases

**Database multi-dimensional indexing** uses matrix-like search patterns for range queries on multiple columns. A query like "find records where age BETWEEN 25 AND 35 AND salary BETWEEN 50000 AND 80000" searches a 2D space. R-Trees and KD-Trees generalize the staircase search concept to arbitrary dimensions, enabling efficient multi-dimensional range queries in spatial databases (PostGIS, MongoDB geospatial).

**Distributed systems coordination** uses binary search on sorted partitions for data lookup. Apache Kafka consumers use binary search on offset indexes to find messages by timestamp. Cassandra's SSTables use binary search on partition keys within sorted string tables. The "search in infinite array" pattern applies to append-only logs where the total size is unknown and growing.

**Image processing and computer vision** uses matrix search patterns for template matching and feature detection. Integral images (2D prefix sums) combined with binary search enable efficient threshold-based feature detection. The staircase search pattern appears in algorithms that process sorted distance matrices for nearest-neighbor queries.

**Merge operations in distributed computing** use the median-of-two-sorted-arrays technique when combining sorted results from multiple nodes. MapReduce shuffle phases, distributed sort-merge joins, and parallel merge sort all need to find partition boundaries that divide data evenly across workers. The binary search on partition technique enables O(log n) boundary finding instead of O(n) linear merge.

**Time-series databases** use exponential search for temporal queries. When searching for events at a specific timestamp in a time-ordered log, exponential search finds the approximate position quickly (O(log k) where k is the distance from the start), which is faster than binary search (O(log n)) when recent events are queried more frequently than old ones. InfluxDB and TimescaleDB use similar techniques for time-range queries.

## Interview Questions

**Q: How would you search for a target in a matrix where each row and column is sorted?**

A: Use the staircase search starting from the top-right corner. If the current element equals the target, return true. If it is greater than the target, move left (eliminate the current column since all elements below are larger). If it is less than the target, move down (eliminate the current row since all elements to the left are smaller). Each step eliminates one row or column, giving O(m + n) time. This works because the top-right corner is simultaneously the maximum of its row and minimum of its column.

**Q: Explain how to find the median of two sorted arrays in O(log(min(m,n))) time.**

A: Binary search on the partition point of the shorter array. A valid partition divides both arrays into left and right halves where: (1) left half has exactly (m+n+1)/2 elements total, and (2) max(left elements) <= min(right elements). Binary search on partition1 (0 to m), compute partition2 = (m+n+1)/2 - partition1. Check if maxLeft1 <= minRight2 AND maxLeft2 <= minRight1. If maxLeft1 is too large, move partition1 left. If maxLeft2 is too large, move partition1 right. The median is max(maxLeft1, maxLeft2) for odd total, or average of max-left and min-right for even total.

**Q: When would you use exponential search instead of binary search?**

A: Use exponential search when the target is likely near the beginning of a large or unbounded array. Exponential search finds the range containing the target in O(log k) time where k is the target's position, then binary searches within that range in O(log k) time. Total is O(log k), which is better than binary search's O(log n) when k is much smaller than n. Applications include searching in infinite/streaming data, searching in arrays where most queries target recent elements, and as a building block for self-adjusting data structures.

**Q: How do you find the kth smallest element in a sorted matrix?**

A: Binary search on the value. The search range is [matrix[0][0], matrix[n-1][n-1]]. For each candidate value mid, count how many elements are <= mid using the staircase technique (O(n) per count). If count < k, the answer is larger (left = mid + 1). If count >= k, the answer might be mid or smaller (right = mid). This converges to the kth smallest value in O(n * log(max - min)) time. The key insight is that even though mid might not exist in the matrix, the binary search converges to an actual matrix value because the count function has discrete jumps at matrix values.

## Production Tips

- **Use SIMD-accelerated search for large sorted arrays**: Modern CPUs can compare 16-32 elements simultaneously using SIMD instructions (AVX2, AVX-512). For large sorted arrays with frequent lookups, SIMD binary search or SIMD linear search within cache lines provides 2-4x speedup over scalar binary search. Libraries like Boost.SIMD and compiler auto-vectorization can generate these instructions automatically for simple comparison loops.

- **Consider cache-oblivious layouts for frequently searched matrices**: Standard row-major matrix layout causes cache misses during column traversal in staircase search. For matrices that are searched frequently, consider storing in a cache-oblivious layout (Z-order curve, Hilbert curve) that keeps spatially close elements close in memory. This improves cache hit rates for 2D range queries by 2-5x on large matrices.

- **Implement adaptive search based on access patterns**: If your application searches the same sorted structure with varying query distributions, track query positions and adapt the search strategy. For queries clustered near the beginning, use exponential search. For uniform queries, use standard binary search. For queries with temporal locality, use interpolation search with a cached last-position hint.

## Related Topics

- [Binary Search Patterns](./binary-search-patterns.md) — Foundational binary search techniques this topic extends
- [Comparison-Based Sorting](./comparison-based-sorting.md) — Sorting that produces the structures searched here
- [Arrays and Strings](../arrays-and-strings/index.md) — Array fundamentals underlying matrix representations
- [Trees and Graphs](../trees-and-graphs/index.md) — Tree-based search structures (BST, B-Tree) as alternatives
