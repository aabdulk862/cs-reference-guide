/**
 * Coding Interview Guide — Top 25 LeetCode problems organized by pattern.
 * Dense, concrete, code-heavy. Each tab: core idea → visualization → real problems with full solutions.
 */

import { useState, useCallback } from 'react';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';
import { ComplexityPair } from '@/components/content/ComplexityBadge';

type Section = 'two-pointers' | 'sliding-window' | 'hashmap' | 'binary-search' | 'bfs-dfs' | 'backtracking' | 'dp' | 'stack' | 'heap' | 'graphs' | 'linked-list' | 'intervals';

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
  { id: 'linked-list', label: 'Linked List' },
  { id: 'intervals', label: 'Greedy / Intervals' },
];

interface VisualizationStep {
  cells: CellData[];
  pointers?: { index: number; label: string; color: 'blue' | 'red' | 'green' | 'purple' }[];
  description: string;
  auxiliary?: string;
}

interface CellData {
  value: string | number;
  state: 'default' | 'active' | 'found' | 'done' | 'compare' | 'window';
}

interface ProblemSolution {
  id: number;
  title: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  insight: string;
  code: string;
  edges?: string;
  followUp?: string;
}

interface PatternSectionProps {
  idea: string;
  solves: string[];
  insight: string;
  complexity: { time: string; space: string; why: string };
  steps: VisualizationStep[];
  code: string;
  problems: ProblemSolution[];
  currentStep: number;
  onStepChange: (step: number) => void;
}

/** Minimal Java syntax highlighter — keywords, types, comments, strings */
function JavaCode({ code }: { code: string }) {
  const highlighted = code.split('\n').map((line, lineIdx) => {
    // Handle single-line comments
    const commentIdx = line.indexOf('//');
    let codePart = commentIdx >= 0 ? line.slice(0, commentIdx) : line;
    const commentPart = commentIdx >= 0 ? line.slice(commentIdx) : '';

    // Tokenize the code part
    const tokens = codePart.split(/(\b(?:public|private|protected|static|final|void|class|new|return|if|else|while|for|break|continue|null|true|false|this|import|throws|try|catch|extends|implements)\b|\b(?:int|boolean|char|long|double|float|String|Integer|Map|HashMap|Set|HashSet|List|ArrayList|LinkedList|Queue|Deque|ArrayDeque|PriorityQueue|TreeNode|ListNode|Node|Arrays|Collections|Math|Character)\b|"[^"]*")/g);

    const keywords = new Set(['public','private','protected','static','final','void','class','new','return','if','else','while','for','break','continue','null','true','false','this','import','throws','try','catch','extends','implements']);
    const types = new Set(['int','boolean','char','long','double','float','String','Integer','Map','HashMap','Set','HashSet','List','ArrayList','LinkedList','Queue','Deque','ArrayDeque','PriorityQueue','TreeNode','ListNode','Node','Arrays','Collections','Math','Character']);

    return (
      <span key={lineIdx}>
        {tokens.map((token, i) => {
          if (keywords.has(token)) return <span key={i} className="cg-hl-kw">{token}</span>;
          if (types.has(token)) return <span key={i} className="cg-hl-type">{token}</span>;
          if (token.startsWith('"')) return <span key={i} className="cg-hl-str">{token}</span>;
          return <span key={i}>{token}</span>;
        })}
        {commentPart && <span className="cg-hl-comment">{commentPart}</span>}
        {'\n'}
      </span>
    );
  });

  return <pre><code>{highlighted}</code></pre>;
}

interface AlgoVisualizerProps {
  steps: VisualizationStep[];
  currentStep: number;
  onStepChange: (step: number) => void;
}

function AlgoVisualizer({ steps, currentStep, onStepChange }: AlgoVisualizerProps) {
  const step = steps[currentStep];

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      onStepChange(Math.min(steps.length - 1, currentStep + 1));
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      onStepChange(Math.max(0, currentStep - 1));
    }
  }, [steps.length, currentStep, onStepChange]);

  return (
    <div className="cg-viz" tabIndex={0} onKeyDown={handleKeyDown} role="region" aria-label="Algorithm visualization">
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
      {step.auxiliary && <div className="cg-viz__aux">{step.auxiliary}</div>}
      <div className="cg-viz__desc">{step.description}</div>
      <div className="cg-viz__controls">
        <button className="cg-viz__btn" onClick={() => onStepChange(Math.max(0, currentStep - 1))} disabled={currentStep === 0} aria-label="Previous step">←</button>
        <div className="cg-viz__progress">
          {steps.map((_, i) => (
            <span key={i} className={`cg-viz__dot ${i === currentStep ? 'cg-viz__dot--active' : i < currentStep ? 'cg-viz__dot--done' : ''}`} />
          ))}
        </div>
        <button className="cg-viz__btn" onClick={() => onStepChange(Math.min(steps.length - 1, currentStep + 1))} disabled={currentStep === steps.length - 1} aria-label="Next step">→</button>
      </div>
    </div>
  );
}

function PatternSection({ idea, solves, insight, complexity, steps, code, problems, currentStep, onStepChange }: PatternSectionProps) {
  return (
    <div className="cg-pattern-section">
      <div className="cg-idea">
        <div className="cg-idea__label">Core idea</div>
        <p>{idea}</p>
      </div>

      <ComplexityPair time={complexity.time} space={complexity.space} why={complexity.why} />

      <AlgoVisualizer steps={steps} currentStep={currentStep} onStepChange={onStepChange} />

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
        <div className="cg-code__label">Template</div>
        <JavaCode code={code} />
      </div>

      <div className="cg-problems">
        <div className="cg-problems__label">Full Solutions</div>
        {problems.map(p => (
          <div key={p.id} className="cg-problem-item">
            <div className="cg-problem-item__header">
              <span className="cg-problem-item__id">#{p.id}</span>
              <span className="cg-problem-item__title">{p.title}</span>
              <span className={`cg-problem-item__diff cg-problem-item__diff--${p.difficulty.toLowerCase()}`}>{p.difficulty}</span>
            </div>
            <div className="cg-problem-item__insight">💡 {p.insight}</div>
            <JavaCode code={p.code} />
            {(p.edges || p.followUp) && (
              <div className="cg-problem-item__footer">
                {p.edges && <span className="cg-problem-item__edges">⚠️ {p.edges}</span>}
                {p.followUp && <span className="cg-problem-item__followup">🔄 {p.followUp}</span>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

interface SectionStepProps {
  currentStep: number;
  onStepChange: (step: number) => void;
}

function TwoPointersSection({ currentStep, onStepChange }: SectionStepProps) {
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
      currentStep={currentStep}
      onStepChange={onStepChange}
      solves={[
        'Two Sum on sorted array',
        'Container with most water',
        'Three Sum / Three Sum Closest',
        'Remove duplicates in-place',
        'Valid palindrome',
        'Trapping rain water',
      ]}
      insight="If the array is sorted (or you can sort it), two pointers from both ends lets you make a decision at each step — move left pointer right to increase sum, or right pointer left to decrease it. You never need to go back."
      code={`// Two Sum on sorted array — the template
int left = 0, right = nums.length - 1;
while (left < right) {
    int sum = nums[left] + nums[right];
    if (sum == target) return new int[]{left, right};
    else if (sum < target) left++;
    else right--;
}`}

      problems={[
        {
          id: 125,
          title: 'Valid Palindrome',
          difficulty: 'Easy',
          insight: 'Skip non-alphanumeric in-place with two pointers from both ends. No need to build a clean string.',
          edges: 'Empty string → true. Single char → true. All non-alphanumeric → true.',
          followUp: 'What if you can delete at most one character? (LC #680 — try both skip-left and skip-right on mismatch)',
          code: `public boolean isPalindrome(String s) {
    int left = 0, right = s.length() - 1;
    while (left < right) {
        while (left < right && !Character.isLetterOrDigit(s.charAt(left))) left++;
        while (left < right && !Character.isLetterOrDigit(s.charAt(right))) right--;
        if (Character.toLowerCase(s.charAt(left)) != Character.toLowerCase(s.charAt(right)))
            return false;
        left++; right--;
    }
    return true;
}`,
        },
        {
          id: 11,
          title: 'Container With Most Water',
          difficulty: 'Medium',
          insight: 'Start widest. Move the shorter line inward — it\'s the bottleneck. On tie: move either (width shrinks, height can\'t increase, so no valid pair is skipped).',
          edges: 'Two elements → only one container. All same height → first/last is optimal.',
          followUp: 'What about Trapping Rain Water? (LC #42 — need to consider ALL bars, not just two endpoints)',
          code: `public int maxArea(int[] height) {
    int left = 0, right = height.length - 1, max = 0;
    while (left < right) {
        int area = Math.min(height[left], height[right]) * (right - left);
        max = Math.max(max, area);
        if (height[left] < height[right]) left++;
        else right--;
    }
    return max;
}`,
        },
        {
          id: 15,
          title: '3Sum',
          difficulty: 'Medium',
          insight: 'Sort first. Fix one number, two-pointer the rest. Skip duplicates by checking nums[i] == nums[i-1].',
          edges: 'Array < 3 elements → empty. All zeros → [[0,0,0]]. Handle duplicate triplets via skip logic.',
          followUp: 'What about 4Sum? (Same pattern: fix two numbers, two-pointer the rest. O(n³).)',
          code: `public List<List<Integer>> threeSum(int[] nums) {
    List<List<Integer>> res = new ArrayList<>();
    Arrays.sort(nums);
    for (int i = 0; i < nums.length - 2; i++) {
        if (nums[i] > 0) break;                          // can't sum to 0
        if (i > 0 && nums[i] == nums[i-1]) continue;     // skip dupes
        int lo = i + 1, hi = nums.length - 1;
        while (lo < hi) {
            int sum = nums[i] + nums[lo] + nums[hi];
            if (sum == 0) {
                res.add(List.of(nums[i], nums[lo], nums[hi]));
                lo++; hi--;
                while (lo < hi && nums[lo] == nums[lo-1]) lo++;   // skip left dupes
                while (lo < hi && nums[hi] == nums[hi+1]) hi--;   // skip right dupes
            } else if (sum < 0) lo++;
            else hi--;
        }
    }
    return res;
}`,
        },
        {
          id: 56,
          title: 'Merge Intervals',
          difficulty: 'Medium',
          insight: 'Sort by start time. Scan left to right: if current overlaps previous, merge (extend end). Otherwise start new interval.',
          edges: 'Single interval → return as-is. All overlapping → one merged interval. Already sorted → still works.',
          followUp: 'What about Insert Interval? (LC #57 — find insertion point, merge overlapping neighbors.)',
          code: `public int[][] merge(int[][] intervals) {
    Arrays.sort(intervals, (a, b) -> a[0] - b[0]); // sort by start
    List<int[]> merged = new ArrayList<>();
    for (int[] curr : intervals) {
        if (merged.isEmpty() || merged.get(merged.size()-1)[1] < curr[0]) {
            merged.add(curr);  // no overlap, add new interval
        } else {
            // overlap: extend the end of the last merged interval
            merged.get(merged.size()-1)[1] = Math.max(merged.get(merged.size()-1)[1], curr[1]);
        }
    }
    return merged.toArray(new int[0][]);
}`,
        },
      ]}
    />
  );
}

function SlidingWindowSection({ currentStep, onStepChange }: SectionStepProps) {
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
      description: 'Expand R. Window "abc" — all unique.',
      auxiliary: 'Window: "abc" | Length: 3',
    },
    {
      cells: 'abcbdab'.split('').map((v, i) => ({ value: v, state: i <= 3 ? 'window' as const : 'default' as const })),
      pointers: [{ index: 0, label: 'L', color: 'blue' }, { index: 3, label: 'R', color: 'red' }],
      description: 'R hits "b" at index 3. Duplicate! Shrink L past first "b".',
      auxiliary: 'Window: "abcb" ← duplicate!',
    },
    {
      cells: 'abcbdab'.split('').map((v, i) => ({ value: v, state: (i >= 2 && i <= 3) ? 'window' as const : (i < 2 ? 'done' as const : 'default' as const) })),
      pointers: [{ index: 2, label: 'L', color: 'blue' }, { index: 3, label: 'R', color: 'red' }],
      description: 'L jumps to index 2. Window "cb" valid again.',
      auxiliary: 'Window: "cb" | Max so far: 3',
    },
    {
      cells: 'abcbdab'.split('').map((v, i) => ({ value: v, state: (i >= 2 && i <= 5) ? 'found' as const : 'done' as const })),
      pointers: [{ index: 2, label: 'L', color: 'green' }, { index: 5, label: 'R', color: 'green' }],
      description: 'Expand through "d", "a". Window "cbda" — length 4, new max!',
      auxiliary: 'Window: "cbda" | Max: 4 ✓',
    },
  ];

  return (
    <PatternSection
      idea="Maintain a window [left, right] over a contiguous subarray/substring. Expand right to include more, shrink left when a constraint is violated. Track the best answer as you go."
      complexity={{ time: 'O(n)', space: 'O(k)', why: 'Each element enters and leaves the window at most once. Space depends on what you track (charset size k).' }}
      steps={steps}
      currentStep={currentStep}
      onStepChange={onStepChange}
      solves={[
        'Longest substring without repeating characters',
        'Best time to buy and sell stock',
        'Minimum window substring',
        'Maximum sum subarray of size K',
        'Longest substring with at most K distinct chars',
        'Permutation in string / Find all anagrams',
      ]}
      insight="The window only moves forward — right expands, left shrinks. You never reset. This is why it's O(n) even though it looks like two loops."
      code={`// Longest substring without repeating chars — the template
Map<Character, Integer> lastSeen = new HashMap<>();
int left = 0, maxLen = 0;
for (int right = 0; right < s.length(); right++) {
    char c = s.charAt(right);
    if (lastSeen.containsKey(c))
        left = Math.max(left, lastSeen.get(c) + 1); // jump past dupe
    lastSeen.put(c, right);
    maxLen = Math.max(maxLen, right - left + 1);
}`}

      problems={[
        {
          id: 121,
          title: 'Best Time to Buy and Sell Stock',
          difficulty: 'Easy',
          insight: 'Track min price so far. At each day, profit = price - minPrice. One pass, two variables.',
          edges: 'Single day → 0. Prices only decrease → 0. All same price → 0.',
          followUp: 'What if you can buy/sell multiple times? (LC #122 — sum all positive differences)',
          code: `public int maxProfit(int[] prices) {
    int minPrice = Integer.MAX_VALUE, maxProfit = 0;
    for (int price : prices) {
        if (price < minPrice) minPrice = price;
        else maxProfit = Math.max(maxProfit, price - minPrice);
    }
    return maxProfit;
}`,
        },
        {
          id: 3,
          title: 'Longest Substring Without Repeating Characters',
          difficulty: 'Medium',
          insight: 'HashMap stores char→last index. On duplicate, jump left past it. Use max(left, ...) so left never goes backwards.',
          edges: 'Empty string → 0. All same chars → 1. All unique → length.',
          followUp: 'What if at most K repeating chars allowed? (LC #340 — track frequency, shrink when distinct > k)',
          code: `public int lengthOfLongestSubstring(String s) {
    Map<Character, Integer> map = new HashMap<>();
    int left = 0, max = 0;
    for (int right = 0; right < s.length(); right++) {
        char c = s.charAt(right);
        if (map.containsKey(c))
            left = Math.max(left, map.get(c) + 1);
        map.put(c, right);
        max = Math.max(max, right - left + 1);
    }
    return max;
}`,
        },
        {
          id: 76,
          title: 'Minimum Window Substring',
          difficulty: 'Hard',
          insight: 'Expand right to satisfy constraint (all chars of t present). Shrink left to minimize. Track "matched" count of distinct chars fully satisfied.',
          edges: 't longer than s → "". t has duplicate chars (need frequency match, not just presence).',
          followUp: 'What if you need the window to contain chars in order? (Much harder — DP approach)',
          code: `public String minWindow(String s, String t) {
    Map<Character, Integer> need = new HashMap<>(), have = new HashMap<>();
    for (char c : t.toCharArray()) need.merge(c, 1, Integer::sum);
    int left = 0, matched = 0, minLen = Integer.MAX_VALUE, start = 0;
    for (int right = 0; right < s.length(); right++) {
        char c = s.charAt(right);
        have.merge(c, 1, Integer::sum);
        if (need.containsKey(c) && have.get(c).equals(need.get(c))) matched++;
        while (matched == need.size()) {
            if (right - left + 1 < minLen) { minLen = right - left + 1; start = left; }
            char lc = s.charAt(left);
            have.merge(lc, -1, Integer::sum);
            if (need.containsKey(lc) && have.get(lc) < need.get(lc)) matched--;
            left++;
        }
    }
    return minLen == Integer.MAX_VALUE ? "" : s.substring(start, start + minLen);
}`,
        },
      ]}
    />
  );
}

function HashMapSection({ currentStep, onStepChange }: SectionStepProps) {
  const steps: VisualizationStep[] = [
    {
      cells: [2, 7, 11, 15].map(v => ({ value: v, state: 'default' as const })),
      pointers: [{ index: 0, label: 'i', color: 'blue' }],
      description: 'Two Sum: target = 9. Check if complement (9-2=7) is in map.',
      auxiliary: 'Map: {} | Need: 7 → not found',
    },
    {
      cells: [2, 7, 11, 15].map((v, i) => ({ value: v, state: i === 0 ? 'done' as const : (i === 1 ? 'active' as const : 'default' as const) })),
      pointers: [{ index: 1, label: 'i', color: 'blue' }],
      description: 'Store 2→0. Move to index 1. Complement (9-7=2) IS in map at index 0!',
      auxiliary: 'Map: {2→0} | Need: 2 → FOUND!',
    },
    {
      cells: [2, 7, 11, 15].map((v, i) => ({ value: v, state: (i === 0 || i === 1) ? 'found' as const : 'done' as const })),
      pointers: [{ index: 0, label: '✓', color: 'green' }, { index: 1, label: '✓', color: 'green' }],
      description: 'Return [0, 1]. Single pass with O(1) lookups.',
      auxiliary: 'Result: [0, 1]',
    },
  ];

  return (
    <PatternSection
      idea="Use a HashMap for O(1) lookups to avoid nested loops. Store what you've seen so far, then check if the complement/target exists as you iterate."
      complexity={{ time: 'O(n)', space: 'O(n)', why: 'Single pass through array. HashMap stores up to n entries in worst case.' }}
      steps={steps}
      currentStep={currentStep}
      onStepChange={onStepChange}
      solves={[
        'Two Sum (unsorted)',
        'Valid anagram',
        'Group anagrams',
        'Subarray sum equals K (prefix sum + map)',
        'Longest consecutive sequence',
        'Top K frequent elements',
      ]}
      insight="Instead of searching for a pair with two loops, store each element in a map and check if its complement already exists. One pass, O(n)."
      code={`// Two Sum — the template for complement lookups
Map<Integer, Integer> map = new HashMap<>();
for (int i = 0; i < nums.length; i++) {
    int complement = target - nums[i];
    if (map.containsKey(complement))
        return new int[]{map.get(complement), i};
    map.put(nums[i], i);
}`}
      problems={[
        {
          id: 1,
          title: 'Two Sum',
          difficulty: 'Easy',
          insight: 'Store value→index. For each element, check if (target - current) exists. Single pass.',
          edges: 'Negative numbers work fine. Duplicate values: map stores latest index (still correct). target = 2×nums[i]: must be different indices.',
          followUp: 'What if the array is sorted? (Two pointers, O(1) space.) What if you need all pairs? (Don\'t return early.)',
          code: `public int[] twoSum(int[] nums, int target) {
    Map<Integer, Integer> seen = new HashMap<>();
    for (int i = 0; i < nums.length; i++) {
        int complement = target - nums[i];
        if (seen.containsKey(complement))
            return new int[]{seen.get(complement), i};
        seen.put(nums[i], i);
    }
    return new int[]{};
}`,
        },
        {
          id: 242,
          title: 'Valid Anagram',
          difficulty: 'Easy',
          insight: 'int[26] counter: increment for s, decrement for t. All zeros = anagram.',
          edges: 'Different lengths → false immediately. Unicode chars? Use HashMap instead of int[26].',
          followUp: 'What if inputs are streams? (Sort both and compare, or use HashMap with running counts)',
          code: `public boolean isAnagram(String s, String t) {
    if (s.length() != t.length()) return false;
    int[] count = new int[26];
    for (int i = 0; i < s.length(); i++) {
        count[s.charAt(i) - 'a']++;
        count[t.charAt(i) - 'a']--;
    }
    for (int c : count) if (c != 0) return false;
    return true;
}`,
        },
        {
          id: 49,
          title: 'Group Anagrams',
          difficulty: 'Medium',
          insight: 'Sorted string as map key. All anagrams sort to the same key → same bucket.',
          edges: 'Empty strings → group together. Single char strings. Mixed case? (Problem says lowercase only.)',
          followUp: 'Can you avoid sorting? (Use char frequency as key: "1#0#2#..." for O(n×k) instead of O(n×k log k))',
          code: `public List<List<String>> groupAnagrams(String[] strs) {
    Map<String, List<String>> map = new HashMap<>();
    for (String s : strs) {
        char[] chars = s.toCharArray();
        Arrays.sort(chars);
        String key = new String(chars);
        map.computeIfAbsent(key, k -> new ArrayList<>()).add(s);
    }
    return new ArrayList<>(map.values());
}`,
        },
        {
          id: 238,
          title: 'Product of Array Except Self',
          difficulty: 'Medium',
          insight: 'Two passes: left-to-right builds prefix products, right-to-left builds suffix products. result[i] = prefix[i] × suffix[i]. No division needed.',
          edges: 'Contains zero → all products are 0 except at the zero index. Two zeros → all zeros.',
          followUp: 'What if you can use division? (Product of all / nums[i] — but handle zeros separately.)',
          code: `public int[] productExceptSelf(int[] nums) {
    int n = nums.length;
    int[] result = new int[n];
    result[0] = 1;
    for (int i = 1; i < n; i++)
        result[i] = result[i-1] * nums[i-1]; // prefix products
    int suffix = 1;
    for (int i = n - 2; i >= 0; i--) {
        suffix *= nums[i+1];
        result[i] *= suffix; // multiply by suffix product
    }
    return result;
}`,
        },
        {
          id: 146,
          title: 'LRU Cache',
          difficulty: 'Medium',
          insight: 'HashMap for O(1) lookup + doubly linked list for O(1) eviction order. get() moves node to front. put() adds to front, evicts from tail if over capacity.',
          edges: 'Capacity 1 → every put evicts. get() on missing key → -1. put() on existing key → update value + move to front.',
          followUp: 'What about LFU Cache? (LC #460 — track frequency, evict least frequent, break ties by LRU.)',
          code: `class LRUCache {
    int cap;
    Map<Integer, Node> map = new HashMap<>();
    Node head = new Node(0,0), tail = new Node(0,0); // sentinels

    LRUCache(int capacity) { cap = capacity; head.next = tail; tail.prev = head; }

    public int get(int key) {
        if (!map.containsKey(key)) return -1;
        Node node = map.get(key);
        remove(node); addToFront(node); // mark as recently used
        return node.val;
    }

    public void put(int key, int value) {
        if (map.containsKey(key)) remove(map.get(key));
        if (map.size() == cap) { map.remove(tail.prev.key); remove(tail.prev); }
        Node node = new Node(key, value);
        map.put(key, node); addToFront(node);
    }

    void addToFront(Node n) { n.next=head.next; n.prev=head; head.next.prev=n; head.next=n; }
    void remove(Node n) { n.prev.next=n.next; n.next.prev=n.prev; }
}
class Node { int key, val; Node prev, next; Node(int k,int v){key=k;val=v;} }`,
        },
      ]}
    />
  );
}

function BinarySearchSection({ currentStep, onStepChange }: SectionStepProps) {
  const steps: VisualizationStep[] = [
    {
      cells: [1, 3, 5, 7, 9, 11, 13].map(v => ({ value: v, state: 'active' as const })),
      pointers: [{ index: 0, label: 'lo', color: 'blue' }, { index: 3, label: 'mid', color: 'purple' }, { index: 6, label: 'hi', color: 'red' }],
      description: 'Target = 9. mid = 7 < 9 → search right half.',
      auxiliary: 'mid=7 < target=9 → lo = mid+1',
    },
    {
      cells: [1, 3, 5, 7, 9, 11, 13].map((v, i) => ({ value: v, state: i < 4 ? 'done' as const : 'active' as const })),
      pointers: [{ index: 4, label: 'lo', color: 'blue' }, { index: 5, label: 'mid', color: 'purple' }, { index: 6, label: 'hi', color: 'red' }],
      description: 'New range [9,11,13]. mid = 11 > 9 → search left half.',
      auxiliary: 'mid=11 > target=9 → hi = mid-1',
    },
    {
      cells: [1, 3, 5, 7, 9, 11, 13].map((v, i) => ({ value: v, state: i === 4 ? 'found' as const : 'done' as const })),
      pointers: [{ index: 4, label: '✓', color: 'green' }],
      description: 'Only 9 left. Found at index 4! 3 comparisons for 7 elements.',
      auxiliary: 'Result: index 4 — O(log n)',
    },
  ];

  return (
    <PatternSection
      idea="Halve the search space each step. Works on sorted arrays, but also on any problem with a monotonic condition — 'all values left of X satisfy condition, all right don't.'"
      complexity={{ time: 'O(log n)', space: 'O(1)', why: 'Search space halves each iteration: n → n/2 → n/4 → ... → 1 = log₂(n) steps.' }}
      steps={steps}
      currentStep={currentStep}
      onStepChange={onStepChange}
      solves={[
        'Search in sorted/rotated array',
        'Find first/last position of element',
        'Find peak element',
        'Koko eating bananas (search on answer)',
        'Minimum in rotated sorted array',
        'Median of two sorted arrays',
      ]}
      insight="Binary search isn't just 'find element in sorted array.' It's applicable whenever you can define a boolean condition that flips from false to true at some boundary. You're searching for that boundary."
      code={`// Standard binary search
int lo = 0, hi = nums.length - 1;
while (lo <= hi) {
    int mid = lo + (hi - lo) / 2;  // avoid overflow
    if (nums[mid] == target) return mid;
    else if (nums[mid] < target) lo = mid + 1;
    else hi = mid - 1;
}
return -1;`}
      problems={[
        {
          id: 704,
          title: 'Binary Search',
          difficulty: 'Easy',
          insight: 'The classic. lo + (hi - lo) / 2 avoids overflow. Three branches: found, go right, go left.',
          edges: 'Empty array → -1. Single element. Target smaller/larger than all elements.',
          followUp: 'Find the insertion position? (LC #35 — return lo when loop ends.)',
          code: `public int search(int[] nums, int target) {
    int lo = 0, hi = nums.length - 1;
    while (lo <= hi) {
        int mid = lo + (hi - lo) / 2;
        if (nums[mid] == target) return mid;
        else if (nums[mid] < target) lo = mid + 1;
        else hi = mid - 1;
    }
    return -1;
}`,
        },
        {
          id: 33,
          title: 'Search in Rotated Sorted Array',
          difficulty: 'Medium',
          insight: 'One half is always sorted. Check which half is sorted, then check if target falls in that range.',
          edges: 'Not rotated (already sorted). Rotated by n (same as original). Two elements. Target at pivot.',
          followUp: 'What if duplicates exist? (LC #81 — worst case O(n) when all elements equal.)',
          code: `public int search(int[] nums, int target) {
    int lo = 0, hi = nums.length - 1;
    while (lo <= hi) {
        int mid = lo + (hi - lo) / 2;
        if (nums[mid] == target) return mid;
        if (nums[lo] <= nums[mid]) {  // left half sorted
            if (target >= nums[lo] && target < nums[mid]) hi = mid - 1;
            else lo = mid + 1;
        } else {                       // right half sorted
            if (target > nums[mid] && target <= nums[hi]) lo = mid + 1;
            else hi = mid - 1;
        }
    }
    return -1;
}`,
        },
        {
          id: 875,
          title: 'Koko Eating Bananas',
          difficulty: 'Medium',
          insight: 'Binary search on the answer. Search speed [1, max(piles)]. For each speed, check if she can finish in h hours. lo < hi pattern finds leftmost valid.',
          edges: 'Single pile → speed = ceil(pile/h). h == piles.length → speed = max(piles). h very large → speed = 1.',
          followUp: 'Why lo < hi instead of lo <= hi? (We\'re finding leftmost valid, not exact match. hi = mid narrows without skipping.)',
          code: `public int minEatingSpeed(int[] piles, int h) {
    int lo = 1, hi = Arrays.stream(piles).max().getAsInt();
    while (lo < hi) {
        int mid = lo + (hi - lo) / 2;
        if (canFinish(piles, mid, h)) hi = mid;  // try slower
        else lo = mid + 1;                        // need faster
    }
    return lo;
}
boolean canFinish(int[] piles, int speed, int h) {
    int hours = 0;
    for (int p : piles) hours += (p + speed - 1) / speed; // ceil division
    return hours <= h;
}`,
        },
      ]}
    />
  );
}

function BfsDfsSection({ currentStep, onStepChange }: SectionStepProps) {
  const steps: VisualizationStep[] = [
    {
      cells: [1, 2, 3, 4, 5, 6].map(v => ({ value: v, state: 'default' as const })),
      pointers: [{ index: 0, label: 'root', color: 'blue' }],
      description: 'BFS level-order: start at root (1). Queue: [1].',
      auxiliary: 'Queue: [1] | Level 0',
    },
    {
      cells: [1, 2, 3, 4, 5, 6].map((v, i) => ({ value: v, state: i === 0 ? 'done' as const : (i <= 2 ? 'active' as const : 'default' as const) })),
      pointers: [{ index: 1, label: '→', color: 'blue' }, { index: 2, label: '→', color: 'blue' }],
      description: 'Process level 0 (node 1). Add children 2, 3.',
      auxiliary: 'Queue: [2, 3] | Output: [[1]]',
    },
    {
      cells: [1, 2, 3, 4, 5, 6].map((v, i) => ({ value: v, state: i <= 2 ? 'done' as const : 'active' as const })),
      pointers: [{ index: 3, label: '→', color: 'blue' }, { index: 4, label: '→', color: 'blue' }, { index: 5, label: '→', color: 'blue' }],
      description: 'Process level 1 (nodes 2, 3). Add children 4, 5, 6.',
      auxiliary: 'Queue: [4, 5, 6] | Output: [[1], [2,3]]',
    },
    {
      cells: [1, 2, 3, 4, 5, 6].map(v => ({ value: v, state: 'found' as const })),
      pointers: [],
      description: 'Process level 2. Done! Level-by-level traversal complete.',
      auxiliary: 'Output: [[1], [2,3], [4,5,6]] ✓',
    },
  ];

  return (
    <PatternSection
      idea="BFS explores level by level (queue) — use for shortest path in unweighted graphs. DFS explores as deep as possible first (stack/recursion) — use for tree traversals, path finding, connected components."
      complexity={{ time: 'O(V + E)', space: 'O(V)', why: 'Visit every vertex and edge once. Queue/stack holds at most V nodes. For trees: O(n) time, O(h) space.' }}
      steps={steps}
      currentStep={currentStep}
      onStepChange={onStepChange}
      solves={[
        'Binary tree level order traversal',
        'Invert binary tree',
        'Maximum depth of binary tree',
        'Number of islands',
        'Validate BST',
        'Word ladder (BFS shortest path)',
      ]}
      insight="BFS guarantees shortest path in unweighted graphs because it visits all nodes at distance d before any at d+1. DFS is better for 'does a path exist' or 'enumerate all paths.'"
      code={`// BFS — level order traversal template
Queue<TreeNode> queue = new LinkedList<>();
if (root != null) queue.offer(root);
while (!queue.isEmpty()) {
    int size = queue.size();  // nodes at this level
    for (int i = 0; i < size; i++) {
        TreeNode node = queue.poll();
        // process node
        if (node.left != null) queue.offer(node.left);
        if (node.right != null) queue.offer(node.right);
    }
}`}

      problems={[
        {
          id: 226,
          title: 'Invert Binary Tree',
          difficulty: 'Easy',
          insight: 'At every node: swap left and right, then recurse both. Three lines of logic.',
          edges: 'Null root → null. Single node → itself. Already symmetric → still works.',
          followUp: 'Check if a tree is symmetric? (LC #101 — compare left.left with right.right recursively.)',
          code: `public TreeNode invertTree(TreeNode root) {
    if (root == null) return null;
    TreeNode temp = root.left;
    root.left = root.right;
    root.right = temp;
    invertTree(root.left);
    invertTree(root.right);
    return root;
}`,
        },
        {
          id: 104,
          title: 'Maximum Depth of Binary Tree',
          difficulty: 'Easy',
          insight: 'Depth = 1 + max(left depth, right depth). Base case: null → 0.',
          edges: 'Null → 0. Single node → 1. Skewed tree (all left) → n.',
          followUp: 'Minimum depth? (LC #111 — BFS is better, returns at first leaf found.)',
          code: `public int maxDepth(TreeNode root) {
    if (root == null) return 0;
    return 1 + Math.max(maxDepth(root.left), maxDepth(root.right));
}`,
        },
        {
          id: 200,
          title: 'Number of Islands',
          difficulty: 'Medium',
          insight: 'Scan grid. On finding "1": count++, DFS-flood to sink entire island (mark as "0"). Each DFS = one island.',
          edges: 'All water → 0. All land → 1. Single cell. Grid is not square.',
          followUp: 'What if you can\'t modify the input? (Use a visited[][] boolean array. What about counting distinct island shapes? — normalize coordinates.)',
          code: `public int numIslands(char[][] grid) {
    int count = 0;
    for (int i = 0; i < grid.length; i++)
        for (int j = 0; j < grid[0].length; j++)
            if (grid[i][j] == '1') { count++; dfs(grid, i, j); }
    return count;
}
void dfs(char[][] grid, int i, int j) {
    if (i < 0 || i >= grid.length || j < 0 || j >= grid[0].length
        || grid[i][j] != '1') return;
    grid[i][j] = '0';
    dfs(grid, i+1, j); dfs(grid, i-1, j);
    dfs(grid, i, j+1); dfs(grid, i, j-1);
}`,
        },
        {
          id: 206,
          title: 'Reverse Linked List',
          difficulty: 'Easy',
          insight: 'Three pointers: prev=null, curr=head. Each step: save next, point curr.next to prev, advance prev and curr.',
          edges: 'Empty list → null. Single node → itself. Already reversed → works fine.',
          followUp: 'Reverse nodes in groups of K? (LC #25 — reverse K at a time, reconnect segments.)',
          code: `public ListNode reverseList(ListNode head) {
    ListNode prev = null, curr = head;
    while (curr != null) {
        ListNode next = curr.next; // save next
        curr.next = prev;          // reverse pointer
        prev = curr;               // advance prev
        curr = next;               // advance curr
    }
    return prev; // new head
}`,
        },
      ]}
    />
  );
}

function BacktrackingSection({ currentStep, onStepChange }: SectionStepProps) {
  const steps: VisualizationStep[] = [
    {
      cells: [1, 2, 3].map(v => ({ value: v, state: 'default' as const })),
      pointers: [{ index: 0, label: 'start', color: 'blue' }],
      description: 'Subsets of [1,2,3]. Start with empty path. Add [] to result.',
      auxiliary: 'Path: [] | Result: [[]]',
    },
    {
      cells: [1, 2, 3].map((v, i) => ({ value: v, state: i === 0 ? 'active' as const : 'default' as const })),
      pointers: [{ index: 0, label: 'choose', color: 'green' }],
      description: 'Choose 1. Add [1]. Recurse.',
      auxiliary: 'Path: [1] | Result: [[], [1]]',
    },
    {
      cells: [1, 2, 3].map((v, i) => ({ value: v, state: i <= 1 ? 'active' as const : 'default' as const })),
      pointers: [{ index: 1, label: 'choose', color: 'green' }],
      description: 'Choose 2. Add [1,2]. Recurse.',
      auxiliary: 'Path: [1,2] | Result: [..., [1,2]]',
    },
    {
      cells: [1, 2, 3].map(v => ({ value: v, state: 'active' as const })),
      pointers: [{ index: 2, label: 'choose', color: 'green' }],
      description: 'Choose 3. Add [1,2,3]. No more → backtrack.',
      auxiliary: 'Path: [1,2,3] | Result: [..., [1,2,3]]',
    },
    {
      cells: [1, 2, 3].map(v => ({ value: v, state: 'found' as const })),
      pointers: [],
      description: 'Continue all branches. Final: [[], [1], [1,2], [1,2,3], [1,3], [2], [2,3], [3]]',
      auxiliary: 'All 2³ = 8 subsets ✓',
    },
  ];

  return (
    <PatternSection
      idea="Build a solution incrementally. At each step: make a choice, recurse, then undo the choice (backtrack). Explores all valid combinations by treating the problem as a decision tree."
      complexity={{ time: 'O(2ⁿ) or O(n!)', space: 'O(n)', why: 'Subsets: 2ⁿ. Permutations: n!. Space is recursion depth (at most n).' }}
      steps={steps}
      currentStep={currentStep}
      onStepChange={onStepChange}
      solves={[
        'Subsets / Power set',
        'Permutations',
        'Combination Sum',
        'N-Queens',
        'Word Search in grid',
        'Generate parentheses',
        'Letter combinations of phone number',
      ]}
      insight="The template is always: choose → explore → unchoose. The only things that change: (1) what choices are available, (2) when to stop, (3) how to prune invalid paths early."
      code={`// Subsets — the purest backtracking template
void backtrack(int[] nums, int start, List<Integer> path) {
    result.add(new ArrayList<>(path));  // every path is valid
    for (int i = start; i < nums.length; i++) {
        path.add(nums[i]);              // choose
        backtrack(nums, i + 1, path);   // explore
        path.remove(path.size() - 1);   // unchoose
    }
}`}

      problems={[
        {
          id: 46,
          title: 'Permutations',
          difficulty: 'Medium',
          insight: 'At each position try every unused number. boolean[] tracks what\'s in the current path.',
          edges: 'Single element → [[x]]. Two elements → [[a,b],[b,a]]. All same values? (Problem says distinct.)',
          followUp: 'What if there are duplicates? (LC #47 — sort + skip nums[i] == nums[i-1] when !used[i-1].)',
          code: `public List<List<Integer>> permute(int[] nums) {
    List<List<Integer>> res = new ArrayList<>();
    backtrack(nums, new ArrayList<>(), new boolean[nums.length], res);
    return res;
}
void backtrack(int[] nums, List<Integer> path, boolean[] used, List<List<Integer>> res) {
    if (path.size() == nums.length) { res.add(new ArrayList<>(path)); return; }
    for (int i = 0; i < nums.length; i++) {
        if (used[i]) continue;
        used[i] = true; path.add(nums[i]);
        backtrack(nums, path, used, res);
        path.remove(path.size() - 1); used[i] = false;
    }
}`,
        },
        {
          id: 39,
          title: 'Combination Sum',
          difficulty: 'Medium',
          insight: 'Pass i (not i+1) to allow reusing same element. Prune when remaining < 0.',
          edges: 'Target = 0 → [[]]. Single candidate larger than target → []. Candidate = 1 → many combinations.',
          followUp: 'What if each number can only be used once? (LC #40 — pass i+1, skip duplicates with sort.)',
          code: `public List<List<Integer>> combinationSum(int[] candidates, int target) {
    List<List<Integer>> res = new ArrayList<>();
    Arrays.sort(candidates);
    backtrack(candidates, target, 0, new ArrayList<>(), res);
    return res;
}
void backtrack(int[] cands, int remain, int start, List<Integer> path, List<List<Integer>> res) {
    if (remain == 0) { res.add(new ArrayList<>(path)); return; }
    for (int i = start; i < cands.length; i++) {
        if (cands[i] > remain) break;  // pruning (sorted)
        path.add(cands[i]);
        backtrack(cands, remain - cands[i], i, path, res);  // i not i+1
        path.remove(path.size() - 1);
    }
}`,
        },
      ]}
    />
  );
}

function DpSection({ currentStep, onStepChange }: SectionStepProps) {
  const steps: VisualizationStep[] = [
    {
      cells: [0, '∞', '∞', '∞', '∞', '∞', '∞'].map((v, i) => ({ value: v, state: i === 0 ? 'found' as const : 'default' as const })),
      pointers: [{ index: 0, label: 'base', color: 'green' }],
      description: 'Coin Change: coins=[1,3,4], amount=6. dp[0]=0 (base). Fill left to right.',
      auxiliary: 'dp[i] = min coins for amount i',
    },
    {
      cells: [0, 1, 2, '∞', '∞', '∞', '∞'].map((v, i) => ({ value: v, state: i <= 2 ? 'done' as const : 'default' as const })),
      pointers: [{ index: 2, label: 'i', color: 'blue' }],
      description: 'dp[1]=1 (coin 1), dp[2]=2 (coin 1+1).',
      auxiliary: 'Using coin 1 only so far',
    },
    {
      cells: [0, 1, 2, 1, 1, 2, '∞'].map((v, i) => ({ value: v, state: i === 3 || i === 4 ? 'active' as const : (i < 3 ? 'done' as const : 'default' as const) })),
      pointers: [{ index: 3, label: 'coin=3', color: 'purple' }, { index: 4, label: 'coin=4', color: 'purple' }],
      description: 'dp[3]: min(dp[2]+1, dp[0]+1)=1 (coin 3). dp[4]: min(dp[3]+1, dp[0]+1)=1 (coin 4).',
      auxiliary: 'Coins 3 and 4 give better answers!',
    },
    {
      cells: [0, 1, 2, 1, 1, 2, 2].map((v, i) => ({ value: v, state: i === 6 ? 'found' as const : 'done' as const })),
      pointers: [{ index: 6, label: 'answer', color: 'green' }],
      description: 'dp[6]: min(dp[5]+1=3, dp[3]+1=2, dp[2]+1=3) = 2. Answer: 2 coins (3+3).',
      auxiliary: 'dp[6] = 2 ✓',
    },
  ];

  return (
    <PatternSection
      idea="Break a problem into overlapping subproblems. Define state (what changes), write a recurrence (how states relate), set base cases, fill a table bottom-up."
      complexity={{ time: 'O(n) to O(n×m)', space: 'O(n) to O(n×m)', why: 'Fill each cell once. 1D: O(n). 2D (LCS, grid): O(n×m). Often optimizable to O(n) with rolling variables.' }}
      steps={steps}
      currentStep={currentStep}
      onStepChange={onStepChange}
      solves={[
        'Climbing stairs / Fibonacci',
        'Maximum subarray (Kadane\'s)',
        'House robber',
        'Coin change',
        'Longest increasing subsequence',
        'Longest common subsequence',
        'Word break',
      ]}
      insight="The hardest part is defining the state. Ask: 'What info do I need to make a decision at step i?' That's your dp dimensions. Then: 'How does dp[i] relate to previous states?' That's your recurrence."
      code={`// Coin change — the template for "min cost" DP
int[] dp = new int[amount + 1];
Arrays.fill(dp, amount + 1);  // sentinel (not MAX_VALUE to avoid overflow)
dp[0] = 0;
for (int i = 1; i <= amount; i++)
    for (int coin : coins)
        if (coin <= i)
            dp[i] = Math.min(dp[i], dp[i - coin] + 1);
return dp[amount] > amount ? -1 : dp[amount];`}

      problems={[
        {
          id: 70,
          title: 'Climbing Stairs',
          difficulty: 'Easy',
          insight: 'It\'s Fibonacci. ways[n] = ways[n-1] + ways[n-2]. Only need two variables.',
          edges: 'n=0 → 1 (or 0 depending on definition). n=1 → 1. Large n → watch for integer overflow.',
          followUp: 'What if you can take 1, 2, or 3 steps? (Add dp[i-3]. What about k steps? — loop over last k values.)',
          code: `public int climbStairs(int n) {
    if (n <= 2) return n;
    int prev2 = 1, prev1 = 2;
    for (int i = 3; i <= n; i++) {
        int curr = prev1 + prev2;
        prev2 = prev1;
        prev1 = curr;
    }
    return prev1;
}`,
        },
        {
          id: 53,
          title: 'Maximum Subarray',
          difficulty: 'Medium',
          insight: 'Kadane\'s: at each position, either extend previous subarray or start fresh. currentSum = max(nums[i], currentSum + nums[i]).',
          edges: 'All negative → return the largest (least negative). Single element → that element. All positive → sum of all.',
          followUp: 'Return the actual subarray indices? (Track start/end when maxSum updates.) What about circular array? (LC #918 — max(normal Kadane, totalSum - minSubarray).)',
          code: `public int maxSubArray(int[] nums) {
    int current = nums[0], max = nums[0];
    for (int i = 1; i < nums.length; i++) {
        current = Math.max(nums[i], current + nums[i]); // extend or restart
        max = Math.max(max, current);
    }
    return max;
}`,
        },
        {
          id: 322,
          title: 'Coin Change',
          difficulty: 'Medium',
          insight: 'dp[i] = min coins for amount i. Try each coin: dp[i] = min(dp[i], dp[i-coin] + 1). Build from 0 up.',
          edges: 'amount = 0 → 0. No coins → -1. Single coin that doesn\'t divide amount → -1.',
          followUp: 'Count number of ways instead of min coins? (LC #518 — dp[i] += dp[i-coin], order of loops matters for combinations vs permutations.)',
          code: `public int coinChange(int[] coins, int amount) {
    int[] dp = new int[amount + 1];
    Arrays.fill(dp, amount + 1);  // sentinel (not MAX_VALUE to avoid overflow)
    dp[0] = 0;
    for (int i = 1; i <= amount; i++) {
        for (int coin : coins) {
            if (coin <= i) {
                dp[i] = Math.min(dp[i], dp[i - coin] + 1);
            }
        }
    }
    return dp[amount] > amount ? -1 : dp[amount];
}`,
        },
        {
          id: 139,
          title: 'Word Break',
          difficulty: 'Medium',
          insight: 'dp[i] = can s[0..i-1] be segmented? For each i, check all j < i: if dp[j] && s[j..i] is in dict → dp[i] = true.',
          edges: 'Empty string → true. Single char not in dict → false. Overlapping words in dict are fine.',
          followUp: 'Return all possible sentences? (LC #140 — backtracking with memoization.)',
          code: `public boolean wordBreak(String s, List<String> wordDict) {
    Set<String> dict = new HashSet<>(wordDict);
    boolean[] dp = new boolean[s.length() + 1];
    dp[0] = true; // empty string is always valid
    for (int i = 1; i <= s.length(); i++) {
        for (int j = 0; j < i; j++) {
            if (dp[j] && dict.contains(s.substring(j, i))) {
                dp[i] = true;
                break;
            }
        }
    }
    return dp[s.length()];
}`,
        },
        {
          id: 300,
          title: 'Longest Increasing Subsequence',
          difficulty: 'Medium',
          insight: 'O(n²): dp[i] = LIS ending at i. For each j < i, if nums[j] < nums[i]: dp[i] = max(dp[i], dp[j]+1). O(n log n): patience sorting with binary search.',
          edges: 'Single element → 1. All decreasing → 1. All equal → 1 (strictly increasing).',
          followUp: 'Print the actual subsequence? (Track parent pointers during DP, reconstruct backwards.)',
          code: `// O(n log n) — patience sorting
public int lengthOfLIS(int[] nums) {
    List<Integer> tails = new ArrayList<>(); // tails[i] = smallest tail for LIS of length i+1
    for (int num : nums) {
        int pos = Collections.binarySearch(tails, num);
        if (pos < 0) pos = -(pos + 1);
        if (pos == tails.size()) tails.add(num);
        else tails.set(pos, num);
    }
    return tails.size();
}`,
        },
      ]}
    />
  );
}

function StackSection({ currentStep, onStepChange }: SectionStepProps) {
  const steps: VisualizationStep[] = [
    {
      cells: [73, 74, 75, 71, 69, 72, 76, 73].map((v, i) => ({ value: v, state: i === 0 ? 'active' as const : 'default' as const })),
      pointers: [{ index: 0, label: 'i', color: 'blue' }],
      description: 'Daily Temperatures. Push index 0 (73°) onto stack.',
      auxiliary: 'Stack: [0(73)] | Result: [_,_,_,_,_,_,_,_]',
    },
    {
      cells: [73, 74, 75, 71, 69, 72, 76, 73].map((v, i) => ({ value: v, state: i <= 1 ? (i === 0 ? 'found' as const : 'active' as const) : 'default' as const })),
      pointers: [{ index: 1, label: 'i', color: 'blue' }],
      description: '74 > 73 (top). Pop 0, ans[0]=1-0=1. Push 1.',
      auxiliary: 'Stack: [1(74)] | Result: [1,_,_,_,_,_,_,_]',
    },
    {
      cells: [73, 74, 75, 71, 69, 72, 76, 73].map((v, i) => ({ value: v, state: i <= 1 ? 'found' as const : (i >= 2 && i <= 4 ? 'active' as const : 'default' as const) })),
      pointers: [{ index: 4, label: 'i', color: 'blue' }],
      description: '75>74: pop, ans[1]=1. Then 71<75, 69<71: push both. Stack grows.',
      auxiliary: 'Stack: [2(75), 3(71), 4(69)] ↓ monotonic',
    },
    {
      cells: [73, 74, 75, 71, 69, 72, 76, 73].map((v, i) => ({ value: v, state: i <= 1 ? 'found' as const : (i === 5 ? 'active' as const : (i === 3 || i === 4 ? 'compare' as const : 'default' as const)) })),
      pointers: [{ index: 5, label: '72', color: 'blue' }],
      description: '72>69: pop 4, ans[4]=1. 72>71: pop 3, ans[3]=2. 72<75: stop.',
      auxiliary: 'Stack: [2(75), 5(72)] | Popped 2 elements',
    },
    {
      cells: [73, 74, 75, 71, 69, 72, 76, 73].map((v, i) => ({ value: v, state: i <= 5 ? 'found' as const : (i === 6 ? 'active' as const : 'default' as const) })),
      pointers: [{ index: 6, label: '76', color: 'blue' }],
      description: '76>72: pop, ans[5]=1. 76>75: pop, ans[2]=4. Stack empty.',
      auxiliary: 'Result: [1,1,4,2,1,1,_,_] ✓',
    },
  ];

  return (
    <PatternSection
      idea="Maintain a stack where elements are always in monotonic order. When a new element violates the order, pop and process — those popped elements just found their 'next greater/smaller.'"
      complexity={{ time: 'O(n)', space: 'O(n)', why: 'Each element pushed once, popped at most once. Stack holds at most n elements.' }}
      steps={steps}
      currentStep={currentStep}
      onStepChange={onStepChange}
      solves={[
        'Valid parentheses',
        'Daily temperatures / Next greater element',
        'Largest rectangle in histogram',
        'Trapping rain water (stack approach)',
        'Min stack',
        'Remove K digits',
      ]}
      insight="The stack stores indices (not values). When you pop, the current element is its 'next greater', and the new stack top is its 'previous greater'. This gives you both boundaries in O(n)."
      code={`// Daily temperatures — monotonic stack template
int[] result = new int[temps.length];
Deque<Integer> stack = new ArrayDeque<>();  // stores indices
for (int i = 0; i < temps.length; i++) {
    while (!stack.isEmpty() && temps[i] > temps[stack.peek()]) {
        int idx = stack.pop();
        result[idx] = i - idx;  // distance to next warmer
    }
    stack.push(i);
}`}

      problems={[
        {
          id: 20,
          title: 'Valid Parentheses',
          difficulty: 'Easy',
          insight: 'Push openers. On closer: pop must match. End: stack must be empty.',
          edges: 'Single char → false. Only openers → false. Only closers → false. Nested correctly → true.',
          followUp: 'Minimum insertions to make valid? (LC #1541 — count unmatched openers and closers.)',
          code: `public boolean isValid(String s) {
    Deque<Character> stack = new ArrayDeque<>();
    for (char c : s.toCharArray()) {
        if (c == '(' || c == '[' || c == '{') stack.push(c);
        else {
            if (stack.isEmpty()) return false;
            char top = stack.pop();
            if (c == ')' && top != '(') return false;
            if (c == ']' && top != '[') return false;
            if (c == '}' && top != '{') return false;
        }
    }
    return stack.isEmpty();
}`,
        },
        {
          id: 739,
          title: 'Daily Temperatures',
          difficulty: 'Medium',
          insight: 'Monotonic decreasing stack of indices. When temp[i] > top: pop and record distance.',
          edges: 'All increasing → all 1s. All decreasing → all 0s. All same → all 0s.',
          followUp: 'What about Next Greater Element in a circular array? (LC #503 — iterate 2n with i % n.)',
          code: `public int[] dailyTemperatures(int[] temps) {
    int[] res = new int[temps.length];
    Deque<Integer> stack = new ArrayDeque<>();
    for (int i = 0; i < temps.length; i++) {
        while (!stack.isEmpty() && temps[i] > temps[stack.peek()]) {
            int idx = stack.pop();
            res[idx] = i - idx;
        }
        stack.push(i);
    }
    return res;
}`,
        },
        {
          id: 84,
          title: 'Largest Rectangle in Histogram',
          difficulty: 'Hard',
          insight: 'Monotonic increasing stack. On pop: height = popped bar, width = i - newTop - 1. Append sentinel 0 to flush remaining bars (forces all to pop at end).',
          edges: 'Single bar → its height. All same height → n × height. Strictly increasing → last bar triggers all pops.',
          followUp: 'Maximal rectangle in a 2D binary matrix? (LC #85 — build histogram per row, apply this algorithm.)',
          code: `public int largestRectangleArea(int[] heights) {
    Deque<Integer> stack = new ArrayDeque<>();
    int max = 0;
    for (int i = 0; i <= heights.length; i++) {
        int h = (i == heights.length) ? 0 : heights[i];
        while (!stack.isEmpty() && h < heights[stack.peek()]) {
            int height = heights[stack.pop()];
            int width = stack.isEmpty() ? i : i - stack.peek() - 1;
            max = Math.max(max, height * width);
        }
        stack.push(i);
    }
    return max;
}`,
        },
      ]}
    />
  );
}

function HeapSection({ currentStep, onStepChange }: SectionStepProps) {
  const steps: VisualizationStep[] = [
    {
      cells: [4, 5, 8].map(v => ({ value: v, state: 'active' as const })),
      pointers: [{ index: 0, label: 'root', color: 'blue' }],
      description: 'Kth Largest (k=3). Min-heap of size 3. Added [4,5,8]. Root=4 is 3rd largest.',
      auxiliary: 'Heap: [4, 5, 8] | k=3',
    },
    {
      cells: [4, 5, 8].map((v, i) => ({ value: v, state: i === 0 ? 'compare' as const : 'active' as const })),
      pointers: [{ index: 0, label: 'root=4', color: 'red' }],
      description: 'Add 2. 2 < root (4) → not in top 3. Skip.',
      auxiliary: 'Incoming: 2 < root → skip',
    },
    {
      cells: [5, 8, 9].map(v => ({ value: v, state: 'active' as const })),
      pointers: [{ index: 0, label: 'root', color: 'blue' }],
      description: 'Add 9. 9 > root. Remove root (4), insert 9. New root = 5.',
      auxiliary: 'Heap: [5, 8, 9] | 3rd largest = 5',
    },
    {
      cells: [5, 8, 9].map((v, i) => ({ value: v, state: i === 0 ? 'found' as const : 'active' as const })),
      pointers: [{ index: 0, label: 'answer', color: 'green' }],
      description: 'Answer: heap root = 5 (3rd largest). O(n log k) total.',
      auxiliary: 'Top 3: [5,8,9] | kth = 5 ✓',
    },
  ];

  return (
    <PatternSection
      idea="A heap gives min/max in O(1) and insert/remove in O(log n). Use it for repeatedly finding smallest/largest, maintaining running top-K, or merging K sorted streams."
      complexity={{ time: 'O(n log k)', space: 'O(k)', why: 'For top-K: process n elements, each heap op is O(log k). Heap never exceeds size k.' }}
      steps={steps}
      currentStep={currentStep}
      onStepChange={onStepChange}
      solves={[
        'Kth largest element',
        'Find median from data stream',
        'Merge K sorted lists',
        'Top K frequent elements',
        'Meeting rooms II',
        'Task scheduler',
      ]}
      insight="For 'Kth largest': min-heap of size K. Everything in the heap is top-K, root is the Kth largest. For 'Kth smallest': max-heap of size K."
      code={`// Kth largest — min-heap of size K
PriorityQueue<Integer> minHeap = new PriorityQueue<>();
for (int num : nums) {
    minHeap.offer(num);
    if (minHeap.size() > k) minHeap.poll();
}
return minHeap.peek();`}

      problems={[
        {
          id: 295,
          title: 'Find Median from Data Stream',
          difficulty: 'Hard',
          insight: 'Two heaps: max-heap for lower half, min-heap for upper half. Balance sizes. Median = top of larger heap or average of both tops.',
          edges: 'Single element → that element. Even count → average of two middles. Negative numbers work fine.',
          followUp: 'What if 99% of numbers are in [0, 100]? (Use bucket counting for that range, heap for outliers.)',
          code: `class MedianFinder {
    PriorityQueue<Integer> lo = new PriorityQueue<>(Collections.reverseOrder()); // max-heap
    PriorityQueue<Integer> hi = new PriorityQueue<>(); // min-heap

    public void addNum(int num) {
        lo.offer(num);           // always add to max-heap first
        hi.offer(lo.poll());     // balance: move max of lo to hi
        if (hi.size() > lo.size())
            lo.offer(hi.poll()); // keep lo same size or 1 bigger
    }

    public double findMedian() {
        return lo.size() > hi.size()
            ? lo.peek()
            : (lo.peek() + hi.peek()) / 2.0;
    }
}`,
        },
        {
          id: 215,
          title: 'Kth Largest Element in an Array',
          difficulty: 'Medium',
          insight: 'Min-heap of size k. Add all elements; if size > k, poll smallest. Root = kth largest.',
          edges: 'k = 1 → max element. k = n → min element. Duplicates are fine (kth largest, not kth distinct).',
          followUp: 'Can you do O(n) average? (Quickselect — partition like quicksort, recurse only one side.)',
          code: `public int findKthLargest(int[] nums, int k) {
    PriorityQueue<Integer> heap = new PriorityQueue<>();
    for (int num : nums) {
        heap.offer(num);
        if (heap.size() > k) heap.poll();
    }
    return heap.peek();
}`,
        },
        {
          id: 23,
          title: 'Merge K Sorted Lists',
          difficulty: 'Hard',
          insight: 'Min-heap of size k (one node per list). Always poll global min, push its .next. O(N log k).',
          edges: 'Empty lists array → null. Some lists are null → skip them. k = 1 → return that list. All lists empty → null.',
          followUp: 'What about divide and conquer approach? (Merge pairs recursively like merge sort — same O(N log k) but no heap.)',
          code: `public ListNode mergeKLists(ListNode[] lists) {
    PriorityQueue<ListNode> pq = new PriorityQueue<>((a, b) -> a.val - b.val);
    for (ListNode head : lists)
        if (head != null) pq.offer(head);
    ListNode dummy = new ListNode(0), curr = dummy;
    while (!pq.isEmpty()) {
        ListNode node = pq.poll();
        curr.next = node;
        curr = curr.next;
        if (node.next != null) pq.offer(node.next);
    }
    return dummy.next;
}`,
        },
      ]}
    />
  );
}

function GraphsSection({ currentStep, onStepChange }: SectionStepProps) {
  const steps: VisualizationStep[] = [
    {
      cells: [0, 1, 2, 3].map(v => ({ value: `C${v}`, state: 'default' as const })),
      pointers: [{ index: 3, label: 'in=0', color: 'green' }],
      description: 'Topological Sort: 4 courses. Prerequisites: 1→0, 2→0, 3→1, 3→2.',
      auxiliary: 'In-degree: [2, 1, 1, 0] | Queue: [3]',
    },
    {
      cells: [0, 1, 2, 3].map((v, i) => ({ value: `C${v}`, state: i === 3 ? 'done' as const : (i >= 1 ? 'active' as const : 'default' as const) })),
      pointers: [{ index: 1, label: 'in=0', color: 'green' }, { index: 2, label: 'in=0', color: 'green' }],
      description: 'Process C3. Decrement C1, C2. Both reach in-degree 0.',
      auxiliary: 'Queue: [1, 2] | Order: [3]',
    },
    {
      cells: [0, 1, 2, 3].map((v, i) => ({ value: `C${v}`, state: i >= 1 ? 'done' as const : 'active' as const })),
      pointers: [{ index: 0, label: 'in=0', color: 'green' }],
      description: 'Process C1, C2. C0 reaches in-degree 0.',
      auxiliary: 'Queue: [0] | Order: [3,1,2]',
    },
    {
      cells: [0, 1, 2, 3].map(v => ({ value: `C${v}`, state: 'found' as const })),
      pointers: [],
      description: 'Process C0. All 4 processed = numCourses. Valid ordering!',
      auxiliary: 'Order: [3,1,2,0] ✓ | count==n → no cycle',
    },
  ];

  return (
    <PatternSection
      idea="Graphs = nodes + edges. Most problems reduce to: traversal (BFS/DFS), shortest path (Dijkstra/BFS), cycle detection, topological sort, or union-find for connected components."
      complexity={{ time: 'O(V + E)', space: 'O(V + E)', why: 'Adjacency list stores all edges. Traversal visits each vertex and edge once. Dijkstra: O((V+E) log V).' }}
      steps={steps}
      currentStep={currentStep}
      onStepChange={onStepChange}
      solves={[
        'Course schedule (topo sort / cycle detection)',
        'Linked list cycle (Floyd\'s)',
        'Clone graph',
        'Network delay time (Dijkstra)',
        'Redundant connection (Union-Find)',
        'Accounts merge (Union-Find)',
      ]}
      insight="Topo sort = process nodes in dependency order (DAGs only). Can't topo-sort all nodes? Cycle. Dijkstra = BFS with priority queue for weighted shortest path. Union-Find = 'are these connected?' in near O(1)."
      code={`// Topological sort — Kahn's algorithm (BFS)
int[] inDegree = new int[n];
Map<Integer, List<Integer>> graph = new HashMap<>();
// build graph, compute in-degrees...
Queue<Integer> queue = new LinkedList<>();
for (int i = 0; i < n; i++)
    if (inDegree[i] == 0) queue.offer(i);
int count = 0;
while (!queue.isEmpty()) {
    int node = queue.poll(); count++;
    for (int next : graph.getOrDefault(node, List.of()))
        if (--inDegree[next] == 0) queue.offer(next);
}
return count == n; // false = cycle`}

      problems={[
        {
          id: 141,
          title: 'Linked List Cycle',
          difficulty: 'Easy',
          insight: 'Floyd\'s: slow moves 1, fast moves 2. If cycle exists, they meet. If fast hits null, no cycle.',
          edges: 'Empty list → false. Single node no cycle → false. Cycle of length 1 (self-loop) → true.',
          followUp: 'Find where the cycle starts? (LC #142 — after meeting, reset one pointer to head, both move 1 step. They meet at cycle start.)',
          code: `public boolean hasCycle(ListNode head) {
    ListNode slow = head, fast = head;
    while (fast != null && fast.next != null) {
        slow = slow.next;
        fast = fast.next.next;
        if (slow == fast) return true;
    }
    return false;
}`,
        },
        {
          id: 207,
          title: 'Course Schedule',
          difficulty: 'Medium',
          insight: 'Topological sort (Kahn\'s). Process in-degree 0 nodes. If processed < total, cycle exists.',
          edges: 'No prerequisites → always true. Self-dependency [a,a] → false. Disconnected components → still works.',
          followUp: 'Return one valid ordering? (LC #210 — same algorithm, collect the order as you process.)',
          code: `public boolean canFinish(int numCourses, int[][] prerequisites) {
    int[] inDeg = new int[numCourses];
    List<List<Integer>> graph = new ArrayList<>();
    for (int i = 0; i < numCourses; i++) graph.add(new ArrayList<>());
    for (int[] p : prerequisites) { graph.get(p[1]).add(p[0]); inDeg[p[0]]++; }
    Queue<Integer> q = new LinkedList<>();
    for (int i = 0; i < numCourses; i++) if (inDeg[i] == 0) q.offer(i);
    int count = 0;
    while (!q.isEmpty()) {
        int c = q.poll(); count++;
        for (int next : graph.get(c))
            if (--inDeg[next] == 0) q.offer(next);
    }
    return count == numCourses;
}`,
        },
        {
          id: 743,
          title: 'Network Delay Time',
          difficulty: 'Medium',
          insight: 'Dijkstra: min-heap of (dist, node). Relax edges. Answer = max distance to any node.',
          edges: 'Unreachable node → -1. Single node → 0. Negative weights? (Dijkstra doesn\'t work — need Bellman-Ford.)',
          followUp: 'What if edges have negative weights? (Bellman-Ford O(VE). What about negative cycles? — detect if relaxation still possible after V-1 rounds.)',
          code: `public int networkDelayTime(int[][] times, int n, int k) {
    Map<Integer, List<int[]>> graph = new HashMap<>();
    for (int[] t : times)
        graph.computeIfAbsent(t[0], x -> new ArrayList<>()).add(new int[]{t[1], t[2]});
    int[] dist = new int[n + 1];
    Arrays.fill(dist, Integer.MAX_VALUE);
    dist[k] = 0;
    PriorityQueue<int[]> pq = new PriorityQueue<>((a, b) -> a[0] - b[0]);
    pq.offer(new int[]{0, k});
    while (!pq.isEmpty()) {
        int[] curr = pq.poll();
        int d = curr[0], u = curr[1];
        if (d > dist[u]) continue;
        for (int[] edge : graph.getOrDefault(u, List.of())) {
            int v = edge[0], w = edge[1];
            if (dist[u] + w < dist[v]) {
                dist[v] = dist[u] + w;
                pq.offer(new int[]{dist[v], v});
            }
        }
    }
    int max = 0;
    for (int i = 1; i <= n; i++) { if (dist[i] == Integer.MAX_VALUE) return -1; max = Math.max(max, dist[i]); }
    return max;
}`,
        },
      ]}
    />
  );
}

function LinkedListSection({ currentStep, onStepChange }: SectionStepProps) {
  const steps: VisualizationStep[] = [
    {
      cells: [1, 2, 3, 4, 5].map(v => ({ value: v, state: 'default' as const })),
      pointers: [{ index: 0, label: 'curr', color: 'blue' }],
      description: 'Reverse linked list: 1→2→3→4→5. Initialize prev=null, curr=head.',
      auxiliary: 'prev=null | curr=1 | next=?',
    },
    {
      cells: [1, 2, 3, 4, 5].map((v, i) => ({ value: v, state: i === 0 ? 'active' as const : 'default' as const })),
      pointers: [{ index: 0, label: 'prev', color: 'purple' }, { index: 1, label: 'curr', color: 'blue' }],
      description: 'Save next=2. Point 1→null. Move prev=1, curr=2.',
      auxiliary: 'null←1  2→3→4→5',
    },
    {
      cells: [1, 2, 3, 4, 5].map((v, i) => ({ value: v, state: i <= 1 ? 'active' as const : 'default' as const })),
      pointers: [{ index: 1, label: 'prev', color: 'purple' }, { index: 2, label: 'curr', color: 'blue' }],
      description: 'Save next=3. Point 2→1. Move prev=2, curr=3.',
      auxiliary: 'null←1←2  3→4→5',
    },
    {
      cells: [1, 2, 3, 4, 5].map((v, i) => ({ value: v, state: i <= 2 ? 'active' as const : 'default' as const })),
      pointers: [{ index: 2, label: 'prev', color: 'purple' }, { index: 3, label: 'curr', color: 'blue' }],
      description: 'Save next=4. Point 3→2. Move prev=3, curr=4.',
      auxiliary: 'null←1←2←3  4→5',
    },
    {
      cells: [1, 2, 3, 4, 5].map((v, i) => ({ value: v, state: i <= 4 ? 'found' as const : 'default' as const })),
      pointers: [{ index: 4, label: 'prev', color: 'green' }],
      description: 'Continue until curr=null. prev points to new head (5). Done!',
      auxiliary: 'null←1←2←3←4←5 | return prev',
    },
  ];

  return (
    <PatternSection
      idea="Iterative pointer reversal with three pointers: prev, curr, next. At each step, save next, reverse the link, advance pointers. Works for full reversal and partial (k-group, between positions)."
      complexity={{ time: 'O(n)', space: 'O(1)', why: 'Single pass through the list. Only three pointer variables regardless of list size.' }}
      steps={steps}
      currentStep={currentStep}
      onStepChange={onStepChange}
      solves={[
        'Reverse entire linked list',
        'Reverse nodes in k-group',
        'Reverse between positions m and n',
        'Palindrome linked list (reverse second half)',
        'Swap nodes in pairs',
        'Reorder list (split + reverse + merge)',
      ]}
      insight="The key is saving the next pointer BEFORE you reverse the link. Without it, you lose the rest of the list. The pattern is always: save next → reverse link → advance prev and curr."
      code={`// Iterative linked list reversal — the template
ListNode prev = null, curr = head;
while (curr != null) {
    ListNode next = curr.next;  // save next
    curr.next = prev;           // reverse link
    prev = curr;                // advance prev
    curr = next;                // advance curr
}
return prev; // new head`}

      problems={[
        {
          id: 206,
          title: 'Reverse Linked List',
          difficulty: 'Easy',
          insight: 'Three pointers: prev, curr, next. At each node, save next, point curr back to prev, advance both. Return prev when curr is null.',
          edges: 'Empty list → null. Single node → return as-is. Two nodes → swap.',
          followUp: 'Can you do it recursively? (Yes — reverse rest, then point next.next back to current. O(n) stack space.)',
          code: `public ListNode reverseList(ListNode head) {
    ListNode prev = null, curr = head;
    while (curr != null) {
        ListNode next = curr.next;
        curr.next = prev;
        prev = curr;
        curr = next;
    }
    return prev;
}`,
        },
        {
          id: 25,
          title: 'Reverse Nodes in k-Group',
          difficulty: 'Hard',
          insight: 'Count k nodes ahead. If enough, reverse that segment using the standard reversal, then connect the reversed group to the previous tail. Repeat until fewer than k nodes remain.',
          edges: 'List shorter than k → return as-is. k=1 → no change. Last group < k → leave in original order.',
          followUp: 'What if you should also reverse the last group even if < k? (Remove the length check for the final segment.)',
          code: `public ListNode reverseKGroup(ListNode head, int k) {
    ListNode dummy = new ListNode(0);
    dummy.next = head;
    ListNode groupPrev = dummy;

    while (true) {
        // Check if k nodes remain
        ListNode kth = groupPrev;
        for (int i = 0; i < k; i++) {
            kth = kth.next;
            if (kth == null) return dummy.next;
        }
        ListNode groupNext = kth.next;

        // Reverse k nodes
        ListNode prev = groupNext, curr = groupPrev.next;
        for (int i = 0; i < k; i++) {
            ListNode next = curr.next;
            curr.next = prev;
            prev = curr;
            curr = next;
        }

        // Connect reversed group
        ListNode tmp = groupPrev.next;
        groupPrev.next = prev; // prev is new group head (was kth)
        groupPrev = tmp;       // old group head is now group tail
    }
}`,
        },
      ]}
    />
  );
}

function IntervalsSection({ currentStep, onStepChange }: SectionStepProps) {
  const steps: VisualizationStep[] = [
    {
      cells: ['[1,3]', '[2,6]', '[8,10]', '[15,18]'].map(v => ({ value: v, state: 'default' as const })),
      pointers: [{ index: 0, label: 'i', color: 'blue' }],
      description: 'Sort intervals by start time. Begin scanning from left.',
      auxiliary: 'Merged: [[1,3]]',
    },
    {
      cells: ['[1,3]', '[2,6]', '[8,10]', '[15,18]'].map((v, i) => ({ value: v, state: i <= 1 ? 'active' as const : 'default' as const })),
      pointers: [{ index: 1, label: 'i', color: 'blue' }],
      description: '[2,6] overlaps [1,3] (2 <= 3). Merge → extend end to max(3,6) = 6.',
      auxiliary: 'Merged: [[1,6]]',
    },
    {
      cells: ['[1,6]', '[8,10]', '[15,18]'].map((v, i) => ({ value: v, state: i === 0 ? 'done' as const : (i === 1 ? 'active' as const : 'default' as const) })),
      pointers: [{ index: 1, label: 'i', color: 'blue' }],
      description: '[8,10] does NOT overlap [1,6] (8 > 6). Start new interval.',
      auxiliary: 'Merged: [[1,6], [8,10]]',
    },
    {
      cells: ['[1,6]', '[8,10]', '[15,18]'].map((v, i) => ({ value: v, state: i <= 1 ? 'done' as const : 'active' as const })),
      pointers: [{ index: 2, label: 'i', color: 'blue' }],
      description: '[15,18] does NOT overlap [8,10] (15 > 10). Start new interval.',
      auxiliary: 'Merged: [[1,6], [8,10], [15,18]]',
    },
    {
      cells: ['[1,6]', '[8,10]', '[15,18]'].map(v => ({ value: v, state: 'found' as const })),
      pointers: [],
      description: 'Done! 4 intervals merged into 3. O(n log n) sort + O(n) scan.',
      auxiliary: 'Result: [[1,6], [8,10], [15,18]] ✓',
    },
  ];

  return (
    <PatternSection
      idea="Sort intervals by start time, then scan left to right. If the current interval overlaps the last merged one, extend the end. Otherwise, start a new merged interval. Greedy: always merge as much as possible."
      complexity={{ time: 'O(n log n)', space: 'O(n)', why: 'Sorting dominates. Output list can be up to n intervals in worst case (no overlaps).' }}
      steps={steps}
      currentStep={currentStep}
      onStepChange={onStepChange}
      solves={[
        'Merge overlapping intervals',
        'Insert interval into sorted list',
        'Meeting rooms (can attend all?)',
        'Meeting rooms II (min rooms needed)',
        'Non-overlapping intervals (min removals)',
        'Interval list intersections',
      ]}
      insight="The greedy insight: after sorting by start, you only need to compare each interval with the last merged one. If they overlap (current.start <= lastMerged.end), merge. Otherwise, the current interval can never overlap anything already merged."
      code={`// Merge Intervals — the template
Arrays.sort(intervals, (a, b) -> a[0] - b[0]); // sort by start
List<int[]> merged = new ArrayList<>();
for (int[] curr : intervals) {
    if (merged.isEmpty() || merged.get(merged.size()-1)[1] < curr[0]) {
        merged.add(curr);  // no overlap
    } else {
        merged.get(merged.size()-1)[1] = Math.max(
            merged.get(merged.size()-1)[1], curr[1]); // merge
    }
}
return merged.toArray(new int[0][]);`}

      problems={[
        {
          id: 56,
          title: 'Merge Intervals',
          difficulty: 'Medium',
          insight: 'Sort by start. Scan and merge: if current.start <= last.end, extend last.end = max(last.end, current.end). Otherwise push new interval.',
          edges: 'Single interval → return as-is. All overlapping → one merged interval. Already sorted → still works.',
          followUp: 'What about Insert Interval? (LC #57 — find insertion point, merge overlapping neighbors.)',
          code: `public int[][] merge(int[][] intervals) {
    Arrays.sort(intervals, (a, b) -> a[0] - b[0]);
    List<int[]> merged = new ArrayList<>();
    for (int[] curr : intervals) {
        if (merged.isEmpty() || merged.get(merged.size()-1)[1] < curr[0]) {
            merged.add(curr);
        } else {
            merged.get(merged.size()-1)[1] = Math.max(merged.get(merged.size()-1)[1], curr[1]);
        }
    }
    return merged.toArray(new int[0][]);
}`,
        },
        {
          id: 57,
          title: 'Insert Interval',
          difficulty: 'Medium',
          insight: 'Three phases: (1) add all intervals ending before newInterval starts, (2) merge all overlapping with newInterval, (3) add remaining. No sorting needed — input already sorted.',
          edges: 'Insert at beginning. Insert at end. newInterval covers everything → single merged interval.',
          followUp: 'What if intervals are not sorted? (Sort first, then same as Merge Intervals.)',
          code: `public int[][] insert(int[][] intervals, int[] newInterval) {
    List<int[]> result = new ArrayList<>();
    int i = 0, n = intervals.length;
    // Phase 1: add all intervals ending before newInterval starts
    while (i < n && intervals[i][1] < newInterval[0])
        result.add(intervals[i++]);
    // Phase 2: merge overlapping intervals
    while (i < n && intervals[i][0] <= newInterval[1]) {
        newInterval[0] = Math.min(newInterval[0], intervals[i][0]);
        newInterval[1] = Math.max(newInterval[1], intervals[i][1]);
        i++;
    }
    result.add(newInterval);
    // Phase 3: add remaining
    while (i < n) result.add(intervals[i++]);
    return result.toArray(new int[0][]);
}`,
        },
        {
          id: 253,
          title: 'Meeting Rooms II',
          difficulty: 'Medium',
          insight: 'Min-heap of end times. For each meeting (sorted by start): if earliest ending room is free (heap.peek() <= start), reuse it (poll). Always add current end. Heap size = rooms needed.',
          edges: 'No meetings → 0. All overlap → n rooms. Sequential meetings → 1 room.',
          followUp: 'What if you just need to check if one room is enough? (LC #252 — sort by start, check no overlap with previous end.)',
          code: `public int minMeetingRooms(int[][] intervals) {
    Arrays.sort(intervals, (a, b) -> a[0] - b[0]); // sort by start
    PriorityQueue<Integer> heap = new PriorityQueue<>(); // min-heap of end times
    for (int[] meeting : intervals) {
        if (!heap.isEmpty() && heap.peek() <= meeting[0])
            heap.poll(); // reuse room — earliest ending meeting is done
        heap.offer(meeting[1]); // allocate room with this end time
    }
    return heap.size(); // heap size = concurrent rooms needed
}`,
        },
      ]}
    />
  );
}

export default function CodingGuidePage() {
  const [activeSection, setActiveSection] = useState<Section>('two-pointers');
  const [stepPositions, setStepPositions] = useState<Record<Section, number>>({
    'two-pointers': 0,
    'sliding-window': 0,
    'hashmap': 0,
    'binary-search': 0,
    'bfs-dfs': 0,
    'backtracking': 0,
    'dp': 0,
    'stack': 0,
    'heap': 0,
    'graphs': 0,
    'linked-list': 0,
    'intervals': 0,
  });

  useDocumentMeta({
    title: 'Coding Interview Guide — CS Reference Guide',
    description: 'Top 25 LeetCode problems by pattern. Core idea, visualization, key insight, and full Java solutions.',
  });

  const updateStepPosition = useCallback((section: Section, step: number) => {
    setStepPositions(prev => ({ ...prev, [section]: step }));
  }, []);

  const handleSectionChange = useCallback((section: Section) => {
    setActiveSection(section);
  }, []);

  const renderSection = () => {
    const currentStep = stepPositions[activeSection];
    const onStepChange = (step: number) => updateStepPosition(activeSection, step);
    switch (activeSection) {
      case 'two-pointers': return <TwoPointersSection currentStep={currentStep} onStepChange={onStepChange} />;
      case 'sliding-window': return <SlidingWindowSection currentStep={currentStep} onStepChange={onStepChange} />;
      case 'hashmap': return <HashMapSection currentStep={currentStep} onStepChange={onStepChange} />;
      case 'binary-search': return <BinarySearchSection currentStep={currentStep} onStepChange={onStepChange} />;
      case 'bfs-dfs': return <BfsDfsSection currentStep={currentStep} onStepChange={onStepChange} />;
      case 'backtracking': return <BacktrackingSection currentStep={currentStep} onStepChange={onStepChange} />;
      case 'dp': return <DpSection currentStep={currentStep} onStepChange={onStepChange} />;
      case 'stack': return <StackSection currentStep={currentStep} onStepChange={onStepChange} />;
      case 'heap': return <HeapSection currentStep={currentStep} onStepChange={onStepChange} />;
      case 'graphs': return <GraphsSection currentStep={currentStep} onStepChange={onStepChange} />;
      case 'linked-list': return <LinkedListSection currentStep={currentStep} onStepChange={onStepChange} />;
      case 'intervals': return <IntervalsSection currentStep={currentStep} onStepChange={onStepChange} />;
    }
  };

  return (
    <div className="page-coding-guide">
      <h2 className="page-coding-guide__title">Coding Interview Guide</h2>
      <p className="page-coding-guide__subtitle">Top 25 LeetCode problems — pattern refresher with full solutions. Read 30 min before your interview.</p>

      {/* Interview Framework */}
      <div className="cg-framework">
        <div className="cg-framework__title">The Interview Framework (do this every time)</div>
        <div className="cg-framework__steps">
          <div className="cg-framework__step"><span className="cg-framework__num">1</span> Clarify — inputs, outputs, constraints. State assumptions aloud. Ask: can I modify the input?</div>
          <div className="cg-framework__step"><span className="cg-framework__num">2</span> Brute force — state approach + complexity. Ask: "should I code this or optimize first?"</div>
          <div className="cg-framework__step"><span className="cg-framework__num">3</span> Optimize — identify pattern, explain approach, state time/space complexity before coding</div>
          <div className="cg-framework__step"><span className="cg-framework__num">4</span> Code — clean, talk while writing, use helper functions, handle edge cases inline</div>
          <div className="cg-framework__step"><span className="cg-framework__num">5</span> Test — trace through an example, check edge cases, discuss tradeoffs if asked</div>
        </div>
        <div className="cg-framework__timing">
          <span>⏱️ <strong>Pace:</strong></span>
          <span>Easy 8-12 min</span>
          <span>Medium 18-25 min</span>
          <span>Hard 25-35 min (expect hints)</span>
        </div>
      </div>

      {/* Pattern Picker */}
      <div className="cg-picker">
        <div className="cg-picker__title">Stuck? Match the signal to the pattern</div>
        <div className="cg-picker__grid">
          <div className="cg-picker__rule" onClick={() => handleSectionChange('hashmap')}>"Find if complement exists" or "count frequencies" <strong>HashMap</strong></div>
          <div className="cg-picker__rule" onClick={() => handleSectionChange('two-pointers')}>Input is sorted + need pair/triplet <strong>Two Pointers</strong></div>
          <div className="cg-picker__rule" onClick={() => handleSectionChange('sliding-window')}>"Longest/shortest contiguous subarray where..." <strong>Sliding Window</strong></div>
          <div className="cg-picker__rule" onClick={() => handleSectionChange('binary-search')}>"Minimum value that satisfies X" or sorted input <strong>Binary Search</strong></div>
          <div className="cg-picker__rule" onClick={() => handleSectionChange('bfs-dfs')}>Tree structure or "shortest path in unweighted" <strong>BFS / DFS</strong></div>
          <div className="cg-picker__rule" onClick={() => handleSectionChange('backtracking')}>"Generate all valid..." or "find all combinations" <strong>Backtracking</strong></div>
          <div className="cg-picker__rule" onClick={() => handleSectionChange('dp')}>"How many ways" or "min/max cost" with overlapping choices <strong>DP</strong></div>
          <div className="cg-picker__rule" onClick={() => handleSectionChange('stack')}>"Next greater/smaller" or "process in LIFO undo order" <strong>Monotonic Stack</strong></div>
          <div className="cg-picker__rule" onClick={() => handleSectionChange('heap')}>"Give me the K largest/smallest" or "merge K sorted" <strong>Heap</strong></div>
          <div className="cg-picker__rule" onClick={() => handleSectionChange('graphs')}>Dependencies / ordering / "can I reach X from Y" <strong>Graph</strong></div>
          <div className="cg-picker__rule" onClick={() => handleSectionChange('intervals')}>"Merge overlapping" or "minimum rooms/resources" with time ranges <strong>Greedy / Intervals</strong></div>
          <div className="cg-picker__rule" onClick={() => handleSectionChange('linked-list')}>"Reverse a linked list" or "manipulate node pointers" <strong>Linked List</strong></div>
        </div>
      </div>

      <div className="bigo-chart-image">
        <img src="/images/bigO.png" alt="Big-O Complexity Chart" />
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
