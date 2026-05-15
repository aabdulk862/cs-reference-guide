import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDocumentMeta, truncatePreservingWords } from './useDocumentMeta';

describe('truncatePreservingWords', () => {
  it('returns the string unchanged when within the limit', () => {
    expect(truncatePreservingWords('Hello world', 60)).toBe('Hello world');
  });

  it('truncates at a word boundary and appends ellipsis', () => {
    const input = 'This is a long title that exceeds the sixty character limit for document titles';
    const result = truncatePreservingWords(input, 60);
    expect(result.length).toBeLessThanOrEqual(60);
    expect(result).toMatch(/…$/);
    // The text before the ellipsis should end at a word boundary (space before the cut)
    const textBeforeEllipsis = result.slice(0, -1);
    // Verify no partial word: the original text should contain the prefix as a complete word sequence
    expect(input.startsWith(textBeforeEllipsis)).toBe(true);
    // The character after the truncation point in the original should be a space (word boundary)
    const nextCharInOriginal = input[textBeforeEllipsis.length];
    expect(nextCharInOriginal).toBe(' ');
  });

  it('handles strings exactly at the limit', () => {
    const input = 'a'.repeat(60);
    expect(truncatePreservingWords(input, 60)).toBe(input);
  });

  it('hard truncates when no word boundary is found', () => {
    const input = 'Superlongwordwithoutanyspaces'.repeat(5);
    const result = truncatePreservingWords(input, 60);
    expect(result.length).toBeLessThanOrEqual(60);
    expect(result).toMatch(/…$/);
  });

  it('trims whitespace from input', () => {
    expect(truncatePreservingWords('  Hello world  ', 60)).toBe('Hello world');
  });

  it('handles empty string', () => {
    expect(truncatePreservingWords('', 60)).toBe('');
  });

  it('truncates description to 160 chars preserving words', () => {
    const input = 'This is a very long description that goes on and on about various computer science topics including data structures, algorithms, system design patterns, and much more content that exceeds the one hundred sixty character limit.';
    const result = truncatePreservingWords(input, 160);
    expect(result.length).toBeLessThanOrEqual(160);
    expect(result).toMatch(/…$/);
  });
});

describe('useDocumentMeta', () => {
  beforeEach(() => {
    // Reset document title
    document.title = '';
    // Remove any meta tags added by previous tests
    document.querySelectorAll('meta[name="description"], meta[property="og:image"]').forEach((el) => el.remove());
  });

  it('sets document.title to the provided title', () => {
    renderHook(() => useDocumentMeta({ title: 'My Topic', description: 'A description' }));
    expect(document.title).toBe('My Topic');
  });

  it('truncates document.title to 60 characters', () => {
    const longTitle = 'This is a very long topic title that definitely exceeds the sixty character maximum limit';
    renderHook(() => useDocumentMeta({ title: longTitle, description: 'desc' }));
    expect(document.title.length).toBeLessThanOrEqual(60);
    expect(document.title).toMatch(/…$/);
  });

  it('sets meta description content', () => {
    renderHook(() => useDocumentMeta({ title: 'Title', description: 'My description text' }));
    const meta = document.querySelector('meta[name="description"]');
    expect(meta).not.toBeNull();
    expect(meta?.getAttribute('content')).toBe('My description text');
  });

  it('truncates meta description to 160 characters', () => {
    const longDesc = 'A'.repeat(10) + ' ' + 'word '.repeat(40);
    renderHook(() => useDocumentMeta({ title: 'Title', description: longDesc }));
    const meta = document.querySelector('meta[name="description"]');
    expect(meta?.getAttribute('content')?.length).toBeLessThanOrEqual(160);
  });

  it('sets og:image to default when not provided', () => {
    renderHook(() => useDocumentMeta({ title: 'Title', description: 'Desc' }));
    const ogImage = document.querySelector('meta[property="og:image"]');
    expect(ogImage).not.toBeNull();
    expect(ogImage?.getAttribute('content')).toBe('/icons/icon-512.png');
  });

  it('sets og:image to custom value when provided', () => {
    renderHook(() => useDocumentMeta({ title: 'Title', description: 'Desc', ogImage: '/custom-image.png' }));
    const ogImage = document.querySelector('meta[property="og:image"]');
    expect(ogImage?.getAttribute('content')).toBe('/custom-image.png');
  });

  it('reuses existing meta elements instead of creating duplicates', () => {
    renderHook(() => useDocumentMeta({ title: 'First', description: 'First desc' }));
    renderHook(() => useDocumentMeta({ title: 'Second', description: 'Second desc' }));
    const descMetas = document.querySelectorAll('meta[name="description"]');
    expect(descMetas.length).toBe(1);
  });
});
