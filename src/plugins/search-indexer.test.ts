import { describe, it, expect } from 'vitest';
import { buildSearchDocuments } from './search-indexer';
import type { ParsedContent } from '@/types/content';

/**
 * Creates a minimal ParsedContent object for testing.
 */
function makeParsedContent(overrides: Partial<ParsedContent> = {}): ParsedContent {
  return {
    id: 'test-topic',
    slug: 'test-topic',
    title: 'Test Topic',
    category: 'Testing',
    sections: [],
    images: [],
    codeBlocks: [],
    mathExpressions: [],
    metadata: {
      source: 'parsed',
      wordCount: 0,
      sectionCount: 0,
    },
    ...overrides,
  };
}

describe('buildSearchDocuments', () => {
  it('returns empty array for empty input', () => {
    const result = buildSearchDocuments([]);
    expect(result).toEqual([]);
  });

  it('returns empty array for content with no sections', () => {
    const content = makeParsedContent({ sections: [] });
    const result = buildSearchDocuments([content]);
    expect(result).toEqual([]);
  });

  it('creates a document for each section', () => {
    const content = makeParsedContent({
      id: 'arrays',
      sections: [
        {
          id: 'introduction',
          heading: 'Introduction',
          level: 2,
          content: [{ type: 'paragraph', text: 'Arrays are data structures.' }],
          wordCount: 4,
          subsections: [],
        },
        {
          id: 'operations',
          heading: 'Operations',
          level: 2,
          content: [{ type: 'paragraph', text: 'Insert, delete, search.' }],
          wordCount: 3,
          subsections: [],
        },
      ],
    });

    const result = buildSearchDocuments([content]);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: 'arrays:introduction',
      topicId: 'arrays',
      sectionId: 'introduction',
      title: 'Introduction',
      content: 'Introduction Arrays are data structures.',
    });
    expect(result[1]).toEqual({
      id: 'arrays:operations',
      topicId: 'arrays',
      sectionId: 'operations',
      title: 'Operations',
      content: 'Operations Insert, delete, search.',
    });
  });

  it('indexes code blocks', () => {
    const content = makeParsedContent({
      id: 'js-basics',
      sections: [
        {
          id: 'example',
          heading: 'Example',
          level: 2,
          content: [
            { type: 'code', language: 'javascript', code: 'const x = 42;', runnable: true },
          ],
          wordCount: 0,
          subsections: [],
        },
      ],
    });

    const result = buildSearchDocuments([content]);
    expect(result[0].content).toContain('const x = 42;');
  });

  it('indexes list items', () => {
    const content = makeParsedContent({
      id: 'ds',
      sections: [
        {
          id: 'types',
          heading: 'Types',
          level: 2,
          content: [
            { type: 'list', ordered: false, items: ['Array', 'LinkedList', 'Tree'] },
          ],
          wordCount: 3,
          subsections: [],
        },
      ],
    });

    const result = buildSearchDocuments([content]);
    expect(result[0].content).toContain('Array LinkedList Tree');
  });

  it('indexes blockquotes', () => {
    const content = makeParsedContent({
      id: 'quotes',
      sections: [
        {
          id: 'note',
          heading: 'Note',
          level: 2,
          content: [
            { type: 'blockquote', text: 'Important concept here.' },
          ],
          wordCount: 3,
          subsections: [],
        },
      ],
    });

    const result = buildSearchDocuments([content]);
    expect(result[0].content).toContain('Important concept here.');
  });

  it('indexes table content', () => {
    const content = makeParsedContent({
      id: 'complexity',
      sections: [
        {
          id: 'table',
          heading: 'Complexity Table',
          level: 2,
          content: [
            {
              type: 'table',
              headers: ['Operation', 'Time'],
              rows: [['Insert', 'O(1)'], ['Search', 'O(n)']],
            },
          ],
          wordCount: 6,
          subsections: [],
        },
      ],
    });

    const result = buildSearchDocuments([content]);
    expect(result[0].content).toContain('Operation');
    expect(result[0].content).toContain('O(1)');
    expect(result[0].content).toContain('O(n)');
  });

  it('recursively indexes subsections', () => {
    const content = makeParsedContent({
      id: 'topic',
      sections: [
        {
          id: 'parent',
          heading: 'Parent Section',
          level: 2,
          content: [{ type: 'paragraph', text: 'Parent text.' }],
          wordCount: 2,
          subsections: [
            {
              id: 'child',
              heading: 'Child Section',
              level: 3,
              content: [{ type: 'paragraph', text: 'Child text.' }],
              wordCount: 2,
              subsections: [],
            },
          ],
        },
      ],
    });

    const result = buildSearchDocuments([content]);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('topic:parent');
    expect(result[1].id).toBe('topic:child');
    expect(result[1].title).toBe('Child Section');
    expect(result[1].content).toContain('Child text.');
  });

  it('handles multiple parsed content files', () => {
    const content1 = makeParsedContent({
      id: 'topic-a',
      sections: [
        {
          id: 'sec-1',
          heading: 'Section 1',
          level: 2,
          content: [{ type: 'paragraph', text: 'Content A.' }],
          wordCount: 2,
          subsections: [],
        },
      ],
    });
    const content2 = makeParsedContent({
      id: 'topic-b',
      sections: [
        {
          id: 'sec-2',
          heading: 'Section 2',
          level: 2,
          content: [{ type: 'paragraph', text: 'Content B.' }],
          wordCount: 2,
          subsections: [],
        },
      ],
    });

    const result = buildSearchDocuments([content1, content2]);
    expect(result).toHaveLength(2);
    expect(result[0].topicId).toBe('topic-a');
    expect(result[1].topicId).toBe('topic-b');
  });

  it('includes heading text in content field', () => {
    const content = makeParsedContent({
      id: 'topic',
      sections: [
        {
          id: 'binary-search',
          heading: 'Binary Search Algorithm',
          level: 2,
          content: [{ type: 'paragraph', text: 'Divide and conquer.' }],
          wordCount: 3,
          subsections: [],
        },
      ],
    });

    const result = buildSearchDocuments([content]);
    expect(result[0].content).toContain('Binary Search Algorithm');
  });

  it('skips sections with no meaningful content', () => {
    const content = makeParsedContent({
      id: 'topic',
      sections: [
        {
          id: 'empty',
          heading: '',
          level: 2,
          content: [],
          wordCount: 0,
          subsections: [],
        },
      ],
    });

    const result = buildSearchDocuments([content]);
    expect(result).toHaveLength(0);
  });

  it('concatenates code block content with prose text for full-text indexing', () => {
    const content = makeParsedContent({
      id: 'java-basics',
      sections: [
        {
          id: 'examples',
          heading: 'Examples',
          level: 2,
          content: [
            { type: 'paragraph', text: 'Here is a simple class definition.' },
            { type: 'code', language: 'java', code: 'public class HelloWorld {\n  public static void main(String[] args) {\n    System.out.println("Hello");\n  }\n}', runnable: false },
            { type: 'paragraph', text: 'And a utility method.' },
            { type: 'code', language: 'java', code: 'public static int add(int a, int b) { return a + b; }', runnable: false },
          ],
          wordCount: 10,
          subsections: [],
        },
      ],
    });

    const result = buildSearchDocuments([content]);
    expect(result).toHaveLength(1);
    // Prose text is included
    expect(result[0].content).toContain('Here is a simple class definition.');
    expect(result[0].content).toContain('And a utility method.');
    // Code block content is included in full
    expect(result[0].content).toContain('public class HelloWorld');
    expect(result[0].content).toContain('System.out.println("Hello")');
    expect(result[0].content).toContain('public static int add(int a, int b)');
  });

  it('indexes mermaid diagram source text', () => {
    const content = makeParsedContent({
      id: 'architecture',
      sections: [
        {
          id: 'diagram',
          heading: 'Architecture Diagram',
          level: 2,
          content: [
            { type: 'mermaid', source: 'graph TD\n  A[Client] --> B[Server]\n  B --> C[Database]' },
          ],
          wordCount: 0,
          subsections: [],
        },
      ],
    });

    const result = buildSearchDocuments([content]);
    expect(result[0].content).toContain('Client');
    expect(result[0].content).toContain('Server');
    expect(result[0].content).toContain('Database');
  });

  it('indexes admonition content', () => {
    const content = makeParsedContent({
      id: 'tips',
      sections: [
        {
          id: 'notes',
          heading: 'Important Notes',
          level: 2,
          content: [
            { type: 'admonition', admonitionType: 'warning', content: 'Never use eval in production code.' },
          ],
          wordCount: 6,
          subsections: [],
        },
      ],
    });

    const result = buildSearchDocuments([content]);
    expect(result[0].content).toContain('Never use eval in production code.');
  });

  it('indexes task list item text', () => {
    const content = makeParsedContent({
      id: 'checklist',
      sections: [
        {
          id: 'setup',
          heading: 'Setup Steps',
          level: 2,
          content: [
            { type: 'task-list', items: [
              { checked: true, text: 'Install dependencies' },
              { checked: false, text: 'Configure environment variables' },
            ]},
          ],
          wordCount: 4,
          subsections: [],
        },
      ],
    });

    const result = buildSearchDocuments([content]);
    expect(result[0].content).toContain('Install dependencies');
    expect(result[0].content).toContain('Configure environment variables');
  });

  it('indexes footnote definition content', () => {
    const content = makeParsedContent({
      id: 'references',
      sections: [
        {
          id: 'details',
          heading: 'Details',
          level: 2,
          content: [
            { type: 'footnote-def', identifier: '1', content: 'CAP theorem was introduced by Eric Brewer in 2000.' },
          ],
          wordCount: 8,
          subsections: [],
        },
      ],
    });

    const result = buildSearchDocuments([content]);
    expect(result[0].content).toContain('CAP theorem was introduced by Eric Brewer in 2000.');
  });
});
