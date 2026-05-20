/**
 * ComplexityChart — Visual comparison of algorithm complexities.
 *
 * Shows a table with color-coded bars representing relative growth rates.
 * Used in interview prep pages and algorithm topic pages.
 */

import { ComplexityBadge } from './ComplexityBadge';

interface AlgorithmComplexity {
  name: string;
  time: string;
  space: string;
  /** Optional: when to use this algorithm */
  useCase?: string;
}

interface ComplexityChartProps {
  title?: string;
  algorithms: AlgorithmComplexity[];
  /** Show the visual growth bars */
  showBars?: boolean;
}

type ComplexityLevel = 'constant' | 'logarithmic' | 'linear' | 'linearithmic' | 'quadratic' | 'cubic' | 'exponential' | 'factorial' | 'unknown';

function classifyForBar(value: string): ComplexityLevel {
  const normalized = value.replace(/\s+/g, '').toLowerCase();
  if (/o\(1\)/.test(normalized)) return 'constant';
  if (/o\(log\s*n\)/.test(normalized) || /o\(logn\)/.test(normalized)) return 'logarithmic';
  if (/^o\(n\)$/.test(normalized)) return 'linear';
  if (/o\(nlog/.test(normalized) || /o\(n\s*log/.test(normalized)) return 'linearithmic';
  if (/o\(n[²2]\)/.test(normalized) || /o\(n\^2\)/.test(normalized)) return 'quadratic';
  if (/o\(n[³3]\)/.test(normalized) || /o\(n\^3\)/.test(normalized)) return 'cubic';
  if (/o\(2\^?n\)/.test(normalized)) return 'exponential';
  if (/o\(n!\)/.test(normalized) || /o\(n[!]\)/.test(normalized)) return 'factorial';
  if (normalized.includes('log')) return 'logarithmic';
  if (normalized.includes('n²') || normalized.includes('n^2')) return 'quadratic';
  return 'unknown';
}

/** Common interview algorithm complexities — pre-built data sets */
export const SORTING_ALGORITHMS: AlgorithmComplexity[] = [
  { name: 'Quick Sort', time: 'O(n log n)', space: 'O(log n)', useCase: 'General purpose, in-place' },
  { name: 'Merge Sort', time: 'O(n log n)', space: 'O(n)', useCase: 'Stable sort, linked lists' },
  { name: 'Heap Sort', time: 'O(n log n)', space: 'O(1)', useCase: 'In-place, guaranteed worst case' },
  { name: 'Tim Sort', time: 'O(n log n)', space: 'O(n)', useCase: 'Real-world data (Python/Java default)' },
  { name: 'Insertion Sort', time: 'O(n²)', space: 'O(1)', useCase: 'Small arrays, nearly sorted' },
  { name: 'Bubble Sort', time: 'O(n²)', space: 'O(1)', useCase: 'Educational only' },
  { name: 'Counting Sort', time: 'O(n)', space: 'O(k)', useCase: 'Small integer range' },
  { name: 'Radix Sort', time: 'O(n)', space: 'O(n)', useCase: 'Fixed-length integers/strings' },
];

export const SEARCH_ALGORITHMS: AlgorithmComplexity[] = [
  { name: 'Hash Table Lookup', time: 'O(1)', space: 'O(n)', useCase: 'Direct access by key' },
  { name: 'Binary Search', time: 'O(log n)', space: 'O(1)', useCase: 'Sorted array' },
  { name: 'Linear Search', time: 'O(n)', space: 'O(1)', useCase: 'Unsorted data' },
  { name: 'BFS/DFS', time: 'O(V + E)', space: 'O(V)', useCase: 'Graph traversal' },
  { name: 'Dijkstra', time: 'O(n log n)', space: 'O(n)', useCase: 'Shortest path (non-negative)' },
];

export const DATA_STRUCTURE_OPS: AlgorithmComplexity[] = [
  { name: 'Array Access', time: 'O(1)', space: 'O(1)', useCase: 'Index-based lookup' },
  { name: 'Array Search', time: 'O(n)', space: 'O(1)', useCase: 'Unsorted linear scan' },
  { name: 'Hash Map Get/Set', time: 'O(1)', space: 'O(n)', useCase: 'Key-value store' },
  { name: 'BST Search', time: 'O(log n)', space: 'O(1)', useCase: 'Ordered data' },
  { name: 'Heap Insert/Extract', time: 'O(log n)', space: 'O(1)', useCase: 'Priority queue' },
  { name: 'Stack Push/Pop', time: 'O(1)', space: 'O(1)', useCase: 'LIFO operations' },
  { name: 'Queue Enqueue/Dequeue', time: 'O(1)', space: 'O(1)', useCase: 'FIFO operations' },
  { name: 'Linked List Insert', time: 'O(1)', space: 'O(1)', useCase: 'Insert at head/known position' },
  { name: 'Linked List Search', time: 'O(n)', space: 'O(1)', useCase: 'Sequential access' },
];

export const INTERVIEW_PATTERNS: AlgorithmComplexity[] = [
  { name: 'Two Pointers', time: 'O(n)', space: 'O(1)', useCase: 'Sorted arrays, pair finding' },
  { name: 'Sliding Window', time: 'O(n)', space: 'O(k)', useCase: 'Subarray/substring problems' },
  { name: 'Binary Search', time: 'O(log n)', space: 'O(1)', useCase: 'Search space reduction' },
  { name: 'BFS (Level Order)', time: 'O(n)', space: 'O(n)', useCase: 'Shortest path, level traversal' },
  { name: 'DFS + Backtracking', time: 'O(2^n)', space: 'O(n)', useCase: 'Combinations, permutations' },
  { name: 'Dynamic Programming', time: 'O(n²)', space: 'O(n)', useCase: 'Overlapping subproblems' },
  { name: 'Monotonic Stack', time: 'O(n)', space: 'O(n)', useCase: 'Next greater/smaller element' },
  { name: 'Heap / Top-K', time: 'O(n log k)', space: 'O(k)', useCase: 'K-th largest, merge K lists' },
  { name: 'Union-Find', time: 'O(α(n))', space: 'O(n)', useCase: 'Connected components' },
  { name: 'Trie', time: 'O(m)', space: 'O(n·m)', useCase: 'Prefix search, autocomplete' },
];

export function ComplexityChart({ title, algorithms, showBars = true }: ComplexityChartProps) {
  return (
    <div className="complexity-chart">
      {title && <h3 className="complexity-chart__title">{title}</h3>}
      <div className="content-card__table-wrapper">
        <table className="complexity-chart__table">
          <thead>
            <tr>
              <th>Algorithm</th>
              <th>Time</th>
              <th>Space</th>
              {showBars && <th>Growth</th>}
              {algorithms.some(a => a.useCase) && <th>Use Case</th>}
            </tr>
          </thead>
          <tbody>
            {algorithms.map((algo) => {
              const level = classifyForBar(algo.time);
              return (
                <tr key={algo.name}>
                  <td>{algo.name}</td>
                  <td>
                    <ComplexityBadge value={algo.time} size="sm" />
                  </td>
                  <td>
                    <ComplexityBadge value={algo.space} size="sm" />
                  </td>
                  {showBars && (
                    <td>
                      <div className={`complexity-chart__bar complexity-chart__bar--${level}`} />
                    </td>
                  )}
                  {algorithms.some(a => a.useCase) && (
                    <td>{algo.useCase || '—'}</td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default ComplexityChart;
