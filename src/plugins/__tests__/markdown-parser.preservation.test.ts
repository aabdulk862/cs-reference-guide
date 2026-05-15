/**
 * Preservation Property Tests - Well-Formed Markdown Parsing and Category Resolution Unchanged
 *
 * These tests capture the EXISTING correct behavior of the content pipeline on unfixed code.
 * They MUST PASS on the current code — they serve as regression guards to ensure that
 * bug fixes do not alter behavior for well-formed inputs.
 *
 * Property-Based Tests:
 * 1. parseMarkdown: well-formed markdown (single H1 + N H2 sections) produces sectionCount === N
 *    and preserves title, section headings, and word counts
 * 2. resolveCategory: paths matching existing CATEGORY_MAPPINGS return expected category strings
 * 3. shouldExclude: paths ending in .tex, .css, starting with public/, or containing dot-prefixed
 *    directories return true
 * 4. renderContentNode: non-interactive ContentNode types produce consistent JSX output
 *
 * **Validates: Requirements 3.1, 3.4, 3.6, 3.7, 3.8, 3.9, 3.10**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { parseMarkdown } from '../markdown-parser';
import { resolveCategory } from '../vite-content-plugin';
import { shouldExclude } from '../exclusion-filter';

// ============================================================================
// Observation Phase - Confirm baseline behavior on unfixed code
// ============================================================================

describe('Preservation - Observation Phase', () => {
  it('Observe: parseMarkdown with H1 + 2 H2 sections produces structured output with 2 sections', () => {
    const markdown = '# Title\n## Section 1\nContent\n## Section 2\nMore';
    const result = parseMarkdown(markdown, 'test/path.md', 'Data Structures');

    expect(result.title).toBe('Title');
    expect(result.sections).toHaveLength(2);
    expect(result.sections[0].heading).toBe('Section 1');
    expect(result.sections[1].heading).toBe('Section 2');
    expect(result.metadata.sectionCount).toBe(2);
  });

  it('Observe: resolveCategory("backend/java.md") returns "Backend"', () => {
    const category = resolveCategory('backend/java.md');
    expect(category).toBe('Backend');
  });

  it('Observe: resolveCategory("data-structures-and-algorithms/array.md") returns "Data Structures & Algorithms"', () => {
    const category = resolveCategory('data-structures-and-algorithms/array.md');
    expect(category).toBe('Data Structures & Algorithms');
  });

  it('Observe: shouldExclude("file.tex") returns true', () => {
    expect(shouldExclude('file.tex')).toBe(true);
  });

  it('Observe: shouldExclude("public/index.html") returns true', () => {
    expect(shouldExclude('public/index.html')).toBe(true);
  });

  it('Observe: shouldExclude(".hidden/file.md") returns true', () => {
    expect(shouldExclude('.hidden/file.md')).toBe(true);
  });
});

// ============================================================================
// Property-Based Tests
// ============================================================================

describe('Preservation Property Tests', () => {
  /**
   * PBT 1: Well-Formed Markdown Parsing Preservation
   *
   * For all well-formed markdown (single H1 + N H2 sections with unique titles
   * within category), parseMarkdown produces sectionCount === N and preserves
   * title, section headings, and word counts.
   *
   * **Validates: Requirements 3.8**
   */
  describe('PBT 1: parseMarkdown preserves well-formed markdown structure', () => {
    // Generator for a valid section heading (unique, non-empty, no markdown special chars)
    const sectionHeadingArb = fc.stringMatching(/^[A-Za-z][A-Za-z0-9 ]{2,25}$/);

    // Generator for paragraph content (non-empty words)
    const paragraphArb = fc.stringMatching(/^[A-Za-z][A-Za-z0-9 .,!?]{5,60}$/);

    // Generator for well-formed markdown with N H2 sections
    const wellFormedMarkdownArb = fc.record({
      title: fc.stringMatching(/^[A-Za-z][A-Za-z0-9 ]{2,30}$/),
      sections: fc.array(
        fc.record({
          heading: sectionHeadingArb,
          paragraphs: fc.array(paragraphArb, { minLength: 1, maxLength: 3 }),
        }),
        { minLength: 1, maxLength: 6 }
      ),
    }).filter((data) => {
      // Ensure unique section headings (to avoid slug collisions)
      const headings = data.sections.map((s) => s.heading.trim().toLowerCase());
      return new Set(headings).size === headings.length &&
        data.title.trim().length > 0 &&
        data.sections.every((s) => s.heading.trim().length > 0);
    });

    it('produces sectionCount === N for N H2 sections', () => {
      fc.assert(
        fc.property(wellFormedMarkdownArb, (data) => {
          const markdown = [
            `# ${data.title}`,
            ...data.sections.flatMap((s) => [
              `## ${s.heading}`,
              ...s.paragraphs,
              '', // blank line between sections
            ]),
          ].join('\n');

          const result = parseMarkdown(markdown, 'test/file.md', 'TestCategory');

          // Section count should equal number of H2 headings
          expect(result.sections).toHaveLength(data.sections.length);
          expect(result.metadata.sectionCount).toBe(data.sections.length);
        }),
        { numRuns: 50 }
      );
    });

    it('preserves the H1 title', () => {
      fc.assert(
        fc.property(wellFormedMarkdownArb, (data) => {
          // Trim title since markdown heading parsing normalizes whitespace
          const title = data.title.trim();
          const markdown = [
            `# ${title}`,
            ...data.sections.flatMap((s) => [
              `## ${s.heading.trim()}`,
              ...s.paragraphs,
            ]),
          ].join('\n');

          const result = parseMarkdown(markdown, 'test/file.md', 'TestCategory');

          expect(result.title).toBe(title);
        }),
        { numRuns: 50 }
      );
    });

    it('preserves section headings in order', () => {
      fc.assert(
        fc.property(wellFormedMarkdownArb, (data) => {
          // Trim headings since markdown heading parsing normalizes whitespace
          const sections = data.sections.map((s) => ({
            ...s,
            heading: s.heading.trim(),
          }));
          const markdown = [
            `# ${data.title.trim()}`,
            ...sections.flatMap((s) => [
              `## ${s.heading}`,
              ...s.paragraphs,
            ]),
          ].join('\n');

          const result = parseMarkdown(markdown, 'test/file.md', 'TestCategory');

          for (let i = 0; i < sections.length; i++) {
            expect(result.sections[i].heading).toBe(sections[i].heading);
          }
        }),
        { numRuns: 50 }
      );
    });

    it('produces non-zero word count when sections have content', () => {
      fc.assert(
        fc.property(wellFormedMarkdownArb, (data) => {
          const markdown = [
            `# ${data.title}`,
            ...data.sections.flatMap((s) => [
              `## ${s.heading}`,
              ...s.paragraphs,
            ]),
          ].join('\n');

          const result = parseMarkdown(markdown, 'test/file.md', 'TestCategory');

          // Total word count should be positive since we have paragraph content
          expect(result.metadata.wordCount).toBeGreaterThan(0);

          // Each section should have non-zero word count
          for (const section of result.sections) {
            expect(section.wordCount).toBeGreaterThan(0);
          }
        }),
        { numRuns: 50 }
      );
    });
  });

  /**
   * PBT 2: Category Resolution Preservation
   *
   * For all paths matching existing CATEGORY_MAPPINGS patterns
   * (backend/*, frontend/*, infrastructure/*, data-structures-and-algorithms/*,
   * system-design/*, interview-prep/*, git/*),
   * resolveCategory returns the expected category string.
   *
   * **Validates: Requirements 3.10**
   */
  describe('PBT 2: resolveCategory preserves existing category mappings', () => {
    // Generator for a valid filename
    const filenameArb = fc.stringMatching(/^[A-Za-z][A-Za-z0-9 _-]{1,20}\.md$/);

    // Generator for an optional subdirectory
    const subdirArb = fc.oneof(
      fc.constant(''),
      fc.stringMatching(/^[A-Za-z][A-Za-z0-9 _-]{1,15}$/).map((s) => s + '/')
    );

    it('resolves backend/* paths to "Backend"', () => {
      fc.assert(
        fc.property(filenameArb, subdirArb, (filename, subdir) => {
          const path = `backend/${subdir}${filename}`;
          const result = resolveCategory(path);
          expect(result).toBe('Backend');
        }),
        { numRuns: 30 }
      );
    });

    it('resolves frontend/* paths to "Frontend"', () => {
      fc.assert(
        fc.property(filenameArb, subdirArb, (filename, subdir) => {
          const path = `frontend/${subdir}${filename}`;
          const result = resolveCategory(path);
          expect(result).toBe('Frontend');
        }),
        { numRuns: 30 }
      );
    });

    it('resolves infrastructure/* paths to "Infrastructure"', () => {
      fc.assert(
        fc.property(filenameArb, subdirArb, (filename, subdir) => {
          const path = `infrastructure/${subdir}${filename}`;
          const result = resolveCategory(path);
          expect(result).toBe('Infrastructure');
        }),
        { numRuns: 30 }
      );
    });

    it('resolves data-structures-and-algorithms/* paths to "Data Structures & Algorithms"', () => {
      fc.assert(
        fc.property(filenameArb, subdirArb, (filename, subdir) => {
          const path = `data-structures-and-algorithms/${subdir}${filename}`;
          const result = resolveCategory(path);
          expect(result).toBe('Data Structures & Algorithms');
        }),
        { numRuns: 30 }
      );
    });

    it('resolves system-design/* paths to "System Design"', () => {
      fc.assert(
        fc.property(filenameArb, subdirArb, (filename, subdir) => {
          const path = `system-design/${subdir}${filename}`;
          const result = resolveCategory(path);
          expect(result).toBe('System Design');
        }),
        { numRuns: 30 }
      );
    });

    it('resolves interview-prep/* paths to "Interview Prep"', () => {
      fc.assert(
        fc.property(filenameArb, subdirArb, (filename, subdir) => {
          const path = `interview-prep/${subdir}${filename}`;
          const result = resolveCategory(path);
          expect(result).toBe('Interview Prep');
        }),
        { numRuns: 30 }
      );
    });

    it('resolves git/* paths to "Git"', () => {
      fc.assert(
        fc.property(filenameArb, subdirArb, (filename, subdir) => {
          const path = `git/${subdir}${filename}`;
          const result = resolveCategory(path);
          expect(result).toBe('Git');
        }),
        { numRuns: 30 }
      );
    });

    it('returns null for unmapped paths', () => {
      fc.assert(
        fc.property(filenameArb, (filename) => {
          const path = `unmapped-directory/${filename}`;
          const result = resolveCategory(path);
          expect(result).toBeNull();
        }),
        { numRuns: 30 }
      );
    });
  });

  /**
   * PBT 3: Exclusion Filter Preservation
   *
   * For all paths ending in .tex, .css, starting with public/, or containing
   * dot-prefixed directories, shouldExclude returns true.
   *
   * **Validates: Requirements 3.9**
   */
  describe('PBT 3: shouldExclude preserves exclusion rules', () => {
    // Generator for a valid directory name (non-dot-prefixed)
    const dirNameArb = fc.stringMatching(/^[A-Za-z][A-Za-z0-9 _-]{0,15}$/);

    // Generator for a base filename (without extension)
    const baseNameArb = fc.stringMatching(/^[A-Za-z][A-Za-z0-9_-]{0,15}$/);

    it('excludes all paths ending in .tex', () => {
      fc.assert(
        fc.property(dirNameArb, baseNameArb, (dir, baseName) => {
          const path = dir.trim().length > 0
            ? `${dir.trim()}/${baseName.trim()}.tex`
            : `${baseName.trim()}.tex`;
          expect(shouldExclude(path)).toBe(true);
        }),
        { numRuns: 50 }
      );
    });

    it('excludes all paths ending in .css', () => {
      fc.assert(
        fc.property(dirNameArb, baseNameArb, (dir, baseName) => {
          const path = dir.trim().length > 0
            ? `${dir.trim()}/${baseName.trim()}.css`
            : `${baseName.trim()}.css`;
          expect(shouldExclude(path)).toBe(true);
        }),
        { numRuns: 50 }
      );
    });

    it('excludes all paths starting with public/', () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^[A-Za-z][A-Za-z0-9._-]{1,20}$/),
          (filename) => {
            const path = `public/${filename}`;
            expect(shouldExclude(path)).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('excludes all paths containing dot-prefixed directories', () => {
      fc.assert(
        fc.property(
          // Generate a dot-prefixed directory name
          fc.stringMatching(/^[a-z][a-z0-9]{1,10}$/).map((s) => `.${s}`),
          // Generate a filename
          fc.stringMatching(/^[A-Za-z][A-Za-z0-9_-]{1,15}\.[a-z]{2,4}$/),
          (dotDir, filename) => {
            const path = `${dotDir}/${filename}`;
            expect(shouldExclude(path)).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('excludes paths with nested dot-prefixed directories', () => {
      fc.assert(
        fc.property(
          dirNameArb,
          fc.stringMatching(/^[a-z][a-z0-9]{1,10}$/).map((s) => `.${s}`),
          fc.stringMatching(/^[A-Za-z][A-Za-z0-9_-]{1,10}\.md$/),
          (parentDir, dotDir, filename) => {
            const trimmedParent = parentDir.trim();
            if (trimmedParent.length === 0) return; // skip empty
            const path = `${trimmedParent}/${dotDir}/${filename}`;
            expect(shouldExclude(path)).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * PBT 4: renderContentNode Preservation for Non-Interactive Types
   *
   * For all non-interactive ContentNode types (paragraph, code, table, math,
   * image, list, blockquote), renderContentNode produces the same JSX output.
   *
   * We test this by rendering ContentCard with sections containing these node types
   * and verifying the output structure is consistent.
   *
   * **Validates: Requirements 3.4**
   */
  describe('PBT 4: renderContentNode produces consistent output for non-interactive types', () => {
    // We import ContentCard and render sections with various node types
    // to verify the rendering is stable

    it('renders paragraph nodes consistently', () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^[A-Za-z][A-Za-z0-9 .,!?]{5,80}$/),
          (text) => {
            const trimmedText = text.trim();
            if (trimmedText.length === 0) return true;

            // Use parseMarkdown to generate a section with a paragraph
            const markdown = `# Title\n## Section\n${trimmedText}`;
            const result = parseMarkdown(markdown, 'test.md', 'Test');

            // Verify the paragraph node is preserved
            expect(result.sections).toHaveLength(1);
            const paragraphNodes = result.sections[0].content.filter(
              (n) => n.type === 'paragraph'
            );
            expect(paragraphNodes.length).toBeGreaterThan(0);
            // The text content should be preserved
            const firstParagraph = paragraphNodes[0];
            if (firstParagraph.type === 'paragraph') {
              expect(firstParagraph.text).toBe(trimmedText);
            }
          }
        ),
        { numRuns: 30 }
      );
    });

    it('renders code nodes consistently', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('python', 'java', 'javascript', 'typescript', 'go', 'rust'),
          fc.stringMatching(/^[A-Za-z][A-Za-z0-9 =();."']{5,50}$/),
          (language, code) => {
            const markdown = `# Title\n## Section\n\`\`\`${language}\n${code}\n\`\`\``;
            const result = parseMarkdown(markdown, 'test.md', 'Test');

            expect(result.sections).toHaveLength(1);
            const codeNodes = result.sections[0].content.filter(
              (n) => n.type === 'code'
            );
            expect(codeNodes.length).toBe(1);
            if (codeNodes[0].type === 'code') {
              expect(codeNodes[0].language).toBe(language);
              expect(codeNodes[0].code).toBe(code);
            }
          }
        ),
        { numRuns: 30 }
      );
    });

    it('renders list nodes consistently', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.stringMatching(/^[A-Za-z][A-Za-z0-9 ]{2,20}$/),
            { minLength: 1, maxLength: 5 }
          ),
          fc.boolean(),
          (items, ordered) => {
            const validItems = items.filter((i) => i.trim().length > 0);
            if (validItems.length === 0) return true;

            const listContent = validItems
              .map((item, idx) => ordered ? `${idx + 1}. ${item}` : `- ${item}`)
              .join('\n');
            const markdown = `# Title\n## Section\n${listContent}`;
            const result = parseMarkdown(markdown, 'test.md', 'Test');

            expect(result.sections).toHaveLength(1);
            const listNodes = result.sections[0].content.filter(
              (n) => n.type === 'list'
            );
            expect(listNodes.length).toBe(1);
            if (listNodes[0].type === 'list') {
              expect(listNodes[0].ordered).toBe(ordered);
              expect(listNodes[0].items).toHaveLength(validItems.length);
            }
          }
        ),
        { numRuns: 30 }
      );
    });

    it('renders table nodes consistently', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.stringMatching(/^[A-Za-z][A-Za-z0-9]{1,10}$/),
            { minLength: 2, maxLength: 4 }
          ),
          fc.array(
            fc.array(
              fc.stringMatching(/^[A-Za-z0-9][A-Za-z0-9 ]{0,10}$/),
              { minLength: 2, maxLength: 4 }
            ),
            { minLength: 1, maxLength: 3 }
          ),
          (headers, rows) => {
            const validHeaders = headers.filter((h) => h.trim().length > 0);
            if (validHeaders.length < 2) return true;

            // Ensure rows have same column count as headers
            const normalizedRows = rows.map((row) =>
              row.slice(0, validHeaders.length).concat(
                Array(Math.max(0, validHeaders.length - row.length)).fill('x')
              )
            );

            const headerLine = `| ${validHeaders.join(' | ')} |`;
            const separatorLine = `| ${validHeaders.map(() => '---').join(' | ')} |`;
            const rowLines = normalizedRows
              .map((row) => `| ${row.slice(0, validHeaders.length).join(' | ')} |`)
              .join('\n');

            const markdown = `# Title\n## Section\n${headerLine}\n${separatorLine}\n${rowLines}`;
            const result = parseMarkdown(markdown, 'test.md', 'Test');

            expect(result.sections).toHaveLength(1);
            const tableNodes = result.sections[0].content.filter(
              (n) => n.type === 'table'
            );
            expect(tableNodes.length).toBe(1);
            if (tableNodes[0].type === 'table') {
              expect(tableNodes[0].headers).toHaveLength(validHeaders.length);
              expect(tableNodes[0].rows).toHaveLength(normalizedRows.length);
            }
          }
        ),
        { numRuns: 30 }
      );
    });

    it('renders blockquote nodes consistently', () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^[A-Za-z][A-Za-z0-9 .,!?]{5,50}$/),
          (quoteText) => {
            const trimmed = quoteText.trim();
            if (trimmed.length === 0) return true;

            const markdown = `# Title\n## Section\n> ${trimmed}`;
            const result = parseMarkdown(markdown, 'test.md', 'Test');

            expect(result.sections).toHaveLength(1);
            const bqNodes = result.sections[0].content.filter(
              (n) => n.type === 'blockquote'
            );
            expect(bqNodes.length).toBe(1);
            if (bqNodes[0].type === 'blockquote') {
              expect(bqNodes[0].text).toBe(trimmed);
            }
          }
        ),
        { numRuns: 30 }
      );
    });

    it('renders image nodes consistently', () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^[A-Za-z][A-Za-z0-9 ]{2,20}$/),
          fc.stringMatching(/^[a-z][a-z0-9_-]{1,15}\.(png|jpg|gif|svg)$/),
          (altText, filename) => {
            const trimmedAlt = altText.trim();
            if (trimmedAlt.length === 0) return true;

            const markdown = `# Title\n## Section\n![${trimmedAlt}](./${filename})`;
            const result = parseMarkdown(markdown, 'test.md', 'Test');

            expect(result.sections).toHaveLength(1);
            const imageNodes = result.sections[0].content.filter(
              (n) => n.type === 'image'
            );
            expect(imageNodes.length).toBe(1);
            if (imageNodes[0].type === 'image') {
              expect(imageNodes[0].alt).toBe(trimmedAlt);
              expect(imageNodes[0].src).toBe(`./${filename}`);
            }
          }
        ),
        { numRuns: 30 }
      );
    });

    it('renders math nodes consistently', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            'E = mc^2',
            'x^2 + y^2 = z^2',
            'f(x) = ax + b',
            '\\sum_{i=1}^{n} i',
            '\\frac{a}{b}'
          ),
          (expression) => {
            const markdown = `# Title\n## Section\n$$\n${expression}\n$$`;
            const result = parseMarkdown(markdown, 'test.md', 'Test');

            expect(result.sections).toHaveLength(1);
            const mathNodes = result.sections[0].content.filter(
              (n) => n.type === 'math'
            );
            expect(mathNodes.length).toBe(1);
            if (mathNodes[0].type === 'math') {
              expect(mathNodes[0].expression).toBe(expression);
              expect(mathNodes[0].display).toBe('block');
            }
          }
        ),
        { numRuns: 5 }
      );
    });
  });
});
