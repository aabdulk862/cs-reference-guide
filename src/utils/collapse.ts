import type { ContentNode } from '@/types/content';

/**
 * Counts the number of paragraph nodes in a content array.
 */
function countParagraphs(content: ContentNode[]): number {
  return content.filter((node) => node.type === 'paragraph').length;
}

/**
 * Counts words in a single text string.
 */
function countWords(text: string): number {
  return text.trim().split(/\s+/).filter((w) => w.length > 0).length;
}

/**
 * Calculates total word count for a section including its subsections.
 */
function totalWordCount(section: { wordCount: number; content: ContentNode[]; subsections?: Array<{ wordCount: number; content: ContentNode[]; subsections?: any[] }> }): number {
  let total = section.wordCount;
  if (section.subsections) {
    for (const sub of section.subsections) {
      total += totalWordCount(sub);
    }
  }
  return total;
}

/**
 * Determines whether a content section should be collapsed.
 *
 * A section should collapse if:
 * - Its total wordCount (including subsections) exceeds 300, OR
 * - Its paragraph count exceeds 3
 *
 * Whichever threshold is reached first triggers collapse.
 */
export function shouldCollapse(section: {
  wordCount: number;
  content: ContentNode[];
  subsections?: Array<{ wordCount: number; content: ContentNode[]; subsections?: any[] }>;
}): boolean {
  if (totalWordCount(section) > 300) {
    return true;
  }
  if (countParagraphs(section.content) > 3) {
    return true;
  }
  return false;
}

/** Maximum number of paragraphs to show in collapsed state */
const MAX_VISIBLE_PARAGRAPHS = 3;

/**
 * Returns a truncated subset of content nodes that fits within the maxWords limit
 * AND the paragraph limit (MAX_VISIBLE_PARAGRAPHS).
 *
 * Iterates through content nodes in order, accumulating word counts and paragraph counts.
 * Once either budget is exhausted, remaining nodes are excluded.
 * For text-based nodes (paragraph, blockquote), the last included node
 * may be truncated mid-text to stay within the word limit.
 */
export function getVisibleContent(
  content: ContentNode[],
  maxWords: number
): ContentNode[] {
  if (maxWords <= 0) {
    return [];
  }

  const result: ContentNode[] = [];
  let wordsRemaining = maxWords;
  let paragraphsRemaining = MAX_VISIBLE_PARAGRAPHS;

  for (const node of content) {
    if (wordsRemaining <= 0 || paragraphsRemaining <= 0) {
      break;
    }

    switch (node.type) {
      case 'paragraph': {
        const words = node.text.trim().split(/\s+/).filter((w) => w.length > 0);
        if (words.length <= wordsRemaining) {
          result.push(node);
          wordsRemaining -= words.length;
        } else {
          // Truncate the paragraph to fit within the word budget
          const truncatedText = words.slice(0, wordsRemaining).join(' ') + '…';
          result.push({ type: 'paragraph', text: truncatedText });
          wordsRemaining = 0;
        }
        paragraphsRemaining--;
        break;
      }

      case 'blockquote': {
        const words = node.text.trim().split(/\s+/).filter((w) => w.length > 0);
        if (words.length <= wordsRemaining) {
          result.push(node);
          wordsRemaining -= words.length;
        } else {
          const truncatedText = words.slice(0, wordsRemaining).join(' ') + '…';
          result.push({ type: 'blockquote', text: truncatedText });
          wordsRemaining = 0;
        }
        break;
      }

      case 'list': {
        const listWords = node.items.reduce(
          (sum, item) => sum + countWords(item),
          0
        );
        if (listWords <= wordsRemaining) {
          result.push(node);
          wordsRemaining -= listWords;
        } else {
          // Include items until we run out of word budget
          const truncatedItems: string[] = [];
          for (const item of node.items) {
            const itemWords = item.trim().split(/\s+/).filter((w) => w.length > 0);
            if (itemWords.length <= wordsRemaining) {
              truncatedItems.push(item);
              wordsRemaining -= itemWords.length;
            } else {
              // Truncate this item
              truncatedItems.push(
                itemWords.slice(0, wordsRemaining).join(' ') + '…'
              );
              wordsRemaining = 0;
              break;
            }
          }
          if (truncatedItems.length > 0) {
            result.push({
              type: 'list',
              ordered: node.ordered,
              items: truncatedItems,
            });
          }
        }
        break;
      }

      case 'table': {
        // Count words in headers + all rows
        const headerWords = node.headers.reduce(
          (sum, h) => sum + countWords(h),
          0
        );
        const rowWords = node.rows.reduce(
          (sum, row) =>
            sum + row.reduce((rSum, cell) => rSum + countWords(cell), 0),
          0
        );
        const totalTableWords = headerWords + rowWords;
        if (totalTableWords <= wordsRemaining) {
          result.push(node);
          wordsRemaining -= totalTableWords;
        } else {
          // Include the table but it consumes remaining budget
          result.push(node);
          wordsRemaining = 0;
        }
        break;
      }

      case 'code': {
        const codeWords = countWords(node.code);
        if (codeWords <= wordsRemaining) {
          result.push(node);
          wordsRemaining -= codeWords;
        } else {
          // Include code block as-is but consume remaining budget
          result.push(node);
          wordsRemaining = 0;
        }
        break;
      }

      case 'image':
      case 'math':
      case 'interactive':
      case 'unparseable': {
        // Non-text nodes don't consume word budget significantly
        result.push(node);
        break;
      }

      case 'mermaid':
      case 'admonition':
      case 'task-list':
      case 'footnote-ref':
      case 'footnote-def': {
        result.push(node);
        break;
      }
    }
  }

  return result;
}
