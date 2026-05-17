# Advanced DP Patterns

## Quick Reference

- **Interval DP**: O(n³) time, O(n²) space — optimal decisions on contiguous ranges
- **Bitmask DP**: O(2^n * n) time — track subset state for small n (≤ 20)
- **DP on Trees**: O(n) time — bottom-up computation on tree structure
- **Digit DP**: O(digits * state * 10) — count numbers with digit constraints
- **Profile DP (broken profile)**: O(m * 2^n) — tile placement on grids
- **Knuth's optimization**: O(n²) from O(n³) — when optimal split point is monotone
- **Divide and Conquer optimization**: O(n² log n) from O(n³) — similar monotonicity condition
- **Convex Hull Trick**: O(n) or O(n log n) — optimize DP with linear cost functions
- **Aliens trick (lambda optimization)**: Remove one constraint by binary search on penalty
- **Key insight**: recognize which advanced pattern applies by examining state and transition structure

## When to Use

Advanced DP patterns handle problems where basic 1D or 2D DP is insufficient due to complex state spaces, exponential subsets, or cubic time that needs optimization. Each pattern addresses a specific structural property of the problem.

Use interval DP when the problem involves making optimal decisions on contiguous ranges that can be split at any point (burst balloons, optimal BST, stone merging, palindrome partitioning). The state is an interval [i, j] and you try all split points k within it.

Use bitmask DP when the state involves a subset of elements and n is small enough (typically n ≤ 20) for 2^n states to fit in memory. Classic applications include Traveling Salesman Problem, assignment problems, and Hamiltonian path counting.

Use DP on trees when the problem has tree structure and each node's answer depends on its children's answers. Applications include maximum independent set on trees, tree diameter, and rerooting techniques.

Use digit DP when counting integers in a range that satisfy digit-level constraints (count numbers with digit sum equal to k, count numbers without consecutive equal digits). The state tracks position, tight constraint, and accumulated properties.

Use optimization techniques (Knuth's, divide-and-conquer, convex hull trick) when you have identified a correct O(n³) or O(n²) DP but need to reduce the time complexity by exploiting monotonicity or convexity in the transition.

## Code Examples

### Interval DP: Burst Balloons

The burst balloons problem demonstrates interval DP where you choose which element to process last within each interval, building the solution from smaller intervals.

```java
public class IntervalDP {
    /**
     * Burst Balloons: maximize coins from bursting all balloons.
     * Key insight: think about which balloon to burst LAST in interval [i,j].
     * dp[i][j] = max coins from bursting all balloons between i and j.
     * Time: O(n³), Space: O(n²)
     */
    public static int maxCoins(int[] nums) {
        int n = nums.length;
        // Pad with 1s on both ends for boundary handling
        int[] padded = new int[n + 2];
        padded[0] = padded[n + 1] = 1;
        System.arraycopy(nums, 0, padded, 1, n);

        int[][] dp = new int[n + 2][n + 2];

        // Fill by increasing interval length
        for (int len = 1; len <= n; len++) {
            for (int left = 1; left <= n - len + 1; left++) {
                int right = left + len - 1;
                for (int last = left; last <= right; last++) {
                    // Burst 'last' balloon last in interval [left, right]
                    int coins = padded[left - 1] * padded[last] * padded[right + 1]
                        + dp[left][last - 1] + dp[last + 1][right];
                    dp[left][right] = Math.max(dp[left][right], coins);
                }
            }
        }
        return dp[1][n];
    }

    /**
     * Palindrome Partitioning: minimum cuts to partition string into palindromes.
     * Combine palindrome checking DP with partition DP.
     * Time: O(n²), Space: O(n²)
     */
    public static int minCut(String s) {
        int n = s.length();
        // isPalin[i][j] = true if s[i..j] is a palindrome
        boolean[][] isPalin = new boolean[n][n];
        for (int i = n - 1; i >= 0; i--) {
            for (int j = i; j < n; j++) {
                isPalin[i][j] = s.charAt(i) == s.charAt(j)
                    && (j - i <= 2 || isPalin[i + 1][j - 1]);
            }
        }

        // dp[i] = minimum cuts for s[0..i]
        int[] dp = new int[n];
        Arrays.fill(dp, Integer.MAX_VALUE);

        for (int i = 0; i < n; i++) {
            if (isPalin[0][i]) {
                dp[i] = 0;  // Entire prefix is palindrome, no cuts needed
            } else {
                for (int j = 1; j <= i; j++) {
                    if (isPalin[j][i]) {
                        dp[i] = Math.min(dp[i], dp[j - 1] + 1);
                    }
                }
            }
        }
        return dp[n - 1];
    }
}
```

```typescript
function maxCoins(nums: number[]): number {
  const n = nums.length;
  const padded = [1, ...nums, 1];
  const dp: number[][] = Array.from({ length: n + 2 }, () => new Array(n + 2).fill(0));

  for (let len = 1; len <= n; len++) {
    for (let left = 1; left <= n - len + 1; left++) {
      const right = left + len - 1;
      for (let last = left; last <= right; last++) {
        const coins = padded[left - 1] * padded[last] * padded[right + 1]
          + dp[left][last - 1] + dp[last + 1][right];
        dp[left][right] = Math.max(dp[left][right], coins);
      }
    }
  }
  return dp[1][n];
}
```

### Bitmask DP: Traveling Salesman Problem

Bitmask DP tracks which elements have been visited using a bitmask, enabling efficient subset enumeration for problems with small n.

```java
public class BitmaskDP {
    /**
     * Traveling Salesman Problem: minimum cost to visit all cities and return.
     * State: (current city, set of visited cities as bitmask)
     * dp[mask][i] = min cost to visit cities in mask, ending at city i.
     * Time: O(2^n * n²), Space: O(2^n * n)
     */
    public static int tsp(int[][] dist) {
        int n = dist.length;
        int fullMask = (1 << n) - 1;
        int[][] dp = new int[1 << n][n];
        for (int[] row : dp) Arrays.fill(row, Integer.MAX_VALUE / 2);

        dp[1][0] = 0;  // Start at city 0, only city 0 visited

        for (int mask = 1; mask <= fullMask; mask++) {
            for (int u = 0; u < n; u++) {
                if ((mask & (1 << u)) == 0) continue;  // u not in mask
                if (dp[mask][u] == Integer.MAX_VALUE / 2) continue;

                for (int v = 0; v < n; v++) {
                    if ((mask & (1 << v)) != 0) continue;  // v already visited
                    int newMask = mask | (1 << v);
                    dp[newMask][v] = Math.min(dp[newMask][v],
                        dp[mask][u] + dist[u][v]);
                }
            }
        }

        // Find minimum cost to return to start after visiting all cities
        int minCost = Integer.MAX_VALUE;
        for (int u = 1; u < n; u++) {
            if (dp[fullMask][u] + dist[u][0] < minCost) {
                minCost = dp[fullMask][u] + dist[u][0];
            }
        }
        return minCost;
    }

    /**
     * Count Hamiltonian paths: number of paths visiting all vertices exactly once.
     * Similar structure to TSP but counting instead of minimizing.
     */
    public static int countHamiltonianPaths(boolean[][] adj) {
        int n = adj.length;
        int[][] dp = new int[1 << n][n];

        // Base: single vertex paths
        for (int i = 0; i < n; i++) dp[1 << i][i] = 1;

        for (int mask = 1; mask < (1 << n); mask++) {
            for (int u = 0; u < n; u++) {
                if ((mask & (1 << u)) == 0 || dp[mask][u] == 0) continue;
                for (int v = 0; v < n; v++) {
                    if ((mask & (1 << v)) != 0 || !adj[u][v]) continue;
                    dp[mask | (1 << v)][v] += dp[mask][u];
                }
            }
        }

        int count = 0;
        int fullMask = (1 << n) - 1;
        for (int i = 0; i < n; i++) count += dp[fullMask][i];
        return count;
    }
}
```

### DP on Trees: Maximum Independent Set

Tree DP computes answers bottom-up from leaves to root, where each node's answer depends on its children's answers.

```java
public class TreeDP {
    /**
     * Maximum Independent Set on a tree.
     * Select maximum-weight subset of vertices with no two adjacent.
     * dp[v][0] = max weight not including v
     * dp[v][1] = max weight including v
     * Time: O(n), Space: O(n)
     */
    public static int maxIndependentSet(List<List<Integer>> tree, int[] weights, int root) {
        int n = weights.length;
        int[][] dp = new int[n][2];
        boolean[] visited = new boolean[n];

        dfs(tree, weights, root, dp, visited);
        return Math.max(dp[root][0], dp[root][1]);
    }

    private static void dfs(List<List<Integer>> tree, int[] weights,
                            int v, int[][] dp, boolean[] visited) {
        visited[v] = true;
        dp[v][1] = weights[v];  // Include v: start with its weight

        for (int child : tree.get(v)) {
            if (visited[child]) continue;
            dfs(tree, weights, child, dp, visited);

            // If v not included, children can be included or not
            dp[v][0] += Math.max(dp[child][0], dp[child][1]);
            // If v included, children must not be included
            dp[v][1] += dp[child][0];
        }
    }

    /**
     * Tree Diameter: longest path between any two nodes.
     * At each node, track the two longest paths through children.
     * Time: O(n)
     */
    public static int treeDiameter(List<List<Integer>> tree, int root) {
        int[] diameter = {0};
        dfsDepth(tree, root, -1, diameter);
        return diameter[0];
    }

    private static int dfsDepth(List<List<Integer>> tree, int v, int parent, int[] diameter) {
        int maxDepth1 = 0, maxDepth2 = 0;  // Two longest paths through children

        for (int child : tree.get(v)) {
            if (child == parent) continue;
            int childDepth = 1 + dfsDepth(tree, child, v, diameter);

            if (childDepth > maxDepth1) {
                maxDepth2 = maxDepth1;
                maxDepth1 = childDepth;
            } else if (childDepth > maxDepth2) {
                maxDepth2 = childDepth;
            }
        }

        // Diameter through v = sum of two longest paths
        diameter[0] = Math.max(diameter[0], maxDepth1 + maxDepth2);
        return maxDepth1;  // Return longest single path for parent's computation
    }
}
```

```java
/**
 * Maximum weight independent set on a tree using DFS-based tree DP.
 * dp[v][0] = max weight excluding vertex v
 * dp[v][1] = max weight including vertex v
 * Time: O(n)
 */
public class MaxIndependentSet {
    private int[][] dp;
    private List<List<Integer>> tree;
    private int[] weights;

    public int solve(List<List<Integer>> tree, int[] weights, int root) {
        int n = weights.length;
        this.dp = new int[n][2];
        this.tree = tree;
        this.weights = weights;

        dfs(root, -1);
        return Math.max(dp[root][0], dp[root][1]);
    }

    private void dfs(int v, int parent) {
        dp[v][1] = weights[v];
        for (int child : tree.get(v)) {
            if (child == parent) continue;
            dfs(child, v);
            dp[v][0] += Math.max(dp[child][0], dp[child][1]);
            dp[v][1] += dp[child][0];
        }
    }
}
```

## Common Pitfalls

- **Incorrect interval DP iteration order**: Interval DP must process intervals by increasing length. Computing dp[i][j] requires all shorter intervals dp[i][k] and dp[k+1][j] to be already computed. A common mistake is iterating i from 0 to n and j from i to n, which processes long intervals before their sub-intervals are ready. Always use a length-based outer loop.

- **Bitmask overflow for n > 30**: Bitmask DP uses integers as bit vectors, limiting n to 30 (int) or 62 (long). For n > 20, the 2^n states exceed practical memory limits (2^20 = 1M states is fine, 2^25 = 33M is borderline, 2^30 = 1B is infeasible). Always verify that 2^n * n fits in available memory before implementing bitmask DP.

- **Not handling the root correctly in tree DP**: Tree DP typically starts from an arbitrary root and processes bottom-up. If the problem requires considering all possible roots (e.g., find the vertex that minimizes some property), use the rerooting technique: compute answers rooted at one vertex, then propagate to adjacent vertices by "rerooting" in O(1) per edge, achieving O(n) total instead of O(n²).

- **Applying optimization techniques without verifying preconditions**: Knuth's optimization requires that the optimal split point is monotone (opt[i][j] ≤ opt[i][j+1]). The convex hull trick requires that the slopes of linear functions are monotone. Applying these optimizations without verifying the precondition produces incorrect results. Always prove or empirically verify the monotonicity condition before applying.

- **Forgetting that interval DP base cases are single elements or empty intervals**: For burst balloons, dp[i][i] represents bursting a single balloon. For matrix chain, dp[i][i] = 0 (multiplying a single matrix costs nothing). For palindrome partitioning, dp[i][i] = 0 (single character is already a palindrome). Missing or incorrect base cases propagate errors through all larger intervals.

## Real-World Use Cases

**Vehicle routing and logistics** uses TSP variants (solved with bitmask DP for small instances or heuristics for large ones) to optimize delivery routes. Amazon, UPS, and FedEx solve variants of TSP daily for millions of packages. For small fleets (under 20 vehicles), exact bitmask DP solutions are feasible. For larger instances, the DP solution provides lower bounds that guide branch-and-bound or metaheuristic approaches.

**Compiler instruction scheduling** uses interval DP and tree DP to determine optimal instruction ordering. The compiler must schedule instructions to minimize pipeline stalls while respecting data dependencies (a DAG). For basic blocks, this reduces to interval scheduling. For expression trees, tree DP determines the optimal evaluation order that minimizes register spills.

**Game theory and AI** uses tree DP for minimax evaluation of game trees. Chess engines evaluate positions by computing optimal play for both sides bottom-up through the game tree. Alpha-beta pruning (an optimization of minimax tree DP) eliminates branches that cannot affect the final decision. Modern engines combine tree DP with neural network evaluation functions.

**Network design and VLSI layout** uses Steiner tree problems (connecting a subset of terminals with minimum cost) that are solved with bitmask DP when the number of terminals is small. The Dreyfus-Wagner algorithm uses dp[S][v] = minimum cost tree connecting terminal set S rooted at v, with transitions that try all subset splits. This is used in chip design to route wires connecting pins.

**Computational linguistics** uses interval DP for parsing natural language. The CYK (Cocke-Younger-Kasami) algorithm parses sentences according to context-free grammars using interval DP where dp[i][j] stores all possible parse trees for the substring from position i to j. This is the foundation of syntactic parsing in NLP systems.

## Interview Questions

**Q: Explain interval DP with the burst balloons problem.**

A: Interval DP solves problems where you make decisions on contiguous ranges. For burst balloons, the key insight is thinking about which balloon to burst last in each interval (not first). If balloon k is burst last in interval [i,j], it earns nums[i-1] * nums[k] * nums[j+1] coins (because all other balloons in the interval are already gone). The recurrence is dp[i][j] = max over k in [i,j] of (dp[i][k-1] + dp[k+1][j] + nums[i-1]*nums[k]*nums[j+1]). Fill by increasing interval length. Time is O(n³), space is O(n²).

**Q: How does bitmask DP work for the Traveling Salesman Problem?**

A: State is (current city, set of visited cities). Represent the visited set as a bitmask where bit i is 1 if city i has been visited. dp[mask][u] = minimum cost to visit exactly the cities in mask, ending at city u. Transition: for each unvisited city v, dp[mask | (1<<v)][v] = min(dp[mask][u] + dist[u][v]). Base case: dp[1<<start][start] = 0. Answer: min over all u of (dp[fullMask][u] + dist[u][start]). Time is O(2^n * n²), feasible for n ≤ 20.

**Q: What is DP on trees and how does it differ from standard DP?**

A: Tree DP computes answers bottom-up from leaves to root, where each node's state depends on its children's states. Unlike grid DP (fixed direction) or interval DP (increasing length), tree DP follows the tree structure using DFS. At each node, combine children's answers according to the problem's recurrence. Common patterns include "include/exclude" (independent set), "max depth through children" (diameter), and "subtree aggregation" (subtree sums). Time is typically O(n) since each node is processed once.

**Q: When would you use the Convex Hull Trick to optimize DP?**

A: The Convex Hull Trick optimizes DP transitions of the form dp[i] = min(dp[j] + cost(j, i)) where cost(j, i) can be decomposed as a[j] * b[i] + c[j] (linear in b[i] with slope a[j] and intercept c[j]). Each previous state j defines a line, and finding the optimal j for state i means querying the minimum over all lines at point b[i]. Maintaining a convex hull of lines enables O(1) amortized queries when b[i] is monotone, reducing O(n²) DP to O(n). Applications include stock trading with transaction costs, building bridges, and certain sequence partitioning problems.

## Production Tips

- **Use iterative deepening for bitmask DP memory optimization**: When 2^n * n exceeds memory but you only need the final answer (not the full table), process masks in order and keep only the current "layer" of masks with a fixed number of set bits. This reduces memory from O(2^n * n) to O(C(n, k) * n) for the largest layer, though it complicates the implementation.

- **Apply memoization with hash maps for sparse state spaces**: When the theoretical state space is large but only a fraction of states are reachable (common in tree DP with complex states or digit DP), use hash map memoization instead of pre-allocated arrays. This trades O(1) array access for O(1) amortized hash map access but avoids allocating memory for unreachable states.

- **Profile and benchmark DP optimizations before deploying**: Theoretical improvements (Knuth's optimization reducing O(n³) to O(n²)) may not translate to practical speedup for small n due to increased code complexity and worse cache behavior. The convex hull trick adds implementation complexity that is only worthwhile for n > 10,000. Always benchmark with realistic input sizes before choosing the optimized variant.

## Related Topics

- [Fundamentals and 1D Problems](./fundamentals-and-1d-problems.md) — Foundation that advanced patterns build upon
- [Grid and Path DP](./grid-and-path-dp.md) — Matrix chain multiplication as interval DP
- [Trees and Graphs](../trees-and-graphs/index.md) — Tree structure for DP on trees
- [Sorting and Searching](../sorting-and-searching/index.md) — Binary search in convex hull trick queries
