/**
 * Unit tests for the content validation pipeline.
 *
 * Tests word count validation, required section detection, section minimum
 * word count, broken image detection, external image detection, and orphaned
 * image detection.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import type { ParsedContent, ContentSection, ContentNode } from '../types/content';
import {
  countProseWords,
  validateWordCount,
  validateRequiredSections,
  validateSectionWordCounts,
  validateImageReferences,
  detectOrphanedImages,
  validateContent,
  DEFAULT_VALIDATION_CONFIG,
} from './content-validator';

/**
 * Helper to create a minimal ParsedContent object for testing.
 */
function createParsedContent(overrides: Partial<ParsedContent> = {}): ParsedContent {
  return {
    id: 'test-topic',
    slug: 'test-topic',
    title: 'Test Topic',
    category: 'Test',
    sections: [],
    images: [],
    codeBlocks: [],
    mathExpressions: [],
    metadata: {
      source: 'parsed',
      filePath: '/content/test/test-topic.md',
      wordCount: 0,
      sectionCount: 0,
    },
    ...overrides,
  };
}

/**
 * Helper to create a section with prose content of a given word count.
 */
function createSectionWithWords(heading: string, wordCount: number): ContentSection {
  const words = Array(wordCount).fill('word').join(' ');
  return {
    id: heading.toLowerCase().replace(/\s+/g, '-'),
    heading,
    level: 2,
    content: [{ type: 'paragraph', text: words }],
    wordCount,
    subsections: [],
  };
}

describe('countProseWords', () => {
  it('counts words in paragraphs', () => {
    const nodes: ContentNode[] = [
      { type: 'paragraph', text: 'Hello world this is a test' },
    ];
    expect(countProseWords(nodes)).toBe(6);
  });

  it('counts words in list items', () => {
    const nodes: ContentNode[] = [
      { type: 'list', ordered: false, items: ['first item', 'second item'] },
    ];
    expect(countProseWords(nodes)).toBe(4);
  });

  it('counts words in blockquotes', () => {
    const nodes: ContentNode[] = [
      { type: 'blockquote', text: 'This is a quote with words' },
    ];
    expect(countProseWords(nodes)).toBe(6);
  });

  it('counts words in admonitions', () => {
    const nodes: ContentNode[] = [
      { type: 'admonition', admonitionType: 'note', content: 'Important note here' },
    ];
    expect(countProseWords(nodes)).toBe(3);
  });

  it('counts words in table cells', () => {
    const nodes: ContentNode[] = [
      { type: 'table', headers: ['Col A', 'Col B'], rows: [['cell one', 'cell two']] },
    ];
    // headers: "Col A" (2) + "Col B" (2) = 4, rows: "cell one" (2) + "cell two" (2) = 4 => total 8
    expect(countProseWords(nodes)).toBe(8);
  });

  it('does NOT count words in code blocks', () => {
    const nodes: ContentNode[] = [
      { type: 'code', language: 'typescript', code: 'const x = 1; const y = 2;', runnable: false },
    ];
    expect(countProseWords(nodes)).toBe(0);
  });

  it('does NOT count words in mermaid blocks', () => {
    const nodes: ContentNode[] = [
      { type: 'mermaid', source: 'graph TD; A-->B; B-->C;' },
    ];
    expect(countProseWords(nodes)).toBe(0);
  });

  it('does NOT count words in image nodes', () => {
    const nodes: ContentNode[] = [
      { type: 'image', src: 'test.png', alt: 'A test image', originalPath: 'test.png' },
    ];
    expect(countProseWords(nodes)).toBe(0);
  });

  it('returns 0 for empty content', () => {
    expect(countProseWords([])).toBe(0);
  });
});

describe('validateWordCount', () => {
  const config = DEFAULT_VALIDATION_CONFIG;

  it('emits stub-content warning when below stub threshold', () => {
    const parsed = createParsedContent({
      sections: [createSectionWithWords('Intro', 50)],
    });
    const messages = validateWordCount(parsed, config);
    expect(messages).toHaveLength(1);
    expect(messages[0].type).toBe('stub-content');
    expect(messages[0].severity).toBe('warning');
    expect(messages[0].details?.wordCount).toBe(50);
  });

  it('emits low-word-count warning when between stub and minimum', () => {
    const parsed = createParsedContent({
      sections: [createSectionWithWords('Intro', 500)],
    });
    const messages = validateWordCount(parsed, config);
    expect(messages).toHaveLength(1);
    expect(messages[0].type).toBe('low-word-count');
    expect(messages[0].severity).toBe('warning');
    expect(messages[0].details?.wordCount).toBe(500);
  });

  it('emits no warning when at or above minimum', () => {
    const parsed = createParsedContent({
      sections: [createSectionWithWords('Intro', 1500)],
    });
    const messages = validateWordCount(parsed, config);
    expect(messages).toHaveLength(0);
  });
});

describe('validateRequiredSections', () => {
  const config = DEFAULT_VALIDATION_CONFIG;

  it('emits missing-section info message when required sections are absent', () => {
    const parsed = createParsedContent({
      sections: [createSectionWithWords('Introduction', 200)],
    });
    const messages = validateRequiredSections(parsed, config);
    expect(messages).toHaveLength(1);
    expect(messages[0].type).toBe('missing-section');
    expect(messages[0].severity).toBe('info');
    expect(messages[0].details?.missingSections).toEqual(config.requiredSections);
  });

  it('emits no message when all required sections are present', () => {
    const sections = config.requiredSections.map((name) =>
      createSectionWithWords(name, 150)
    );
    const parsed = createParsedContent({ sections });
    const messages = validateRequiredSections(parsed, config);
    expect(messages).toHaveLength(0);
  });

  it('matches section headings case-insensitively', () => {
    const sections = config.requiredSections.map((name) =>
      createSectionWithWords(name.toUpperCase(), 150)
    );
    const parsed = createParsedContent({ sections });
    const messages = validateRequiredSections(parsed, config);
    expect(messages).toHaveLength(0);
  });
});

describe('validateSectionWordCounts', () => {
  const config = DEFAULT_VALIDATION_CONFIG;

  it('emits section-too-short warning for sections below minimum', () => {
    const parsed = createParsedContent({
      sections: [createSectionWithWords('Short Section', 50)],
    });
    const messages = validateSectionWordCounts(parsed, config);
    expect(messages).toHaveLength(1);
    expect(messages[0].type).toBe('section-too-short');
    expect(messages[0].severity).toBe('warning');
    expect(messages[0].details?.section).toBe('Short Section');
  });

  it('does not warn for sections that are pure code/diagram', () => {
    const section: ContentSection = {
      id: 'code-only',
      heading: 'Code Only',
      level: 2,
      content: [
        { type: 'code', language: 'ts', code: 'const x = 1;', runnable: false },
      ],
      wordCount: 0,
      subsections: [],
    };
    const parsed = createParsedContent({ sections: [section] });
    const messages = validateSectionWordCounts(parsed, config);
    expect(messages).toHaveLength(0);
  });

  it('does not warn for sections at or above minimum', () => {
    const parsed = createParsedContent({
      sections: [createSectionWithWords('Good Section', 150)],
    });
    const messages = validateSectionWordCounts(parsed, config);
    expect(messages).toHaveLength(0);
  });
});

describe('validateImageReferences', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let existsSyncSpy: any;

  beforeEach(() => {
    existsSyncSpy = vi.spyOn(fs, 'existsSync');
  });

  afterEach(() => {
    existsSyncSpy.mockRestore();
  });

  it('emits external-image warning for http:// URLs', () => {
    const section: ContentSection = {
      id: 'images',
      heading: 'Images',
      level: 2,
      content: [
        { type: 'image', src: 'http://example.com/img.png', alt: 'test', originalPath: 'http://example.com/img.png' },
      ],
      wordCount: 0,
      subsections: [],
    };
    const parsed = createParsedContent({ sections: [section] });
    const messages = validateImageReferences(parsed, '/content');
    expect(messages).toHaveLength(1);
    expect(messages[0].type).toBe('external-image');
    expect(messages[0].severity).toBe('warning');
  });

  it('emits external-image warning for https:// URLs', () => {
    const section: ContentSection = {
      id: 'images',
      heading: 'Images',
      level: 2,
      content: [
        { type: 'image', src: 'https://example.com/img.png', alt: 'test', originalPath: 'https://example.com/img.png' },
      ],
      wordCount: 0,
      subsections: [],
    };
    const parsed = createParsedContent({ sections: [section] });
    const messages = validateImageReferences(parsed, '/content');
    expect(messages).toHaveLength(1);
    expect(messages[0].type).toBe('external-image');
    expect(messages[0].severity).toBe('warning');
  });

  it('emits broken-image warning when local file does not exist', () => {
    existsSyncSpy.mockReturnValue(false);
    const section: ContentSection = {
      id: 'images',
      heading: 'Images',
      level: 2,
      content: [
        { type: 'image', src: 'missing.png', alt: 'test', originalPath: 'missing.png' },
      ],
      wordCount: 0,
      subsections: [],
    };
    const parsed = createParsedContent({
      sections: [section],
      metadata: {
        source: 'parsed',
        filePath: '/content/test/topic.md',
        wordCount: 0,
        sectionCount: 1,
      },
    });
    const messages = validateImageReferences(parsed, '/content');
    expect(messages).toHaveLength(1);
    expect(messages[0].type).toBe('broken-image');
    expect(messages[0].severity).toBe('warning');
  });

  it('emits no warning when local file exists', () => {
    existsSyncSpy.mockReturnValue(true);
    const section: ContentSection = {
      id: 'images',
      heading: 'Images',
      level: 2,
      content: [
        { type: 'image', src: 'exists.png', alt: 'test', originalPath: 'exists.png' },
      ],
      wordCount: 0,
      subsections: [],
    };
    const parsed = createParsedContent({
      sections: [section],
      metadata: {
        source: 'parsed',
        filePath: '/content/test/topic.md',
        wordCount: 0,
        sectionCount: 1,
      },
    });
    const messages = validateImageReferences(parsed, '/content');
    expect(messages).toHaveLength(0);
  });
});

describe('detectOrphanedImages', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let existsSyncSpy: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let readdirSyncSpy: any;

  beforeEach(() => {
    existsSyncSpy = vi.spyOn(fs, 'existsSync');
    readdirSyncSpy = vi.spyOn(fs, 'readdirSync');
  });

  afterEach(() => {
    existsSyncSpy.mockRestore();
    readdirSyncSpy.mockRestore();
  });

  it('detects orphaned .png files not referenced by any topic', () => {
    existsSyncSpy.mockReturnValue(true);
    // Mock readdirSync to return a directory with one png file
    readdirSyncSpy.mockReturnValue([
      { name: 'orphan.png', isDirectory: () => false, isFile: () => true },
    ] as unknown as fs.Dirent[]);

    const parsed = createParsedContent({
      sections: [],
    });

    const messages = detectOrphanedImages('/content', [parsed]);
    expect(messages.length).toBeGreaterThan(0);
    expect(messages[0].type).toBe('orphaned-image');
    expect(messages[0].severity).toBe('warning');
  });

  it('does not flag referenced images as orphaned', () => {
    existsSyncSpy.mockReturnValue(true);
    readdirSyncSpy.mockReturnValue([
      { name: 'used.png', isDirectory: () => false, isFile: () => true },
    ] as unknown as fs.Dirent[]);

    const section: ContentSection = {
      id: 'images',
      heading: 'Images',
      level: 2,
      content: [
        { type: 'image', src: 'used.png', alt: 'test', originalPath: 'used.png' },
      ],
      wordCount: 0,
      subsections: [],
    };
    const parsed = createParsedContent({
      sections: [section],
      metadata: {
        source: 'parsed',
        filePath: '/content/test/topic.md',
        wordCount: 0,
        sectionCount: 1,
      },
    });

    const messages = detectOrphanedImages('/content', [parsed]);
    expect(messages).toHaveLength(0);
  });
});

describe('validateContent (integration)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let existsSyncSpy: any;

  beforeEach(() => {
    existsSyncSpy = vi.spyOn(fs, 'existsSync');
    existsSyncSpy.mockReturnValue(true);
  });

  afterEach(() => {
    existsSyncSpy.mockRestore();
  });

  it('returns all messages for a file with multiple issues', () => {
    const parsed = createParsedContent({
      sections: [createSectionWithWords('Introduction', 50)],
    });
    const result = validateContent(parsed, '/content');
    // Should have stub-content (warning) + missing-section (info) + section-too-short (warning)
    expect(result.messages.length).toBeGreaterThanOrEqual(2);
    const types = result.messages.map((m) => m.type);
    expect(types).toContain('stub-content');
    expect(types).toContain('missing-section');
  });

  it('returns no messages for a well-formed file', () => {
    const requiredSections = DEFAULT_VALIDATION_CONFIG.requiredSections.map((name) =>
      createSectionWithWords(name, 300)
    );
    const parsed = createParsedContent({
      sections: requiredSections,
    });
    const result = validateContent(parsed, '/content');
    expect(result.messages).toHaveLength(0);
  });

  it('assigns correct severity levels to different message types', () => {
    const parsed = createParsedContent({
      sections: [createSectionWithWords('Introduction', 50)],
    });
    const result = validateContent(parsed, '/content');
    
    const missingSectionMsg = result.messages.find((m) => m.type === 'missing-section');
    const stubContentMsg = result.messages.find((m) => m.type === 'stub-content');
    
    expect(missingSectionMsg?.severity).toBe('info');
    expect(stubContentMsg?.severity).toBe('warning');
  });
});
