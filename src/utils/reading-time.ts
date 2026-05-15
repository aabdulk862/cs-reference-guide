/**
 * Reading time calculation utility.
 *
 * Calculates estimated reading time based on word count,
 * using 200 words per minute as the reading speed.
 *
 * Requirements: 20.5
 */

/**
 * Calculate estimated reading time in minutes.
 *
 * @param wordCount - Total word count of the content
 * @returns Reading time in minutes (minimum 1 for non-empty content)
 */
export function calculateReadingTime(wordCount: number): number {
  if (wordCount <= 0) return 1;
  return Math.max(1, Math.ceil(wordCount / 200));
}
