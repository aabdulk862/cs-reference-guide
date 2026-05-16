# Binary Search Patterns

## Quick Reference

- **Classic binary search**: O(log n) time, O(1) space — find exact target in sorted array
- **Lower bound (first occurrence)**: O(log n) — leftmost position where target could be inserted
- **Upper bound (last occurrence)**: O(log n) — rightmost position after all occurrences of target
- **Search on answer (parametric)**: O(log(range) * verify) — binary search on the answer space
- **Rotated sorted array search**: O(log n) — identify sorted half, search accordingly
- **Peak finding**: O(log n) — find local maximum in bitonic array
- **Minimum in rotated array**: O(log n) — find rotation point
- **Search insert position**: O(log n) — where to insert to maintain sorted order
- **Key insight**: binary search applies whenever the search space has a monotonic property
- **Invariant**: maintain the property that the answer is always within [left, right]

## When to Use

Binary search applies far beyond simple element lookup in sorted arrays. The core insight is that binary search works on any search space where you can determine which half contains the answer based on a condition evaluated at the midpoint. This generalization — called "binary search on the answer" or "parametric search" — is one of the most powerful algorithmic techniques.

Use classic binary search when finding an element in a sorted array, finding insertion position, or finding the first/last occurrence of a value. Use binary search on the answer when the problem asks for the minimum or maximum value satisfying a condition, and you can verify whether a candidate answer is feasible in polynomial time (minimize maximum distance, maximize minimum value, find threshold).

Use binary search on rotated or modified sorted arrays when the array has a known structure that preserves partial ordering (rotated sorted array, bitonic array, mountain array). Use binary search with custom predicates when the search space is not a simple array but any monotonic function (square root computation, finding the day when cumulative sum exceeds threshold).

The key to applying binary search is identifying the monotonic property: there exists a boundary where the predicate changes from false to true (or vice versa), and binary search finds that boundary. If you can phrase your problem as "find the smallest x such that condition(x) is true," binary search likely applies.

## Code Examples

### Classic Binary Search Variants

The three fundamental binary search patterns: exact match, lower bound (first occurrence), and upper bound (past last occurrence).

```java
public class BinarySearch {
    /**
     * Standard binary search: find index of target, or -1 if not found.
     * Invariant: if target exists, it is in arr[left..right].
     */
    public static int search(int[] arr, int target) {
        int left = 0, right = arr.length - 1;
        while (left <= right) {
            int mid = left + (right - left) / 2;
            if (arr[mid] == target) return mid;
            if (arr[mid] < target) left = mid + 1;
            else right = mid - 1;
        }
        return -1;
    }

    /**
     * Lower bound: first index where arr[i] >= target.
     * Returns insertion point if target not present.
     * Equivalent to C++ lower_bound, Python bisect_left.
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

    /**
     * Upper bound: first index where arr[i] > target.
     * Equivalent to C++ upper_bound, Python bisect_right.
     */
    public static int upperBound(int[] arr, int target) {
        int left = 0, right = arr.length;
        while (left < right) {
            int mid = left + (right - left) / 2;
            if (arr[mid] <= target) left = mid + 1;
            else right = mid;
        }
        return left;
    }

    /**
     * Count occurrences of target in sorted array.
     * Uses upper_bound - lower_bound.
     */
    public static int countOccurrences(int[] arr, int target) {
        return upperBound(arr, target) - lowerBound(arr, target);
    }

    /**
     * Find first and last position of target.
     */
    public static int[] searchRange(int[] arr, int target) {
        int first = lowerBound(arr, target);
        if (first == arr.length || arr[first] != target) return new int[]{-1, -1};
        int last = upperBound(arr, target) - 1;
        return new int[]{first, last};
    }
}
```

```typescript
function lowerBound(arr: number[], target: number): number {
  let left = 0, right = arr.length;
  while (left < right) {
    const mid = left + Math.floor((right - left) / 2);
    if (arr[mid] < target) left = mid + 1;
    else right = mid;
  }
  return left;
}

function upperBound(arr: number[], target: number): number {
  let left = 0, right = arr.length;
  while (left < right) {
    const mid = left + Math.floor((right - left) / 2);
    if (arr[mid] <= target) left = mid + 1;
    else right = mid;
  }
  return left;
}
```

### Binary Search on the Answer (Parametric Search)

The most powerful binary search pattern: instead of searching in an array, search over the space of possible answers using a feasibility check.

```java
public class ParametricSearch {
    /**
     * Minimize the maximum distance between adjacent gas stations.
     * Given stations[] and k additional stations to place,
     * find the minimum possible maximum gap.
     * Binary search on the answer (the maximum gap value).
     */
    public static double minMaxGap(int[] stations, int k) {
        double left = 0, right = stations[stations.length - 1] - stations[0];

        // Binary search on the answer: minimum gap that is achievable
        for (int iter = 0; iter < 100; iter++) {  // 100 iterations for precision
            double mid = (left + right) / 2;
            if (canAchieveGap(stations, k, mid)) {
                right = mid;  // Can achieve this gap, try smaller
            } else {
                left = mid;   // Cannot achieve, need larger gap
            }
        }
        return left;
    }

    private static boolean canAchieveGap(int[] stations, int k, double maxGap) {
        int stationsNeeded = 0;
        for (int i = 1; i < stations.length; i++) {
            double gap = stations[i] - stations[i - 1];
            stationsNeeded += (int) (gap / maxGap);  // Stations needed to fill this gap
        }
        return stationsNeeded <= k;
    }

    /**
     * Koko eating bananas: minimum eating speed to finish in h hours.
     * Binary search on speed: find minimum speed where total hours <= h.
     */
    public static int minEatingSpeed(int[] piles, int h) {
        int left = 1, right = Arrays.stream(piles).max().orElse(1);

        while (left < right) {
            int mid = left + (right - left) / 2;
            if (canFinish(piles, h, mid)) {
                right = mid;  // Can finish at this speed, try slower
            } else {
                left = mid + 1;  // Too slow, need faster
            }
        }
        return left;
    }

    private static boolean canFinish(int[] piles, int h, int speed) {
        int hours = 0;
        for (int pile : piles) {
            hours += (pile + speed - 1) / speed;  // Ceiling division
        }
        return hours <= h;
    }

    /**
     * Split array largest sum: minimize the largest sum when splitting
     * array into m subarrays.
     */
    public static int splitArray(int[] nums, int m) {
        int left = Arrays.stream(nums).max().orElse(0);
        int right = Arrays.stream(nums).sum();

        while (left < right) {
            int mid = left + (right - left) / 2;
            if (canSplit(nums, m, mid)) {
                right = mid;
            } else {
                left = mid + 1;
            }
        }
        return left;
    }

    private static boolean canSplit(int[] nums, int m, int maxSum) {
        int splits = 1, currentSum = 0;
        for (int num : nums) {
            if (currentSum + num > maxSum) {
                splits++;
                currentSum = num;
                if (splits > m) return false;
            } else {
                currentSum += num;
            }
        }
        return true;
    }
}
```

### Rotated Sorted Array Search

Searching in arrays that have been rotated, requiring identification of the sorted half at each step.

```java
public class RotatedArraySearch {
    /**
     * Search in rotated sorted array (no duplicates).
     * At each step, one half is guaranteed to be sorted.
     * Determine which half is sorted, check if target is in that half.
     * Time: O(log n)
     */
    public static int search(int[] nums, int target) {
        int left = 0, right = nums.length - 1;

        while (left <= right) {
            int mid = left + (right - left) / 2;
            if (nums[mid] == target) return mid;

            // Left half is sorted
            if (nums[left] <= nums[mid]) {
                if (target >= nums[left] && target < nums[mid]) {
                    right = mid - 1;  // Target in sorted left half
                } else {
                    left = mid + 1;   // Target in right half
                }
            }
            // Right half is sorted
            else {
                if (target > nums[mid] && target <= nums[right]) {
                    left = mid + 1;   // Target in sorted right half
                } else {
                    right = mid - 1;  // Target in left half
                }
            }
        }
        return -1;
    }

    /**
     * Find minimum in rotated sorted array.
     * The minimum is at the rotation point.
     * Time: O(log n)
     */
    public static int findMin(int[] nums) {
        int left = 0, right = nums.length - 1;

        while (left < right) {
            int mid = left + (right - left) / 2;
            if (nums[mid] > nums[right]) {
                left = mid + 1;  // Minimum is in right half
            } else {
                right = mid;     // Minimum is in left half (including mid)
            }
        }
        return nums[left];
    }

    /**
     * Find peak element: element greater than its neighbors.
     * Binary search on the slope: move toward the ascending side.
     * Time: O(log n)
     */
    public static int findPeakElement(int[] nums) {
        int left = 0, right = nums.length - 1;

        while (left < right) {
            int mid = left + (right - left) / 2;
            if (nums[mid] < nums[mid + 1]) {
                left = mid + 1;  // Peak is to the right (ascending)
            } else {
                right = mid;     // Peak is to the left or at mid (descending)
            }
        }
        return left;
    }
}
```

```python
from bisect import bisect_left, bisect_right

def search_rotated(nums: list[int], target: int) -> int:
    """Search in rotated sorted array. O(log n) time."""
    left, right = 0, len(nums) - 1

    while left <= right:
        mid = (left + right) // 2
        if nums[mid] == target:
            return mid

        if nums[left] <= nums[mid]:  # Left half sorted
            if nums[left] <= target < nums[mid]:
                right = mid - 1
            else:
                left = mid + 1
        else:  # Right half sorted
            if nums[mid] < target <= nums[right]:
                left = mid + 1
            else:
                right = mid - 1

    return -1

def min_eating_speed(piles: list[int], h: int) -> int:
    """Binary search on answer: minimum speed to eat all bananas in h hours."""
    left, right = 1, max(piles)

    while left < right:
        mid = (left + right) // 2
        hours = sum((pile + mid - 1) // mid for pile in piles)
        if hours <= h:
            right = mid
        else:
            left = mid + 1

    return left
```

## Common Pitfalls

- **Off-by-one errors in loop condition and boundary updates**: The most common binary search bug. Using `left <= right` with `right = mid` causes infinite loops (when left == right == mid). Using `left < right` with `right = mid - 1` may skip the answer. The safe patterns are: (1) `left <= right` with `left = mid + 1` and `right = mid - 1` for exact search, or (2) `left < right` with `left = mid + 1` and `right = mid` for lower bound. Choose one pattern and stick with it consistently.

- **Integer overflow in midpoint calculation**: Computing `mid = (left + right) / 2` overflows when left + right exceeds Integer.MAX_VALUE. Always use `mid = left + (right - left) / 2`. This bug existed in Java's standard library binary search for 9 years before being discovered. In languages with arbitrary-precision integers (Python), this is not an issue.

- **Applying binary search when the predicate is not monotonic**: Binary search requires that the predicate transitions from false to true (or true to false) exactly once across the search space. If the predicate oscillates (true, false, true, false), binary search may converge to any transition point or miss the answer entirely. Always verify monotonicity before applying binary search.

- **Not handling duplicates in rotated array search**: The standard rotated array search assumes no duplicates. With duplicates, when nums[left] == nums[mid] == nums[right], you cannot determine which half is sorted. The fix is to shrink the window (left++, right--) in this case, degrading worst-case to O(n). Failing to handle this case produces incorrect results on inputs like [1,1,1,0,1,1].

- **Using wrong precision termination for floating-point binary search**: For floating-point binary search (square root, minimize maximum gap), using `left < right` never terminates due to floating-point precision. Use a fixed number of iterations (100 iterations gives 2^-100 precision) or check `right - left < epsilon` with an appropriate epsilon. Too few iterations give imprecise answers; too many waste time.

## Real-World Use Cases

**Database query optimization** uses binary search extensively. B-Tree index lookups perform binary search within each node to find the correct child pointer. Range queries use lower_bound and upper_bound to identify the start and end of matching ranges. The query optimizer uses binary search on statistics (histograms) to estimate selectivity and choose between index scan and sequential scan.

**System configuration tuning** uses binary search on the answer to find optimal parameters. Finding the maximum request rate a server can handle before latency exceeds an SLA is a parametric search problem: binary search on the rate, with a load test as the feasibility check. Similarly, finding the minimum number of replicas needed to achieve a target availability uses binary search on replica count with a reliability model as the predicate.

**Version control bisection** (git bisect) uses binary search to find the commit that introduced a bug. Given a known-good commit and a known-bad commit, it checks the midpoint commit and narrows the range based on whether the bug is present. This finds the culprit in O(log n) tests instead of O(n) linear search through commit history.

**Competitive programming and algorithm design** uses binary search on the answer as a meta-technique. Problems like "minimize the maximum load across k workers" or "maximize the minimum distance between placed objects" are naturally solved by binary searching on the answer value and checking feasibility with a greedy algorithm. This pattern appears in hundreds of competitive programming problems.

**Machine learning hyperparameter tuning** uses binary search variants to find optimal learning rates, regularization strengths, and threshold values. When the metric is unimodal (increases then decreases as the parameter changes), ternary search or golden section search finds the optimum. When the metric has a monotonic feasibility boundary, binary search finds the threshold.

## Interview Questions

**Q: Explain the difference between lower_bound and upper_bound. When would you use each?**

A: Lower_bound finds the first position where arr[i] >= target (leftmost insertion point). Upper_bound finds the first position where arr[i] > target (past the last occurrence). Use lower_bound to find the first occurrence of a value, the insertion point for maintaining sorted order, or the start of a range. Use upper_bound to find the position after the last occurrence, enabling count = upper_bound - lower_bound. Together they define the range [lower_bound, upper_bound) containing all occurrences of target.

**Q: How would you search in a rotated sorted array?**

A: At each step, compare nums[mid] with nums[left] to determine which half is sorted. If nums[left] <= nums[mid], the left half is sorted; check if target falls in [nums[left], nums[mid]) and narrow accordingly. Otherwise, the right half is sorted; check if target falls in (nums[mid], nums[right]] and narrow accordingly. This works because rotation preserves one sorted half at every split. Time is O(log n). With duplicates, add a check for nums[left] == nums[mid] == nums[right] and shrink boundaries.

**Q: What is binary search on the answer? Give an example.**

A: Binary search on the answer searches over the space of possible answer values rather than array indices. You need: (1) a bounded answer range [lo, hi], (2) a monotonic feasibility predicate (if answer x is feasible, all answers > x are also feasible, or vice versa), and (3) an efficient feasibility check. Example: "minimum speed to eat all bananas in h hours." Binary search on speed from 1 to max(piles). For each candidate speed, check if total hours <= h (greedy check in O(n)). Total time: O(n * log(max_pile)).

**Q: How do you find the square root of a number using binary search?**

A: Binary search on the answer in range [0, x]. For each midpoint, check if mid*mid <= x. If yes, the answer is at least mid (move left up). If no, the answer is less than mid (move right down). For integer square root, use `left < right` with `left = mid + 1` when mid*mid <= x and `right = mid` otherwise, returning left - 1. For floating-point, iterate a fixed number of times (50-100) for sufficient precision. Handle edge cases: sqrt(0) = 0, sqrt(1) = 1, and for x < 1 the search range is [x, 1] not [0, x].

## Production Tips

- **Use language-standard binary search implementations**: Java's Arrays.binarySearch, C++'s std::lower_bound/upper_bound, and Python's bisect module are thoroughly tested and optimized. They handle edge cases correctly and use branchless implementations on modern hardware. Only implement custom binary search when you need a non-standard predicate or the standard library does not support your data structure.

- **Add bounds checking and input validation in production binary search**: Production code should validate that the array is actually sorted (or at least check a sample), handle empty arrays gracefully, and document the behavior for duplicate elements. A binary search that silently returns wrong results on unsorted input is worse than one that throws an exception.

- **Consider interpolation search for uniformly distributed data**: When keys are uniformly distributed (database IDs, timestamps), interpolation search estimates the target position proportionally: pos = left + (target - arr[left]) * (right - left) / (arr[right] - arr[left]). This achieves O(log log n) average time for uniform distributions but degrades to O(n) for adversarial inputs. Use it when you can verify the distribution assumption.

## Related Topics

- [Comparison-Based Sorting](./comparison-based-sorting.md) — Sorting algorithms that produce the sorted arrays binary search operates on
- [Non-Comparison and Linear Sorting](./non-comparison-and-linear-sorting.md) — Alternative sorting for specialized inputs
- [Searching in Specialized Structures](./searching-in-specialized-structures.md) — Binary search extended to matrices and custom structures
- [Arrays and Strings](../arrays-and-strings/index.md) — Array fundamentals underlying binary search
