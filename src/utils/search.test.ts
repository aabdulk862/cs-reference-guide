/**
 * Unit tests for the pure search utility functions.
 *
 * Tests: highlightMatches, extractSnippet, buildSearchResults
 * Requirements: 2.3, 2.4, 2.5, 2.7
 */

import { describe, it, expect } from 'vitest';
import {
  highlightMatches,
  extractSnippet,
  buildSearchResults,
  MAX_RESULTS,
} from './search';
import type { SearchDocument } from '@/plugins/search-indexer';

describe('highlightMatches', () => {
  it('returns unhighlighted text when query is empty', () => {
    const result = highlightMatches('Hello world', '');
    expect(result).toEqual([{ text: 'Hello world', highlighted: false }]);
  });

  it('returns unhighlighted text when query has only whitespace', () => {
    const result = highlightMatches('Hello world', '   ');
    expect(result).toEqual([{ text: 'Hello world', highlighted: false }]);
  });

  it('highlights a single matching term', () => {
    const result = highlightMatches('Binary Search Algorithm', 'search');
    expect(result).toEqual([
      { text: 'Binary ', highlighted: false },
      { text: 'Search', highlighted: true },
      { text: ' Algorithm', highlighted: false },
    ]);
  });

  it('highlights multiple occurrences of the same term', () => {
    const result = highlightMatches('array of arrays', 'array');
    expect(result).toEqual([
      { text: 'array', highlighted: true },
      { text: ' of ', highlighted: false },
      { text: 'array', highlighted: true },
      { text: 's', highlighted: false },
    ]);
  });

  it('highlights multiple different terms', () => {
    const result = highlightMatches('Binary Search Tree', 'binary tree');
    expect(result).toEqual([
      { text: 'Binary', highlighted: true },
      { text: ' Search ', highlighted: false },
      { text: 'Tree', highlighted: true },
    ]);
  });

  it('is case-insensitive', () => {
    const result = highlightMatches('HELLO world', 'hello');
    expect(result).toEqual([
      { text: 'HELLO', highlighted: true },
      { text: ' world', highlighted: false },
    ]);
  });

  it('handles text with no matches', () => {
    const result = highlightMatches('Hello world', 'xyz');
    expect(result).toEqual([{ text: 'Hello world', highlighted: false }]);
  });

  it('escapes regex special characters in query', () => {
    const result = highlightMatches('O(n^2) complexity', 'O(n^2)');
    expect(result).toEqual([
      { text: 'O(n^2)', highlighted: true },
      { text: ' complexity', highlighted: false },
    ]);
  });
});

describe('extractSnippet', () => {
  it('returns beginning of content when no match found', () => {
    const content = 'This is a long piece of content that goes on and on.';
    const result = extractSnippet(content, 'xyz', 30);
    expect(result.length).toBeLessThanOrEqual(32); // 30 + ellipsis
    expect(result).toContain('This is');
  });

  it('returns content centered around the first match', () => {
    const content =
      'Introduction to algorithms. Binary search is a divide and conquer algorithm. It works on sorted arrays.';
    const result = extractSnippet(content, 'binary', 40);
    expect(result.toLowerCase()).toContain('binary');
  });

  it('returns full content when shorter than maxLength', () => {
    const content = 'Short text';
    const result = extractSnippet(content, 'short', 120);
    expect(result).toBe('Short text');
  });

  it('handles empty content', () => {
    const result = extractSnippet('', 'query');
    expect(result).toBe('');
  });

  it('handles empty query', () => {
    const content = 'Some content here';
    const result = extractSnippet(content, '', 10);
    expect(result).toBe('Some conte…');
  });
});

describe('buildSearchResults', () => {
  function makeDocMap(docs: SearchDocument[]): Map<string, SearchDocument> {
    const map = new Map<string, SearchDocument>();
    for (const doc of docs) {
      map.set(doc.id, doc);
    }
    return map;
  }

  it('returns empty array for empty matchedIds', () => {
    const result = buildSearchResults([], new Map(), 'query');
    expect(result).toEqual([]);
  });

  it('builds results from matched document IDs', () => {
    const docs: SearchDocument[] = [
      {
        id: 'arrays:intro',
        topicId: 'arrays',
        sectionId: 'intro',
        title: 'Introduction to Arrays',
        content: 'Arrays are contiguous memory data structures.',
      },
    ];
    const docMap = makeDocMap(docs);

    const result = buildSearchResults(['arrays:intro'], docMap, 'arrays');
    expect(result).toHaveLength(1);
    expect(result[0].topicId).toBe('arrays');
    expect(result[0].sectionId).toBe('intro');
    expect(result[0].title).toBe('Introduction to Arrays');
    expect(result[0].matchedTerms).toContain('arrays');
  });

  it('limits results to MAX_RESULTS', () => {
    const docs: SearchDocument[] = Array.from({ length: 15 }, (_, i) => ({
      id: `topic:section-${i}`,
      topicId: 'topic',
      sectionId: `section-${i}`,
      title: `Section ${i}`,
      content: `Content for section ${i} about algorithms.`,
    }));
    const docMap = makeDocMap(docs);
    const ids = docs.map((d) => d.id);

    const result = buildSearchResults(ids, docMap, 'algorithms');
    expect(result).toHaveLength(MAX_RESULTS);
  });

  it('deduplicates results by ID', () => {
    const docs: SearchDocument[] = [
      {
        id: 'topic:section',
        topicId: 'topic',
        sectionId: 'section',
        title: 'Test Section',
        content: 'Test content about search.',
      },
    ];
    const docMap = makeDocMap(docs);

    // Same ID appears multiple times (e.g., matched in both title and content fields)
    const result = buildSearchResults(
      ['topic:section', 'topic:section', 'topic:section'],
      docMap,
      'search'
    );
    expect(result).toHaveLength(1);
  });

  it('skips IDs not found in document map', () => {
    const result = buildSearchResults(['nonexistent:id'], new Map(), 'query');
    expect(result).toEqual([]);
  });

  it('includes matched terms that appear in content or title', () => {
    const docs: SearchDocument[] = [
      {
        id: 'ds:bst',
        topicId: 'ds',
        sectionId: 'bst',
        title: 'Binary Search Tree',
        content: 'A binary search tree is a data structure.',
      },
    ];
    const docMap = makeDocMap(docs);

    const result = buildSearchResults(['ds:bst'], docMap, 'binary tree');
    expect(result[0].matchedTerms).toContain('binary');
    expect(result[0].matchedTerms).toContain('tree');
  });
});
