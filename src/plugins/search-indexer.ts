/**
 * Search indexer for the content parser pipeline.
 *
 * Generates a JSON array of searchable documents from parsed content at build time.
 * At runtime, the app loads this JSON and adds each document to a FlexSearch index
 * for sub-200ms full-text search.
 *
 * Requirements: 2.3, 2.4
 */

import type { ParsedContent, ContentSection, ContentNode } from '../types/content';

/**
 * A searchable document produced at build time.
 * Each document represents a single section within a topic.
 */
export interface SearchDocument {
  /** Unique document id: "{topicId}:{sectionId}" */
  id: string;
  /** The topic this document belongs to */
  topicId: string;
  /** The section within the topic */
  sectionId: string;
  /** The section heading */
  title: string;
  /** Concatenated searchable text from paragraphs, list items, blockquotes, and code */
  content: string;
}

/**
 * Extracts searchable text from a ContentNode.
 * Ensures all text content — including code blocks — is included in the search index.
 */
function extractTextFromNode(node: ContentNode): string {
  switch (node.type) {
    case 'paragraph':
      return node.text;
    case 'code':
      return node.code;
    case 'list':
      return node.items.join(' ');
    case 'blockquote':
      return node.text;
    case 'table':
      return [...node.headers, ...node.rows.flat()].join(' ');
    case 'math':
      return node.expression;
    case 'image':
      return node.alt;
    case 'mermaid':
      return node.source;
    case 'admonition':
      return node.content;
    case 'task-list':
      return node.items.map((item) => item.text).join(' ');
    case 'footnote-ref':
      return '';
    case 'footnote-def':
      return node.content;
    case 'unparseable':
      return node.raw;
    case 'interactive':
      return '';
    default:
      return '';
  }
}

/**
 * Extracts all searchable text from a section's content nodes.
 */
function extractSectionText(content: ContentNode[]): string {
  return content
    .map(extractTextFromNode)
    .filter((text) => text.length > 0)
    .join(' ');
}

/**
 * Recursively builds search documents from a section and its subsections.
 */
function buildDocumentsFromSection(
  section: ContentSection,
  topicId: string
): SearchDocument[] {
  const documents: SearchDocument[] = [];

  const sectionText = extractSectionText(section.content);
  const combinedContent = [section.heading, sectionText]
    .filter((t) => t.length > 0)
    .join(' ');

  if (combinedContent.trim().length > 0) {
    documents.push({
      id: `${topicId}:${section.id}`,
      topicId,
      sectionId: section.id,
      title: section.heading,
      content: combinedContent,
    });
  }

  // Recurse into subsections
  for (const subsection of section.subsections) {
    documents.push(...buildDocumentsFromSection(subsection, topicId));
  }

  return documents;
}

/**
 * Builds an array of searchable documents from parsed content files.
 *
 * Indexes all headings, body text, code examples, list items, blockquotes,
 * and table content from each section of each parsed topic.
 *
 * @param parsedContents - Array of parsed markdown content objects
 * @returns Array of SearchDocument objects ready for serialization
 */
export function buildSearchDocuments(parsedContents: ParsedContent[]): SearchDocument[] {
  const documents: SearchDocument[] = [];

  for (const parsed of parsedContents) {
    for (const section of parsed.sections) {
      documents.push(...buildDocumentsFromSection(section, parsed.id));
    }
  }

  return documents;
}
