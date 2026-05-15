/**
 * Unit tests for the fuzzy matching utility.
 * Tests core fuzzy matching logic and filtering behavior.
 */

import { describe, it, expect } from 'vitest';
import { fuzzyMatch, fuzzyFilter } from './fuzzy-match';
import type { CommandPaletteItem } from '../types/navigation';

describe('fuzzyMatch', () => {
  it('returns > 0 for exact match', () => {
    expect(fuzzyMatch('array', 'Array')).toBeGreaterThan(0);
  });

  it('returns > 0 for subsequence match', () => {
    expect(fuzzyMatch('arr', 'Array')).toBeGreaterThan(0);
  });

  it('returns 0 when query characters are not in order', () => {
    expect(fuzzyMatch('zyx', 'Array')).toBe(0);
  });

  it('returns 0 when query is longer than text', () => {
    expect(fuzzyMatch('arrays are great', 'arr')).toBe(0);
  });

  it('returns > 0 for empty query (matches everything)', () => {
    expect(fuzzyMatch('', 'anything')).toBeGreaterThan(0);
  });

  it('returns 0 for empty text with non-empty query', () => {
    expect(fuzzyMatch('a', '')).toBe(0);
  });

  it('is case-insensitive', () => {
    const score1 = fuzzyMatch('BST', 'Binary Search Tree');
    const score2 = fuzzyMatch('bst', 'Binary Search Tree');
    expect(score1).toBe(score2);
  });

  it('gives higher score for consecutive matches', () => {
    const consecutive = fuzzyMatch('arr', 'Array');
    const scattered = fuzzyMatch('ary', 'Array');
    expect(consecutive).toBeGreaterThan(scattered);
  });

  it('gives bonus for word-start matches', () => {
    const wordStart = fuzzyMatch('ds', 'Data Structures');
    const midWord = fuzzyMatch('at', 'Data Structures');
    expect(wordStart).toBeGreaterThan(midWord);
  });

  it('handles special characters in text', () => {
    expect(fuzzyMatch('tcp', 'TCP/IP Model')).toBeGreaterThan(0);
  });
});

describe('fuzzyFilter', () => {
  const mockItems: CommandPaletteItem[] = [
    { id: '1', label: 'Array', type: 'topic', action: () => {}, keywords: ['data structure'] },
    { id: '2', label: 'Binary Search Tree', type: 'topic', action: () => {}, keywords: ['bst', 'tree'] },
    { id: '3', label: 'Graph Algorithms', type: 'topic', action: () => {}, keywords: ['bfs', 'dfs'] },
    { id: '4', label: 'Start Pomodoro', type: 'action', action: () => {}, keywords: ['timer', 'focus'] },
    { id: '5', label: 'Open Dashboard', type: 'action', action: () => {}, keywords: ['home'] },
    { id: '6', label: 'Linked List', type: 'bookmark', action: () => {}, keywords: ['list'] },
    { id: '7', label: 'Hash Map', type: 'topic', action: () => {}, keywords: ['map', 'dictionary'] },
    { id: '8', label: 'Dynamic Programming', type: 'topic', action: () => {}, keywords: ['dp', 'memoization'] },
    { id: '9', label: 'Sorting Algorithms', type: 'topic', action: () => {}, keywords: ['sort', 'quicksort'] },
    { id: '10', label: 'Stack', type: 'topic', action: () => {}, keywords: ['lifo'] },
    { id: '11', label: 'Queue', type: 'topic', action: () => {}, keywords: ['fifo'] },
    { id: '12', label: 'Heap', type: 'topic', action: () => {}, keywords: ['priority queue'] },
  ];

  it('returns at most limit results', () => {
    const results = fuzzyFilter('a', mockItems, 10);
    expect(results.length).toBeLessThanOrEqual(10);
  });

  it('returns empty array when no matches', () => {
    const results = fuzzyFilter('zzzzz', mockItems, 10);
    expect(results).toHaveLength(0);
  });

  it('returns items matching by label', () => {
    const results = fuzzyFilter('arr', mockItems, 10);
    expect(results.some((r) => r.id === '1')).toBe(true);
  });

  it('returns items matching by keywords', () => {
    const results = fuzzyFilter('bst', mockItems, 10);
    expect(results.some((r) => r.id === '2')).toBe(true);
  });

  it('returns up to limit items for empty query', () => {
    const results = fuzzyFilter('', mockItems, 5);
    expect(results).toHaveLength(5);
  });

  it('returns all items for empty query when limit is larger', () => {
    const results = fuzzyFilter('', mockItems, 20);
    expect(results).toHaveLength(mockItems.length);
  });

  it('sorts results by score descending', () => {
    const results = fuzzyFilter('sort', mockItems, 10);
    // "Sorting Algorithms" should rank higher than items that only partially match
    expect(results[0].label).toBe('Sorting Algorithms');
  });

  it('respects the limit parameter', () => {
    const results = fuzzyFilter('a', mockItems, 3);
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it('matches action items', () => {
    const results = fuzzyFilter('pomo', mockItems, 10);
    expect(results.some((r) => r.id === '4')).toBe(true);
  });

  it('matches bookmark items', () => {
    const results = fuzzyFilter('link', mockItems, 10);
    expect(results.some((r) => r.id === '6')).toBe(true);
  });
});
