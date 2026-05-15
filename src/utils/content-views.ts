/**
 * Content view utilities for the CS Reference Guide.
 *
 * Provides pure functions for truncating content to Cheat Sheet (≤500 words)
 * and ELI5 (≤3 sentences) views.
 *
 * Requirements: 12.1, 12.2, 12.3
 */

import type { ContentNode } from '../types/content';

/** The three available content view modes */
export type ContentView = 'full' | 'cheat-sheet' | 'eli5';

/**
 * Count words in a text string.
 * Splits on whitespace and filters out empty strings.
 */
export function countWords(text: string): number {
  if (!text.trim()) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Count sentences in a text string.
 * Splits on sentence-ending punctuation (. ! ?) followed by whitespace or end of string.
 */
export function countSentences(text: string): number {
  if (!text.trim()) return 0;
  // Match sentence-ending punctuation followed by space, newline, or end of string
  const sentences = text.trim().split(/[.!?]+(?:\s|$)/).filter((s) => s.trim().length > 0);
  return sentences.length;
}

/**
 * Extract plain text from a ContentNode for word/sentence counting.
 */
function getNodeText(node: ContentNode): string {
  switch (node.type) {
    case 'paragraph':
      return node.text;
    case 'blockquote':
      return node.text;
    case 'code':
      return node.code;
    case 'list':
      return node.items.join(' ');
    case 'table':
      return [...node.headers, ...node.rows.flat()].join(' ');
    case 'math':
      return node.expression;
    case 'image':
      return node.alt;
    case 'interactive':
      return '';
    case 'unparseable':
      return node.raw;
    default:
      return '';
  }
}

/**
 * Count total words across an array of ContentNodes.
 */
export function countContentWords(content: ContentNode[]): number {
  return content.reduce((total, node) => total + countWords(getNodeText(node)), 0);
}

/**
 * Truncate a text string to a maximum number of words.
 * Returns the truncated text with trailing ellipsis if truncated.
 */
function truncateText(text: string, maxWords: number): { text: string; wordCount: number; truncated: boolean } {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) {
    return { text: text.trim(), wordCount: words.length, truncated: false };
  }
  return { text: words.slice(0, maxWords).join(' ') + '…', wordCount: maxWords, truncated: true };
}

/**
 * Truncate content nodes to fit within a maximum word count (Cheat Sheet view).
 *
 * Iterates through nodes, including them fully if they fit within the budget,
 * or partially truncating the last node that exceeds the limit.
 * Code blocks are always included in full without counting toward the word budget.
 * Non-text nodes (images, interactive) are always included.
 *
 * @param content - Array of ContentNode to truncate
 * @param maxWords - Maximum word count (default 500 per Requirement 12.2)
 * @returns Truncated array of ContentNode
 */
export function truncateToCheatSheet(content: ContentNode[], maxWords: number = 500): ContentNode[] {
  if (content.length === 0) return [];

  const result: ContentNode[] = [];
  let wordsRemaining = maxWords;

  for (const node of content) {
    // Code blocks are always included in full without counting toward the word budget
    if (node.type === 'code') {
      result.push(node);
      continue;
    }

    // Non-text nodes (images, interactive, mermaid, etc.) are always included
    const nodeText = getNodeText(node);
    const nodeWordCount = countWords(nodeText);
    if (nodeWordCount === 0) {
      result.push(node);
      continue;
    }

    // If word budget is exhausted, skip remaining text nodes
    if (wordsRemaining <= 0) continue;

    // Node fits entirely within budget
    if (nodeWordCount <= wordsRemaining) {
      result.push(node);
      wordsRemaining -= nodeWordCount;
      continue;
    }

    // Node exceeds budget — truncate it
    switch (node.type) {
      case 'paragraph': {
        const { text } = truncateText(node.text, wordsRemaining);
        result.push({ type: 'paragraph', text });
        wordsRemaining = 0;
        break;
      }
      case 'blockquote': {
        const { text } = truncateText(node.text, wordsRemaining);
        result.push({ type: 'blockquote', text });
        wordsRemaining = 0;
        break;
      }
      case 'list': {
        // Include items until we exceed the word budget
        const truncatedItems: string[] = [];
        let itemWordsLeft = wordsRemaining;
        for (const item of node.items) {
          const itemWords = countWords(item);
          if (itemWords <= itemWordsLeft) {
            truncatedItems.push(item);
            itemWordsLeft -= itemWords;
          } else if (itemWordsLeft > 0) {
            const { text } = truncateText(item, itemWordsLeft);
            truncatedItems.push(text);
            itemWordsLeft = 0;
            break;
          } else {
            break;
          }
        }
        if (truncatedItems.length > 0) {
          result.push({ type: 'list', ordered: node.ordered, items: truncatedItems });
        }
        wordsRemaining = 0;
        break;
      }
      case 'table': {
        // Include the table as-is (tables are hard to truncate meaningfully)
        result.push(node);
        wordsRemaining = 0;
        break;
      }
      default: {
        // For other types, include as-is and stop
        result.push(node);
        wordsRemaining = 0;
        break;
      }
    }
  }

  return result;
}

/**
 * Truncate content nodes to fit within a maximum sentence count (ELI5 view).
 *
 * Extracts text from paragraph and blockquote nodes, counts sentences,
 * and returns only enough nodes to contain maxSentences sentences.
 *
 * @param content - Array of ContentNode to truncate
 * @param maxSentences - Maximum sentence count (default 3 per Requirement 20.2)
 * @returns Truncated array of ContentNode with total sentences ≤ maxSentences
 */
export function truncateToELI5(content: ContentNode[], maxSentences: number = 3): ContentNode[] {
  if (content.length === 0) return [];

  const result: ContentNode[] = [];
  let sentencesRemaining = maxSentences;

  for (const node of content) {
    if (sentencesRemaining <= 0) break;

    // Only count sentences in text-bearing nodes
    if (node.type === 'paragraph' || node.type === 'blockquote') {
      const text = node.type === 'paragraph' ? node.text : node.text;
      const nodeSentences = countSentences(text);

      if (nodeSentences === 0) {
        // No sentences detected, include as-is
        result.push(node);
        continue;
      }

      if (nodeSentences <= sentencesRemaining) {
        result.push(node);
        sentencesRemaining -= nodeSentences;
      } else {
        // Truncate to remaining sentences
        const truncatedText = extractSentences(text, sentencesRemaining);
        if (node.type === 'paragraph') {
          result.push({ type: 'paragraph', text: truncatedText });
        } else {
          result.push({ type: 'blockquote', text: truncatedText });
        }
        sentencesRemaining = 0;
      }
    }
    // Skip non-text nodes in ELI5 view (keep it simple)
  }

  return result;
}

/**
 * Extract the first N sentences from a text string.
 */
function extractSentences(text: string, count: number): string {
  if (count <= 0) return '';

  // Match sentences: text followed by sentence-ending punctuation
  const sentencePattern = /[^.!?]*[.!?]+/g;
  const matches: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = sentencePattern.exec(text)) !== null && matches.length < count) {
    matches.push(match[0].trim());
  }

  if (matches.length === 0) {
    // No sentence-ending punctuation found, return the whole text
    return text.trim();
  }

  return matches.join(' ');
}
