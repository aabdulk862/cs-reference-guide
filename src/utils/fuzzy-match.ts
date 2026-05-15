/**
 * Fuzzy matching utility for the command palette.
 * Characters in the query must appear in order in the target string.
 * Returns a score > 0 if matches, 0 if no match.
 *
 * Requirements: 10.3
 */

import type { CommandPaletteItem } from '../types/navigation';

/**
 * Compute a fuzzy match score for a query against a text string.
 * Characters in query must appear in order in text (case-insensitive).
 *
 * Scoring:
 * - Base score: 1 point per matched character
 * - Bonus: +2 for consecutive character matches
 * - Bonus: +3 for match at start of word
 * - Returns 0 if no match
 */
export function fuzzyMatch(query: string, text: string): number {
  if (query.length === 0) return 1; // empty query matches everything
  if (text.length === 0) return 0;

  const queryLower = query.toLowerCase();
  const textLower = text.toLowerCase();

  let score = 0;
  let queryIndex = 0;
  let lastMatchIndex = -2; // Track consecutive matches

  for (let i = 0; i < textLower.length && queryIndex < queryLower.length; i++) {
    if (textLower[i] === queryLower[queryIndex]) {
      // Base score for match
      score += 1;

      // Bonus for consecutive matches
      if (i === lastMatchIndex + 1) {
        score += 2;
      }

      // Bonus for match at start of word (first char or after space/separator)
      if (i === 0 || /[\s\-_/.]/.test(textLower[i - 1])) {
        score += 3;
      }

      lastMatchIndex = i;
      queryIndex++;
    }
  }

  // All query characters must be found in order
  if (queryIndex < queryLower.length) {
    return 0;
  }

  return score;
}

/**
 * Filter a list of command palette items using fuzzy matching.
 * Returns up to `limit` items sorted by best match score.
 * Only items with score > 0 are returned.
 */
export function fuzzyFilter(
  query: string,
  items: CommandPaletteItem[],
  limit: number = 10
): CommandPaletteItem[] {
  if (query.trim().length === 0) {
    return items.slice(0, limit);
  }

  const scored: Array<{ item: CommandPaletteItem; score: number }> = [];

  for (const item of items) {
    // Match against label and keywords
    let bestScore = fuzzyMatch(query, item.label);

    for (const keyword of item.keywords) {
      const keywordScore = fuzzyMatch(query, keyword);
      if (keywordScore > bestScore) {
        bestScore = keywordScore;
      }
    }

    if (bestScore > 0) {
      scored.push({ item, score: bestScore });
    }
  }

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((s) => s.item);
}
