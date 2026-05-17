# Prefix Sums and Hashing

## Quick Reference

- **Prefix sum build**: O(n) time, O(n) space — precompute cumulative sums
- **Range sum query**: O(1) time after O(n) preprocessing — sum(i, j) = prefix[j+1] - prefix[i]
- **2D prefix sum build**: O(n*m) time, O(n*m) space — inclusion-exclusion principle
- **2D range sum query**: O(1) time — four prefix sum lookups with inclusion-exclusion
- **Hash map lookup**: O(1) average, O(n) worst — amortized constant time
- **Rolling hash**: O(1) per slide after O(m) initialization — polynomial hash with modular arithmetic
- **Frequency counting**: O(n) time, O(k) space — count occurrences of k distinct elements
- **Two-sum with hash map**: O(n) time, O(n) space — complement lookup pattern
- **Subarray sum equals k**: O(n) time, O(n) space — prefix sum + hash map combination

## When to Use

Prefix sums and hashing are precomputation techniques that trade space for time, converting repeated O(n) range queries into O(1) lookups. They are complementary: prefix sums handle additive range queries over ordered sequences, while hash maps handle frequency counting, existence checking, and complement finding over unordered data.

Use prefix sums when you need to answer multiple range sum queries on a static array, when computing running totals or cumulative statistics, when solving subarray problems where the constraint involves a sum or count (subarray sum equals k, number of subarrays with sum in range), or when working with 2D grids where you need rectangular region sums (image processing, matrix queries).

Use hash maps when you need O(1) lookup for complement values (two-sum pattern), when counting frequencies of elements to detect duplicates, anagrams, or majority elements, when grouping elements by some computed key (group anagrams, bucket sort), or when you need to track the last-seen index of elements (longest subarray with distinct elements, first non-repeating character).

The combination of prefix sums with hash maps is particularly powerful. The "prefix sum + hash map" pattern solves problems like "count subarrays with sum equal to k" in O(n) time by storing prefix sum frequencies and looking up complements. This pattern appears frequently in interview problems and production analytics.

These techniques are foundational in database query engines (range scans, aggregations), stream processing (running statistics), image processing (integral images for feature detection), and competitive programming (offline range queries).

## Code Examples

### Prefix Sum Array for Range Queries

The prefix sum array enables O(1) range sum queries after O(n) preprocessing. The key insight is that sum(i, j) equals the cumulative sum up to j minus the cumulative sum up to i-1.

```java
public class PrefixSum {
    private final long[] prefix;

    /**
     * Builds prefix sum array from input.
     * prefix[i] = sum of arr[0..i-1], prefix[0] = 0
     * Time: O(n), Space: O(n)
     */
    public PrefixSum(int[] arr) {
        prefix = new long[arr.length + 1];
        for (int i = 0; i < arr.length; i++) {
            prefix[i + 1] = prefix[i] + arr[i];
        }
    }

    /**
     * Returns sum of elements from index left to right (inclusive).
     * Time: O(1)
     */
    public long rangeSum(int left, int right) {
        return prefix[right + 1] - prefix[left];
    }

    /**
     * Count subarrays with sum equal to target.
     * Uses prefix sum + hash map pattern.
     * Time: O(n), Space: O(n)
     */
    public static int subarraySum(int[] nums, int target) {
        Map<Long, Integer> prefixCount = new HashMap<>();
        prefixCount.put(0L, 1);  // Empty prefix has sum 0
        long currentSum = 0;
        int count = 0;

        for (int num : nums) {
            currentSum += num;
            // If (currentSum - target) was a previous prefix sum,
            // then the subarray between them sums to target
            count += prefixCount.getOrDefault(currentSum - target, 0);
            prefixCount.merge(currentSum, 1, Integer::sum);
        }
        return count;
    }
}
```

```typescript
class PrefixSum {
  private prefix: number[];

  constructor(arr: number[]) {
    this.prefix = new Array(arr.length + 1).fill(0);
    for (let i = 0; i < arr.length; i++) {
      this.prefix[i + 1] = this.prefix[i] + arr[i];
    }
  }

  rangeSum(left: number, right: number): number {
    return this.prefix[right + 1] - this.prefix[left];
  }
}

function subarraySum(nums: number[], target: number): number {
  const prefixCount = new Map<number, number>();
  prefixCount.set(0, 1);
  let currentSum = 0;
  let count = 0;

  for (const num of nums) {
    currentSum += num;
    count += prefixCount.get(currentSum - target) ?? 0;
    prefixCount.set(currentSum, (prefixCount.get(currentSum) ?? 0) + 1);
  }
  return count;
}
```

### 2D Prefix Sum (Integral Image)

The 2D prefix sum enables O(1) rectangular region sum queries using the inclusion-exclusion principle. This technique is called an "integral image" in computer vision.

```java
public class PrefixSum2D {
    private final long[][] prefix;

    /**
     * Builds 2D prefix sum matrix.
     * prefix[i][j] = sum of all elements in matrix[0..i-1][0..j-1]
     * Time: O(rows * cols), Space: O(rows * cols)
     */
    public PrefixSum2D(int[][] matrix) {
        int rows = matrix.length, cols = matrix[0].length;
        prefix = new long[rows + 1][cols + 1];

        for (int i = 1; i <= rows; i++) {
            for (int j = 1; j <= cols; j++) {
                prefix[i][j] = matrix[i - 1][j - 1]
                    + prefix[i - 1][j]
                    + prefix[i][j - 1]
                    - prefix[i - 1][j - 1];  // Inclusion-exclusion
            }
        }
    }

    /**
     * Sum of elements in rectangle from (r1,c1) to (r2,c2) inclusive.
     * Time: O(1)
     */
    public long regionSum(int r1, int c1, int r2, int c2) {
        return prefix[r2 + 1][c2 + 1]
            - prefix[r1][c2 + 1]
            - prefix[r2 + 1][c1]
            + prefix[r1][c1];
    }
}
```

```java
/**
 * Alternative 2D prefix sum implementation using static methods.
 * Demonstrates the inclusion-exclusion principle for rectangular queries.
 */
public class PrefixSum2DStatic {
    /**
     * Build 2D prefix sum from matrix.
     * Returns (rows+1) x (cols+1) array with zero-padding.
     */
    public static long[][] build(int[][] matrix) {
        int rows = matrix.length, cols = matrix[0].length;
        long[][] prefix = new long[rows + 1][cols + 1];

        for (int i = 1; i <= rows; i++) {
            for (int j = 1; j <= cols; j++) {
                prefix[i][j] = matrix[i - 1][j - 1]
                    + prefix[i - 1][j]
                    + prefix[i][j - 1]
                    - prefix[i - 1][j - 1];
            }
        }
        return prefix;
    }

    /**
     * Query sum of rectangle (r1,c1) to (r2,c2) inclusive.
     * Uses inclusion-exclusion on the prefix array.
     */
    public static long regionSum(long[][] prefix, int r1, int c1, int r2, int c2) {
        return prefix[r2 + 1][c2 + 1]
            - prefix[r1][c2 + 1]
            - prefix[r2 + 1][c1]
            + prefix[r1][c1];
    }
}
```

### Hash Map Patterns for Array Problems

Hash maps enable O(1) complement lookups, frequency counting, and index tracking that transform quadratic algorithms into linear ones.

```java
public class HashMapPatterns {
    /**
     * Two Sum: find indices of two numbers that sum to target.
     * Time: O(n), Space: O(n)
     */
    public static int[] twoSum(int[] nums, int target) {
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

    /**
     * Longest subarray with sum equal to k (handles negatives).
     * Stores first occurrence of each prefix sum.
     * Time: O(n), Space: O(n)
     */
    public static int longestSubarrayWithSum(int[] nums, int k) {
        Map<Long, Integer> firstOccurrence = new HashMap<>();
        firstOccurrence.put(0L, -1);  // Empty prefix at index -1
        long sum = 0;
        int maxLen = 0;

        for (int i = 0; i < nums.length; i++) {
            sum += nums[i];
            if (firstOccurrence.containsKey(sum - k)) {
                maxLen = Math.max(maxLen, i - firstOccurrence.get(sum - k));
            }
            firstOccurrence.putIfAbsent(sum, i);  // Only store first occurrence
        }
        return maxLen;
    }

    /**
     * Find majority element (appears more than n/2 times).
     * Boyer-Moore Voting Algorithm: O(n) time, O(1) space.
     */
    public static int majorityElement(int[] nums) {
        int candidate = nums[0], count = 1;
        for (int i = 1; i < nums.length; i++) {
            if (count == 0) {
                candidate = nums[i];
                count = 1;
            } else if (nums[i] == candidate) {
                count++;
            } else {
                count--;
            }
        }
        return candidate;  // Assumes majority element exists
    }
}
```

```java
import java.util.*;
import java.util.stream.Collectors;

public class HashMapPatternsAlt {
    /**
     * Two Sum: find indices of two numbers that sum to target.
     * Time: O(n), Space: O(n)
     */
    public static int[] twoSum(int[] nums, int target) {
        Map<Integer, Integer> seen = new HashMap<>();
        for (int i = 0; i < nums.length; i++) {
            int complement = target - nums[i];
            if (seen.containsKey(complement)) {
                return new int[]{seen.get(complement), i};
            }
            seen.put(nums[i], i);
        }
        return null;
    }

    /**
     * Longest subarray with sum equal to k. Handles negatives.
     * Stores first occurrence of each prefix sum.
     * Time: O(n), Space: O(n)
     */
    public static int longestSubarrayWithSum(int[] nums, int k) {
        Map<Long, Integer> firstOccurrence = new HashMap<>();
        firstOccurrence.put(0L, -1);
        long currentSum = 0;
        int maxLen = 0;

        for (int i = 0; i < nums.length; i++) {
            currentSum += nums[i];
            if (firstOccurrence.containsKey(currentSum - k)) {
                maxLen = Math.max(maxLen, i - firstOccurrence.get(currentSum - k));
            }
            firstOccurrence.putIfAbsent(currentSum, i);
        }
        return maxLen;
    }

    /**
     * Group elements by their frequency. O(n) time.
     * Returns map of frequency -> list of elements with that frequency.
     */
    public static Map<Integer, List<Integer>> groupByFrequency(int[] nums) {
        Map<Integer, Integer> freq = new HashMap<>();
        for (int num : nums) {
            freq.merge(num, 1, Integer::sum);
        }

        Map<Integer, List<Integer>> groups = new HashMap<>();
        for (Map.Entry<Integer, Integer> entry : freq.entrySet()) {
            groups.computeIfAbsent(entry.getValue(), k -> new ArrayList<>())
                  .add(entry.getKey());
        }
        return groups;
    }
}
```

## Common Pitfalls

- **Off-by-one errors in prefix sum indexing**: The prefix sum array has length n+1 where prefix[0] = 0 and prefix[i] = sum of first i elements. The range sum from index left to right inclusive is prefix[right+1] - prefix[left], not prefix[right] - prefix[left-1]. Confusing 0-indexed array positions with 1-indexed prefix positions is the most common source of bugs. Draw out a small example and verify the formula before coding.

- **Integer overflow in cumulative sums**: When computing prefix sums over arrays with large values, the cumulative sum can overflow 32-bit integers. Use long (64-bit) for prefix sum arrays even when the input is int. For 2D prefix sums over large matrices, overflow is even more likely because values accumulate quadratically. In competitive programming, this is a frequent source of wrong answers on large test cases.

- **Forgetting to initialize the hash map with the empty prefix**: In the "prefix sum + hash map" pattern for counting subarrays with sum k, you must initialize the map with {0: 1} (or {0: -1} for longest subarray). This accounts for subarrays starting at index 0. Without this initialization, you miss all subarrays that start from the beginning of the array and sum to the target.

- **Using mutable objects as hash map keys**: In Java, using arrays or mutable lists as HashMap keys causes lookup failures because the hash code changes when the object is modified. Use immutable keys (String, Integer, or create defensive copies). In Python, lists are unhashable; convert to tuples for use as dictionary keys. This pitfall appears when trying to use frequency arrays as keys for grouping anagrams.

- **Assuming hash map operations are always O(1)**: Hash map operations are O(1) amortized average case, but O(n) worst case when many keys hash to the same bucket. In adversarial settings (competitive programming, security-sensitive code), use randomized hash functions or tree-based maps. Java 8+ HashMap uses balanced trees for buckets exceeding 8 entries, providing O(log n) worst case, but this adds constant-factor overhead.

## Real-World Use Cases

**Database query engines** use prefix sums extensively for range aggregations. When a SQL query requests `SUM(column) WHERE id BETWEEN x AND y`, the engine can precompute prefix sums over sorted data to answer in O(1) per query. Columnar databases like ClickHouse and Apache Druid maintain pre-aggregated prefix sums at multiple granularities (minute, hour, day) for time-series analytics, enabling sub-second responses over billions of rows.

**Computer vision and image processing** use integral images (2D prefix sums) for rapid feature computation. The Viola-Jones face detection algorithm computes Haar-like features using rectangular region sums, evaluating thousands of features per image window in constant time each. Without integral images, real-time face detection in video streams would be computationally infeasible. OpenCV's `integral()` function implements this for production use.

**Network monitoring and anomaly detection** systems maintain rolling prefix sums over packet counts, byte volumes, and error rates. When traffic exceeds a threshold over any time window, alerts fire. The prefix sum structure allows checking arbitrary time ranges without re-scanning raw data. Systems like Prometheus and Grafana use similar precomputation for dashboard queries over time-series metrics.

**Caching and memoization layers** in web applications use hash maps as the fundamental data structure. Redis, Memcached, and application-level caches all provide O(1) key-value lookup. The hash map pattern of "check cache, compute if missing, store result" appears in every production system. Understanding hash collision behavior and load factor tuning directly impacts cache hit rates and tail latency.

**Financial analytics platforms** compute running totals, moving averages, and cumulative returns using prefix sums over time-series price data. Portfolio value at any point is a prefix sum of daily returns. Risk metrics like maximum drawdown require prefix maximum arrays. These computations run over millions of data points and must complete within milliseconds for real-time trading dashboards.

## Interview Questions

**Q: Given an array of integers, find the number of subarrays with sum equal to k. The array may contain negative numbers.**

A: Use the prefix sum plus hash map pattern. Maintain a running prefix sum and a hash map counting how many times each prefix sum value has occurred. For each position, the number of subarrays ending here with sum k equals the count of previous prefix sums equal to (current prefix sum minus k). Initialize the map with {0: 1} to handle subarrays starting at index 0. Time is O(n), space is O(n). This works with negative numbers because we are not using a sliding window (which requires monotonicity) but rather algebraic properties of prefix sums.

**Q: How would you find the contiguous subarray with the largest sum (Kadane's algorithm)? How does it relate to prefix sums?**

A: Kadane's algorithm maintains the maximum subarray sum ending at each position: maxEndingHere = max(nums[i], maxEndingHere + nums[i]). Track the global maximum across all positions. Time is O(n), space is O(1). The connection to prefix sums is that the maximum subarray sum equals max(prefix[j] - prefix[i]) for all j greater than i, which is equivalent to finding the maximum difference in the prefix sum array where the smaller value comes first. Kadane's algorithm implicitly tracks the minimum prefix sum seen so far.

**Q: Design a data structure that supports range sum queries and point updates efficiently.**

A: A plain prefix sum array supports O(1) queries but O(n) updates (must rebuild the suffix). For dynamic data, use a Fenwick tree (Binary Indexed Tree) which provides O(log n) for both point updates and prefix sum queries, or a segment tree which additionally supports range updates and arbitrary range queries. The Fenwick tree uses the binary representation of indices to determine parent-child relationships, storing partial sums at each node. It requires only n elements of storage and has excellent cache behavior due to its array-based structure.

**Q: How would you find the longest subarray with equal numbers of 0s and 1s in a binary array?**

A: Transform the problem by replacing 0s with -1s. Now the problem becomes finding the longest subarray with sum 0. Use the prefix sum plus hash map pattern: compute running prefix sums and store the first occurrence of each sum value. When the same prefix sum appears again at a later index, the subarray between those indices has sum 0 (equal 0s and 1s). The answer is the maximum difference between indices with the same prefix sum. Initialize with {0: -1} to handle subarrays starting at index 0. Time and space are both O(n).

## Production Tips

- **Use Fenwick trees for dynamic prefix sums in production**: When the underlying array changes frequently (real-time analytics, leaderboards, inventory systems), a static prefix sum array requires O(n) rebuilding on each update. A Fenwick tree (Binary Indexed Tree) provides O(log n) point updates and O(log n) prefix queries with minimal memory overhead (just an array of size n). It is simpler to implement and has better cache behavior than segment trees for this specific use case.

- **Choose hash map implementations based on access patterns**: Java's HashMap uses chaining with tree-based buckets for collision handling. For high-throughput systems, consider open-addressing implementations (Eclipse Collections IntObjectHashMap, Koloboke) that avoid pointer chasing and reduce garbage collection pressure. In C++, absl::flat_hash_map provides better cache behavior than std::unordered_map. Profile with realistic key distributions before choosing.

- **Pre-aggregate at multiple granularities for time-series queries**: Instead of computing prefix sums over raw data for every query, maintain pre-aggregated sums at multiple time granularities (second, minute, hour, day). A query for "total over the last 7 days" combines 7 daily aggregates instead of scanning millions of raw records. This is the approach used by time-series databases like InfluxDB and TimescaleDB, trading storage for query speed.

## Related Topics

- [Array Fundamentals](./array-fundamentals.md) — Core array operations that prefix sums build upon
- [Two Pointers and Sliding Window](./two-pointers-and-sliding-window.md) — Alternative O(n) technique for range problems with monotonic constraints
- [String Matching Algorithms](./string-matching-algorithms.md) — Rolling hash (Rabin-Karp) uses similar hashing principles
- [Sorting and Searching](../sorting-and-searching/index.md) — Binary search on prefix sums for threshold queries
