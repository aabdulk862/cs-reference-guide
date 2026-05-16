# Two Pointers and Sliding Window

## Quick Reference

- **Two pointers (sorted array)**: O(n) time, O(1) space — converging from both ends
- **Two pointers (fast/slow)**: O(n) time, O(1) space — cycle detection, middle finding
- **Fixed-size sliding window**: O(n) time, O(1) space — max/min/sum of k-element subarrays
- **Variable-size sliding window**: O(n) time, O(k) space — longest/shortest subarray with constraint
- **Shrinkable window pattern**: expand right, shrink left until constraint satisfied
- **Two pointers on two arrays**: O(n + m) merge pattern for sorted arrays
- **Key insight**: both patterns avoid nested loops by maintaining state incrementally
- **Common constraint types**: sum, count, distinct elements, character frequency

## When to Use

The two-pointer and sliding window techniques transform brute-force O(n squared) solutions into O(n) linear-time algorithms by exploiting monotonic properties of the problem. They are applicable whenever you can define a valid window or pair condition that changes predictably as pointers move.

Use two pointers when the array is sorted and you need to find pairs satisfying a condition (two-sum, three-sum, container with most water), when you need to partition or rearrange elements in-place (remove duplicates, move zeros, Dutch National Flag), or when you need to detect cycles in linked structures (Floyd's algorithm).

Use sliding window when you need to find the longest or shortest subarray satisfying a constraint (maximum sum subarray of size k, longest substring without repeating characters), when the constraint involves a running aggregate (sum, product, frequency count) that can be updated incrementally as the window moves, or when you need to count subarrays satisfying a condition.

The key insight is that both techniques maintain a state that changes by a constant amount as pointers advance, avoiding the need to recompute from scratch. This incremental update is what provides the linear time guarantee.

These patterns appear in production systems for stream processing (maintaining rolling statistics over a window of events), network protocols (TCP sliding window for flow control), and real-time analytics (computing moving averages over time-series data).

## Code Examples

### Two Sum on Sorted Array

The classic two-pointer pattern for finding a pair that sums to a target. Pointers converge from both ends based on whether the current sum is too small or too large.

```java
public class TwoPointers {
    /**
     * Finds indices of two numbers in a sorted array that sum to target.
     * Returns [-1, -1] if no such pair exists.
     * Time: O(n), Space: O(1)
     */
    public static int[] twoSum(int[] sorted, int target) {
        int left = 0, right = sorted.length - 1;

        while (left < right) {
            int sum = sorted[left] + sorted[right];
            if (sum == target) {
                return new int[]{left, right};
            } else if (sum < target) {
                left++;   // Need larger sum, move left pointer right
            } else {
                right--;  // Need smaller sum, move right pointer left
            }
        }

        return new int[]{-1, -1};
    }

    /**
     * Three-sum: find all unique triplets that sum to zero.
     * Fix one element, then use two-pointer on the remainder.
     * Time: O(n^2), Space: O(1) excluding output
     */
    public static List<List<Integer>> threeSum(int[] nums) {
        Arrays.sort(nums);
        List<List<Integer>> result = new ArrayList<>();

        for (int i = 0; i < nums.length - 2; i++) {
            if (i > 0 && nums[i] == nums[i - 1]) continue; // Skip duplicates

            int left = i + 1, right = nums.length - 1;
            while (left < right) {
                int sum = nums[i] + nums[left] + nums[right];
                if (sum == 0) {
                    result.add(Arrays.asList(nums[i], nums[left], nums[right]));
                    while (left < right && nums[left] == nums[left + 1]) left++;
                    while (left < right && nums[right] == nums[right - 1]) right--;
                    left++;
                    right--;
                } else if (sum < 0) {
                    left++;
                } else {
                    right--;
                }
            }
        }
        return result;
    }
}
```

```typescript
function twoSum(sorted: number[], target: number): [number, number] | null {
  let left = 0;
  let right = sorted.length - 1;

  while (left < right) {
    const sum = sorted[left] + sorted[right];
    if (sum === target) return [left, right];
    if (sum < target) left++;
    else right--;
  }

  return null;
}

function threeSum(nums: number[]): number[][] {
  nums.sort((a, b) => a - b);
  const result: number[][] = [];

  for (let i = 0; i < nums.length - 2; i++) {
    if (i > 0 && nums[i] === nums[i - 1]) continue;

    let left = i + 1;
    let right = nums.length - 1;

    while (left < right) {
      const sum = nums[i] + nums[left] + nums[right];
      if (sum === 0) {
        result.push([nums[i], nums[left], nums[right]]);
        while (left < right && nums[left] === nums[left + 1]) left++;
        while (left < right && nums[right] === nums[right - 1]) right--;
        left++;
        right--;
      } else if (sum < 0) left++;
      else right--;
    }
  }

  return result;
}
```

### Fixed-Size Sliding Window

Compute the maximum sum of any contiguous subarray of size k. The window slides one position at a time, adding the new element and removing the old one.

```java
public class SlidingWindow {
    /**
     * Maximum sum of any subarray of exactly size k.
     * Time: O(n), Space: O(1)
     */
    public static int maxSumSubarray(int[] arr, int k) {
        if (arr.length < k) throw new IllegalArgumentException("Array smaller than window");

        int windowSum = 0;
        for (int i = 0; i < k; i++) {
            windowSum += arr[i];
        }

        int maxSum = windowSum;
        for (int i = k; i < arr.length; i++) {
            windowSum += arr[i] - arr[i - k];  // Slide: add new, remove old
            maxSum = Math.max(maxSum, windowSum);
        }

        return maxSum;
    }
}
```

### Variable-Size Sliding Window

Find the length of the longest substring without repeating characters. The window expands right and shrinks left when a duplicate is found.

```java
public class VariableWindow {
    /**
     * Longest substring without repeating characters.
     * Time: O(n), Space: O(min(n, alphabet_size))
     */
    public static int lengthOfLongestSubstring(String s) {
        Map<Character, Integer> lastSeen = new HashMap<>();
        int maxLen = 0;
        int left = 0;

        for (int right = 0; right < s.length(); right++) {
            char c = s.charAt(right);
            if (lastSeen.containsKey(c) && lastSeen.get(c) >= left) {
                left = lastSeen.get(c) + 1;  // Shrink window past duplicate
            }
            lastSeen.put(c, right);
            maxLen = Math.max(maxLen, right - left + 1);
        }

        return maxLen;
    }

    /**
     * Minimum window substring: smallest window in s containing all chars of t.
     * Time: O(n), Space: O(t.length)
     */
    public static String minWindow(String s, String t) {
        Map<Character, Integer> need = new HashMap<>();
        for (char c : t.toCharArray()) need.merge(c, 1, Integer::sum);

        int have = 0, required = need.size();
        int left = 0, minLen = Integer.MAX_VALUE, minStart = 0;
        Map<Character, Integer> window = new HashMap<>();

        for (int right = 0; right < s.length(); right++) {
            char c = s.charAt(right);
            window.merge(c, 1, Integer::sum);

            if (need.containsKey(c) && window.get(c).equals(need.get(c))) {
                have++;
            }

            while (have == required) {
                if (right - left + 1 < minLen) {
                    minLen = right - left + 1;
                    minStart = left;
                }
                char leftChar = s.charAt(left);
                window.merge(leftChar, -1, Integer::sum);
                if (need.containsKey(leftChar) && window.get(leftChar) < need.get(leftChar)) {
                    have--;
                }
                left++;
            }
        }

        return minLen == Integer.MAX_VALUE ? "" : s.substring(minStart, minStart + minLen);
    }
}
```

```python
def length_of_longest_substring(s: str) -> int:
    """Longest substring without repeating characters. O(n) time."""
    last_seen: dict[str, int] = {}
    max_len = 0
    left = 0

    for right, char in enumerate(s):
        if char in last_seen and last_seen[char] >= left:
            left = last_seen[char] + 1
        last_seen[char] = right
        max_len = max(max_len, right - left + 1)

    return max_len


def min_window(s: str, t: str) -> str:
    """Minimum window substring containing all characters of t."""
    from collections import Counter

    need = Counter(t)
    have, required = 0, len(need)
    window: dict[str, int] = {}
    result = ""
    min_len = float("inf")
    left = 0

    for right, char in enumerate(s):
        window[char] = window.get(char, 0) + 1
        if char in need and window[char] == need[char]:
            have += 1

        while have == required:
            if right - left + 1 < min_len:
                min_len = right - left + 1
                result = s[left:right + 1]
            left_char = s[left]
            window[left_char] -= 1
            if left_char in need and window[left_char] < need[left_char]:
                have -= 1
            left += 1

    return result
```

## Common Pitfalls

- **Moving both pointers in the same direction when convergence is needed**: In the two-sum pattern on sorted arrays, the left pointer must only move right and the right pointer must only move left. Moving both in the same direction breaks the invariant that all pairs between the pointers have been implicitly considered. The convergence property guarantees that no valid pair is skipped.

- **Not handling the window initialization phase correctly**: For a fixed-size window of size k, the first k-1 iterations are building the initial window and should not produce results. A common bug is checking for maximum or minimum before the window is fully formed, leading to incorrect answers for arrays shorter than k or wrong initial comparisons.

- **Forgetting to shrink the window when the constraint is violated**: In variable-size window problems, the left pointer must advance when the window violates the constraint. Failing to shrink means the window grows indefinitely, producing incorrect longest or shortest results. The shrinking loop should be a while loop (not if), as multiple shrinks may be needed after a single expansion.

- **Off-by-one in window size calculation**: The size of a window from index left to right inclusive is `right - left + 1`, not `right - left`. This error appears frequently in minimum window substring and longest subarray problems, causing results to be one element too short.

- **Using the wrong data structure for window state**: Tracking character frequencies with an array of size 26 works for lowercase English letters but fails for Unicode strings. Using a HashMap handles arbitrary character sets but adds overhead. Choose the state structure based on the actual input constraints, and document the assumption.

## Real-World Use Cases

The sliding window pattern is fundamental to **TCP flow control**, where the sender maintains a window of unacknowledged packets. The window size adjusts dynamically based on network congestion (congestion window) and receiver capacity (receive window). This is literally called the "sliding window protocol" in networking literature, and understanding the algorithmic pattern helps debug network performance issues.

In **stream processing systems** like Apache Kafka Streams and Apache Flink, windowed aggregations compute rolling statistics (count, sum, average, percentiles) over time-based or count-based windows. Tumbling windows (fixed, non-overlapping), sliding windows (fixed, overlapping), and session windows (variable, gap-based) all derive from the sliding window pattern. Production systems process millions of events per second using these patterns.

**Rate limiting** in API gateways uses sliding window counters to enforce request quotas. A fixed window counter (reset every minute) allows burst traffic at window boundaries. A sliding window log (tracking each request timestamp) is precise but memory-intensive. The sliding window counter approximation combines both approaches, using the previous window's count weighted by overlap percentage.

**Real-time analytics dashboards** compute moving averages, rolling percentiles, and trend detection using sliding windows over time-series data. Financial trading systems compute VWAP (Volume Weighted Average Price) and Bollinger Bands using fixed-size windows over price data, where the window slides with each new tick.

**DNA sequence analysis** uses sliding windows to compute GC content (percentage of G and C nucleotides) across a genome, identify CpG islands, and find open reading frames. The window size is typically 100-1000 base pairs, and the algorithm must process genomes with billions of positions efficiently.

## Interview Questions

**Q: How would you find the longest substring with at most k distinct characters?**

A: Use a variable-size sliding window with a HashMap tracking character frequencies. Expand the right pointer, adding characters to the map. When the map size exceeds k, shrink from the left by decrementing frequencies and removing characters with zero count. Track the maximum window size throughout. Time is O(n) because each character is added and removed at most once. Space is O(k) for the frequency map.

**Q: Given an array of positive integers, find the minimum length subarray with sum greater than or equal to a target. What if the array contains negative numbers?**

A: For positive integers, use a variable-size sliding window. Expand right to increase the sum, shrink left when sum meets the target while tracking minimum length. Time is O(n) because both pointers move at most n times total. For negative numbers, the sliding window breaks because shrinking does not guarantee sum decrease. Instead, use prefix sums with binary search (O(n log n)) or a deque-based approach maintaining a monotonic prefix sum queue.

**Q: How does the container with most water problem use two pointers?**

A: Start with pointers at both ends of the height array. The area between two lines is min(height[left], height[right]) times (right minus left). Always move the pointer pointing to the shorter line inward, because moving the taller line can only decrease the width without possibility of increasing the height constraint. This greedy choice is correct because the shorter line is the bottleneck, and keeping it while reducing width can never improve the answer. Time is O(n), space is O(1).

**Q: Explain how you would count the number of subarrays with sum equal to k (array may contain negatives).**

A: This is not a pure sliding window problem due to negative numbers. Use prefix sums with a HashMap. For each index, compute the running prefix sum. The number of subarrays ending at the current index with sum k equals the number of previous prefix sums equal to (current prefix sum minus k). Store prefix sum frequencies in a HashMap. Time is O(n), space is O(n). This technique is called the "prefix sum + hash map" pattern.

## Production Tips

- **Use ring buffers for fixed-size sliding windows in streaming systems**: When computing rolling statistics over the last N events, a ring buffer (circular array) provides O(1) insertion and removal without memory allocation. Pre-allocate the buffer at startup and overwrite the oldest entry on each new event. This eliminates garbage collection pauses in latency-sensitive systems like trading platforms and real-time monitoring.

- **Batch window updates for throughput**: In high-throughput stream processing, updating window state for every single event creates CPU overhead from function call and cache invalidation. Batch multiple events (micro-batching) and update the window state once per batch. Apache Spark Structured Streaming uses this approach, trading latency for throughput. Choose batch size based on your latency SLA.

- **Consider approximate algorithms for large windows**: When the window contains millions of elements and you need percentiles or distinct counts, exact computation requires O(window_size) memory. Approximate data structures like Count-Min Sketch (frequency estimation), HyperLogLog (cardinality), and t-digest (percentiles) provide bounded-error answers with O(1) or O(log n) memory regardless of window size.

## Related Topics

- [Array Fundamentals](./array-fundamentals.md) — Core array operations that two-pointer patterns build upon
- [String Manipulation](./string-manipulation.md) — Sliding window applied to substring problems
- [Prefix Sums and Hashing](./prefix-sums-and-hashing.md) — Complementary technique for range queries
- [Sorting and Searching](../sorting-and-searching/index.md) — Two pointers often require sorted input
