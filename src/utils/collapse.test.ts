import { describe, it, expect } from 'vitest';
import { shouldCollapse, getVisibleContent } from './collapse';
import type { ContentNode } from '@/types/content';

describe('shouldCollapse', () => {
  it('returns false for short content with few paragraphs', () => {
    const section = {
      wordCount: 100,
      content: [
        { type: 'paragraph' as const, text: 'Hello world' },
        { type: 'paragraph' as const, text: 'Another paragraph' },
      ],
    };
    expect(shouldCollapse(section)).toBe(false);
  });

  it('returns true when wordCount exceeds 300', () => {
    const section = {
      wordCount: 301,
      content: [
        { type: 'paragraph' as const, text: 'Short text' },
      ],
    };
    expect(shouldCollapse(section)).toBe(true);
  });

  it('returns true when paragraph count exceeds 3', () => {
    const section = {
      wordCount: 50,
      content: [
        { type: 'paragraph' as const, text: 'One' },
        { type: 'paragraph' as const, text: 'Two' },
        { type: 'paragraph' as const, text: 'Three' },
        { type: 'paragraph' as const, text: 'Four' },
      ],
    };
    expect(shouldCollapse(section)).toBe(true);
  });

  it('returns false when exactly 300 words and 3 paragraphs', () => {
    const section = {
      wordCount: 300,
      content: [
        { type: 'paragraph' as const, text: 'One' },
        { type: 'paragraph' as const, text: 'Two' },
        { type: 'paragraph' as const, text: 'Three' },
      ],
    };
    expect(shouldCollapse(section)).toBe(false);
  });

  it('does not count non-paragraph nodes toward paragraph count', () => {
    const section = {
      wordCount: 50,
      content: [
        { type: 'paragraph' as const, text: 'One' },
        { type: 'code' as const, language: 'js', code: 'const x = 1;', runnable: false },
        { type: 'paragraph' as const, text: 'Two' },
        { type: 'list' as const, ordered: false, items: ['item1', 'item2'] },
        { type: 'paragraph' as const, text: 'Three' },
      ],
    };
    expect(shouldCollapse(section)).toBe(false);
  });
});

describe('getVisibleContent', () => {
  it('returns all content when total words are within limit', () => {
    const content: ContentNode[] = [
      { type: 'paragraph', text: 'Hello world' },
      { type: 'paragraph', text: 'Another paragraph here' },
    ];
    const result = getVisibleContent(content, 300);
    expect(result).toEqual(content);
  });

  it('truncates paragraph text when exceeding word limit', () => {
    const longText = Array(400).fill('word').join(' ');
    const content: ContentNode[] = [
      { type: 'paragraph', text: longText },
    ];
    const result = getVisibleContent(content, 300);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('paragraph');
    if (result[0].type === 'paragraph') {
      const words = result[0].text.replace('…', '').trim().split(/\s+/);
      expect(words.length).toBe(300);
      expect(result[0].text.endsWith('…')).toBe(true);
    }
  });

  it('returns empty array when maxWords is 0', () => {
    const content: ContentNode[] = [
      { type: 'paragraph', text: 'Hello world' },
    ];
    expect(getVisibleContent(content, 0)).toEqual([]);
  });

  it('includes non-text nodes without consuming word budget', () => {
    const content: ContentNode[] = [
      { type: 'image', src: '/img.png', alt: 'test', originalPath: './img.png' },
      { type: 'paragraph', text: 'Hello world' },
    ];
    const result = getVisibleContent(content, 300);
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe('image');
    expect(result[1].type).toBe('paragraph');
  });

  it('truncates list items when exceeding word limit', () => {
    const content: ContentNode[] = [
      {
        type: 'list',
        ordered: false,
        items: [
          Array(200).fill('word').join(' '),
          Array(200).fill('word').join(' '),
        ],
      },
    ];
    const result = getVisibleContent(content, 300);
    expect(result).toHaveLength(1);
    if (result[0].type === 'list') {
      expect(result[0].items.length).toBe(2);
      // First item fully included (200 words), second truncated to 100 words
      const firstItemWords = result[0].items[0].trim().split(/\s+/);
      expect(firstItemWords.length).toBe(200);
      const secondItemWords = result[0].items[1].replace('…', '').trim().split(/\s+/);
      expect(secondItemWords.length).toBe(100);
    }
  });

  it('stops including nodes after budget is exhausted', () => {
    const content: ContentNode[] = [
      { type: 'paragraph', text: Array(300).fill('word').join(' ') },
      { type: 'paragraph', text: 'This should not appear' },
    ];
    const result = getVisibleContent(content, 300);
    expect(result).toHaveLength(1);
  });

  it('handles blockquote truncation', () => {
    const content: ContentNode[] = [
      { type: 'blockquote', text: Array(400).fill('word').join(' ') },
    ];
    const result = getVisibleContent(content, 300);
    expect(result).toHaveLength(1);
    if (result[0].type === 'blockquote') {
      const words = result[0].text.replace('…', '').trim().split(/\s+/);
      expect(words.length).toBe(300);
      expect(result[0].text.endsWith('…')).toBe(true);
    }
  });
});
