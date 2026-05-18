/**
 * Shared utility functions for topic page rendering.
 * Extracted from TopicPage to be reusable across sub-components.
 */

import {
  truncateToCheatSheet,
  truncateToELI5,
  type ContentView,
} from './content-views';
import type { ContentSection } from '../types/content';

/** Extract quick reference items from the first few sections */
export function extractQuickReferenceItems(sections: ContentSection[]): string[] {
  const items: string[] = [];
  for (const section of sections) {
    if (items.length >= 7) break;
    for (const node of section.content) {
      if (items.length >= 7) break;
      if (node.type === 'paragraph' && node.text.trim().length > 0) {
        items.push(node.text);
        break;
      }
    }
  }
  return items;
}

/** Count words in a text string */
export function countWordsInText(text: string): number {
  if (!text.trim()) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Get total word count across all sections recursively */
export function getTotalWordCount(sections: ContentSection[]): number {
  let total = 0;
  for (const section of sections) {
    total += section.wordCount;
    if (section.subsections && section.subsections.length > 0) {
      total += getTotalWordCount(section.subsections);
    }
  }
  return total;
}

/**
 * Filter sections at the topic level for cheat-sheet and eli5 views.
 */
export function filterSectionsByView(
  sections: ContentSection[],
  view: ContentView
): ContentSection[] {
  if (view === 'full') {
    return sections;
  }

  if (view === 'eli5') {
    if (sections.length === 0) return [];
    let sentencesRemaining = 3;
    const result: ContentSection[] = [];

    for (const section of sections) {
      if (sentencesRemaining <= 0) break;
      const truncatedContent = truncateToELI5(section.content, sentencesRemaining);
      if (truncatedContent.length === 0) continue;

      let sentencesUsed = 0;
      for (const node of truncatedContent) {
        if (node.type === 'paragraph' || node.type === 'blockquote') {
          const text = node.type === 'paragraph' ? node.text : node.text;
          const sentences = text.trim().split(/[.!?]+(?:\s|$)/).filter((s: string) => s.trim().length > 0);
          sentencesUsed += sentences.length;
        }
      }

      result.push({ ...section, content: truncatedContent, subsections: [] });
      sentencesRemaining -= sentencesUsed;
    }
    return result;
  }

  // Cheat-sheet
  const result: ContentSection[] = [];
  let wordsRemaining = 500;

  for (const section of sections) {
    if (wordsRemaining <= 0) break;
    const truncatedContent = truncateToCheatSheet(section.content, wordsRemaining);
    if (truncatedContent.length === 0) continue;

    let sectionWords = 0;
    for (const node of truncatedContent) {
      if (node.type === 'code') continue;
      if (node.type === 'paragraph') sectionWords += countWordsInText(node.text);
      else if (node.type === 'blockquote') sectionWords += countWordsInText(node.text);
      else if (node.type === 'list') sectionWords += node.items.reduce((sum, item) => sum + countWordsInText(item), 0);
    }

    result.push({ ...section, content: truncatedContent, subsections: [] });
    wordsRemaining -= sectionWords;
  }
  return result;
}
