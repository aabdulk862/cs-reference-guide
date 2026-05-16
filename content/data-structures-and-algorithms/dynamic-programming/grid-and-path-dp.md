# Grid and Path DP

## Quick Reference

- **Unique Paths (grid)**: O(m*n) time, O(n) space — count paths from top-left to bottom-right
- **Minimum Path Sum**: O(m*n) time, O(n) space — minimize cost traversing grid
- **Maximum Square**: O(m*n) time, O(n) space — largest square of 1s in binary matrix
- **Matrix Chain Multiplication**: O(n³) time, O(n²) space — optimal parenthesization
- **Triangle Minimum Path**: O(n²) time, O(n) space — top-to-bottom minimum sum
- **Dungeon Game**: O(m*n) time, O(n) space — minimum initial health (reverse DP)
- **Cherry Pickup**: O(m*n²) time — two simultaneous paths through grid
- **Paint House**: O(n*k) time, O(k) space — minimize cost with adjacency constraint
- **Key insight**: state is position in grid, transitions are valid moves from that position

## When to Use

Grid and path DP problems involve finding optimal paths or counting paths through a 2D structure where movement is constrained (typically right and down only, or to adjacent cells). The state naturally maps to grid coordinates, and transitions correspond to valid moves.

Use grid DP when navigating a matrix with movement constraints and costs (robot path planning, minimum cost paths), when counting the number of ways to traverse a grid (combinatorial path counting, lattice paths), when finding optimal substructures within a matrix (maximum square, maximal rectangle), or when the problem involves making sequential decisions on a 2D structure (paint house, stock trading with cooldown mapped to states).

Matrix chain multiplication and similar interval problems extend the grid DP concept to problems where you choose how to partition a sequence, with the state being the interval endpoints. These problems have O(n³) time complexity due to the need to try all split points within each interval.

The key insight for grid DP is that the optimal path to any cell depends only on the optimal paths to cells from which you can reach it. For right-and-down movement, dp[i][j] depends on dp[i-1][j] (came from above) and dp[i][j-1] (came from left). This dependency structure enables row-by-row computation with O(n) space.

## Code Examples

### Unique Paths and Minimum Path Sum

The foundational grid DP problems: counting paths and finding minimum-cost paths through a grid with constrained movement.

```java
public class GridDP {
    /**
     * Count unique paths from top-left to bottom-right.
     * Can only move right or down.
     * dp[j] = number of paths to reach cell (current_row, j).
     * Time: O(m*n), Space: O(n)
     */
    public static int uniquePaths(int m, int n) {
        int[] dp = new int[n];
        Arrays.fill(dp, 1);  // First row: only one way (all right moves)

        for (int i = 1; i < m; i++) {
            for (int j = 1; j < n; j++) {
                dp[j] += dp[j - 1];  // dp[j] (from above) + dp[j-1] (from left)
            }
        }
        return dp[n - 1];
    }

    /**
     * Unique paths with obstacles. Cells with obstacles cannot be traversed.
     * Time: O(m*n), Space: O(n)
     */
    public static int uniquePathsWithObstacles(int[][] grid) {
        int n = grid[0].length;
        int[] dp = new int[n];
        dp[0] = grid[0][0] == 0 ? 1 : 0;

        for (int[] row : grid) {
            for (int j = 0; j < n; j++) {
                if (row[j] == 1) {
                    dp[j] = 0;  // Obstacle: no paths through here
                } else if (j > 0) {
                    dp[j] += dp[j - 1];
                }
            }
        }
        return dp[n - 1];
    }

    /**
     * Minimum path sum from top-left to bottom-right.
     * dp[j] = minimum cost to reach cell (current_row, j).
     * Time: O(m*n), Space: O(n)
     */
    public static int minPathSum(int[][] grid) {
        int m = grid.length, n = grid[0].length;
        int[] dp = new int[n];
        dp[0] = grid[0][0];

        // Initialize first row
        for (int j = 1; j < n; j++) {
            dp[j] = dp[j - 1] + grid[0][j];
        }

        for (int i = 1; i < m; i++) {
            dp[0] += grid[i][0];  // First column: can only come from above
            for (int j = 1; j < n; j++) {
                dp[j] = Math.min(dp[j], dp[j - 1]) + grid[i][j];
            }
        }
        return dp[n - 1];
    }
}
```

```typescript
function uniquePaths(m: number, n: number): number {
  const dp = new Array(n).fill(1);
  for (let i = 1; i < m; i++) {
    for (let j = 1; j < n; j++) {
      dp[j] += dp[j - 1];
    }
  }
  return dp[n - 1];
}

function minPathSum(grid: number[][]): number {
  const m = grid.length, n = grid[0].length;
  const dp = [...grid[0]];
  for (let j = 1; j < n; j++) dp[j] += dp[j - 1];

  for (let i = 1; i < m; i++) {
    dp[0] += grid[i][0];
    for (let j = 1; j < n; j++) {
      dp[j] = Math.min(dp[j], dp[j - 1]) + grid[i][j];
    }
  }
  return dp[n - 1];
}
```

### Maximal Square in Binary Matrix

Finding the largest square containing only 1s in a binary matrix, using the elegant min-of-three-neighbors recurrence.

```java
public class MaximalSquare {
    /**
     * Find the area of the largest square of 1s in a binary matrix.
     * dp[j] = side length of largest square with bottom-right corner at (i, j).
     * Recurrence: dp[i][j] = min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]) + 1
     * Time: O(m*n), Space: O(n)
     */
    public static int maximalSquare(char[][] matrix) {
        int m = matrix.length, n = matrix[0].length;
        int[] dp = new int[n];
        int maxSide = 0;
        int prev = 0;  // Stores dp[i-1][j-1]

        for (int i = 0; i < m; i++) {
            for (int j = 0; j < n; j++) {
                int temp = dp[j];  // Save before overwriting (becomes prev for next j)
                if (matrix[i][j] == '1') {
                    if (i == 0 || j == 0) {
                        dp[j] = 1;
                    } else {
                        dp[j] = Math.min(Math.min(dp[j], dp[j - 1]), prev) + 1;
                    }
                    maxSide = Math.max(maxSide, dp[j]);
                } else {
                    dp[j] = 0;
                }
                prev = temp;
            }
        }
        return maxSide * maxSide;
    }
}
```

### Matrix Chain Multiplication

The classic interval DP problem: find the optimal way to parenthesize a chain of matrix multiplications to minimize total scalar multiplications.

```java
public class MatrixChain {
    /**
     * Minimum cost to multiply chain of matrices.
     * dimensions[i] = rows of matrix i, dimensions[i+1] = cols of matrix i.
     * dp[i][j] = minimum multiplications to compute product of matrices i..j.
     * Try all split points k: dp[i][j] = min(dp[i][k] + dp[k+1][j] + cost(i,k,j))
     * Time: O(n³), Space: O(n²)
     */
    public static int matrixChainOrder(int[] dimensions) {
        int n = dimensions.length - 1;  // Number of matrices
        int[][] dp = new int[n][n];

        // Fill by increasing chain length
        for (int len = 2; len <= n; len++) {
            for (int i = 0; i <= n - len; i++) {
                int j = i + len - 1;
                dp[i][j] = Integer.MAX_VALUE;

                // Try all split points
                for (int k = i; k < j; k++) {
                    int cost = dp[i][k] + dp[k + 1][j]
                        + dimensions[i] * dimensions[k + 1] * dimensions[j + 1];
                    dp[i][j] = Math.min(dp[i][j], cost);
                }
            }
        }
        return dp[0][n - 1];
    }

    /**
     * With parenthesization reconstruction.
     */
    public static String optimalParenthesization(int[] dimensions) {
        int n = dimensions.length - 1;
        int[][] dp = new int[n][n];
        int[][] split = new int[n][n];

        for (int len = 2; len <= n; len++) {
            for (int i = 0; i <= n - len; i++) {
                int j = i + len - 1;
                dp[i][j] = Integer.MAX_VALUE;
                for (int k = i; k < j; k++) {
                    int cost = dp[i][k] + dp[k + 1][j]
                        + dimensions[i] * dimensions[k + 1] * dimensions[j + 1];
                    if (cost < dp[i][j]) {
                        dp[i][j] = cost;
                        split[i][j] = k;
                    }
                }
            }
        }

        return buildParens(split, 0, n - 1);
    }

    private static String buildParens(int[][] split, int i, int j) {
        if (i == j) return "M" + i;
        return "(" + buildParens(split, i, split[i][j]) + " × "
            + buildParens(split, split[i][j] + 1, j) + ")";
    }
}
```

```python
def min_path_sum(grid: list[list[int]]) -> int:
    """Minimum path sum from top-left to bottom-right."""
    m, n = len(grid), len(grid[0])
    dp = list(grid[0])
    for j in range(1, n):
        dp[j] += dp[j - 1]

    for i in range(1, m):
        dp[0] += grid[i][0]
        for j in range(1, n):
            dp[j] = min(dp[j], dp[j - 1]) + grid[i][j]

    return dp[n - 1]

def matrix_chain_order(dims: list[int]) -> int:
    """Minimum scalar multiplications for matrix chain."""
    n = len(dims) - 1
    dp = [[0] * n for _ in range(n)]

    for length in range(2, n + 1):
        for i in range(n - length + 1):
            j = i + length - 1
            dp[i][j] = float('inf')
            for k in range(i, j):
                cost = dp[i][k] + dp[k + 1][j] + dims[i] * dims[k + 1] * dims[j + 1]
                dp[i][j] = min(dp[i][j], cost)

    return dp[0][n - 1]
```

## Common Pitfalls

- **Incorrect initialization of first row and column in grid DP**: The first row can only be reached by moving right, and the first column only by moving down. For minimum path sum, dp[0][j] = sum of grid[0][0..j] (not just grid[0][j]). For unique paths with obstacles, if any cell in the first row is an obstacle, all cells to its right have 0 paths. Forgetting cumulative initialization produces incorrect results for cells reachable only from the boundary.

- **Modifying the input grid instead of using a separate DP array**: While modifying the grid in-place saves space, it destroys the original data and can cause bugs if the grid is needed later or if the function is called multiple times. In production code, always use a separate DP array. In interviews, mention the trade-off and ask if in-place modification is acceptable.

- **Wrong iteration order for interval DP (matrix chain)**: Interval DP must fill the table by increasing interval length (not by row or column). Computing dp[i][j] requires dp[i][k] and dp[k+1][j] for all k between i and j, which are shorter intervals. Iterating by row or column accesses entries that have not been computed yet, producing garbage values.

- **Not handling the reverse DP direction for problems like Dungeon Game**: Some grid problems require computing from bottom-right to top-left (reverse direction). The Dungeon Game asks for minimum initial health to reach the end with positive health at every step. Forward DP fails because you do not know the future minimum health requirement. Reverse DP from the destination works because you know the minimum health needed at each cell to survive from there to the end.

- **Forgetting that unique paths has a combinatorial closed-form**: For a grid without obstacles, the number of unique paths from (0,0) to (m-1,n-1) with only right and down moves is C(m+n-2, m-1) = (m+n-2)! / ((m-1)! * (n-1)!). This is O(min(m,n)) to compute versus O(m*n) for DP. Use the combinatorial formula when there are no obstacles and you only need the count.

## Real-World Use Cases

**Robot path planning** in warehouses (Amazon Robotics, Kiva Systems) uses grid DP to find optimal routes for robots navigating warehouse floors. The grid represents the warehouse layout with obstacles (shelves, other robots), and the cost function includes distance, congestion, and energy consumption. Multi-robot coordination extends this to simultaneous path planning for hundreds of robots, using variants of the cherry pickup problem (multiple agents on the same grid).

**Image processing and computer vision** uses grid DP for seam carving (content-aware image resizing). The algorithm finds the minimum-energy vertical or horizontal path through the image (a path that removes the least visually important pixels). This is exactly the minimum path sum problem on the image's energy map. Seam carving is used in photo editing software and responsive image display.

**Computational biology** uses grid DP for sequence alignment (Needleman-Wunsch and Smith-Waterman algorithms). The DP table represents alignments between two biological sequences, with cells containing alignment scores. The minimum path through this grid (with gap penalties) gives the optimal alignment. This is the foundation of tools like BLAST that compare DNA and protein sequences against databases.

**Supply chain and logistics optimization** uses grid-like DP for multi-stage decision problems. A delivery company deciding which warehouse to ship from at each stage, considering inventory levels and transportation costs, faces a problem structurally similar to minimum path sum through a grid where rows are time periods and columns are warehouse choices.

**Video compression** (H.264, H.265/HEVC) uses block matching algorithms that search for the best matching block in a reference frame. The search pattern through the reference frame is optimized using DP-like techniques that exploit the spatial correlation of motion vectors. The cost function combines pixel difference (distortion) and encoding cost (rate), creating a rate-distortion optimization problem solved with DP.

## Interview Questions

**Q: How would you find the minimum path sum in a grid where you can only move right or down?**

A: Define dp[i][j] as the minimum sum to reach cell (i,j) from (0,0). Base case: dp[0][0] = grid[0][0]. First row: dp[0][j] = dp[0][j-1] + grid[0][j] (can only come from left). First column: dp[i][0] = dp[i-1][0] + grid[i][0] (can only come from above). General case: dp[i][j] = min(dp[i-1][j], dp[i][j-1]) + grid[i][j]. Answer is dp[m-1][n-1]. Time is O(m*n), space is O(n) with row-by-row computation. The key insight is that each cell's optimal path must come from either directly above or directly left.

**Q: Explain the maximal square problem and its recurrence relation.**

A: Given a binary matrix, find the area of the largest square containing only 1s. Define dp[i][j] as the side length of the largest square with bottom-right corner at (i,j). If matrix[i][j] is 0, dp[i][j] = 0. If it is 1, dp[i][j] = min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]) + 1. The min-of-three-neighbors works because a square of side k requires squares of side k-1 above, to the left, and diagonally above-left. The answer is max(dp[i][j])². Time is O(m*n), space is O(n).

**Q: What is matrix chain multiplication and why is it important?**

A: Matrix chain multiplication finds the optimal parenthesization of a sequence of matrix multiplications to minimize total scalar operations. Multiplying matrices of dimensions (10×30) × (30×5) × (5×60) costs differently depending on order: ((AB)C) costs 10*30*5 + 10*5*60 = 4500, while (A(BC)) costs 30*5*60 + 10*30*60 = 27000. The DP solution tries all split points for each subchain. It is important because it demonstrates interval DP (a pattern used in optimal BST construction, polygon triangulation, and burst balloons) and because matrix multiplication order matters in scientific computing and machine learning.

**Q: How would you solve the dungeon game (minimum initial health to reach bottom-right)?**

A: Use reverse DP from bottom-right to top-left. Define dp[i][j] as the minimum health needed when entering cell (i,j) to eventually reach the destination alive. Base case: dp[m-1][n-1] = max(1, 1 - dungeon[m-1][n-1]). Transition: dp[i][j] = max(1, min(dp[i+1][j], dp[i][j+1]) - dungeon[i][j]). The max(1,...) ensures health never drops below 1. Forward DP fails because the minimum health at (0,0) depends on the worst point along the path, which you cannot determine without knowing the full path. Reverse DP works because from any cell, you know exactly how much health you need to survive the rest of the journey.

## Production Tips

- **Use SIMD vectorization for large grid DP computations**: When processing large grids (image processing, scientific computing), the inner loop of grid DP can be vectorized using SIMD instructions. Each cell depends on the cell above (same column, previous row) and the cell to the left (same row, previous column). The dependency on the cell above allows processing multiple columns simultaneously with SIMD, achieving 4-8x speedup on modern CPUs.

- **Consider parallel wavefront computation for independent anti-diagonals**: In grid DP where dp[i][j] depends on dp[i-1][j] and dp[i][j-1], all cells on the same anti-diagonal (i+j = constant) are independent and can be computed in parallel. This wavefront parallelism enables GPU acceleration for large grids. CUDA implementations of sequence alignment use this pattern to achieve 100x speedup over sequential CPU computation.

- **Apply space optimization aggressively for production memory constraints**: Most grid DP problems only need the previous row (O(n) space instead of O(m*n)). For problems needing the diagonal value (maximal square), keep one additional variable. For path reconstruction, use Hirschberg's divide-and-conquer technique to achieve O(n) space while still recovering the optimal path, at the cost of 2x computation time.

## Related Topics

- [Fundamentals and 1D Problems](./fundamentals-and-1d-problems.md) — 1D DP foundations that extend to 2D grids
- [Sequence and String DP](./sequence-and-string-dp.md) — 2D DP on string pairs shares grid structure
- [Knapsack and Subset Problems](./knapsack-and-subset-problems.md) — Constraint optimization in different state spaces
- [Advanced DP Patterns](./advanced-dp-patterns.md) — Interval DP generalizes matrix chain multiplication
