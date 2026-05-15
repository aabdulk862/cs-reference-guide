/**
 * Content validation pipeline for the CS Reference Guide.
 *
 * Validates parsed markdown content at build time, checking word counts,
 * required sections, section depth, image references, and orphaned images.
 * Emits warnings without failing the build.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.6, 1.7, 1.8, 2.1, 2.3, 2.4, 2.5
 */

import fs from 'fs';
import path from 'path';
import type { ParsedContent, ContentSection, ContentNode } from '../types/content';

/**
 * Configuration for the content validation pipeline.
 */
export interface ValidationConfig {
  /** Minimum total prose word count for a topic file (default: 1500) */
  minWordCount: number;
  /** Word count below which a file is considered a stub (default: 200) */
  stubThreshold: number;
  /** Minimum word count per section (default: 100) */
  minSectionWords: number;
  /** Required section headings that must be present in each topic file */
  requiredSections: string[];
}

/**
 * A single validation warning emitted during content validation.
 */
export interface ValidationWarning {
  type:
    | 'low-word-count'
    | 'stub-content'
    | 'missing-section'
    | 'broken-image'
    | 'external-image'
    | 'orphaned-image'
    | 'section-too-short';
  message: string;
  details?: Record<string, unknown>;
}

/**
 * The result of validating a single content file.
 */
export interface ValidationResult {
  filePath: string;
  warnings: ValidationWarning[];
}

/**
 * Default validation configuration matching the design spec.
 */
export const DEFAULT_VALIDATION_CONFIG: ValidationConfig = {
  minWordCount: 1500,
  stubThreshold: 200,
  minSectionWords: 100,
  requiredSections: [
    'When to Use',
    'Common Pitfalls',
    'Interview Questions',
    'Real-World Use Cases',
    'Production Tips',
  ],
};

/**
 * Counts prose words in a set of content nodes.
 * Includes words from paragraphs, list items, blockquotes, admonitions, and table cells.
 * Excludes code blocks, headings, mermaid diagrams, and front-matter.
 */
export function countProseWords(content: ContentNode[]): number {
  let count = 0;
  for (const node of content) {
    switch (node.type) {
      case 'paragraph':
        count += wordCount(node.text);
        break;
      case 'list':
        for (const item of node.items) {
          count += wordCount(item);
        }
        break;
      case 'blockquote':
        count += wordCount(node.text);
        break;
      case 'admonition':
        count += wordCount(node.content);
        break;
      case 'table':
        for (const header of node.headers) {
          count += wordCount(header);
        }
        for (const row of node.rows) {
          for (const cell of row) {
            count += wordCount(cell);
          }
        }
        break;
      // code, mermaid, image, math, interactive, task-list, footnotes — not counted
    }
  }
  return count;
}

/**
 * Counts words in a string.
 */
function wordCount(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
}

/**
 * Recursively calculates total prose word count for a section and its subsections.
 */
export function calculateSectionProseWords(section: ContentSection): number {
  let total = countProseWords(section.content);
  for (const sub of section.subsections) {
    total += calculateSectionProseWords(sub);
  }
  return total;
}

/**
 * Calculates total prose word count for an entire parsed topic.
 */
export function calculateTotalProseWords(parsed: ParsedContent): number {
  let total = 0;
  for (const section of parsed.sections) {
    total += calculateSectionProseWords(section);
  }
  return total;
}

/**
 * Collects all section headings (H2-level) from parsed content.
 * Returns headings normalized to lowercase for comparison.
 */
function collectSectionHeadings(sections: ContentSection[]): string[] {
  const headings: string[] = [];
  for (const section of sections) {
    headings.push(section.heading);
    // Also check subsections in case required sections are nested
    for (const sub of section.subsections) {
      headings.push(sub.heading);
    }
  }
  return headings;
}

/**
 * Validates word count thresholds for a parsed topic.
 */
export function validateWordCount(
  parsed: ParsedContent,
  config: ValidationConfig
): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];
  const totalWords = calculateTotalProseWords(parsed);

  if (totalWords < config.stubThreshold) {
    warnings.push({
      type: 'stub-content',
      message: `File "${parsed.metadata.filePath}" is a stub with only ${totalWords} words (threshold: ${config.stubThreshold})`,
      details: { wordCount: totalWords, threshold: config.stubThreshold },
    });
  } else if (totalWords < config.minWordCount) {
    warnings.push({
      type: 'low-word-count',
      message: `File "${parsed.metadata.filePath}" has ${totalWords} words, below minimum of ${config.minWordCount}`,
      details: { wordCount: totalWords, minimum: config.minWordCount },
    });
  }

  return warnings;
}

/**
 * Validates that required sections are present in the parsed content.
 */
export function validateRequiredSections(
  parsed: ParsedContent,
  config: ValidationConfig
): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];
  const headings = collectSectionHeadings(parsed.sections);
  const normalizedHeadings = headings.map((h) => h.toLowerCase().trim());

  const missingSections: string[] = [];
  for (const required of config.requiredSections) {
    const normalizedRequired = required.toLowerCase().trim();
    const found = normalizedHeadings.some((h) => h === normalizedRequired);
    if (!found) {
      missingSections.push(required);
    }
  }

  if (missingSections.length > 0) {
    warnings.push({
      type: 'missing-section',
      message: `File "${parsed.metadata.filePath}" is missing required sections: ${missingSections.join(', ')}`,
      details: { missingSections },
    });
  }

  return warnings;
}

/**
 * Validates that each section meets the minimum word count.
 */
export function validateSectionWordCounts(
  parsed: ParsedContent,
  config: ValidationConfig
): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  function checkSection(section: ContentSection): void {
    const sectionWords = countProseWords(section.content);
    if (sectionWords < config.minSectionWords) {
      // Only warn if the section has some content (not pure code/diagram sections)
      const hasOnlyCodeOrDiagrams = section.content.every(
        (node) =>
          node.type === 'code' ||
          node.type === 'mermaid' ||
          node.type === 'image' ||
          node.type === 'math'
      );
      if (!hasOnlyCodeOrDiagrams && section.content.length > 0) {
        warnings.push({
          type: 'section-too-short',
          message: `Section "${section.heading}" in "${parsed.metadata.filePath}" has ${sectionWords} words, below minimum of ${config.minSectionWords}`,
          details: {
            section: section.heading,
            wordCount: sectionWords,
            minimum: config.minSectionWords,
          },
        });
      }
    }

    for (const sub of section.subsections) {
      checkSection(sub);
    }
  }

  for (const section of parsed.sections) {
    checkSection(section);
  }

  return warnings;
}

/**
 * Collects all image references from parsed content sections recursively.
 */
function collectImageRefs(
  sections: ContentSection[]
): Array<{ src: string; originalPath: string }> {
  const refs: Array<{ src: string; originalPath: string }> = [];

  function walkSection(section: ContentSection): void {
    for (const node of section.content) {
      if (node.type === 'image') {
        refs.push({ src: node.src, originalPath: node.originalPath });
      }
    }
    for (const sub of section.subsections) {
      walkSection(sub);
    }
  }

  for (const section of sections) {
    walkSection(section);
  }
  return refs;
}

/**
 * Validates image references in a parsed topic.
 * Detects broken local image references and external image URLs.
 *
 * @param parsed - The parsed content to validate
 * @param contentRoot - The root content directory for resolving relative paths
 */
export function validateImageReferences(
  parsed: ParsedContent,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _contentRoot: string
): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];
  const imageRefs = collectImageRefs(parsed.sections);

  for (const ref of imageRefs) {
    const src = ref.originalPath || ref.src;

    // Check for external image URLs
    if (src.startsWith('http://') || src.startsWith('https://')) {
      warnings.push({
        type: 'external-image',
        message: `File "${parsed.metadata.filePath}" contains external image URL: ${src}`,
        details: { url: src },
      });
      continue;
    }

    // Check for broken local image references
    // Resolve relative to the markdown file's location within content/
    const markdownFilePath = parsed.metadata.filePath || '';
    let resolvedPath: string;

    if (path.isAbsolute(src)) {
      resolvedPath = src;
    } else {
      // Resolve relative to the markdown file's directory
      const markdownDir = path.dirname(markdownFilePath);
      resolvedPath = path.resolve(markdownDir, src);
    }

    // Check if the file exists
    if (!fs.existsSync(resolvedPath)) {
      warnings.push({
        type: 'broken-image',
        message: `File "${parsed.metadata.filePath}" references image that does not exist: ${src}`,
        details: { imagePath: src, resolvedPath },
      });
    }
  }

  return warnings;
}

/**
 * Detects orphaned image files — .png files in the content directory
 * that are not referenced by any topic file.
 *
 * @param contentRoot - The root content directory to scan for .png files
 * @param allParsedContents - All parsed topic files to check references against
 */
export function detectOrphanedImages(
  contentRoot: string,
  allParsedContents: ParsedContent[]
): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  // Collect all .png files in the content directory
  const allPngFiles = scanPngFiles(contentRoot);

  // Collect all referenced image filenames from all topic files
  const referencedFiles = new Set<string>();
  for (const parsed of allParsedContents) {
    const imageRefs = collectImageRefs(parsed.sections);
    for (const ref of imageRefs) {
      const src = ref.originalPath || ref.src;
      // Skip external URLs
      if (src.startsWith('http://') || src.startsWith('https://')) continue;

      // Resolve the full path of the referenced image
      const markdownFilePath = parsed.metadata.filePath || '';
      let resolvedPath: string;
      if (path.isAbsolute(src)) {
        resolvedPath = path.normalize(src);
      } else {
        const markdownDir = path.dirname(markdownFilePath);
        resolvedPath = path.normalize(path.resolve(markdownDir, src));
      }
      referencedFiles.add(resolvedPath);

      // Also add just the filename for fuzzy matching
      const filename = path.basename(src);
      referencedFiles.add(filename);
    }
  }

  // Find orphaned files
  for (const pngFile of allPngFiles) {
    const normalizedPng = path.normalize(pngFile);
    const filename = path.basename(pngFile);

    // Check if this file is referenced by full path or by filename
    if (!referencedFiles.has(normalizedPng) && !referencedFiles.has(filename)) {
      warnings.push({
        type: 'orphaned-image',
        message: `Image file "${pngFile}" is not referenced by any topic file`,
        details: { filePath: pngFile },
      });
    }
  }

  return warnings;
}

/**
 * Recursively scans a directory for .png files.
 */
function scanPngFiles(dir: string): string[] {
  const results: string[] = [];

  if (!fs.existsSync(dir)) return results;

  function walk(currentDir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        // Skip dot-prefixed directories
        if (entry.name.startsWith('.')) continue;
        walk(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.png')) {
        results.push(fullPath);
      }
    }
  }

  walk(dir);
  return results;
}

/**
 * Validates a single parsed content file against the validation config.
 * Returns all warnings for the file.
 */
export function validateContent(
  parsed: ParsedContent,
  contentRoot: string,
  config: ValidationConfig = DEFAULT_VALIDATION_CONFIG
): ValidationResult {
  const warnings: ValidationWarning[] = [];

  // Word count validation
  warnings.push(...validateWordCount(parsed, config));

  // Required section detection
  warnings.push(...validateRequiredSections(parsed, config));

  // Section minimum word count check
  warnings.push(...validateSectionWordCounts(parsed, config));

  // Image reference validation
  warnings.push(...validateImageReferences(parsed, contentRoot));

  return {
    filePath: parsed.metadata.filePath || '',
    warnings,
  };
}

/**
 * Validates all parsed content files and detects orphaned images.
 * Emits warnings to the console without failing the build.
 *
 * @param allParsedContents - All parsed topic files
 * @param contentRoot - The root content directory
 * @param config - Validation configuration
 * @returns Array of validation results for all files
 */
export function validateAllContent(
  allParsedContents: ParsedContent[],
  contentRoot: string,
  config: ValidationConfig = DEFAULT_VALIDATION_CONFIG
): ValidationResult[] {
  const results: ValidationResult[] = [];

  // Validate each file individually
  for (const parsed of allParsedContents) {
    const result = validateContent(parsed, contentRoot, config);
    results.push(result);
  }

  // Detect orphaned images across all files
  const orphanWarnings = detectOrphanedImages(contentRoot, allParsedContents);
  if (orphanWarnings.length > 0) {
    results.push({
      filePath: contentRoot,
      warnings: orphanWarnings,
    });
  }

  // Emit warnings to console (without failing the build)
  for (const result of results) {
    for (const warning of result.warnings) {
      console.warn(`[content-validator] ${warning.type}: ${warning.message}`);
    }
  }

  return results;
}
