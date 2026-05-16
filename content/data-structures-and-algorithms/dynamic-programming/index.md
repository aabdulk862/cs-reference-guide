# Dynamic Programming

Dynamic programming (DP) is an algorithmic technique that solves complex problems by breaking them into overlapping subproblems and storing their solutions to avoid redundant computation. Unlike divide-and-conquer (which solves independent subproblems), DP exploits the fact that the same subproblems recur many times, achieving polynomial time for problems that would otherwise require exponential brute-force enumeration.

The two hallmarks of DP problems are **optimal substructure** (the optimal solution contains optimal solutions to subproblems) and **overlapping subproblems** (the same subproblems are solved repeatedly in a naive recursive approach). Recognizing these properties is the key skill for identifying when DP applies.

DP appears extensively in technical interviews and production systems. Interview problems test your ability to define state, write recurrence relations, and optimize space. Production applications include route optimization, resource allocation, text processing (diff algorithms, spell checking), and financial modeling. Mastering DP requires practice with the common patterns — each subtopic covers a distinct pattern family with increasing complexity.

## Learning Path

1. [Fundamentals and 1D Problems](./fundamentals-and-1d-problems.md) — Memoization vs tabulation, Fibonacci, climbing stairs, and house robber patterns
2. [Sequence and String DP](./sequence-and-string-dp.md) — Longest common subsequence, edit distance, and palindrome problems
3. [Knapsack and Subset Problems](./knapsack-and-subset-problems.md) — 0/1 knapsack, unbounded knapsack, subset sum, and coin change
4. [Grid and Path DP](./grid-and-path-dp.md) — Unique paths, minimum path sum, and matrix chain multiplication
5. [Advanced DP Patterns](./advanced-dp-patterns.md) — Interval DP, bitmask DP, DP on trees, and optimization techniques
