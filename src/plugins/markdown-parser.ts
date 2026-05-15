/**
 * Markdown parser core for the content parser pipeline.
 *
 * Parses markdown content into structured ParsedContent objects using
 * remark/unified for AST processing. Maps heading levels to the
 * navigation hierarchy (H1 → Topic, H2 → ContentSection, H3+ → subsections).
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.7
 */

import { remark } from 'remark';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { visit } from 'unist-util-visit';
import type {
  ParsedContent,
  ContentSection,
  ContentNode,
  ImageRef,
  CodeBlock,
  MathExpression,
  TaskListItem,
} from '../types/content';
import type { Root, Content, PhrasingContent } from 'mdast';

/**
 * Runnable languages — code blocks with these languages are marked as runnable.
 */
const RUNNABLE_LANGUAGES = new Set(['javascript', 'js']);

/**
 * Generates a URL-friendly slug from a string.
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

/**
 * Counts words in a string.
 */
function countWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
}

/**
 * Extracts plain text from phrasing content nodes (inline elements).
 */
function phrasingToText(nodes: PhrasingContent[]): string {
  return nodes
    .map((node) => {
      if (node.type === 'text') return node.value;
      if (node.type === 'inlineCode') return node.value;
      if (node.type === 'inlineMath') return node.value;
      if (node.type === 'footnoteReference') {
        // Represent footnote reference as [^id] in text
        const id = ('identifier' in node && typeof node.identifier === 'string')
          ? node.identifier
          : '';
        return `[^${id}]`;
      }
      if ('children' in node && Array.isArray(node.children)) {
        return phrasingToText(node.children as PhrasingContent[]);
      }
      if ('value' in node && typeof node.value === 'string') {
        return node.value;
      }
      return '';
    })
    .join('');
}

/**
 * Converts an mdast node to one or more ContentNodes.
 * Returns null for heading nodes (handled separately) or unrecognized nodes.
 * Returns an array when a single AST node produces multiple content nodes
 * (e.g., a paragraph containing footnote references).
 */
function astNodeToContentNode(
  node: Content,
  _filePath: string,
  footnoteIndex: { current: number }
): ContentNode | ContentNode[] | null {
  switch (node.type) {
    case 'paragraph': {
      // Check if paragraph contains only an image
      if (
        node.children.length === 1 &&
        node.children[0].type === 'image'
      ) {
        const img = node.children[0];
        return {
          type: 'image',
          src: img.url || '',
          alt: img.alt || '',
          originalPath: img.url || '',
        };
      }

      // Check for footnote references within the paragraph
      const footnoteRefs: ContentNode[] = [];
      for (const child of node.children) {
        if (child.type === 'footnoteReference') {
          const identifier = ('identifier' in child && typeof child.identifier === 'string')
            ? child.identifier
            : '';
          footnoteIndex.current += 1;
          footnoteRefs.push({
            type: 'footnote-ref',
            identifier,
            index: footnoteIndex.current,
          });
        }
      }

      const text = phrasingToText(node.children);
      const paragraphNode: ContentNode = { type: 'paragraph', text };

      // If there are footnote references, return the paragraph plus the refs
      if (footnoteRefs.length > 0) {
        return [paragraphNode, ...footnoteRefs];
      }

      return paragraphNode;
    }

    case 'code': {
      const language = node.lang || '';

      // Detect mermaid fenced code blocks and emit as mermaid nodes
      if (language.toLowerCase() === 'mermaid') {
        return {
          type: 'mermaid',
          source: node.value,
        };
      }

      const runnable = RUNNABLE_LANGUAGES.has(language.toLowerCase());
      return {
        type: 'code',
        language,
        code: node.value,
        runnable,
      };
    }

    case 'math': {
      return {
        type: 'math',
        expression: node.value,
        display: 'block',
      };
    }

    case 'image': {
      return {
        type: 'image',
        src: node.url || '',
        alt: node.alt || '',
        originalPath: node.url || '',
      };
    }

    case 'list': {
      // Detect task lists: if any listItem has checked !== null, it's a task list
      const listItems = node.children || [];
      const isTaskList = listItems.some(
        (item) => 'checked' in item && item.checked !== null && item.checked !== undefined
      );

      if (isTaskList) {
        const taskItems: TaskListItem[] = listItems
          .filter((item) => 'checked' in item && item.checked !== null && item.checked !== undefined)
          .map((listItem) => {
            const text =
              'children' in listItem && Array.isArray(listItem.children)
                ? listItem.children
                    .map((child: Content) => {
                      if (child.type === 'paragraph' && 'children' in child) {
                        return phrasingToText(child.children);
                      }
                      if ('value' in child && typeof child.value === 'string') {
                        return child.value;
                      }
                      return '';
                    })
                    .join(' ')
                : '';
            return {
              checked: (listItem as { checked: boolean }).checked,
              text,
            };
          });
        return {
          type: 'task-list',
          items: taskItems,
        };
      }

      const items = listItems.map((listItem) => {
        if ('children' in listItem && Array.isArray(listItem.children)) {
          return listItem.children
            .map((child: Content) => {
              if (child.type === 'paragraph' && 'children' in child) {
                return phrasingToText(child.children);
              }
              if ('value' in child && typeof child.value === 'string') {
                return child.value;
              }
              return '';
            })
            .join(' ');
        }
        return '';
      });
      return {
        type: 'list',
        ordered: node.ordered ?? false,
        items,
      };
    }

    case 'table': {
      const rows = (node.children || []).map((row) => {
        if ('children' in row && Array.isArray(row.children)) {
          return row.children.map((cell: Content) => {
            if ('children' in cell && Array.isArray(cell.children)) {
              return phrasingToText(cell.children as PhrasingContent[]);
            }
            return '';
          });
        }
        return [];
      });
      const headers = rows.length > 0 ? rows[0] : [];
      const dataRows = rows.slice(1);
      return {
        type: 'table',
        headers,
        rows: dataRows,
      };
    }

    case 'blockquote': {
      const text = (node.children || [])
        .map((child: Content) => {
          if (child.type === 'paragraph' && 'children' in child) {
            return phrasingToText(child.children);
          }
          return '';
        })
        .join('\n');

      // Detect GitHub-style admonitions: [!NOTE], [!WARNING], [!TIP]
      const admonitionMatch = text.match(/^\[!(NOTE|WARNING|TIP|[A-Z]+)\]\s*/);
      if (admonitionMatch) {
        const rawType = admonitionMatch[1].toLowerCase();
        const recognizedTypes = ['note', 'warning', 'tip'] as const;
        if (recognizedTypes.includes(rawType as typeof recognizedTypes[number])) {
          const admonitionContent = text.slice(admonitionMatch[0].length).trim();
          return {
            type: 'admonition',
            admonitionType: rawType as 'note' | 'warning' | 'tip',
            content: admonitionContent,
          };
        }
        // Unrecognized admonition type — fall through to standard blockquote
      }

      return { type: 'blockquote', text };
    }

    case 'heading':
      // Headings are handled by the section builder
      return null;

    case 'thematicBreak':
    case 'html':
      // Skip thematic breaks and raw HTML
      return null;

    case 'footnoteDefinition': {
      // Footnote definitions have an identifier and children (paragraphs)
      const identifier = ('identifier' in node && typeof node.identifier === 'string')
        ? node.identifier
        : '';
      const defContent = ('children' in node && Array.isArray(node.children))
        ? node.children
            .map((child: Content) => {
              if (child.type === 'paragraph' && 'children' in child) {
                return phrasingToText(child.children);
              }
              if ('value' in child && typeof child.value === 'string') {
                return child.value;
              }
              return '';
            })
            .join(' ')
        : '';
      return {
        type: 'footnote-def',
        identifier,
        content: defContent,
      };
    }

    default:
      // Emit unparseable node for anything we can't handle
      if ('value' in node && typeof node.value === 'string') {
        return { type: 'unparseable', raw: node.value };
      }
      return { type: 'unparseable', raw: `[${node.type}]` };
  }
}

/**
 * Calculates word count for a section's content nodes.
 * Counts words in paragraphs, list items, blockquotes, and table cells.
 */
function calculateWordCount(content: ContentNode[]): number {
  let count = 0;
  for (const node of content) {
    switch (node.type) {
      case 'paragraph':
        count += countWords(node.text);
        break;
      case 'list':
        for (const item of node.items) {
          count += countWords(item);
        }
        break;
      case 'blockquote':
        count += countWords(node.text);
        break;
      case 'admonition':
        count += countWords(node.content);
        break;
      case 'table':
        for (const header of node.headers) {
          count += countWords(header);
        }
        for (const row of node.rows) {
          for (const cell of row) {
            count += countWords(cell);
          }
        }
        break;
    }
  }
  return count;
}

/**
 * Calculates total word count for a section including its subsections.
 */
function calculateTotalWordCount(section: ContentSection): number {
  let total = section.wordCount;
  for (const sub of section.subsections) {
    total += calculateTotalWordCount(sub);
  }
  return total;
}

interface SectionBuilder {
  id: string;
  heading: string;
  level: 1 | 2 | 3 | 4 | 5 | 6;
  content: ContentNode[];
  subsections: ContentSection[];
}

/**
 * Builds the section hierarchy from a flat list of AST nodes.
 * H1 → Topic title, H2 → top-level sections, H3+ → nested subsections.
 */
function buildSections(
  nodes: Content[],
  filePath: string
): { title: string; sections: ContentSection[] } {
  let title = '';
  const topSections: SectionBuilder[] = [];
  // Stack to track nesting: each entry is a section builder at a given level
  const stack: SectionBuilder[] = [];
  // Track content nodes that appear after H1 but before any H2
  const orphanContent: ContentNode[] = [];
  let hasSeenH1 = false;
  // Track footnote reference indices across the entire document
  const footnoteIndex = { current: 0 };

  for (const node of nodes) {
    if (node.type === 'heading') {
      const level = node.depth as 1 | 2 | 3 | 4 | 5 | 6;
      const headingText = phrasingToText(node.children);

      if (level === 1) {
        if (!hasSeenH1) {
          // First H1 becomes the topic title
          title = headingText;
          hasSeenH1 = true;
          continue;
        } else {
          // Subsequent H1s are treated as H2-level section boundaries
          // (multi-H1 files use H1 as chapter markers)
          const newChapterSection: SectionBuilder = {
            id: slugify(headingText),
            heading: headingText,
            level: 2,
            content: [],
            subsections: [],
          };
          stack.length = 0;
          topSections.push(newChapterSection);
          stack.push(newChapterSection);
          continue;
        }
      }

      const newSection: SectionBuilder = {
        id: slugify(headingText),
        heading: headingText,
        level,
        content: [],
        subsections: [],
      };

      if (level === 2) {
        // H2 creates a top-level section
        // Finalize any open stack
        stack.length = 0;
        topSections.push(newSection);
        stack.push(newSection);
      } else {
        // H3+ creates a subsection within the appropriate parent
        // Pop stack until we find a parent with a lower level
        while (stack.length > 0 && stack[stack.length - 1].level >= level) {
          stack.pop();
        }

        if (stack.length > 0) {
          // Add as subsection of the nearest parent with lower level
          stack[stack.length - 1].subsections.push(newSection as unknown as ContentSection);
          stack.push(newSection);
        } else {
          // No parent found — treat as top-level
          topSections.push(newSection);
          stack.push(newSection);
        }
      }
    } else {
      // Content node — add to the current section
      const contentResult = astNodeToContentNode(node, filePath, footnoteIndex);
      if (contentResult !== null) {
        const nodesToAdd = Array.isArray(contentResult) ? contentResult : [contentResult];
        if (stack.length > 0) {
          stack[stack.length - 1].content.push(...nodesToAdd);
        } else if (hasSeenH1) {
          // Content after H1 but before any H2 — collect as orphan content
          orphanContent.push(...nodesToAdd);
        }
      }
    }
  }

  // If orphan content exists after H1 but before any section heading,
  // create an implicit section so the content is not lost.
  // This handles both no-H2 files and multi-H1 files with intro content.
  if (orphanContent.length > 0) {
    if (topSections.length === 0) {
      // No sections at all — create an implicit section
      topSections.push({
        id: 'content',
        heading: title,
        level: 2,
        content: orphanContent,
        subsections: [],
      });
    } else {
      // There are sections (from H2s or subsequent H1s) — prepend an intro section
      topSections.unshift({
        id: 'content',
        heading: title,
        level: 2,
        content: orphanContent,
        subsections: [],
      });
    }
  }

  // Finalize all sections
  const finalSections = topSections.map((s) => finalizeSectionBuilder(s));
  return { title, sections: finalSections };
}

/**
 * Converts a SectionBuilder into a finalized ContentSection with word counts.
 */
function finalizeSectionBuilder(builder: SectionBuilder): ContentSection {
  const finalizedSubsections = builder.subsections.map((sub) => {
    // Sub might be a SectionBuilder or already a ContentSection
    if ('content' in sub && Array.isArray(sub.content)) {
      return finalizeSectionBuilder(sub as unknown as SectionBuilder);
    }
    return sub;
  });

  const wordCount = calculateWordCount(builder.content);

  return {
    id: builder.id,
    heading: builder.heading,
    level: builder.level,
    content: builder.content,
    wordCount,
    subsections: finalizedSubsections,
  };
}

/**
 * Collects all images from the parsed content sections.
 */
function collectImages(sections: ContentSection[]): ImageRef[] {
  const images: ImageRef[] = [];

  function walkSection(section: ContentSection) {
    for (const node of section.content) {
      if (node.type === 'image') {
        images.push({
          src: node.src,
          alt: node.alt,
          originalPath: node.originalPath,
        });
      }
    }
    for (const sub of section.subsections) {
      walkSection(sub);
    }
  }

  for (const section of sections) {
    walkSection(section);
  }
  return images;
}

/**
 * Collects all code blocks from the parsed content sections.
 */
function collectCodeBlocks(sections: ContentSection[]): CodeBlock[] {
  const blocks: CodeBlock[] = [];

  function walkSection(section: ContentSection) {
    for (const node of section.content) {
      if (node.type === 'code') {
        blocks.push({
          language: node.language,
          code: node.code,
          runnable: node.runnable,
        });
      }
    }
    for (const sub of section.subsections) {
      walkSection(sub);
    }
  }

  for (const section of sections) {
    walkSection(section);
  }
  return blocks;
}

/**
 * Collects all math expressions from the parsed content sections and inline math.
 */
function collectMathExpressions(
  sections: ContentSection[],
  tree: Root
): MathExpression[] {
  const expressions: MathExpression[] = [];

  // Collect block math from sections
  function walkSection(section: ContentSection) {
    for (const node of section.content) {
      if (node.type === 'math') {
        expressions.push({
          expression: node.expression,
          display: node.display,
        });
      }
    }
    for (const sub of section.subsections) {
      walkSection(sub);
    }
  }

  for (const section of sections) {
    walkSection(section);
  }

  // Collect inline math from AST
  visit(tree, 'inlineMath', (node) => {
    if ('value' in node && typeof node.value === 'string') {
      expressions.push({
        expression: node.value,
        display: 'inline',
      });
    }
  });

  return expressions;
}

/**
 * Counts total sections (including subsections) recursively.
 */
function countSections(sections: ContentSection[]): number {
  let count = 0;
  for (const section of sections) {
    count += 1;
    count += countSections(section.subsections);
  }
  return count;
}

/**
 * Extracts the parent directory name from a file path.
 * For "Data Structures and Algorithms/Graph/Summary.md", returns "Graph".
 * For "Data Structures and Algorithms/Array.md", returns "Data Structures and Algorithms".
 */
function getParentDirName(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const parts = normalized.split('/');
  // Remove the filename to get directory parts
  parts.pop();
  // Return the immediate parent directory name, or empty string if none
  return parts.length > 0 ? parts[parts.length - 1] : '';
}

/**
 * Parses a markdown string into a structured ParsedContent object.
 *
 * @param content - The raw markdown string to parse
 * @param filePath - The file path of the markdown source (used for image resolution and ID disambiguation)
 * @param category - The category this content belongs to
 * @returns A ParsedContent object with structured sections, images, code blocks, and math
 */
export function parseMarkdown(
  content: string,
  filePath: string,
  category: string
): ParsedContent {
  // Parse the markdown AST
  const processor = remark().use(remarkGfm).use(remarkMath);
  const tree = processor.parse(content);

  // Run transformations (remark-gfm and remark-math need runSync to apply)
  const transformedTree = processor.runSync(tree) as Root;

  // Build section hierarchy from AST children
  const { title, sections } = buildSections(
    transformedTree.children as Content[],
    filePath
  );

  // Derive slug and id from title or file path
  const derivedTitle = title || filePath.split('/').pop()?.replace(/\.md$/, '') || 'Untitled';
  const titleSlug = slugify(derivedTitle);

  // Generate unique ID by incorporating parent directory context.
  // This prevents collisions when multiple files share the same H1 title
  // (e.g., "Summary" in different subdirectories).
  const parentDir = getParentDirName(filePath);
  let id: string;
  if (parentDir && parentDir !== slugify(derivedTitle)) {
    // Incorporate parent directory to disambiguate
    id = slugify(parentDir + '-' + derivedTitle);
  } else {
    // No parent dir or parent dir matches title — use title slug alone
    id = titleSlug;
  }

  const slug = titleSlug;

  // Collect extracted elements
  const images = collectImages(sections);
  const codeBlocks = collectCodeBlocks(sections);
  const mathExpressions = collectMathExpressions(sections, transformedTree);

  // Calculate total word count
  let totalWordCount = 0;
  for (const section of sections) {
    totalWordCount += calculateTotalWordCount(section);
  }

  const sectionCount = countSections(sections);

  return {
    id,
    slug,
    title: derivedTitle,
    category,
    sections,
    images,
    codeBlocks,
    mathExpressions,
    metadata: {
      source: 'parsed',
      filePath,
      wordCount: totalWordCount,
      sectionCount,
    },
  };
}
