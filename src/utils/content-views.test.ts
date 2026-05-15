/**
 * Unit tests for content-views utility functions.
 *
 * Validates: Requirements 12.1, 12.2, 12.3, 12.4, 12.5, 12.6
 */

import { describe, it, expect } from 'vitest';
import type { ContentNode } from '../types/content';
import {
  countWords,
  countSentences,
  countContentWords,
  truncateToCheatSheet,
  truncateToELI5,
} from './content-views';

describe('countWords', () => {
  it('returns 0 for empty string', () => {
    expect(countWords('')).toBe(0);
  });

  it('returns 0 for whitespace-only string', () => {
    expect(countWords('   \t\n  ')).toBe(0);
  });

  it('counts words correctly', () => {
    expect(countWords('hello world')).toBe(2);
    expect(countWords('one two three four five')).toBe(5);
  });

  it('handles multiple spaces between words', () => {
    expect(countWords('hello   world')).toBe(2);
  });
});

describe('countSentences', () => {
  it('returns 0 for empty string', () => {
    expect(countSentences('')).toBe(0);
  });

  it('counts sentences ending with period', () => {
    expect(countSentences('Hello world. This is a test.')).toBe(2);
  });

  it('counts sentences ending with exclamation', () => {
    expect(countSentences('Wow! Amazing!')).toBe(2);
  });

  it('counts sentences ending with question mark', () => {
    expect(countSentences('What? Why? How?')).toBe(3);
  });

  it('counts mixed punctuation', () => {
    expect(countSentences('Hello. How are you? Great!')).toBe(3);
  });
});

describe('countContentWords', () => {
  it('returns 0 for empty array', () => {
    expect(countContentWords([])).toBe(0);
  });

  it('counts words across multiple nodes', () => {
    const nodes: ContentNode[] = [
      { type: 'paragraph', text: 'hello world' },
      { type: 'paragraph', text: 'foo bar baz' },
    ];
    expect(countContentWords(nodes)).toBe(5);
  });

  it('counts words in list items', () => {
    const nodes: ContentNode[] = [
      { type: 'list', ordered: false, items: ['one two', 'three four'] },
    ];
    expect(countContentWords(nodes)).toBe(4);
  });

  it('returns 0 for interactive nodes', () => {
    const nodes: ContentNode[] = [
      { type: 'interactive', interactiveType: 'quiz', config: {} },
    ];
    expect(countContentWords(nodes)).toBe(0);
  });
});

describe('truncateToCheatSheet', () => {
  it('returns empty array for empty input', () => {
    expect(truncateToCheatSheet([], 500)).toEqual([]);
  });

  it('returns all nodes when total words are within limit', () => {
    const nodes: ContentNode[] = [
      { type: 'paragraph', text: 'hello world' },
      { type: 'paragraph', text: 'foo bar' },
    ];
    const result = truncateToCheatSheet(nodes, 500);
    expect(result).toEqual(nodes);
  });

  it('truncates content to stay within word limit', () => {
    const longText = Array(100).fill('word').join(' '); // 100 words
    const nodes: ContentNode[] = [
      { type: 'paragraph', text: longText },
      { type: 'paragraph', text: longText },
      { type: 'paragraph', text: longText },
    ];
    const result = truncateToCheatSheet(nodes, 150);
    // Should include first node (100 words) and truncated second node (50 words)
    expect(result.length).toBe(2);
    expect(countContentWords(result)).toBeLessThanOrEqual(150);
  });

  it('always includes non-text nodes like images', () => {
    const nodes: ContentNode[] = [
      { type: 'image', src: '/img.png', alt: 'test', originalPath: './img.png' },
      { type: 'paragraph', text: 'hello world' },
    ];
    const result = truncateToCheatSheet(nodes, 500);
    expect(result.length).toBe(2);
    expect(result[0].type).toBe('image');
  });

  it('truncates list items to fit within budget', () => {
    const nodes: ContentNode[] = [
      { type: 'list', ordered: false, items: ['one two three', 'four five six', 'seven eight nine'] },
    ];
    const result = truncateToCheatSheet(nodes, 5);
    expect(result.length).toBe(1);
    const listNode = result[0];
    expect(listNode.type).toBe('list');
    if (listNode.type === 'list') {
      // Should have truncated items
      const totalWords = listNode.items.reduce((sum, item) => sum + countWords(item), 0);
      expect(totalWords).toBeLessThanOrEqual(5);
    }
  });

  it('uses default maxWords of 500', () => {
    const longText = Array(600).fill('word').join(' ');
    const nodes: ContentNode[] = [{ type: 'paragraph', text: longText }];
    const result = truncateToCheatSheet(nodes);
    expect(countContentWords(result)).toBeLessThanOrEqual(500);
  });

  it('keeps code blocks in full without counting toward word budget', () => {
    const codeNode: ContentNode = { type: 'code', language: 'js', code: Array(200).fill('token').join(' '), runnable: false };
    const paragraphBefore: ContentNode = { type: 'paragraph', text: Array(100).fill('word').join(' ') };
    const paragraphAfter: ContentNode = { type: 'paragraph', text: Array(100).fill('word').join(' ') };
    const nodes: ContentNode[] = [paragraphBefore, codeNode, paragraphAfter];
    const result = truncateToCheatSheet(nodes, 150);
    // Code block should be included in full
    expect(result).toContainEqual(codeNode);
    // Both paragraphs should fit since code doesn't count toward budget
    expect(result.length).toBe(3);
  });

  it('includes code blocks even after word budget is exhausted', () => {
    const longParagraph: ContentNode = { type: 'paragraph', text: Array(500).fill('word').join(' ') };
    const codeNode: ContentNode = { type: 'code', language: 'python', code: 'print("hello")', runnable: false };
    const extraParagraph: ContentNode = { type: 'paragraph', text: 'extra text here' };
    const nodes: ContentNode[] = [longParagraph, codeNode, extraParagraph];
    const result = truncateToCheatSheet(nodes, 500);
    // Paragraph uses all 500 words, code block still included, extra paragraph skipped
    expect(result.some(n => n.type === 'code')).toBe(true);
    expect(result.some(n => n.type === 'paragraph' && n.text === 'extra text here')).toBe(false);
  });
});

describe('truncateToELI5', () => {
  it('returns empty array for empty input', () => {
    expect(truncateToELI5([], 3)).toEqual([]);
  });

  it('returns all nodes when sentence count is within limit', () => {
    const nodes: ContentNode[] = [
      { type: 'paragraph', text: 'First sentence. Second sentence.' },
    ];
    const result = truncateToELI5(nodes, 3);
    expect(result).toEqual(nodes);
  });

  it('truncates to max sentences', () => {
    const nodes: ContentNode[] = [
      { type: 'paragraph', text: 'One. Two. Three. Four. Five.' },
    ];
    const result = truncateToELI5(nodes, 3);
    expect(result.length).toBe(1);
    if (result[0].type === 'paragraph') {
      expect(countSentences(result[0].text)).toBeLessThanOrEqual(3);
    }
  });

  it('counts sentences across multiple nodes', () => {
    const nodes: ContentNode[] = [
      { type: 'paragraph', text: 'First sentence.' },
      { type: 'paragraph', text: 'Second sentence.' },
      { type: 'paragraph', text: 'Third sentence.' },
      { type: 'paragraph', text: 'Fourth sentence.' },
    ];
    const result = truncateToELI5(nodes, 3);
    expect(result.length).toBe(3);
  });

  it('skips non-text nodes', () => {
    const nodes: ContentNode[] = [
      { type: 'paragraph', text: 'A sentence.' },
      { type: 'code', language: 'js', code: 'const x = 1;', runnable: false },
      { type: 'paragraph', text: 'Another sentence.' },
      { type: 'paragraph', text: 'Third one.' },
      { type: 'paragraph', text: 'Fourth one.' },
    ];
    const result = truncateToELI5(nodes, 3);
    // Should include 3 paragraph nodes only
    expect(result.length).toBe(3);
    expect(result.every((n) => n.type === 'paragraph')).toBe(true);
  });

  it('uses default maxSentences of 3', () => {
    const nodes: ContentNode[] = [
      { type: 'paragraph', text: 'One. Two. Three. Four. Five.' },
    ];
    const result = truncateToELI5(nodes);
    expect(result.length).toBe(1);
    if (result[0].type === 'paragraph') {
      expect(countSentences(result[0].text)).toBeLessThanOrEqual(3);
    }
  });
});
