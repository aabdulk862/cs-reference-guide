# Coding Interviews

## Quick Reference

- **Pattern Recognition**: Most coding problems map to 15-20 core patterns — two pointers, sliding window, BFS/DFS, dynamic programming, binary search, backtracking, topological sort, union-find, monotonic stack, greedy, divide and conquer
- **Time Complexity First**: Before coding, state the expected time and space complexity of your approach and confirm it meets the interviewer's expectations
- **Clarify Before Coding**: Spend 3-5 minutes asking about input constraints, edge cases, expected output format, and whether the input is sorted or has duplicates
- **Test Incrementally**: Walk through your solution with a small example before and after coding to catch logical errors early
- **Communicate Continuously**: Narrate your thought process — silence signals confusion, not deep thinking
- **Optimize Iteratively**: Start with a brute force approach, analyze its complexity, then optimize to the target complexity using appropriate data structures

## When to Use

Coding interviews remain the most common evaluation method across all levels of software engineering hiring. Every major technology company includes at least one coding round, and most include two to four. These rounds assess your ability to translate abstract problems into working code under time pressure, demonstrating both algorithmic thinking and implementation precision.

At senior levels, coding interviews evaluate more than raw problem-solving speed. Interviewers assess code quality, naming conventions, edge case handling, testing instincts, and the ability to discuss trade-offs between multiple valid approaches. A senior candidate who writes clean, well-structured code with proper error handling while explaining their reasoning scores higher than one who produces a correct but unreadable solution in less time.

The coding interview format varies by company. Some use collaborative environments where you can run code and see test results. Others use whiteboard or document-based formats where you must mentally trace execution. Some companies allow language choice while others specify a language. Understanding the specific format before your interview allows you to practice in the most relevant environment and avoid surprises that consume valuable thinking time.

Preparation for coding interviews requires consistent daily practice over 4-8 weeks rather than intensive cramming. The goal is pattern internalization — recognizing which algorithmic approach applies to a new problem within the first 2-3 minutes of reading it. This recognition speed comes from solving 100-200 problems across diverse categories, not from memorizing solutions to specific problems. Each practice session should include problems you cannot immediately solve, as struggling with unfamiliar patterns builds the adaptive thinking that interviews test.

## Code Examples

### Two Pointers Pattern — Container With Most Water

```java
/**
 * Find two lines that together with the x-axis form a container
 * that holds the most water. O(n) time, O(1) space.
 *
 * Key insight: Start with widest container, move the shorter line
 * inward because moving the taller line can only decrease area.
 */
public class ContainerWithMostWater {

    public int maxArea(int[] height) {
        int left = 0;
        int right = height.length - 1;
        int maxWater = 0;

        while (left < right) {
            int width = right - left;
            int minHeight = Math.min(height[left], height[right]);
            int currentArea = width * minHeight;
            maxWater = Math.max(maxWater, currentArea);

            // Move the pointer at the shorter line inward
            // Moving the taller line cannot increase area since
            // width decreases and height is bounded by the shorter line
            if (height[left] < height[right]) {
                left++;
            } else {
                right--;
            }
        }

        return maxWater;
    }

    // Interview follow-up: What if we need to return the indices?
    public int[] maxAreaWithIndices(int[] height) {
        int left = 0, right = height.length - 1;
        int maxWater = 0;
        int[] result = new int[2];

        while (left < right) {
            int area = (right - left) * Math.min(height[left], height[right]);
            if (area > maxWater) {
                maxWater = area;
                result[0] = left;
                result[1] = right;
            }
            if (height[left] < height[right]) left++;
            else right--;
        }
        return result;
    }
}
```

### Sliding Window Pattern — Longest Substring Without Repeating Characters

```typescript
/**
 * Find the length of the longest substring without repeating characters.
 * O(n) time, O(min(m,n)) space where m is charset size.
 *
 * Key insight: Maintain a window [left, right] where all characters are unique.
 * When a duplicate is found, shrink from the left until the window is valid again.
 */
function lengthOfLongestSubstring(s: string): number {
  const charIndex = new Map<string, number>();
  let maxLength = 0;
  let left = 0;

  for (let right = 0; right < s.length; right++) {
    const char = s[right];

    // If character was seen and its last position is within current window,
    // move left pointer past the previous occurrence
    if (charIndex.has(char) && charIndex.get(char)! >= left) {
      left = charIndex.get(char)! + 1;
    }

    charIndex.set(char, right);
    maxLength = Math.max(maxLength, right - left + 1);
  }

  return maxLength;
}

// Interview discussion points:
// 1. Why Map over Set? Map stores position, enabling O(1) left pointer jump
// 2. Why check >= left? Characters outside window are irrelevant
// 3. Space complexity: O(min(26, n)) for lowercase English, O(min(128, n)) for ASCII

/**
 * Follow-up: Find the actual longest substring, not just its length.
 */
function longestSubstringWithoutRepeats(s: string): string {
  const charIndex = new Map<string, number>();
  let maxLength = 0;
  let maxStart = 0;
  let left = 0;

  for (let right = 0; right < s.length; right++) {
    const char = s[right];
    if (charIndex.has(char) && charIndex.get(char)! >= left) {
      left = charIndex.get(char)! + 1;
    }
    charIndex.set(char, right);

    if (right - left + 1 > maxLength) {
      maxLength = right - left + 1;
      maxStart = left;
    }
  }

  return s.substring(maxStart, maxStart + maxLength);
}
```

### Graph BFS Pattern — Shortest Path in Binary Matrix

```python
from collections import deque
from typing import List

def shortest_path_binary_matrix(grid: List[List[int]]) -> int:
    """
    Find shortest path from top-left to bottom-right in a binary matrix.
    Can move in 8 directions. 0 = passable, 1 = blocked.
    O(n^2) time and space for n x n grid.

    Key insight: BFS guarantees shortest path in unweighted graphs.
    Process cells level by level; first time we reach destination is optimal.
    """
    n = len(grid)

    # Edge case: start or end is blocked
    if grid[0][0] == 1 or grid[n-1][n-1] == 1:
        return -1

    # 8 directions: horizontal, vertical, and diagonal
    directions = [
        (-1, -1), (-1, 0), (-1, 1),
        (0, -1),           (0, 1),
        (1, -1),  (1, 0),  (1, 1)
    ]

    queue = deque([(0, 0, 1)])  # (row, col, distance)
    grid[0][0] = 1  # mark visited by setting to 1 (blocked)

    while queue:
        row, col, dist = queue.popleft()

        # Reached destination
        if row == n - 1 and col == n - 1:
            return dist

        for dr, dc in directions:
            new_row, new_col = row + dr, col + dc

            # Check bounds and passability
            if (0 <= new_row < n and 0 <= new_col < n
                    and grid[new_row][new_col] == 0):
                grid[new_row][new_col] = 1  # mark visited
                queue.append((new_row, new_col, dist + 1))

    return -1  # destination unreachable


# Interview discussion:
# 1. Why BFS over DFS? BFS finds shortest path in unweighted graphs
# 2. Why modify grid instead of separate visited set? Saves O(n^2) space
# 3. Trade-off: Modifying input is destructive — discuss with interviewer
# 4. Follow-up: What if edges have weights? Use Dijkstra's algorithm instead
```

### Dynamic Programming Pattern — Longest Increasing Subsequence

```java
/**
 * Find the length of the longest strictly increasing subsequence.
 * Two approaches shown: O(n^2) DP and O(n log n) patience sorting.
 *
 * Interview strategy: Start with O(n^2) DP, then optimize if time permits.
 */
public class LongestIncreasingSubsequence {

    // Approach 1: Classic DP — O(n^2) time, O(n) space
    // dp[i] = length of LIS ending at index i
    public int lengthOfLIS_DP(int[] nums) {
        int n = nums.length;
        int[] dp = new int[n];
        Arrays.fill(dp, 1); // every element is a subsequence of length 1

        int maxLength = 1;

        for (int i = 1; i < n; i++) {
            for (int j = 0; j < i; j++) {
                if (nums[j] < nums[i]) {
                    dp[i] = Math.max(dp[i], dp[j] + 1);
                }
            }
            maxLength = Math.max(maxLength, dp[i]);
        }

        return maxLength;
    }

    // Approach 2: Patience Sorting — O(n log n) time, O(n) space
    // Maintain sorted tails array; binary search for insertion point
    public int lengthOfLIS_Optimized(int[] nums) {
        // tails[i] = smallest tail element for increasing subsequence of length i+1
        List<Integer> tails = new ArrayList<>();

        for (int num : nums) {
            int pos = Collections.binarySearch(tails, num);

            // binarySearch returns -(insertion point) - 1 if not found
            if (pos < 0) pos = -(pos + 1);

            if (pos == tails.size()) {
                tails.add(num); // extend longest subsequence
            } else {
                tails.set(pos, num); // replace to maintain smallest tail
            }
        }

        return tails.size();
    }

    // Interview follow-up: Reconstruct the actual subsequence
    public List<Integer> actualLIS(int[] nums) {
        int n = nums.length;
        int[] dp = new int[n];
        int[] parent = new int[n];
        Arrays.fill(dp, 1);
        Arrays.fill(parent, -1);

        int maxLength = 1, maxIndex = 0;

        for (int i = 1; i < n; i++) {
            for (int j = 0; j < i; j++) {
                if (nums[j] < nums[i] && dp[j] + 1 > dp[i]) {
                    dp[i] = dp[j] + 1;
                    parent[i] = j;
                }
            }
            if (dp[i] > maxLength) {
                maxLength = dp[i];
                maxIndex = i;
            }
        }

        // Reconstruct path
        List<Integer> result = new ArrayList<>();
        int idx = maxIndex;
        while (idx != -1) {
            result.add(0, nums[idx]);
            idx = parent[idx];
        }
        return result;
    }
}
```

## Common Pitfalls

- **Starting to code before understanding the problem**: Rushing into implementation without fully understanding constraints leads to solving the wrong problem or missing critical edge cases. Spend 3-5 minutes asking clarifying questions: What is the input size range? Can there be duplicates? Is the input sorted? What should we return for empty input? Are there negative numbers? This investment prevents costly rewrites mid-interview and demonstrates the methodical approach expected at senior levels.

- **Not stating complexity before coding**: Jumping into implementation without declaring your target time and space complexity means you might implement an O(n²) solution when O(n log n) is expected. State your approach and its complexity upfront: "I'll use a sliding window approach which gives us O(n) time and O(k) space." This gives the interviewer an opportunity to redirect you if your approach is suboptimal, saving valuable time.

- **Ignoring edge cases until the end**: Edge cases discovered after writing 30 lines of code often require restructuring the entire solution. Identify edge cases during the clarification phase: empty input, single element, all duplicates, already sorted, reverse sorted, maximum integer values, negative numbers. Design your solution to handle these from the start rather than bolting on special cases afterward.

- **Writing code without a clear algorithm**: Typing code while still figuring out the algorithm produces messy, incorrect implementations that require extensive debugging. Before writing any code, describe your algorithm in 2-3 sentences, walk through it with a small example on paper or whiteboard, and confirm the approach with the interviewer. Only then translate the validated algorithm into code.

- **Over-optimizing prematurely**: Attempting to write the most optimal solution immediately often leads to complex, bug-prone code that you cannot debug within the time limit. Start with a correct brute force solution, verify it works, then optimize. A working O(n²) solution that you can explain clearly scores better than a broken O(n log n) attempt. The interviewer can always ask you to optimize after seeing a correct baseline.

- **Poor variable naming and code organization**: Using single-letter variables (i, j, k, x, y) throughout makes your code difficult for the interviewer to follow and for you to debug. Use descriptive names: `leftPointer`, `windowStart`, `currentSum`, `maxLength`. This small investment in readability pays dividends when you need to trace through your logic or when the interviewer asks questions about specific parts of your code.

- **Not testing your solution**: Finishing your code and saying "I think that's correct" without verification demonstrates a lack of engineering discipline. Always trace through your solution with at least one normal case and one edge case. Walk through the execution step by step, tracking variable values. This catches the majority of bugs and shows the interviewer that you validate your work before declaring it complete.

## Real-World Use Cases

Coding interview patterns directly correspond to problems encountered in production software engineering. The algorithmic thinking developed through interview preparation translates into better system design, more efficient implementations, and faster debugging of performance issues in real codebases.

Two-pointer and sliding window techniques appear frequently in stream processing systems. Real-time analytics pipelines that compute rolling averages, detect anomalies within time windows, or find patterns in event streams use the same algorithmic foundations tested in coding interviews. Engineers who internalize these patterns recognize optimization opportunities in production code that others miss.

Graph algorithms power critical infrastructure at every major technology company. Social network friend recommendations use BFS for shortest-path connections. Dependency resolution in build systems uses topological sort. Network routing protocols implement Dijkstra's algorithm. Service mesh traffic routing uses graph partitioning. Understanding these algorithms at a deep level enables engineers to choose appropriate solutions and identify when existing implementations have correctness or performance issues.

Dynamic programming appears in resource allocation systems, scheduling optimizers, and recommendation engines. Knapsack variants solve budget allocation across advertising campaigns. Sequence alignment algorithms in bioinformatics use DP. Text diff algorithms that power code review tools implement longest common subsequence. Engineers who understand DP principles can identify when a problem has optimal substructure and overlapping subproblems, enabling efficient solutions where brute force would be computationally infeasible.

Binary search and its variants are fundamental to database indexing, search systems, and configuration management. B-tree traversal in databases, binary search over sorted log files for debugging, and bisecting deployments to find regressions all use the same core principle. The ability to correctly implement binary search with proper boundary handling — a notoriously error-prone task — distinguishes engineers who can write correct low-level code from those who rely entirely on library functions.

Hash map design and collision resolution strategies directly apply to cache implementation, distributed hash tables, and consistent hashing for load balancing. Understanding the trade-offs between chaining and open addressing, load factor management, and hash function properties enables engineers to make informed decisions about data structure selection and configuration in production systems.

## Interview Questions

**Q: How do you approach a problem you have never seen before in a coding interview?**

A: I follow a systematic process. First, I restate the problem in my own words to confirm understanding. Then I identify the input/output types and constraints. I consider what category the problem might fall into by looking for signals: sorted input suggests binary search, optimization over sequences suggests DP, shortest path suggests BFS, "all combinations" suggests backtracking. I work through 2-3 small examples by hand to identify patterns. If I recognize a known pattern, I apply it. If not, I start with brute force to establish correctness, then look for redundant computation that can be eliminated through memoization, better data structures, or algorithmic improvements. Throughout this process, I communicate my thinking to the interviewer so they can provide hints if I am heading in the wrong direction.

**Q: When would you choose a recursive solution over an iterative one?**

A: I prefer recursion when the problem has natural recursive structure — tree traversals, divide-and-conquer algorithms, backtracking problems, and problems where the recursive formulation is significantly clearer than the iterative version. However, I always consider the trade-offs: recursion uses call stack space (risk of stack overflow for deep recursion), has function call overhead, and can be harder to debug. For problems like DFS on trees with bounded depth, recursion is clean and safe. For problems like computing Fibonacci numbers or processing linked lists, iteration avoids stack overflow risk and is typically faster. In interviews, I mention both options and explain my choice. If the interviewer prefers the alternative, I can implement either.

**Q: How do you handle time pressure when you are stuck on a problem?**

A: First, I avoid panicking — getting stuck is normal and expected. I take a step back and try a different angle: Can I solve a simpler version of the problem first? Can I use a different data structure? Is there a mathematical property I am missing? I also leverage the interviewer as a resource — I explain where I am stuck and what approaches I have considered. Good interviewers provide hints when candidates demonstrate clear thinking but hit a specific obstacle. If I truly cannot find the optimal solution, I implement the best solution I can, explain its limitations, and discuss what I think the optimal approach might involve. A well-communicated suboptimal solution scores better than silence or a broken optimal attempt.

**Q: What is your strategy for debugging code during an interview?**

A: I use systematic tracing rather than staring at code hoping to spot the bug. I pick a small concrete input, then walk through my code line by line, tracking every variable's value at each step. I write these values next to the code or on the whiteboard. When the actual value diverges from my expected value, I have found the bug's location. Common bugs I check for: off-by-one errors in loop bounds, incorrect initialization, wrong comparison operator (< vs <=), forgetting to update a variable, and incorrect base cases in recursion. I also verify my algorithm is correct by re-examining my approach with the failing test case before assuming the bug is purely implementational.

**Q: How do you decide between multiple valid approaches to a problem?**

A: I evaluate approaches on four axes: correctness (does it handle all cases?), complexity (time and space relative to constraints), implementation difficulty (can I code it correctly in 20 minutes?), and extensibility (how easily does it adapt to follow-up questions?). For interviews specifically, I bias toward approaches I can implement confidently and correctly over theoretically optimal solutions I might struggle to code. I present my reasoning to the interviewer: "I see two approaches — A is O(n log n) and straightforward to implement, B is O(n) but requires a complex monotonic stack. Given the time constraint, I will implement A and we can discuss B if time permits." This demonstrates judgment and self-awareness.

## Production Tips

- **Practice in the exact environment you will interview in**: If your interview uses CoderPad, practice on CoderPad. If it uses a Google Doc, practice typing code in a document without syntax highlighting or auto-completion. The cognitive overhead of an unfamiliar environment consumes valuable problem-solving bandwidth. Spend at least 5 practice sessions in the actual interview tool before your real interview to eliminate environment-related friction.

- **Build a pattern recognition library through deliberate practice**: Rather than solving random problems, organize your practice by pattern. Solve 5-8 problems for each major pattern (two pointers, sliding window, BFS/DFS, DP, binary search, backtracking, union-find, topological sort, monotonic stack, greedy). After each problem, write a one-sentence summary of the key insight and when this pattern applies. Review these summaries before interviews to prime your pattern recognition.

- **Time yourself strictly during practice**: Set a 25-minute timer for medium problems and 40 minutes for hard problems. When time expires, stop coding regardless of completion state. Analyze what slowed you down: was it problem understanding, algorithm design, implementation, or debugging? This honest assessment reveals which phase needs the most improvement and prevents the false confidence that comes from unlimited-time practice.

- **Conduct mock interviews with peers or professional services**: Solving problems alone does not replicate the pressure of explaining your thinking while coding under observation. The communication overhead of narrating your approach, responding to questions, and managing the interviewer relationship consumes 20-30% of your cognitive capacity. Practice this skill explicitly through mock interviews where someone watches you solve problems in real time and provides feedback on both your solution and your communication.

## Related Topics

- [Behavioral Questions](./behavioral-questions.md) — Coding interviews often include behavioral elements about how you approach problems and handle difficulty
- [System Design Interviews](./system-design-interviews.md) — Strong coding skills enable credible deep dives during system design discussions
- [Technical Communication](./technical-communication.md) — Narrating your thought process clearly is as important as the code itself in coding interviews

