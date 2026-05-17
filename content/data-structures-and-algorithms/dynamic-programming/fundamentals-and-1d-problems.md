# Fundamentals and 1D Problems

## Quick Reference

- **Memoization (top-down)**: Recursive with cache, O(n) time for n unique subproblems
- **Tabulation (bottom-up)**: Iterative with table, O(n) time, often better cache behavior
- **Space optimization**: Many 1D DP problems reduce from O(n) to O(1) space using rolling variables
- **Fibonacci**: O(n) time, O(1) space with two variables
- **Climbing stairs (k steps)**: O(n*k) time, O(n) space — generalized Fibonacci
- **House robber**: O(n) time, O(1) space — max sum of non-adjacent elements
- **Maximum subarray (Kadane's)**: O(n) time, O(1) space — local vs global optimum
- **Longest increasing subsequence**: O(n log n) with patience sorting, O(n²) with basic DP
- **Decode ways**: O(n) time, O(1) space — counting valid decodings
- **Key insight**: define state clearly, then derive transition from smaller states

## When to Use

One-dimensional dynamic programming applies when the problem has a linear structure where each position's optimal solution depends on solutions at previous positions. The state is typically a single index (position in array, step number, remaining capacity) and transitions look backward to previously computed states.

Use 1D DP when you need to find the maximum or minimum value achievable by making sequential choices (house robber, stock trading), when counting the number of ways to reach a target through sequential steps (climbing stairs, decode ways), when finding the longest subsequence satisfying a property (longest increasing subsequence, longest valid parentheses), or when the problem has a natural left-to-right processing order where each decision depends only on previous decisions.

The key to solving 1D DP problems is defining the state precisely. Ask yourself: "What does dp[i] represent?" Common state definitions include "the optimal answer considering elements 0 through i," "the optimal answer ending at position i," and "the number of ways to reach state i." The transition relation then follows from how you can arrive at state i from previous states.

Recognize DP opportunities by looking for problems where greedy fails (local optimal choices do not guarantee global optimum), where brute force involves exponential enumeration of choices, and where the problem has the "optimal substructure" property (you can build the optimal solution from optimal solutions to subproblems).

## Code Examples

### Memoization vs Tabulation Comparison

Demonstrating both approaches on the classic Fibonacci problem, showing the trade-offs between recursive elegance and iterative efficiency.

```java
public class DPFundamentals {
    /**
     * Top-down (memoization): natural recursive structure with caching.
     * Pros: only computes needed subproblems, natural problem decomposition.
     * Cons: recursion overhead, potential stack overflow for large n.
     */
    public static long fibMemo(int n) {
        return fibMemoHelper(n, new HashMap<>());
    }

    private static long fibMemoHelper(int n, Map<Integer, Long> memo) {
        if (n <= 1) return n;
        if (memo.containsKey(n)) return memo.get(n);
        long result = fibMemoHelper(n - 1, memo) + fibMemoHelper(n - 2, memo);
        memo.put(n, result);
        return result;
    }

    /**
     * Bottom-up (tabulation): iterative, fills table from base cases.
     * Pros: no recursion overhead, better cache locality, easy to optimize space.
     * Cons: computes all subproblems even if not all needed.
     */
    public static long fibTabulation(int n) {
        if (n <= 1) return n;
        long[] dp = new long[n + 1];
        dp[0] = 0;
        dp[1] = 1;
        for (int i = 2; i <= n; i++) {
            dp[i] = dp[i - 1] + dp[i - 2];
        }
        return dp[n];
    }

    /**
     * Space-optimized: only need previous two values.
     * O(n) time, O(1) space.
     */
    public static long fibOptimized(int n) {
        if (n <= 1) return n;
        long prev2 = 0, prev1 = 1;
        for (int i = 2; i <= n; i++) {
            long curr = prev1 + prev2;
            prev2 = prev1;
            prev1 = curr;
        }
        return prev1;
    }
}
```

```typescript
// Top-down with memoization
function fibMemo(n: number, memo: Map<number, number> = new Map()): number {
  if (n <= 1) return n;
  if (memo.has(n)) return memo.get(n)!;
  const result = fibMemo(n - 1, memo) + fibMemo(n - 2, memo);
  memo.set(n, result);
  return result;
}

// Bottom-up with tabulation
function fibTab(n: number): number {
  if (n <= 1) return n;
  const dp = new Array(n + 1);
  dp[0] = 0;
  dp[1] = 1;
  for (let i = 2; i <= n; i++) {
    dp[i] = dp[i - 1] + dp[i - 2];
  }
  return dp[n];
}

// Space-optimized
function fibOptimal(n: number): number {
  if (n <= 1) return n;
  let prev2 = 0, prev1 = 1;
  for (let i = 2; i <= n; i++) {
    const curr = prev1 + prev2;
    prev2 = prev1;
    prev1 = curr;
  }
  return prev1;
}
```

### House Robber Pattern (Non-Adjacent Selection)

The house robber pattern appears whenever you must select elements from a sequence with the constraint that no two selected elements are adjacent.

```java
public class HouseRobber {
    /**
     * Maximum sum of non-adjacent elements.
     * dp[i] = max(dp[i-1], dp[i-2] + nums[i])
     * Either skip current house (take dp[i-1]) or rob it (dp[i-2] + nums[i]).
     * Time: O(n), Space: O(1)
     */
    public static int rob(int[] nums) {
        if (nums.length == 0) return 0;
        if (nums.length == 1) return nums[0];

        int prev2 = 0;  // dp[i-2]
        int prev1 = 0;  // dp[i-1]

        for (int num : nums) {
            int curr = Math.max(prev1, prev2 + num);
            prev2 = prev1;
            prev1 = curr;
        }
        return prev1;
    }

    /**
     * House Robber II: houses arranged in a circle.
     * Cannot rob both first and last house.
     * Solution: max(rob(0..n-2), rob(1..n-1))
     */
    public static int robCircular(int[] nums) {
        if (nums.length == 1) return nums[0];
        return Math.max(
            robRange(nums, 0, nums.length - 2),
            robRange(nums, 1, nums.length - 1)
        );
    }

    private static int robRange(int[] nums, int start, int end) {
        int prev2 = 0, prev1 = 0;
        for (int i = start; i <= end; i++) {
            int curr = Math.max(prev1, prev2 + nums[i]);
            prev2 = prev1;
            prev1 = curr;
        }
        return prev1;
    }
}
```

### Longest Increasing Subsequence

Two approaches: O(n²) basic DP and O(n log n) patience sorting with binary search.

```java
public class LIS {
    /**
     * O(n^2) DP approach.
     * dp[i] = length of longest increasing subsequence ending at index i.
     * For each i, check all j < i where nums[j] < nums[i].
     */
    public static int lisQuadratic(int[] nums) {
        int n = nums.length;
        int[] dp = new int[n];
        Arrays.fill(dp, 1);  // Each element is a subsequence of length 1
        int maxLen = 1;

        for (int i = 1; i < n; i++) {
            for (int j = 0; j < i; j++) {
                if (nums[j] < nums[i]) {
                    dp[i] = Math.max(dp[i], dp[j] + 1);
                }
            }
            maxLen = Math.max(maxLen, dp[i]);
        }
        return maxLen;
    }

    /**
     * O(n log n) patience sorting approach.
     * Maintain array 'tails' where tails[i] = smallest tail element
     * for increasing subsequence of length i+1.
     * Use binary search to find position for each new element.
     */
    public static int lisOptimal(int[] nums) {
        List<Integer> tails = new ArrayList<>();

        for (int num : nums) {
            int pos = Collections.binarySearch(tails, num);
            if (pos < 0) pos = -(pos + 1);  // Insertion point

            if (pos == tails.size()) {
                tails.add(num);  // Extend longest subsequence
            } else {
                tails.set(pos, num);  // Replace with smaller tail
            }
        }
        return tails.size();
    }
}
```

```java
import java.util.*;

public class LISOptimal {
    /**
     * Longest increasing subsequence in O(n log n) time.
     * Uses patience sorting: maintain tails array where tails[i]
     * is the smallest tail element for increasing subsequence of length i+1.
     */
    public static int lisLength(int[] nums) {
        List<Integer> tails = new ArrayList<>();

        for (int num : nums) {
            int pos = Collections.binarySearch(tails, num);
            if (pos < 0) pos = -(pos + 1); // insertion point
            if (pos == tails.size()) {
                tails.add(num);
            } else {
                tails.set(pos, num);
            }
        }
        return tails.size();
    }

    /**
     * LIS with actual subsequence reconstruction. O(n^2) time.
     */
    public static List<Integer> lisWithReconstruction(int[] nums) {
        int n = nums.length;
        int[] dp = new int[n];
        int[] parent = new int[n];
        Arrays.fill(dp, 1);
        Arrays.fill(parent, -1);

        for (int i = 1; i < n; i++) {
            for (int j = 0; j < i; j++) {
                if (nums[j] < nums[i] && dp[j] + 1 > dp[i]) {
                    dp[i] = dp[j] + 1;
                    parent[i] = j;
                }
            }
        }

        // Find the index of maximum length
        int maxIdx = 0;
        for (int i = 1; i < n; i++) {
            if (dp[i] > dp[maxIdx]) maxIdx = i;
        }

        // Reconstruct the subsequence
        LinkedList<Integer> result = new LinkedList<>();
        while (maxIdx != -1) {
            result.addFirst(nums[maxIdx]);
            maxIdx = parent[maxIdx];
        }
        return result;
    }
}
```

## Common Pitfalls

- **Incorrect state definition leading to wrong transitions**: The most critical step in DP is defining what dp[i] represents. If dp[i] means "best answer for elements 0 to i" versus "best answer ending at i," the transitions are completely different. For LIS, dp[i] must be "longest increasing subsequence ending at i" (not "longest in first i elements") because the transition needs to know the last element to check the increasing property. Always write out the state definition explicitly before coding transitions.

- **Forgetting base cases or initializing incorrectly**: Every DP solution needs correct base cases. For house robber, dp[0] = nums[0] and dp[1] = max(nums[0], nums[1]). Initializing dp[1] = nums[1] (forgetting to consider skipping house 1 and taking house 0) produces wrong answers. For LIS, every element forms a subsequence of length 1, so dp[i] must be initialized to 1, not 0.

- **Not recognizing when space can be optimized**: Many 1D DP problems only look back a fixed number of positions (Fibonacci looks back 2, house robber looks back 2). In these cases, you can replace the full dp array with a constant number of variables, reducing space from O(n) to O(1). Failing to optimize space is not incorrect but wastes memory and may cause issues for very large inputs.

- **Confusing subsequence with subarray**: A subsequence maintains relative order but elements need not be contiguous. A subarray (or substring) requires contiguous elements. LIS is a subsequence problem (elements can be non-adjacent), while maximum subarray sum (Kadane's) is a subarray problem. Using the wrong definition leads to incorrect transitions.

- **Integer overflow in counting problems**: DP problems that count the number of ways (climbing stairs, decode ways) can produce astronomically large numbers. In Java, use long instead of int. In competitive programming, results are often computed modulo 10^9 + 7. Forgetting the modulo operation causes overflow and wrong answers. Apply modulo at each addition, not just at the end.

## Real-World Use Cases

**Text editors and version control** use the longest common subsequence (LCS) algorithm to compute diffs between file versions. The `diff` command, Git's merge algorithm, and code review tools all rely on DP to find the minimum edit script that transforms one file into another. The standard LCS algorithm runs in O(n*m) time and space, with Myers' diff algorithm providing O(n*d) performance where d is the edit distance (fast for similar files).

**Speech recognition and natural language processing** use dynamic programming for sequence alignment and decoding. The Viterbi algorithm (a DP algorithm) finds the most likely sequence of hidden states in a Hidden Markov Model, used for speech-to-text, part-of-speech tagging, and gene finding. CTC (Connectionist Temporal Classification) decoding in modern neural speech recognition also uses DP to find the most likely text given acoustic model outputs.

**Financial portfolio optimization** uses DP to determine optimal asset allocation over time. The problem of maximizing returns subject to risk constraints over multiple time periods has optimal substructure: the best strategy from period t onward depends only on the current portfolio state, not how you arrived there. Stochastic DP handles uncertainty in returns, and approximate DP handles the curse of dimensionality for high-dimensional state spaces.

**Network packet scheduling** in routers uses DP-based algorithms to optimize Quality of Service (QoS). The problem of scheduling packets across multiple queues with different priorities and deadlines reduces to variants of the weighted job scheduling problem, solvable with DP. Real-time systems use these algorithms to guarantee latency bounds for high-priority traffic.

**Game AI and reinforcement learning** use dynamic programming as the foundation for computing optimal policies. Value iteration and policy iteration (both DP algorithms) compute optimal strategies for Markov Decision Processes. While modern RL uses approximations (deep Q-networks, policy gradients) for large state spaces, the underlying theory is DP, and small-state problems are still solved exactly with tabular DP.

## Interview Questions

**Q: Explain the difference between memoization and tabulation. When would you prefer one over the other?**

A: Memoization (top-down) uses recursion with a cache, computing only subproblems reachable from the original problem. Tabulation (bottom-up) iteratively fills a table from base cases to the target. Prefer memoization when not all subproblems are needed (sparse dependency graph), when the recursive structure is natural and hard to linearize, or when the problem has complex state transitions. Prefer tabulation when all subproblems are needed, when you want to avoid recursion overhead and stack overflow risk, when space optimization is important (easier to identify which previous values to keep), or when cache behavior matters (sequential array access is cache-friendly).

**Q: How would you solve the maximum subarray sum problem? What is Kadane's algorithm?**

A: Kadane's algorithm maintains two values: maxEndingHere (best subarray ending at current position) and maxSoFar (global best). At each position, maxEndingHere = max(nums[i], maxEndingHere + nums[i]) — either start a new subarray at i or extend the previous one. Update maxSoFar = max(maxSoFar, maxEndingHere). Time is O(n), space is O(1). The DP insight is that dp[i] (max subarray ending at i) only depends on dp[i-1], enabling the space optimization. This is equivalent to finding the maximum difference in the prefix sum array.

**Q: How do you determine if a problem can be solved with dynamic programming?**

A: Look for two properties. First, optimal substructure: the optimal solution to the problem contains optimal solutions to subproblems (you can express the answer in terms of answers to smaller instances). Second, overlapping subproblems: a naive recursive solution recomputes the same subproblems many times (the recursion tree has repeated nodes). If only optimal substructure exists without overlap, use divide-and-conquer instead. If the problem asks for "minimum cost," "maximum value," "number of ways," or "is it possible," and choices at each step affect future options, DP is likely applicable.

**Q: Solve the coin change problem: given coins of different denominations, find the minimum number of coins to make a target amount.**

A: Define dp[amount] = minimum coins needed to make that amount. Base case: dp[0] = 0. Transition: dp[i] = min(dp[i - coin] + 1) for each coin denomination where i - coin >= 0. Initialize dp[1..target] to infinity. Iterate amounts from 1 to target, trying each coin. If dp[target] remains infinity, the amount cannot be made. Time is O(amount * numCoins), space is O(amount). This is an unbounded knapsack variant where each coin can be used unlimited times.

## Production Tips

- **Use iterative DP with space optimization for production code**: Recursive memoization risks stack overflow on large inputs and has higher constant factors due to function call overhead and hash map lookups. Convert to iterative tabulation and identify the minimum state needed. Most 1D problems need only O(1) extra space (previous 1-2 values). This makes the code more predictable in terms of memory usage and execution time.

- **Consider the problem size when choosing between exact DP and approximation**: Exact DP solutions have polynomial time but the polynomial degree matters. A O(n³) DP on n=10,000 takes 10^12 operations (infeasible). For large instances, consider approximation algorithms (FPTAS for knapsack), heuristics (greedy with bounded error), or problem-specific optimizations (Knuth's optimization, divide-and-conquer optimization) that reduce the polynomial degree.

- **Profile memory allocation patterns in DP implementations**: In garbage-collected languages, creating new arrays or maps for each subproblem generates GC pressure. Pre-allocate the DP table at the start and reuse it. For 2D DP with space optimization (using only two rows), alternate between rows using modular indexing rather than creating new arrays each iteration.

## Related Topics

- [Sequence and String DP](./sequence-and-string-dp.md) — DP patterns for string and sequence problems
- [Knapsack and Subset Problems](./knapsack-and-subset-problems.md) — Selection problems with constraints
- [Grid and Path DP](./grid-and-path-dp.md) — 2D DP on matrices and grids
- [Sorting and Searching](../sorting-and-searching/index.md) — Binary search optimization for LIS
