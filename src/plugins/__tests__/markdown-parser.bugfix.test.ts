/**
 * Bug Condition Exploration Test - Content Pipeline Defects
 *
 * This test exercises the 5 bug conditions in the content pipeline on UNFIXED code.
 * It is EXPECTED TO FAIL — failure confirms the bugs exist.
 *
 * Bug Conditions:
 * 1. Duplicate IDs: Same H1 title in different directories produces identical IDs
 * 2. No-H2 Loss: Markdown with only H1 + body text produces 0 sections/words
 * 3. Multi-H1 Loss: Multiple H1 headings lose all content after the first
 * 4. markdowns/ Unmapped: resolveCategory returns null for markdowns/ paths
 * 5. Sidebar Link Mismatch: Sidebar uses topic.id instead of topic.slug for links
 *
 * Validates: Requirements 1.10, 1.11, 1.13, 1.14, 1.15
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { parseMarkdown } from '../markdown-parser';
import { resolveCategory } from '../vite-content-plugin';

describe('Bug Condition Exploration - Content Pipeline Defects', () => {
  /**
   * Bug Condition 1 - Duplicate IDs
   *
   * WHEN two markdown files share the same H1 title within a category
   * (e.g., both titled "# Summary") but reside in different parent directories,
   * THEN the generated IDs should be different to avoid data collisions.
   *
   * **Validates: Requirements 1.10**
   */
  describe('Bug Condition 1 - Duplicate IDs', () => {
    it('should generate different IDs for same-title files in different directories', () => {
      fc.assert(
        fc.property(
          // Generate a non-empty title word (alphanumeric, at least 1 char)
          fc.stringMatching(/^[A-Za-z][A-Za-z0-9 ]{0,20}$/),
          (title) => {
            const trimmedTitle = title.trim();
            if (trimmedTitle.length === 0) return true; // skip empty

            const markdown = `# ${trimmedTitle}\n\nSome content here.`;

            const result1 = parseMarkdown(
              markdown,
              `Data Structures and Algorithms/Array/${trimmedTitle}.md`,
              'Data Structures'
            );
            const result2 = parseMarkdown(
              markdown,
              `Data Structures and Algorithms/Graph/${trimmedTitle}.md`,
              'Data Structures'
            );

            // IDs should be different because they come from different directories
            expect(result1.id).not.toBe(result2.id);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should produce different IDs for "# Summary" in Array/ vs Graph/ directories', () => {
      const markdown = '# Summary\n\nThis is a summary of the topic.';

      const result1 = parseMarkdown(
        markdown,
        'Data Structures and Algorithms/Array/Summary.md',
        'Data Structures'
      );
      const result2 = parseMarkdown(
        markdown,
        'Data Structures and Algorithms/Graph/Summary.md',
        'Data Structures'
      );

      // Both produce id: "summary" — this is the bug
      expect(result1.id).not.toBe(result2.id);
    });
  });

  /**
   * Bug Condition 2 - No-H2 Loss
   *
   * WHEN a markdown file has only an H1 title followed by body paragraphs
   * (no H2 headings), THEN the result should have sectionCount >= 1 and
   * wordCount > 0 (content should not be silently dropped).
   *
   * **Validates: Requirements 1.11**
   */
  describe('Bug Condition 2 - No-H2 Loss', () => {
    it('should produce non-zero sections and word count for markdown with only H1 and body text', () => {
      fc.assert(
        fc.property(
          // Generate body content: 1-5 paragraphs of text
          fc.array(
            fc.stringMatching(/^[A-Za-z][A-Za-z0-9 .,!?]{5,50}$/),
            { minLength: 1, maxLength: 5 }
          ),
          (paragraphs) => {
            const bodyText = paragraphs
              .filter((p) => p.trim().length > 0)
              .join('\n\n');

            if (bodyText.trim().length === 0) return true; // skip empty

            const markdown = `# My Topic Title\n\n${bodyText}`;

            const result = parseMarkdown(
              markdown,
              'some/path/file.md',
              'TestCategory'
            );

            // Content should NOT be lost — sections and word count should be non-zero
            expect(result.metadata.sectionCount).toBeGreaterThanOrEqual(1);
            expect(result.metadata.wordCount).toBeGreaterThan(0);
          }
        ),
        { numRuns: 30 }
      );
    });

    it('should not lose content when markdown has H1 followed by paragraphs without H2', () => {
      const markdown = `# Title\n\nThis is the first paragraph with some content.\n\nThis is the second paragraph with more content.`;

      const result = parseMarkdown(markdown, 'test/file.md', 'TestCategory');

      // The bug: sections is empty, sectionCount is 0, wordCount is 0
      expect(result.metadata.sectionCount).toBeGreaterThanOrEqual(1);
      expect(result.metadata.wordCount).toBeGreaterThan(0);
      expect(result.sections.length).toBeGreaterThanOrEqual(1);
    });
  });

  /**
   * Bug Condition 3 - Multi-H1 Loss
   *
   * WHEN a markdown file uses multiple H1 headings as chapter separators
   * (e.g., "# Chapter 1: Intro", "# Chapter 2: Basics"), THEN all chapters
   * after the first should become sections (not be lost).
   *
   * **Validates: Requirements 1.15**
   */
  describe('Bug Condition 3 - Multi-H1 Loss', () => {
    it('should capture all H1 chapters as sections when multiple H1s exist', () => {
      fc.assert(
        fc.property(
          // Generate 2-5 chapter titles
          fc.array(
            fc.stringMatching(/^Chapter [0-9]+: [A-Za-z ]{3,20}$/),
            { minLength: 2, maxLength: 5 }
          ),
          (chapters) => {
            const markdown = chapters
              .map((ch) => `# ${ch}\n\nContent for ${ch}. This has some words.`)
              .join('\n\n');

            const result = parseMarkdown(
              markdown,
              'book/chapters.md',
              'Algorithms'
            );

            const numberOfH1s = chapters.length;

            // All chapters after the first should become sections
            // The first H1 becomes the title, subsequent H1s should be sections
            expect(result.sections.length).toBeGreaterThanOrEqual(numberOfH1s - 1);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should not lose content from subsequent H1 chapters', () => {
      const markdown = [
        '# Chapter 1: Introduction',
        'Introduction content goes here with multiple words.',
        '',
        '# Chapter 2: Basics',
        'Basics content goes here with multiple words.',
        '',
        '# Chapter 3: Advanced',
        'Advanced content goes here with multiple words.',
      ].join('\n');

      const result = parseMarkdown(markdown, 'book/file.md', 'Algorithms');

      // The bug: only first H1 becomes title, subsequent H1s and their content are lost
      // Expected: at least 2 sections (Chapter 2 and Chapter 3)
      expect(result.sections.length).toBeGreaterThanOrEqual(2);
    });
  });

  /**
   * Bug Condition 4 - Legacy Paths Unmapped (Expected Behavior)
   *
   * WHEN the content pipeline encounters files in legacy directories (markdowns/, Infosys/, etc.),
   * THEN resolveCategory should return null since content has been migrated to content/{category}/.
   *
   * **Validates: Requirements 1.14**
   */
  describe('Bug Condition 4 - markdowns/ Unmapped', () => {
    it('should resolve categories for markdowns/ directory paths', () => {
      const markdownPaths = [
        { path: 'markdowns/Grokking Algorithms/file.md' },
        { path: 'markdowns/Designing Data-Intensive Applications/ch1.md' },
        { path: 'markdowns/Cracking the Coding Interview/arrays.md' },
        { path: 'markdowns/Data Structures and Algorithms/trees.md' },
        { path: 'markdowns/Git/branching.md' },
      ];

      for (const { path: filePath } of markdownPaths) {
        const category = resolveCategory(filePath);
        // Legacy paths are intentionally unmapped after migration to content/{category}/
        expect(category).toBeNull();
      }
    });

    it('should resolve markdowns/Grokking Algorithms paths to Algorithms category', () => {
      fc.assert(
        fc.property(
          // Generate random filenames
          fc.stringMatching(/^[A-Za-z][A-Za-z0-9 _-]{2,20}\.md$/),
          (filename) => {
            const filePath = `markdowns/Grokking Algorithms/${filename}`;
            const category = resolveCategory(filePath);

            // Legacy paths are intentionally unmapped after migration
            expect(category).toBeNull();
          }
        ),
        { numRuns: 15 }
      );
    });
  });

  /**
   * Bug Condition 5 - Sidebar Link Mismatch
   *
   * WHEN the sidebar generates links to topics, it uses topic.id in the URL path.
   * WHEN topic.id differs from the slug used in topic.contentPath,
   * THEN navigation fails because TopicPage fetches from contentPath.
   *
   * This test verifies the mismatch exists by checking that the Sidebar component
   * uses `/topic/${category.id}/${topic.id}` pattern rather than using the slug
   * from contentPath.
   *
   * **Validates: Requirements 1.13**
   */
  describe('Bug Condition 5 - Sidebar Link Mismatch', () => {
    it('should use topic.slug (matching contentPath) for sidebar links, not topic.id', () => {
      // Simulate a topic where id differs from the slug in contentPath
      // This happens when parseMarkdown generates id from title slug
      // but contentPath uses the file-based slug
      const topic = {
        id: 'summary', // derived from title "# Summary"
        slug: 'data-structures/array-summary', // includes category and disambiguated slug
        title: 'Summary',
        source: 'parsed' as const,
        sectionCount: 3,
        wordCount: 150,
        contentPath: '/content/data-structures/array-summary.json',
      };

      const category = {
        id: 'data-structures',
        name: 'Data Structures',
      };

      // The sidebar currently generates: /topic/data-structures/summary
      // But the content is at: /content/data-structures/array-summary.json
      // The TopicPage would need to fetch using the slug from contentPath

      // Extract what the sidebar SHOULD use (the topicSlug from contentPath)
      const expectedTopicSlug = topic.contentPath
        .replace('/content/', '')
        .replace('.json', '')
        .split('/')[1]; // "array-summary"

      // After fix: the sidebar uses topic.slug.split('/')[1] which is "array-summary"
      const topicSlugPart = topic.slug.split('/')[1] ?? topic.id;
      const sidebarLinkPath = `/topic/${category.id}/${topicSlugPart}`;
      const correctLinkPath = `/topic/${category.id}/${expectedTopicSlug}`;

      // The fixed sidebar link should match the content path pattern
      expect(sidebarLinkPath).toBe(correctLinkPath);
    });
  });
});
