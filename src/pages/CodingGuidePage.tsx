/**
 * Coding Interview Guide — pattern refresher + quick-reference.
 * Dense, concrete, code-heavy. Read 30 min before an interview to reload patterns.
 */

import { useState, useCallback } from 'react';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';
import { ComplexityPair } from '@/components/content/ComplexityBadge';

type Section = 'two-pointers' | 'sliding-window' | 'hashmap' | 'binary-search' | 'bfs-dfs' | 'backtracking' | 'dp' | 'stack' | 'heap' | 'graphs';

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'two-pointers', label: 'Two Pointers' },
  { id: 'sliding-window', label: 'Sliding Window' },
  { id: 'hashmap', label: 'HashMap' },
  { id: 'binary-search', label: 'Binary Search' },
  { id: 'bfs-dfs', label: 'BFS / DFS' },
  { id: 'backtracking', label: 'Backtracking' },
  { id: 'dp', label: 'Dynamic Programming' },
  { id: 'stack', label: 'Monotonic Stack' },
  { id: 'heap', label: 'Heap / Top-K' },
  { id: 'graphs', label: 'Graphs' },
];

interface PatternSectionProps {
  idea: string;
  solves: string[];
  insight: string;
  complexity: { time: string; space: string; why: string };
  steps: VisualizationStep[];
  code: string;
  variations?: { title: string; code: string }[];
}

interface VisualizationStep {
  /** Array/data to display as cells */
  cells: CellData[];
  /** Pointers/markers to show below cells */
  pointers?: { index: number; label: string; color: 'blue' | 'red' | 'green' | 'purple' }[];
  /** Description of what's happening this step */
  description: string;
  /** Optional secondary data (e.g., stack, queue, map contents) */
  auxiliary?: string;
}

interface CellData {
  value: string | number;
  state: 'default' | 'active' | 'found' | 'done' | 'compare' | 'window';
}

function AlgoVisualizer({ steps }: { steps: VisualizationStep[] }) {
  const [currentStep, setCurrentStep] = useState(0);
  const step = steps[currentStep];

  return (
    <div className="cg-viz">
      <div className="cg-viz__label">Visualization</div>

      <div className="cg-viz__cells">
        {step.cells.map((cell, i) => (
          <div key={i} className={`cg-viz__cell cg-viz__cell--${cell.state}`}>
            <span className="cg-viz__cell-value">{cell.value}</span>
            {step.pointers && step.pointers.filter(p => p.index === i).map(p => (
              <span key={p.label} className={`cg-viz__pointer cg-viz__pointer--${p.color}`}>
                {p.label}
              </span>
            ))}
          </div>
        ))}
      </div>

      {step.auxiliary && (
        <div className="cg-viz__aux">{step.auxiliary}</div>
      )}

      <div className="cg-viz__desc">{step.description}</div>

      <div className="cg-viz__controls">
        <button
          className="cg-viz__btn"
          onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
          disabled={currentStep === 0}
          aria-label="Previous step"
        >
          ←
        </button>
        <span className="cg-viz__step-count">
          {currentStep + 1} / {steps.length}
        </span>
        <button
          className="cg-viz__btn"
          onClick={() => setCurrentStep(Math.min(steps.length - 1, currentStep + 1))}
          disabled={currentStep === steps.length - 1}
          aria-label="Next step"
        >
          →
        </button>
      </div>
    </div>
  );
}

function PatternSection({ idea, solves, insight, complexity, steps, code, variations }: PatternSectionProps) {
  return (
    <div className="cg-pattern-section">
      <div className="cg-idea">
        <div className="cg-idea__label">Core idea</div>
        <p>{idea}</p>
      </div>

      <ComplexityPair time={complexity.time} space={complexity.space} why={complexity.why} />

      <AlgoVisualizer steps={steps} />

      <div className="cg-solves">
        <div className="cg-solves__label">Solves these problems</div>
        <ul>
          {solves.map(s => <li key={s}>{s}</li>)}
        </ul>
      </div>

      <div className="cg-insight">
        <div className="cg-insight__label">Key insight</div>
        <p>{insight}</p>
      </div>

      <div className="cg-code">
        <div className="cg-code__label">Skeleton</div>
        <pre><code>{code}</code></pre>
      </div>

      {variations && variations.length > 0 && (
        <div className="cg-variations">
          {variations.map(v => (
            <div key={v.title} className="cg-variation">
              <div className="cg-variation__title">{v.title}</div>
              <pre><code>{v.code}</code></pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TwoPointersSection() {
  const steps: VisualizationStep[] = [
    {
      cells: [1, 3, 5, 7, 9, 11, 14].map(v => ({ value: v, state: 'default' as const })),
      pointers: [{ index: 0, label: 'L', color: 'blue' }, { index: 6, label: 'R', color: 'red' }],
      description: 'Target = 12. Start with L at beginning, R at end. Sum = 1 + 14 = 15',
      auxiliary: 'sum = 15 > target → move R left',
    },
    {
      cells: [1, 3, 5, 7, 9, 11, 14].map((v, i) => ({ value: v, state: i === 5 ? 'compare' as const : 'default' as const })),
      pointers: [{ index: 0, label: 'L', color: 'blue' }, { index: 5, label: 'R', color: 'red' }],
      description: 'Sum = 1 + 11 = 12 = target. Found!',
      auxiliary: 'sum = 12 = target ✓',
    },
    {
      cells: [1, 3, 5, 7, 9, 11, 14].map((v, i) => ({ value: v, state: (i === 0 || i === 5) ? 'found' as const : 'done' as const })),
      pointers: [{ index: 0, label: 'L', color: 'green' }, { index: 5, label: 'R', color: 'green' }],
      description: 'Return indices [0, 5]. Only took 2 steps instead of checking all pairs.',
      auxiliary: 'Result: [0, 5]',
    },
  ];

  return (
    <PatternSection
      idea="Two pointers move toward each other (or in the same direction) to find pairs, partition, or compare elements without nested loops. Reduces O(n²) to O(n)."
      complexity={{ time: 'O(n)', space: 'O(1)', why: 'Each pointer moves at most n steps total. No extra data structures needed.' }}
      steps={steps}
      solves={[
        'Two Sum on sorted array',
        'Container with most water',
        'Three Sum / Three Sum Closest',
        'Remove duplicates in-place',
        'Palindrome check',
        'Merge two sorted arrays',
        'Trapping rain water',
      ]}
      insight="If the array is sorted (or you can sort it), two pointers from both ends lets you make a decision at each step — move left pointer right to increase sum, or right pointer left to decrease it. You never need to go back."
      code={`// Two Sum on sorted array
int left = 0, right = nums.length - 1;
while (left < right) {
    int sum = nums[left] + nums[right];
    if (sum == target) return new int[]{left, right};
    else if (sum < target) left++;
    else right--;
}`}
      variations={[
        {
          title: 'Three Sum (sort + two pointers)',
          code: `Arrays.sort(nums);
for (int i = 0; i < nums.length - 2; i++) {
    if (i > 0 && nums[i] == nums[i-1]) continue; // skip dupes
    int lo = i + 1, hi = nums.length - 1;
    while (lo < hi) {
        int sum = nums[i] + nums[lo] + nums[hi];
        if (sum == 0) {
            result.add(List.of(nums[i], nums[lo], nums[hi]));
            while (lo < hi && nums[lo] == nums[lo+1]) lo++;
            while (lo < hi && nums[hi] == nums[hi-1]) hi--;
            lo++; hi--;
        } else if (sum < 0) lo++;
        else hi--;
    }
}`,
        },
        {
          title: 'Fast/slow pointers (linked list cycle)',
          code: `ListNode slow = head, fast = head;
while (fast != null && fast.next != null) {
    slow = slow.next;
    fast = fast.next.next;
    if (slow == fast) return true; // cycle found
}
return false;`,
        },
      ]}
    />
  );
}

function SlidingWindowSection() {
  const steps: VisualizationStep[] = [
    {
      cells: 'abcbdab'.split('').map((v, i) => ({ value: v, state: i === 0 ? 'window' as const : 'default' as const })),
      pointers: [{ index: 0, label: 'L', color: 'blue' }, { index: 0, label: 'R', color: 'red' }],
      description: 'Find longest substring without repeating chars. Start with window [a].',
      auxiliary: 'Window: "a" | Length: 1',
    },
    {
      cells: 'abcbdab'.split('').map((v, i) => ({ value: v, state: i <= 2 ? 'window' as const : 'default' as const })),
      pointers: [{ index: 0, label: 'L', color: 'blue' }, { index: 2, label: 'R', color: 'red' }],
      description: 'Expand R. Window "abc" — all unique, keep going.',
      auxiliary: 'Window: "abc" | Length: 3',
    },
    {
      cells: 'abcbdab'.split('').map((v, i) => ({ value: v, state: i <= 3 ? 'window' as const : i === 3 ? 'compare' as const : 'default' as const })),
      pointers: [{ index: 0, label: 'L', color: 'blue' }, { index: 3, label: 'R', color: 'red' }],
      description: 'R moves to index 3 (b). "b" already in window! Constraint violated.',
      auxiliary: 'Window: "abcb" ← duplicate "b"!',
    },
    {
      cells: 'abcbdab'.split('').map((v, i) => ({ value: v, state: (i >= 2 && i <= 3) ? 'window' as const : i < 2 ? 'done' as const : 'default' as const })),
      pointers: [{ index: 2, label: 'L', color: 'blue' }, { index: 3, label: 'R', color: 'red' }],
      description: 'Shrink L past the first "b" (index 1). Now window "cb" is valid again.',
      auxiliary: 'Window: "cb" | Max so far: 3',
    },
    {
      cells: 'abcbdab'.split('').map((v, i) => ({ value: v, state: (i >= 2 && i <= 5) ? 'window' as const : i < 2 ? 'done' as const : 'default' as const })),
      pointers: [{ index: 2, label: 'L', color: 'blue' }, { index: 5, label: 'R', color: 'red' }],
      description: 'Expand R through "d", "a". Window "cbda" — length 4, new max!',
      auxiliary: 'Window: "cbda" | Max: 4 ✓',
    },
  ];

  return (
    <PatternSection
      idea="Maintain a window [left, right] over a contiguous subarray/substring. Expand right to include more, shrink left when a constraint is violated. Track the best answer as you go."
      complexity={{ time: 'O(n)', space: 'O(k)', why: 'Each element enters and leaves the window at most once. Space depends on what you track (charset size, frequency map of k distinct elements).' }}
      steps={steps}
      solves={[
        'Longest substring without repeating characters',
        'Minimum window substring',
        'Maximum sum subarray of size K',
        'Longest substring with at most K distinct characters',
        'Fruit into baskets',
        'Permutation in string / Find all anagrams',
      ]}
      insight="The window only moves forward — right expands, left shrinks. You never reset. This is why it's O(n) even though it looks like two loops. Every element enters and leaves the window at most once."
      code={`// Longest substring without repeating chars
Map<Character, Integer> map = new HashMap<>();
int left = 0, maxLen = 0;

for (int right = 0; right < s.length(); right++) {
    char c = s.charAt(right);
    if (map.containsKey(c)) {
        left = Math.max(left, map.get(c) + 1);
    }
    map.put(c, right);
    maxLen = Math.max(maxLen, right - left + 1);
}
return maxLen;`}
      variations={[
        {
          title: 'Fixed-size window (max sum of size K)',
          code: `int windowSum = 0, maxSum = 0;
for (int i = 0; i < nums.length; i++) {
    windowSum += nums[i];
    if (i >= k) windowSum -= nums[i - k];
    if (i >= k - 1) maxSum = Math.max(maxSum, windowSum);
}`,
        },
        {
          title: 'Minimum window substring',
          code: `Map<Character, Integer> need = new HashMap<>(), have = new HashMap<>();
for (char c : t.toCharArray()) need.merge(c, 1, Integer::sum);
int left = 0, matched = 0, minLen = Integer.MAX_VALUE, start = 0;

for (int right = 0; right < s.length(); right++) {
    char c = s.charAt(right);
    have.merge(c, 1, Integer::sum);
    if (need.containsKey(c) && have.get(c).equals(need.get(c))) matched++;

    while (matched == need.size()) {
        if (right - left + 1 < minLen) {
            minLen = right - left + 1;
            start = left;
        }
        char lc = s.charAt(left);
        have.merge(lc, -1, Integer::sum);
        if (need.containsKey(lc) && have.get(lc) < need.get(lc)) matched--;
        left++;
    }
}`,
        },
      ]}
    />
  );
}

function HashMapSection() {
  const steps: VisualizationStep[] = [
    {
      cells: [2, 7, 11, 15].map(v => ({ value: v, state: 'default' as const })),
      pointers: [{ index: 0, label: 'i', color: 'blue' }],
      description: 'Two Sum: target = 9. Check if complement (9-2=7) is in map.',
      auxiliary: 'Map: {} | Need: 7 → not found',
    },
    {
      cells: [2, 7, 11, 15].map((v, i) => ({ value: v, state: i === 0 ? 'done' as const : 'default' as const })),
      pointers: [{ index: 1, label: 'i', color: 'blue' }],
      description: 'Store 2→0 in map. Move to index 1. Check if complement (9-7=2) is in map.',
      auxiliary: 'Map: {2→0} | Need: 2 → FOUND at index 0!',
    },
    {
      cells: [2, 7, 11, 15].map((v, i) => ({ value: v, state: (i === 0 || i === 1) ? 'found' as const : 'done' as const })),
      pointers: [{ index: 0, label: '✓', color: 'green' }, { index: 1, label: '✓', color: 'green' }],
      description: 'Complement 2 exists at index 0. Return [0, 1]. Single pass!',
      auxiliary: 'Result: [0, 1] — O(n) with HashMap',
    },
  ];

  return (
    <PatternSection
      idea="Use a HashMap for O(1) lookups to avoid nested loops. Store what you've seen so far, then check if the complement/target exists as you iterate."
      complexity={{ time: 'O(n)', space: 'O(n)', why: 'Single pass through array. HashMap stores up to n entries in worst case.' }}
      steps={steps}
      solves={[
        'Two Sum (unsorted)',
        'Group anagrams',
        'Valid anagram / character frequency',
        'Subarray sum equals K (prefix sum + map)',
        'Longest consecutive sequence',
        'Top K frequent elements',
        'Contains duplicate within distance K',
      ]}
      insight="The classic trick: instead of searching for a pair with two loops, store each element in a map and check if its complement already exists. One pass, O(n)."
      code={`// Two Sum (unsorted) — single pass
Map<Integer, Integer> map = new HashMap<>();
for (int i = 0; i < nums.length; i++) {
    int complement = target - nums[i];
    if (map.containsKey(complement)) {
        return new int[]{map.get(complement), i};
    }
    map.put(nums[i], i);
}`}
      variations={[
        {
          title: 'Subarray sum equals K (prefix sum + hashmap)',
          code: `// Count subarrays that sum to k
Map<Integer, Integer> prefixCount = new HashMap<>();
prefixCount.put(0, 1);
int sum = 0, count = 0;

for (int num : nums) {
    sum += num;
    count += prefixCount.getOrDefault(sum - k, 0);
    prefixCount.merge(sum, 1, Integer::sum);
}
return count;`,
        },
        {
          title: 'Group anagrams',
          code: `Map<String, List<String>> map = new HashMap<>();
for (String s : strs) {
    char[] chars = s.toCharArray();
    Arrays.sort(chars);
    String key = new String(chars);
    map.computeIfAbsent(key, k -> new ArrayList<>()).add(s);
}
return new ArrayList<>(map.values());`,
        },
        {
          title: 'Longest consecutive sequence',
          code: `Set<Integer> set = new HashSet<>(Arrays.asList(/* boxed nums */));
int longest = 0;
for (int n : set) {
    if (!set.contains(n - 1)) { // only start from sequence beginning
        int len = 1;
        while (set.contains(n + len)) len++;
        longest = Math.max(longest, len);
    }
}`,
        },
      ]}
    />
  );
}

function BinarySearchSection() {
  const steps: VisualizationStep[] = [
    {
      cells: [1, 3, 5, 7, 9, 11, 13].map(v => ({ value: v, state: 'active' as const })),
      pointers: [{ index: 0, label: 'lo', color: 'blue' }, { index: 3, label: 'mid', color: 'purple' }, { index: 6, label: 'hi', color: 'red' }],
      description: 'Target = 9. Full array is search space. mid = 7 < 9.',
      auxiliary: 'mid=7 < target=9 → search RIGHT half',
    },
    {
      cells: [1, 3, 5, 7, 9, 11, 13].map((v, i) => ({ value: v, state: i < 4 ? 'done' as const : 'active' as const })),
      pointers: [{ index: 4, label: 'lo', color: 'blue' }, { index: 5, label: 'mid', color: 'purple' }, { index: 6, label: 'hi', color: 'red' }],
      description: 'Eliminated left half. New search space [9, 11, 13]. mid = 11 > 9.',
      auxiliary: 'mid=11 > target=9 → search LEFT half',
    },
    {
      cells: [1, 3, 5, 7, 9, 11, 13].map((v, i) => ({ value: v, state: i === 4 ? 'found' as const : 'done' as const })),
      pointers: [{ index: 4, label: 'lo=mid=hi', color: 'green' }],
      description: 'Only element left: 9 = target. Found at index 4! Only 3 comparisons for 7 elements.',
      auxiliary: 'Result: index 4 — O(log n)',
    },
  ];

  return (
    <PatternSection
      idea="Halve the search space each step. Works on sorted arrays, but also on any problem where you can define a monotonic condition — 'all values left of X satisfy condition, all right don't.'"
      complexity={{ time: 'O(log n)', space: 'O(1)', why: 'Search space halves each iteration: n → n/2 → n/4 → ... → 1 = log₂(n) steps.' }}
      steps={steps}
      solves={[
        'Search in sorted/rotated array',
        'Find first/last position of element',
        'Search insert position',
        'Find peak element',
        'Koko eating bananas (search on answer)',
        'Minimum in rotated sorted array',
        'Median of two sorted arrays',
      ]}
      insight="Binary search isn't just 'find element in sorted array.' It's applicable whenever you can define a boolean condition that's false for the first part and true for the rest (or vice versa). You're searching for the boundary."
      code={`// Standard binary search
int lo = 0, hi = nums.length - 1;
while (lo <= hi) {
    int mid = lo + (hi - lo) / 2;  // avoid overflow
    if (nums[mid] == target) return mid;
    else if (nums[mid] < target) lo = mid + 1;
    else hi = mid - 1;
}
return -1; // not found`}
      variations={[
        {
          title: 'Find first occurrence (leftmost)',
          code: `int lo = 0, hi = nums.length - 1, result = -1;
while (lo <= hi) {
    int mid = lo + (hi - lo) / 2;
    if (nums[mid] == target) {
        result = mid;
        hi = mid - 1; // keep searching left
    } else if (nums[mid] < target) lo = mid + 1;
    else hi = mid - 1;
}`,
        },
        {
          title: 'Search on answer (Koko eating bananas)',
          code: `// Find minimum speed to eat all bananas in h hours
int lo = 1, hi = max(piles);
while (lo < hi) {
    int mid = lo + (hi - lo) / 2;
    if (canFinish(piles, mid, h)) hi = mid;
    else lo = mid + 1;
}
return lo;

boolean canFinish(int[] piles, int speed, int h) {
    int hours = 0;
    for (int p : piles) hours += (p + speed - 1) / speed;
    return hours <= h;
}`,
        },
        {
          title: 'Search in rotated sorted array',
          code: `int lo = 0, hi = nums.length - 1;
while (lo <= hi) {
    int mid = lo + (hi - lo) / 2;
    if (nums[mid] == target) return mid;

    if (nums[lo] <= nums[mid]) { // left half sorted
        if (target >= nums[lo] && target < nums[mid]) hi = mid - 1;
        else lo = mid + 1;
    } else { // right half sorted
        if (target > nums[mid] && target <= nums[hi]) lo = mid + 1;
        else hi = mid - 1;
    }
}`,
        },
      ]}
    />
  );
}

function BfsDfsSection() {
  const steps: VisualizationStep[] = [
    {
      cells: [1, 2, 3, 4, 5, 6].map(v => ({ value: v, state: 'default' as const })),
      pointers: [{ index: 0, label: 'root', color: 'blue' }],
      description: 'BFS level-order on tree: [1, 2, 3, 4, 5, 6]. Start at root (1).',
      auxiliary: 'Queue: [1] | Level 0',
    },
    {
      cells: [1, 2, 3, 4, 5, 6].map((v, i) => ({ value: v, state: i === 0 ? 'done' as const : (i <= 2 ? 'active' as const : 'default' as const) })),
      pointers: [{ index: 1, label: '→', color: 'blue' }, { index: 2, label: '→', color: 'blue' }],
      description: 'Process level 0 (node 1). Add children 2, 3 to queue.',
      auxiliary: 'Queue: [2, 3] | Level 1 | Output: [1]',
    },
    {
      cells: [1, 2, 3, 4, 5, 6].map((v, i) => ({ value: v, state: i <= 2 ? 'done' as const : (i <= 5 ? 'active' as const : 'default' as const) })),
      pointers: [{ index: 3, label: '→', color: 'blue' }, { index: 4, label: '→', color: 'blue' }, { index: 5, label: '→', color: 'blue' }],
      description: 'Process level 1 (nodes 2, 3). Add their children 4, 5, 6.',
      auxiliary: 'Queue: [4, 5, 6] | Level 2 | Output: [1], [2,3]',
    },
    {
      cells: [1, 2, 3, 4, 5, 6].map(v => ({ value: v, state: 'found' as const })),
      pointers: [],
      description: 'Process level 2 (nodes 4, 5, 6). No more children. Done!',
      auxiliary: 'Output: [1], [2,3], [4,5,6] — level by level ✓',
    },
  ];

  return (
    <PatternSection
      idea="BFS explores level by level (queue) — use for shortest path in unweighted graphs. DFS explores as deep as possible first (stack/recursion) — use for tree traversals, path finding, connected components."
      complexity={{ time: 'O(V + E)', space: 'O(V)', why: 'Visit every vertex and edge once. Queue/stack holds at most V nodes. For trees: O(n) time, O(h) space where h=height.' }}
      steps={steps}
      solves={[
        'Binary tree level order traversal',
        'Shortest path in grid/maze',
        'Number of islands',
        'Clone graph',
        'Word ladder (BFS)',
        'Path sum / all paths in tree (DFS)',
        'Validate BST',
        'Serialize/deserialize tree',
      ]}
      insight="BFS guarantees shortest path in unweighted graphs because it visits all nodes at distance d before any at distance d+1. DFS is better for 'does a path exist' or 'enumerate all paths' because it fully explores one branch before trying another."
      code={`// BFS — shortest path in grid
Queue<int[]> queue = new LinkedList<>();
queue.offer(new int[]{startRow, startCol, 0}); // row, col, distance
boolean[][] visited = new boolean[rows][cols];
visited[startRow][startCol] = true;
int[][] dirs = {{0,1},{0,-1},{1,0},{-1,0}};

while (!queue.isEmpty()) {
    int[] curr = queue.poll();
    int r = curr[0], c = curr[1], dist = curr[2];
    if (r == targetRow && c == targetCol) return dist;

    for (int[] d : dirs) {
        int nr = r + d[0], nc = c + d[1];
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols
            && !visited[nr][nc] && grid[nr][nc] != WALL) {
            visited[nr][nc] = true;
            queue.offer(new int[]{nr, nc, dist + 1});
        }
    }
}`}
      variations={[
        {
          title: 'DFS — number of islands',
          code: `int count = 0;
for (int i = 0; i < grid.length; i++) {
    for (int j = 0; j < grid[0].length; j++) {
        if (grid[i][j] == '1') {
            dfs(grid, i, j);
            count++;
        }
    }
}

void dfs(char[][] grid, int i, int j) {
    if (i < 0 || i >= grid.length || j < 0 || j >= grid[0].length
        || grid[i][j] != '1') return;
    grid[i][j] = '0'; // mark visited
    dfs(grid, i+1, j); dfs(grid, i-1, j);
    dfs(grid, i, j+1); dfs(grid, i, j-1);
}`,
        },
        {
          title: 'Tree DFS — inorder traversal (iterative)',
          code: `List<Integer> result = new ArrayList<>();
Deque<TreeNode> stack = new ArrayDeque<>();
TreeNode curr = root;

while (curr != null || !stack.isEmpty()) {
    while (curr != null) {
        stack.push(curr);
        curr = curr.left;
    }
    curr = stack.pop();
    result.add(curr.val);
    curr = curr.right;
}`,
        },
        {
          title: 'BFS — level order traversal',
          code: `List<List<Integer>> result = new ArrayList<>();
Queue<TreeNode> queue = new LinkedList<>();
if (root != null) queue.offer(root);

while (!queue.isEmpty()) {
    int size = queue.size();
    List<Integer> level = new ArrayList<>();
    for (int i = 0; i < size; i++) {
        TreeNode node = queue.poll();
        level.add(node.val);
        if (node.left != null) queue.offer(node.left);
        if (node.right != null) queue.offer(node.right);
    }
    result.add(level);
}`,
        },
      ]}
    />
  );
}

function BacktrackingSection() {
  const steps: VisualizationStep[] = [
    {
      cells: [1, 2, 3].map(v => ({ value: v, state: 'default' as const })),
      pointers: [{ index: 0, label: 'start', color: 'blue' }],
      description: 'Subsets of [1, 2, 3]. Start with empty path. Add [] to result.',
      auxiliary: 'Path: [] | Result: [[]]',
    },
    {
      cells: [1, 2, 3].map((v, i) => ({ value: v, state: i === 0 ? 'active' as const : 'default' as const })),
      pointers: [{ index: 0, label: 'choose', color: 'green' }],
      description: 'Choose 1. Add [1] to result. Recurse with start=1.',
      auxiliary: 'Path: [1] | Result: [[], [1]]',
    },
    {
      cells: [1, 2, 3].map((v, i) => ({ value: v, state: i <= 1 ? 'active' as const : 'default' as const })),
      pointers: [{ index: 0, label: '✓', color: 'green' }, { index: 1, label: 'choose', color: 'green' }],
      description: 'Choose 2. Add [1,2] to result. Recurse with start=2.',
      auxiliary: 'Path: [1,2] | Result: [[], [1], [1,2]]',
    },
    {
      cells: [1, 2, 3].map(v => ({ value: v, state: 'active' as const })),
      pointers: [{ index: 0, label: '✓', color: 'green' }, { index: 1, label: '✓', color: 'green' }, { index: 2, label: 'choose', color: 'green' }],
      description: 'Choose 3. Add [1,2,3] to result. No more elements — backtrack.',
      auxiliary: 'Path: [1,2,3] | Result: [[], [1], [1,2], [1,2,3]]',
    },
    {
      cells: [1, 2, 3].map((v, i) => ({ value: v, state: i === 0 ? 'active' as const : (i === 2 ? 'compare' as const : 'done' as const) })),
      pointers: [{ index: 0, label: '✓', color: 'green' }, { index: 2, label: 'choose', color: 'purple' }],
      description: 'Backtrack: remove 2, remove 3. Now choose 3 after 1. Add [1,3].',
      auxiliary: 'Path: [1,3] | Result: [..., [1,3]]',
    },
    {
      cells: [1, 2, 3].map(v => ({ value: v, state: 'found' as const })),
      pointers: [],
      description: 'Continue until all branches explored. Final: [[], [1], [1,2], [1,2,3], [1,3], [2], [2,3], [3]]',
      auxiliary: 'All 2ⁿ = 8 subsets found ✓',
    },
  ];

  return (
    <PatternSection
      idea="Build a solution incrementally. At each step, make a choice, recurse, then undo the choice (backtrack). Explores all valid combinations/permutations by treating the problem as a decision tree."
      complexity={{ time: 'O(2ⁿ) or O(n!)', space: 'O(n)', why: 'Subsets: 2ⁿ possibilities. Permutations: n! possibilities. Space is recursion depth (at most n).' }}
      steps={steps}
      solves={[
        'Subsets / Power set',
        'Permutations',
        'Combination Sum',
        'N-Queens',
        'Word Search in grid',
        'Generate parentheses',
        'Letter combinations of phone number',
        'Sudoku solver',
      ]}
      insight="The template is always the same: choose → explore → unchoose. The only things that change between problems are: (1) what choices are available at each step, (2) when to stop (base case), and (3) how to prune invalid paths early."
      code={`// Subsets — the purest backtracking template
List<List<Integer>> result = new ArrayList<>();

void backtrack(int[] nums, int start, List<Integer> path) {
    result.add(new ArrayList<>(path)); // every path is a valid subset

    for (int i = start; i < nums.length; i++) {
        path.add(nums[i]);           // choose
        backtrack(nums, i + 1, path); // explore
        path.remove(path.size() - 1); // unchoose
    }
}`}
      variations={[
        {
          title: 'Permutations',
          code: `void backtrack(int[] nums, List<Integer> path, boolean[] used) {
    if (path.size() == nums.length) {
        result.add(new ArrayList<>(path));
        return;
    }
    for (int i = 0; i < nums.length; i++) {
        if (used[i]) continue;
        used[i] = true;
        path.add(nums[i]);
        backtrack(nums, path, used);
        path.remove(path.size() - 1);
        used[i] = false;
    }
}`,
        },
        {
          title: 'Combination Sum (reuse allowed)',
          code: `void backtrack(int[] candidates, int target, int start, List<Integer> path) {
    if (target == 0) { result.add(new ArrayList<>(path)); return; }
    if (target < 0) return;

    for (int i = start; i < candidates.length; i++) {
        path.add(candidates[i]);
        backtrack(candidates, target - candidates[i], i, path); // i, not i+1
        path.remove(path.size() - 1);
    }
}`,
        },
        {
          title: 'Word search in grid',
          code: `boolean dfs(char[][] board, String word, int i, int j, int idx) {
    if (idx == word.length()) return true;
    if (i < 0 || i >= board.length || j < 0 || j >= board[0].length
        || board[i][j] != word.charAt(idx)) return false;

    char tmp = board[i][j];
    board[i][j] = '#'; // mark visited
    boolean found = dfs(board, word, i+1, j, idx+1)
                 || dfs(board, word, i-1, j, idx+1)
                 || dfs(board, word, i, j+1, idx+1)
                 || dfs(board, word, i, j-1, idx+1);
    board[i][j] = tmp; // backtrack
    return found;
}`,
        },
      ]}
    />
  );
}

function DpSection() {
  const steps: VisualizationStep[] = [
    {
      cells: [0, '∞', '∞', '∞', '∞', '∞', '∞'].map((v, i) => ({ value: v, state: i === 0 ? 'found' as const : 'default' as const })),
      pointers: [{ index: 0, label: 'base', color: 'green' }],
      description: 'Coin Change: coins=[1,3,4], amount=6. dp[0]=0 (base case). Fill left to right.',
      auxiliary: 'Coins: [1, 3, 4] | dp[i] = min coins for amount i',
    },
    {
      cells: [0, 1, 2, '∞', '∞', '∞', '∞'].map((v, i) => ({ value: v, state: i <= 2 ? 'done' as const : 'default' as const })),
      pointers: [{ index: 2, label: 'i', color: 'blue' }],
      description: 'dp[1] = dp[0]+1 = 1 (use coin 1). dp[2] = dp[1]+1 = 2 (use coin 1).',
      auxiliary: 'dp[1]: min(dp[1-1]+1) = 1 | dp[2]: min(dp[2-1]+1) = 2',
    },
    {
      cells: [0, 1, 2, 1, '∞', '∞', '∞'].map((v, i) => ({ value: v, state: i === 3 ? 'active' as const : (i < 3 ? 'done' as const : 'default' as const) })),
      pointers: [{ index: 3, label: 'i', color: 'blue' }, { index: 0, label: 'coin=3', color: 'purple' }],
      description: 'dp[3]: try coin 1 → dp[2]+1=3. Try coin 3 → dp[0]+1=1. Min = 1!',
      auxiliary: 'dp[3] = min(dp[2]+1, dp[0]+1) = min(3, 1) = 1',
    },
    {
      cells: [0, 1, 2, 1, 1, 2, '∞'].map((v, i) => ({ value: v, state: i === 4 ? 'active' as const : (i < 4 ? 'done' as const : 'default' as const) })),
      pointers: [{ index: 4, label: 'i', color: 'blue' }, { index: 0, label: 'coin=4', color: 'purple' }],
      description: 'dp[4]: try coin 1 → dp[3]+1=2. Try coin 3 → dp[1]+1=2. Try coin 4 → dp[0]+1=1. Min = 1!',
      auxiliary: 'dp[4] = min(2, 2, 1) = 1',
    },
    {
      cells: [0, 1, 2, 1, 1, 2, 2].map((v, i) => ({ value: v, state: i === 6 ? 'found' as const : 'done' as const })),
      pointers: [{ index: 6, label: 'answer', color: 'green' }],
      description: 'dp[6]: try coin 1 → dp[5]+1=3. Try coin 3 → dp[3]+1=2. Try coin 4 → dp[2]+1=3. Min = 2!',
      auxiliary: 'Answer: dp[6] = 2 (use coins 3+3) ✓',
    },
  ];

  return (
    <PatternSection
      idea="Break a problem into overlapping subproblems. Define state (what changes), write a recurrence (how states relate), set base cases, then fill a table bottom-up or memoize top-down."
      complexity={{ time: 'O(n) to O(n×m)', space: 'O(n) to O(n×m)', why: 'Fill each cell once. 1D problems: O(n). 2D (LCS, grid): O(n×m). Often optimizable to O(n) space with rolling array.' }}
      steps={steps}
      solves={[
        'Climbing stairs / Fibonacci',
        'House robber',
        'Longest increasing subsequence',
        'Coin change (min coins)',
        'Longest common subsequence',
        'Edit distance',
        '0/1 Knapsack',
        'Unique paths in grid',
        'Word break',
      ]}
      insight="The hardest part is defining the state. Ask: 'What information do I need to make a decision at step i?' That becomes your dp array dimensions. Then ask: 'How does dp[i] relate to previous states?' That's your recurrence."
      code={`// Climbing stairs — simplest DP
// dp[i] = number of ways to reach step i
int[] dp = new int[n + 1];
dp[0] = 1; dp[1] = 1;
for (int i = 2; i <= n; i++) {
    dp[i] = dp[i-1] + dp[i-2]; // can come from 1 or 2 steps back
}`}
      variations={[
        {
          title: 'House robber (can\'t rob adjacent)',
          code: `// dp[i] = max money robbing houses 0..i
int[] dp = new int[nums.length];
dp[0] = nums[0];
dp[1] = Math.max(nums[0], nums[1]);
for (int i = 2; i < nums.length; i++) {
    dp[i] = Math.max(dp[i-1], dp[i-2] + nums[i]);
    // skip this house OR rob it + best from 2 back
}

// Space-optimized (only need prev two):
int prev2 = 0, prev1 = 0;
for (int num : nums) {
    int curr = Math.max(prev1, prev2 + num);
    prev2 = prev1;
    prev1 = curr;
}`,
        },
        {
          title: 'Coin change (minimum coins)',
          code: `// dp[amount] = min coins to make that amount
int[] dp = new int[amount + 1];
Arrays.fill(dp, amount + 1); // impossible sentinel
dp[0] = 0;

for (int i = 1; i <= amount; i++) {
    for (int coin : coins) {
        if (coin <= i) {
            dp[i] = Math.min(dp[i], dp[i - coin] + 1);
        }
    }
}
return dp[amount] > amount ? -1 : dp[amount];`,
        },
        {
          title: 'Longest common subsequence (2D)',
          code: `// dp[i][j] = LCS of text1[0..i-1] and text2[0..j-1]
int[][] dp = new int[m+1][n+1];
for (int i = 1; i <= m; i++) {
    for (int j = 1; j <= n; j++) {
        if (text1.charAt(i-1) == text2.charAt(j-1)) {
            dp[i][j] = dp[i-1][j-1] + 1;
        } else {
            dp[i][j] = Math.max(dp[i-1][j], dp[i][j-1]);
        }
    }
}`,
        },
        {
          title: 'Longest increasing subsequence — O(n log n)',
          code: `// tails[i] = smallest tail element for IS of length i+1
List<Integer> tails = new ArrayList<>();
for (int num : nums) {
    int pos = Collections.binarySearch(tails, num);
    if (pos < 0) pos = -(pos + 1);
    if (pos == tails.size()) tails.add(num);
    else tails.set(pos, num);
}
return tails.size();`,
        },
      ]}
    />
  );
}

function StackSection() {
  const steps: VisualizationStep[] = [
    {
      cells: [73, 74, 75, 71, 69, 72, 76, 73].map((v, i) => ({ value: v, state: i === 0 ? 'active' as const : 'default' as const })),
      pointers: [{ index: 0, label: 'i', color: 'blue' }],
      description: 'Daily Temperatures. Push index 0 (73°) onto stack.',
      auxiliary: 'Stack: [0(73)] | Result: [_, _, _, _, _, _, _, _]',
    },
    {
      cells: [73, 74, 75, 71, 69, 72, 76, 73].map((v, i) => ({ value: v, state: i === 0 ? 'found' as const : (i === 1 ? 'active' as const : 'default' as const) })),
      pointers: [{ index: 1, label: 'i', color: 'blue' }],
      description: '74 > 73 (stack top). Pop index 0. Answer[0] = 1-0 = 1 day.',
      auxiliary: 'Stack: [1(74)] | Result: [1, _, _, _, _, _, _, _]',
    },
    {
      cells: [73, 74, 75, 71, 69, 72, 76, 73].map((v, i) => ({ value: v, state: i <= 1 ? 'found' as const : (i === 2 ? 'active' as const : 'default' as const) })),
      pointers: [{ index: 2, label: 'i', color: 'blue' }],
      description: '75 > 74 (stack top). Pop index 1. Answer[1] = 2-1 = 1 day.',
      auxiliary: 'Stack: [2(75)] | Result: [1, 1, _, _, _, _, _, _]',
    },
    {
      cells: [73, 74, 75, 71, 69, 72, 76, 73].map((v, i) => ({ value: v, state: i <= 1 ? 'found' as const : (i >= 2 && i <= 4 ? 'active' as const : 'default' as const) })),
      pointers: [{ index: 3, label: '71', color: 'purple' }, { index: 4, label: 'i', color: 'blue' }],
      description: '71 < 75, push. 69 < 71, push. Stack grows (waiting for warmer day).',
      auxiliary: 'Stack: [2(75), 3(71), 4(69)] | Monotonic decreasing ↓',
    },
    {
      cells: [73, 74, 75, 71, 69, 72, 76, 73].map((v, i) => ({ value: v, state: i <= 1 ? 'found' as const : (i === 5 ? 'active' as const : (i === 3 || i === 4 ? 'compare' as const : 'default' as const)) })),
      pointers: [{ index: 5, label: 'i=72', color: 'blue' }],
      description: '72 > 69: pop 4, ans[4]=1. 72 > 71: pop 3, ans[3]=2. 72 < 75: stop, push.',
      auxiliary: 'Stack: [2(75), 5(72)] | Result: [1, 1, _, 2, 1, _, _, _]',
    },
    {
      cells: [73, 74, 75, 71, 69, 72, 76, 73].map((v, i) => ({ value: v, state: i <= 5 ? 'found' as const : (i === 6 ? 'active' as const : 'default' as const) })),
      pointers: [{ index: 6, label: 'i=76', color: 'blue' }],
      description: '76 > 72: pop 5, ans[5]=1. 76 > 75: pop 2, ans[2]=4. Stack empty, push 6.',
      auxiliary: 'Stack: [6(76)] | Result: [1, 1, 4, 2, 1, 1, _, _]',
    },
  ];

  return (
    <PatternSection
      idea="Maintain a stack where elements are always in increasing (or decreasing) order. When a new element violates the order, pop elements and process them — those popped elements just found their 'next greater/smaller' element."
      complexity={{ time: 'O(n)', space: 'O(n)', why: 'Each element is pushed once and popped at most once. Stack holds at most n elements.' }}
      steps={steps}
      solves={[
        'Next greater element',
        'Daily temperatures',
        'Largest rectangle in histogram',
        'Trapping rain water (stack approach)',
        'Remove K digits to make smallest number',
        'Stock span problem',
        'Sum of subarray minimums',
      ]}
      insight="The stack stores indices (not values). When you pop an element, the current element is its 'next greater/smaller', and the new stack top is its 'previous greater/smaller'. This gives you both boundaries in O(n) total."
      code={`// Daily temperatures — next warmer day
int[] result = new int[temps.length];
Deque<Integer> stack = new ArrayDeque<>(); // stores indices

for (int i = 0; i < temps.length; i++) {
    while (!stack.isEmpty() && temps[i] > temps[stack.peek()]) {
        int idx = stack.pop();
        result[idx] = i - idx;
    }
    stack.push(i);
}`}
      variations={[
        {
          title: 'Largest rectangle in histogram',
          code: `Deque<Integer> stack = new ArrayDeque<>();
int maxArea = 0;

for (int i = 0; i <= heights.length; i++) {
    int h = (i == heights.length) ? 0 : heights[i];
    while (!stack.isEmpty() && h < heights[stack.peek()]) {
        int height = heights[stack.pop()];
        int width = stack.isEmpty() ? i : i - stack.peek() - 1;
        maxArea = Math.max(maxArea, height * width);
    }
    stack.push(i);
}`,
        },
        {
          title: 'Valid parentheses',
          code: `Deque<Character> stack = new ArrayDeque<>();
for (char c : s.toCharArray()) {
    if (c == '(' || c == '[' || c == '{') {
        stack.push(c);
    } else {
        if (stack.isEmpty()) return false;
        char top = stack.pop();
        if (c == ')' && top != '(') return false;
        if (c == ']' && top != '[') return false;
        if (c == '}' && top != '{') return false;
    }
}
return stack.isEmpty();`,
        },
      ]}
    />
  );
}

function HeapSection() {
  const steps: VisualizationStep[] = [
    {
      cells: [4, 5, 8].map(v => ({ value: v, state: 'active' as const })),
      pointers: [{ index: 0, label: 'root', color: 'blue' }],
      description: 'Kth Largest (k=3). Min-heap of size 3. Added [4, 5, 8]. Root = 4 = 3rd largest.',
      auxiliary: 'Heap: [4, 5, 8] | k=3 | 3rd largest = 4',
    },
    {
      cells: [4, 5, 8].map((v, i) => ({ value: v, state: i === 0 ? 'compare' as const : 'active' as const })),
      pointers: [{ index: 0, label: 'root=4', color: 'red' }],
      description: 'Add 2. But 2 < root (4), so it\'s not in top 3. Ignore it.',
      auxiliary: 'Incoming: 2 < root(4) → skip | Heap unchanged',
    },
    {
      cells: [5, 8, 9].map(v => ({ value: v, state: 'active' as const })),
      pointers: [{ index: 0, label: 'root', color: 'blue' }],
      description: 'Add 9. 9 > root (4). Remove root, insert 9. Heap rebalances. New root = 5.',
      auxiliary: 'Heap: [5, 8, 9] | 3rd largest = 5',
    },
    {
      cells: [5, 8, 9].map((v, i) => ({ value: v, state: i === 0 ? 'found' as const : 'active' as const })),
      pointers: [{ index: 0, label: 'answer', color: 'green' }],
      description: 'Answer: heap root = 5 (3rd largest of all elements seen). O(n log k) total.',
      auxiliary: 'All elements: [4,5,8,2,3,9,1] | Top 3: [5,8,9] | 3rd = 5 ✓',
    },
  ];

  return (
    <PatternSection
      idea="A heap gives you the min or max element in O(1) and insert/remove in O(log n). Use it when you need to repeatedly find the smallest/largest element, or maintain a running top-K."
      complexity={{ time: 'O(n log k)', space: 'O(k)', why: 'For top-K: process n elements, each heap operation is O(log k). Heap never exceeds size k.' }}
      steps={steps}
      solves={[
        'Kth largest element',
        'Top K frequent elements',
        'Merge K sorted lists',
        'Find median from data stream',
        'Meeting rooms II (min rooms needed)',
        'Task scheduler',
        'K closest points to origin',
      ]}
      insight="For 'Kth largest', use a min-heap of size K. Everything in the heap is in the top-K, and the heap root is the Kth largest. For 'Kth smallest', use a max-heap of size K. The size constraint is what makes it efficient."
      code={`// Kth largest element — min-heap of size K
PriorityQueue<Integer> minHeap = new PriorityQueue<>();
for (int num : nums) {
    minHeap.offer(num);
    if (minHeap.size() > k) minHeap.poll(); // remove smallest
}
return minHeap.peek(); // kth largest`}
      variations={[
        {
          title: 'Merge K sorted lists',
          code: `PriorityQueue<ListNode> pq = new PriorityQueue<>(
    (a, b) -> a.val - b.val);

for (ListNode head : lists) {
    if (head != null) pq.offer(head);
}

ListNode dummy = new ListNode(0), curr = dummy;
while (!pq.isEmpty()) {
    ListNode node = pq.poll();
    curr.next = node;
    curr = curr.next;
    if (node.next != null) pq.offer(node.next);
}
return dummy.next;`,
        },
        {
          title: 'Find median from data stream (two heaps)',
          code: `PriorityQueue<Integer> lo = new PriorityQueue<>(Collections.reverseOrder()); // max-heap
PriorityQueue<Integer> hi = new PriorityQueue<>(); // min-heap

void addNum(int num) {
    lo.offer(num);
    hi.offer(lo.poll()); // balance: push max of lo to hi
    if (hi.size() > lo.size()) lo.offer(hi.poll());
}

double findMedian() {
    return lo.size() > hi.size() ? lo.peek() : (lo.peek() + hi.peek()) / 2.0;
}`,
        },
        {
          title: 'Top K frequent elements',
          code: `Map<Integer, Integer> freq = new HashMap<>();
for (int n : nums) freq.merge(n, 1, Integer::sum);

PriorityQueue<Integer> pq = new PriorityQueue<>(
    (a, b) -> freq.get(a) - freq.get(b)); // min-heap by freq

for (int key : freq.keySet()) {
    pq.offer(key);
    if (pq.size() > k) pq.poll();
}`,
        },
      ]}
    />
  );
}

function GraphsSection() {
  const steps: VisualizationStep[] = [
    {
      cells: [0, 1, 2, 3].map(v => ({ value: `C${v}`, state: 'default' as const })),
      pointers: [{ index: 3, label: 'in=0', color: 'green' }],
      description: 'Topological Sort: 4 courses. Prerequisites: 1→0, 2→0, 3→1, 3→2. Start with in-degree 0.',
      auxiliary: 'In-degree: [2, 1, 1, 0] | Queue: [3]',
    },
    {
      cells: [0, 1, 2, 3].map((v, i) => ({ value: `C${v}`, state: i === 3 ? 'done' as const : (i >= 1 ? 'active' as const : 'default' as const) })),
      pointers: [{ index: 1, label: 'in=0', color: 'green' }, { index: 2, label: 'in=0', color: 'green' }],
      description: 'Process C3. Decrement neighbors (C1, C2). Both reach in-degree 0 → add to queue.',
      auxiliary: 'In-degree: [2, 0, 0, ✓] | Queue: [1, 2] | Order: [3]',
    },
    {
      cells: [0, 1, 2, 3].map((v, i) => ({ value: `C${v}`, state: (i >= 1) ? 'done' as const : 'active' as const })),
      pointers: [{ index: 0, label: 'in=0', color: 'green' }],
      description: 'Process C1, C2. Decrement C0 twice. C0 reaches in-degree 0 → add to queue.',
      auxiliary: 'In-degree: [0, ✓, ✓, ✓] | Queue: [0] | Order: [3,1,2]',
    },
    {
      cells: [0, 1, 2, 3].map(v => ({ value: `C${v}`, state: 'found' as const })),
      pointers: [],
      description: 'Process C0. All courses processed (count=4=numCourses). Valid ordering exists!',
      auxiliary: 'Order: [3, 1, 2, 0] ✓ | If count < numCourses → cycle!',
    },
  ];

  return (
    <PatternSection
      idea="Graphs = nodes + edges. Represent with adjacency list. Most graph problems reduce to: traversal (BFS/DFS), shortest path (Dijkstra/BFS), cycle detection, topological sort, or union-find for connected components."
      complexity={{ time: 'O(V + E)', space: 'O(V + E)', why: 'Adjacency list stores all edges. Traversal visits each vertex and edge once. Dijkstra: O((V+E) log V) with heap.' }}
      steps={steps}
      solves={[
        'Course schedule (cycle detection / topological sort)',
        'Clone graph',
        'Pacific Atlantic water flow',
        'Cheapest flights within K stops (Dijkstra variant)',
        'Network delay time (Dijkstra)',
        'Redundant connection (Union-Find)',
        'Alien dictionary (topological sort)',
        'Accounts merge (Union-Find)',
      ]}
      insight="Topological sort = process nodes in dependency order (only works on DAGs). If you can't topo-sort all nodes, there's a cycle. Dijkstra = BFS with a priority queue for weighted shortest path. Union-Find = 'are these two nodes connected?' in near O(1)."
      code={`// Topological sort — Course Schedule (BFS / Kahn's)
int[] inDegree = new int[numCourses];
Map<Integer, List<Integer>> graph = new HashMap<>();

for (int[] edge : prerequisites) {
    graph.computeIfAbsent(edge[1], k -> new ArrayList<>()).add(edge[0]);
    inDegree[edge[0]]++;
}

Queue<Integer> queue = new LinkedList<>();
for (int i = 0; i < numCourses; i++) {
    if (inDegree[i] == 0) queue.offer(i);
}

int count = 0;
while (!queue.isEmpty()) {
    int course = queue.poll();
    count++;
    for (int next : graph.getOrDefault(course, List.of())) {
        if (--inDegree[next] == 0) queue.offer(next);
    }
}
return count == numCourses; // false = cycle exists`}
      variations={[
        {
          title: 'Dijkstra — shortest path (weighted)',
          code: `// dist[node] = shortest distance from source
int[] dist = new int[n];
Arrays.fill(dist, Integer.MAX_VALUE);
dist[source] = 0;

// min-heap: {distance, node}
PriorityQueue<int[]> pq = new PriorityQueue<>((a,b) -> a[0] - b[0]);
pq.offer(new int[]{0, source});

while (!pq.isEmpty()) {
    int[] curr = pq.poll();
    int d = curr[0], u = curr[1];
    if (d > dist[u]) continue; // stale entry

    for (int[] edge : graph.get(u)) { // {neighbor, weight}
        int v = edge[0], w = edge[1];
        if (dist[u] + w < dist[v]) {
            dist[v] = dist[u] + w;
            pq.offer(new int[]{dist[v], v});
        }
    }
}`,
        },
        {
          title: 'Union-Find (with path compression + rank)',
          code: `int[] parent, rank;

void init(int n) {
    parent = new int[n]; rank = new int[n];
    for (int i = 0; i < n; i++) parent[i] = i;
}

int find(int x) {
    if (parent[x] != x) parent[x] = find(parent[x]); // path compression
    return parent[x];
}

boolean union(int x, int y) {
    int px = find(x), py = find(y);
    if (px == py) return false; // already connected
    if (rank[px] < rank[py]) parent[px] = py;
    else if (rank[px] > rank[py]) parent[py] = px;
    else { parent[py] = px; rank[px]++; }
    return true;
}`,
        },
      ]}
    />
  );
}

export default function CodingGuidePage() {
  const [activeSection, setActiveSection] = useState<Section>('two-pointers');

  useDocumentMeta({
    title: 'Coding Interview Guide — CS Reference Guide',
    description: 'Pattern refresher for coding interviews. Core idea, skeleton code in Java, and key problems for each pattern.',
  });

  const handleSectionChange = useCallback((section: Section) => {
    setActiveSection(section);
  }, []);

  const renderSection = () => {
    switch (activeSection) {
      case 'two-pointers': return <TwoPointersSection />;
      case 'sliding-window': return <SlidingWindowSection />;
      case 'hashmap': return <HashMapSection />;
      case 'binary-search': return <BinarySearchSection />;
      case 'bfs-dfs': return <BfsDfsSection />;
      case 'backtracking': return <BacktrackingSection />;
      case 'dp': return <DpSection />;
      case 'stack': return <StackSection />;
      case 'heap': return <HeapSection />;
      case 'graphs': return <GraphsSection />;
    }
  };

  return (
    <div className="page-coding-guide">
      <h2 className="page-coding-guide__title">Coding Interview Guide</h2>
      <p className="page-coding-guide__subtitle">Pattern refresher — read 30 min before your interview to reload everything.</p>

      <div className="bigo-chart-image">
        <img src="/images/bigO.png" alt="Big-O Complexity Chart showing growth rates from O(1) to O(n!)" />
      </div>

      <nav className="cg-nav" aria-label="Patterns">
        {SECTIONS.map(section => (
          <button
            key={section.id}
            className={`cg-nav__btn ${activeSection === section.id ? 'cg-nav__btn--active' : ''}`}
            onClick={() => handleSectionChange(section.id)}
            aria-current={activeSection === section.id ? 'true' : undefined}
          >
            {section.label}
          </button>
        ))}
      </nav>

      <div className="cg-content">
        {renderSection()}
      </div>
    </div>
  );
}
