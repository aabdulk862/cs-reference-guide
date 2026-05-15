/**
 * Pure search logic for the CS Reference Guide.
 * Provides testable functions for search operations without React dependencies.
 *
 * Requirements: 2.3, 2.4, 2.5, 2.7
 */

import type { SearchResult } from '@/types/search';
import type { SearchDocument } from '@/plugins/search-indexer';

/** Maximum number of results to return from a search query */
export const MAX_RESULTS = 10;

/** Minimum query length to trigger a search */
export const MIN_QUERY_LENGTH = 1;

/**
 * Highlights matching terms in a text string by wrapping them in <mark> tags.
 * Returns an array of segments with their highlight status for React rendering.
 */
export interface HighlightSegment {
  text: string;
  highlighted: boolean;
}

/**
 * Splits text into segments with matching terms highlighted.
 * Uses case-insensitive matching.
 */
export function highlightMatches(text: string, query: string): HighlightSegment[] {
  if (!query.trim() || !text) {
    return [{ text, highlighted: false }];
  }

  const terms = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0);

  if (terms.length === 0) {
    return [{ text, highlighted: false }];
  }

  // Build a regex that matches any of the search terms
  const escapedTerms = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`(${escapedTerms.join('|')})`, 'gi');

  const segments: HighlightSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    // Add non-matching text before this match
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), highlighted: false });
    }
    // Add the matching text
    segments.push({ text: match[0], highlighted: true });
    lastIndex = pattern.lastIndex;
  }

  // Add remaining text after last match
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), highlighted: false });
  }

  // If no matches found, return the whole text unhighlighted
  if (segments.length === 0) {
    return [{ text, highlighted: false }];
  }

  return segments;
}

/**
 * Extracts a snippet from content around the first matching term.
 * Returns up to maxLength characters centered around the match.
 */
export function extractSnippet(content: string, query: string, maxLength = 120): string {
  if (!content || !query.trim()) {
    if (!content) return '';
    return content.length > maxLength
      ? content.slice(0, maxLength) + '…'
      : content;
  }

  const terms = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0);

  const lowerContent = content.toLowerCase();

  // Find the first matching term position
  let firstMatchIndex = -1;
  for (const term of terms) {
    const idx = lowerContent.indexOf(term);
    if (idx !== -1 && (firstMatchIndex === -1 || idx < firstMatchIndex)) {
      firstMatchIndex = idx;
    }
  }

  if (firstMatchIndex === -1) {
    // No match found, return the beginning of content
    return content.slice(0, maxLength) + (content.length > maxLength ? '…' : '');
  }

  // Center the snippet around the first match
  const halfLength = Math.floor(maxLength / 2);
  let start = Math.max(0, firstMatchIndex - halfLength);
  let end = Math.min(content.length, start + maxLength);

  // Adjust start if we're near the end
  if (end === content.length && end - start < maxLength) {
    start = Math.max(0, end - maxLength);
  }

  let snippet = content.slice(start, end);

  // Add ellipsis indicators
  if (start > 0) {
    snippet = '…' + snippet;
  }
  if (end < content.length) {
    snippet = snippet + '…';
  }

  return snippet;
}

/**
 * Converts FlexSearch document results into SearchResult objects.
 * Deduplicates by document ID and limits to MAX_RESULTS.
 */
export function buildSearchResults(
  matchedIds: string[],
  documents: Map<string, SearchDocument>,
  query: string
): SearchResult[] {
  const seen = new Set<string>();
  const results: SearchResult[] = [];

  for (const id of matchedIds) {
    if (seen.has(id) || results.length >= MAX_RESULTS) {
      break;
    }
    seen.add(id);

    const doc = documents.get(id);
    if (!doc) continue;

    const snippet = extractSnippet(doc.content, query);
    const matchedTerms = query
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter((term) => {
        const lower = doc.content.toLowerCase();
        return lower.includes(term) || doc.title.toLowerCase().includes(term);
      });

    results.push({
      topicId: doc.topicId,
      sectionId: doc.sectionId,
      title: doc.title,
      snippet,
      matchedTerms,
      score: matchedTerms.length,
    });
  }

  return results;
}
