# Knapsack and Subset Problems

## Quick Reference

- **0/1 Knapsack**: O(n*W) time, O(W) space — each item used at most once
- **Unbounded Knapsack**: O(n*W) time, O(W) space — items can be reused
- **Subset Sum**: O(n*S) time, O(S) space — does a subset sum to target?
- **Coin Change (min coins)**: O(n*amount) time, O(amount) space — unbounded variant
- **Coin Change (count ways)**: O(n*amount) time, O(amount) space — order-independent counting
- **Partition Equal Subset Sum**: O(n*S/2) time — reduce to subset sum with target S/2
- **Target Sum (+/- assignment)**: O(n*S) time — reduce to subset sum
- **Bounded Knapsack**: O(n*W*log(max_count)) with binary representation
- **Key insight**: "include or exclude" decision at each item creates the recurrence
- **Pseudo-polynomial**: O(n*W) is polynomial in n but exponential in bits of W

## When to Use

Knapsack and subset problems arise whenever you must select items from a collection to optimize a value subject to a capacity or target constraint. The fundamental decision at each item is binary: include it or exclude it. This "take or skip" structure creates the overlapping subproblems that DP exploits.

Use 0/1 knapsack when each item can be selected at most once and you want to maximize value within a weight capacity (resource allocation, portfolio selection, cargo loading). Use unbounded knapsack when items can be selected multiple times (coin change, rod cutting, buying items with unlimited stock).

Use subset sum when you need to determine whether a subset of numbers can achieve an exact target (budget allocation, load balancing, cryptographic attacks on knapsack-based encryption). Use partition problems when you need to divide items into groups with equal or constrained sums (fair division, parallel job scheduling, game theory).

Recognize knapsack structure by looking for: a set of items with associated values and weights/costs, a constraint on total weight/cost, and an objective to maximize total value or determine feasibility. The constraint converts what would be a simple greedy problem (take everything) into one requiring careful selection.

These problems are NP-hard in general (when W is exponential in the input size), but the pseudo-polynomial DP solution is efficient when W is bounded. For large W, use approximation algorithms (FPTAS) or branch-and-bound.

## Code Examples

### 0/1 Knapsack

The classic optimization problem: select items to maximize value without exceeding weight capacity, where each item can be used at most once.

```java
public class Knapsack {
    /**
     * 0/1 Knapsack: maximize value within weight capacity.
     * dp[w] = maximum value achievable with capacity w.
     * Process items in outer loop, capacity in REVERSE (to prevent reuse).
     * Time: O(n*W), Space: O(W)
     */
    public static int knapsack01(int[] weights, int[] values, int capacity) {
        int[] dp = new int[capacity + 1];

        for (int i = 0; i < weights.length; i++) {
            // Iterate capacity in reverse to ensure each item used at most once
            for (int w = capacity; w >= weights[i]; w--) {
                dp[w] = Math.max(dp[w], dp[w - weights[i]] + values[i]);
            }
        }
        return dp[capacity];
    }

    /**
     * 0/1 Knapsack with item selection tracking.
     * Returns both maximum value and selected item indices.
     */
    public static int[] knapsackWithItems(int[] weights, int[] values, int capacity) {
        int n = weights.length;
        int[][] dp = new int[n + 1][capacity + 1];

        for (int i = 1; i <= n; i++) {
            for (int w = 0; w <= capacity; w++) {
                dp[i][w] = dp[i - 1][w];  // Don't take item i
                if (weights[i - 1] <= w) {
                    dp[i][w] = Math.max(dp[i][w],
                        dp[i - 1][w - weights[i - 1]] + values[i - 1]);
                }
            }
        }

        // Backtrack to find selected items
        List<Integer> selected = new ArrayList<>();
        int w = capacity;
        for (int i = n; i > 0; i--) {
            if (dp[i][w] != dp[i - 1][w]) {
                selected.add(i - 1);
                w -= weights[i - 1];
            }
        }
        return selected.stream().mapToInt(Integer::intValue).toArray();
    }
}
```

```typescript
function knapsack01(weights: number[], values: number[], capacity: number): number {
  const dp = new Array(capacity + 1).fill(0);

  for (let i = 0; i < weights.length; i++) {
    // Reverse iteration prevents using same item twice
    for (let w = capacity; w >= weights[i]; w--) {
      dp[w] = Math.max(dp[w], dp[w - weights[i]] + values[i]);
    }
  }
  return dp[capacity];
}
```

### Coin Change Variants

Two classic variants: minimum number of coins to make an amount (optimization), and number of ways to make an amount (counting).

```java
public class CoinChange {
    /**
     * Minimum coins to make amount (unbounded knapsack variant).
     * dp[i] = minimum coins needed to make amount i.
     * Time: O(coins.length * amount), Space: O(amount)
     */
    public static int minCoins(int[] coins, int amount) {
        int[] dp = new int[amount + 1];
        Arrays.fill(dp, amount + 1);  // Use amount+1 as "infinity"
        dp[0] = 0;

        for (int i = 1; i <= amount; i++) {
            for (int coin : coins) {
                if (coin <= i && dp[i - coin] + 1 < dp[i]) {
                    dp[i] = dp[i - coin] + 1;
                }
            }
        }
        return dp[amount] > amount ? -1 : dp[amount];
    }

    /**
     * Count number of ways to make amount (combinations, not permutations).
     * Outer loop over coins ensures each combination counted once.
     * Time: O(coins.length * amount), Space: O(amount)
     */
    public static int countWays(int[] coins, int amount) {
        int[] dp = new int[amount + 1];
        dp[0] = 1;  // One way to make amount 0: use no coins

        // Coins in outer loop = combinations (order doesn't matter)
        for (int coin : coins) {
            for (int i = coin; i <= amount; i++) {
                dp[i] += dp[i - coin];
            }
        }
        return dp[amount];
    }

    /**
     * Count permutations (order matters) — different from combinations.
     * Amount in outer loop allows reordering.
     */
    public static int countPermutations(int[] coins, int amount) {
        int[] dp = new int[amount + 1];
        dp[0] = 1;

        // Amount in outer loop = permutations (order matters)
        for (int i = 1; i <= amount; i++) {
            for (int coin : coins) {
                if (coin <= i) {
                    dp[i] += dp[i - coin];
                }
            }
        }
        return dp[amount];
    }
}
```

### Subset Sum and Partition Problems

Determining whether a subset exists that sums to a target, and partitioning arrays into equal-sum halves.

```java
public class SubsetSum {
    /**
     * Can any subset of nums sum to target?
     * dp[s] = true if some subset sums to s.
     * Time: O(n * target), Space: O(target)
     */
    public static boolean canSum(int[] nums, int target) {
        boolean[] dp = new boolean[target + 1];
        dp[0] = true;

        for (int num : nums) {
            // Reverse to prevent using same element twice
            for (int s = target; s >= num; s--) {
                dp[s] = dp[s] || dp[s - num];
            }
        }
        return dp[target];
    }

    /**
     * Can array be partitioned into two subsets with equal sum?
     * Reduces to: does a subset sum to totalSum / 2?
     */
    public static boolean canPartition(int[] nums) {
        int total = Arrays.stream(nums).sum();
        if (total % 2 != 0) return false;
        return canSum(nums, total / 2);
    }

    /**
     * Target Sum: assign + or - to each number to reach target.
     * Reduces to subset sum: find subset summing to (total + target) / 2.
     * If we assign + to subset P and - to subset N:
     *   P - N = target, P + N = total → P = (total + target) / 2
     */
    public static int findTargetSumWays(int[] nums, int target) {
        int total = Arrays.stream(nums).sum();
        if ((total + target) % 2 != 0 || Math.abs(target) > total) return 0;
        int subsetTarget = (total + target) / 2;

        int[] dp = new int[subsetTarget + 1];
        dp[0] = 1;

        for (int num : nums) {
            for (int s = subsetTarget; s >= num; s--) {
                dp[s] += dp[s - num];
            }
        }
        return dp[subsetTarget];
    }
}
```

```python
def can_partition(nums: list[int]) -> bool:
    """Can array be split into two equal-sum subsets?"""
    total = sum(nums)
    if total % 2 != 0:
        return False
    target = total // 2
    dp = [False] * (target + 1)
    dp[0] = True

    for num in nums:
        for s in range(target, num - 1, -1):
            dp[s] = dp[s] or dp[s - num]

    return dp[target]

def min_coins(coins: list[int], amount: int) -> int:
    """Minimum coins to make amount. Returns -1 if impossible."""
    dp = [float('inf')] * (amount + 1)
    dp[0] = 0

    for i in range(1, amount + 1):
        for coin in coins:
            if coin <= i:
                dp[i] = min(dp[i], dp[i - coin] + 1)

    return dp[amount] if dp[amount] != float('inf') else -1
```

## Common Pitfalls

- **Iterating capacity in the wrong direction for 0/1 knapsack**: In the space-optimized 1D array approach, you must iterate capacity in reverse (from W down to weight[i]) to prevent using the same item multiple times. Forward iteration allows the current item's contribution to propagate, effectively making it an unbounded knapsack. This is the single most common bug in knapsack implementations and produces answers that are too large.

- **Confusing combinations with permutations in coin change**: When counting ways to make an amount, the loop order determines whether you count combinations (order-independent) or permutations (order-dependent). Coins in the outer loop gives combinations (each coin denomination processed once). Amount in the outer loop gives permutations (same coins in different orders counted separately). Using the wrong loop order gives a different (usually larger) answer.

- **Not handling the zero-sum base case correctly**: For subset sum and coin change counting, dp[0] = 1 (there is exactly one way to make sum 0: select nothing). For minimum coins, dp[0] = 0 (zero coins needed for amount 0). Initializing dp[0] incorrectly cascades errors through the entire table. For the target sum problem, dp[0] must account for zeros in the input array (each zero doubles the number of ways).

- **Forgetting that knapsack is pseudo-polynomial**: The O(n*W) time complexity is polynomial in n and W, but W might be exponentially large relative to the input size (number of bits to represent W). For W = 10^9, the DP table has a billion entries and is infeasible. In such cases, use approximation algorithms, branch-and-bound, or meet-in-the-middle (O(2^(n/2)) which is better when n is small but W is large).

- **Not reducing problems to known knapsack variants**: Many problems are knapsack in disguise. Partition equal subset sum reduces to subset sum with target = totalSum/2. Target sum (+/- assignment) reduces to subset sum with target = (total + target)/2. Recognizing these reductions is key to solving them efficiently rather than implementing custom DP from scratch.

## Real-World Use Cases

**Cloud resource allocation** uses knapsack algorithms to assign virtual machines to physical servers. Each VM has resource requirements (CPU, memory, disk) and a priority value. The server has fixed capacity. The goal is to maximize total priority of hosted VMs without exceeding any resource dimension. Multi-dimensional knapsack (multiple constraints) models this accurately. Cloud providers like AWS and Azure use variants of these algorithms in their placement engines.

**Portfolio optimization in finance** models investment selection as a knapsack problem. Each asset has an expected return (value) and risk contribution (weight). The investor has a risk budget (capacity) and wants to maximize expected return. The 0/1 variant applies when assets are indivisible (buy or not buy), while the fractional variant applies to divisible assets. Modern portfolio theory extends this with correlation constraints.

**Cutting stock and material optimization** in manufacturing uses unbounded knapsack to minimize waste when cutting raw materials into required pieces. A steel mill cutting standard-length bars into customer-specified lengths, a paper mill cutting rolls into sheets, or a lumber yard cutting boards all face this optimization. The goal is to find cutting patterns that maximize material utilization (minimize waste).

**Compiler register allocation** uses graph coloring (which reduces to subset problems) to assign variables to CPU registers. When more variables are live simultaneously than registers available, the compiler must "spill" some to memory. Choosing which variables to keep in registers (maximizing benefit of fast access) is a knapsack-like optimization where register slots are the capacity and access frequency determines value.

**Cryptography** historically used knapsack problems as the basis for public-key encryption (Merkle-Hellman knapsack cryptosystem). While this specific system was broken, the subset sum problem remains computationally hard in general and forms the basis of lattice-based cryptography schemes that are candidates for post-quantum cryptography (resistant to quantum computer attacks).

## Interview Questions

**Q: Explain the difference between 0/1 knapsack and unbounded knapsack. How does the implementation differ?**

A: In 0/1 knapsack, each item can be used at most once. In unbounded knapsack, items can be reused unlimited times. The implementation difference is the iteration direction of the capacity loop: for 0/1, iterate capacity in reverse (high to low) to prevent reuse; for unbounded, iterate forward (low to high) to allow reuse. Alternatively, in the 2D formulation, 0/1 uses dp[i-1][w-weight] (previous row, item not yet used) while unbounded uses dp[i][w-weight] (current row, item already available).

**Q: How would you solve the partition equal subset sum problem?**

A: First compute the total sum. If odd, return false (cannot split evenly). If even, reduce to subset sum with target = total/2. Use a boolean DP array where dp[s] indicates whether a subset summing to s exists. Initialize dp[0] = true. For each number, iterate capacity in reverse and set dp[s] = dp[s] OR dp[s-num]. Return dp[total/2]. Time is O(n * sum/2), space is O(sum/2). This works because finding a subset summing to half the total automatically means the remaining elements sum to the other half.

**Q: How do you count the number of ways to make change for an amount using given coin denominations?**

A: Use unbounded knapsack counting. Initialize dp[0] = 1 (one way to make zero: use no coins). Iterate coins in the outer loop and amounts in the inner loop (forward direction). For each amount i and coin c where c <= i, add dp[i-c] to dp[i]. The outer-loop-over-coins order ensures each combination is counted once (not permutations). Time is O(coins * amount), space is O(amount). If you want permutations instead, swap the loop order (amounts outer, coins inner).

**Q: What is the time complexity of the knapsack problem? Is it polynomial?**

A: The DP solution runs in O(n*W) time where n is the number of items and W is the capacity. This is pseudo-polynomial: polynomial in the numeric value of W but exponential in the number of bits needed to represent W (log W bits). The knapsack problem is NP-hard, so no truly polynomial algorithm exists (unless P=NP). For practical purposes, O(n*W) is efficient when W is reasonably bounded (millions), but infeasible when W is astronomically large. For large W, use FPTAS (Fully Polynomial-Time Approximation Scheme) that achieves (1-ε) approximation in O(n²/ε) time.

## Production Tips

- **Use branch-and-bound for large knapsack instances**: When the capacity W is too large for DP (billions), branch-and-bound with LP relaxation upper bounds provides exact solutions efficiently for most practical instances. The LP relaxation (fractional knapsack) gives a tight upper bound that prunes most of the search tree. Commercial solvers (Gurobi, CPLEX) implement sophisticated branch-and-bound for integer programming problems that include knapsack as a special case.

- **Apply meet-in-the-middle for moderate n with large W**: When n is around 30-40 and W is too large for DP, split items into two halves. Enumerate all 2^(n/2) subsets for each half, then use two-pointer or binary search to find the best combination. This reduces time from O(2^n) to O(2^(n/2) * n), which is feasible for n up to 40. This technique is used in cryptographic attacks on knapsack-based systems.

- **Consider greedy approximations for real-time decisions**: When exact optimality is not required and decisions must be made in real-time (online knapsack, ad auction bidding), use the greedy approach of sorting by value-to-weight ratio and selecting greedily. This gives a 2-approximation for 0/1 knapsack and is optimal for fractional knapsack. The approximation guarantee is often sufficient for production systems where speed matters more than the last few percent of optimality.

## Related Topics

- [Fundamentals and 1D Problems](./fundamentals-and-1d-problems.md) — DP foundations that knapsack builds upon
- [Grid and Path DP](./grid-and-path-dp.md) — Similar constraint-based optimization in 2D
- [Sequence and String DP](./sequence-and-string-dp.md) — 2D DP table structure shared with knapsack
- [Advanced DP Patterns](./advanced-dp-patterns.md) — Bitmask DP for exponential-state knapsack variants
