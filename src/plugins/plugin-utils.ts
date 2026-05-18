/**
 * Shared utility functions for the content pipeline plugins.
 * Extracted for independent testability and reuse.
 */

/**
 * Category mapping configuration.
 * Maps repository directory patterns to category names.
 */
export interface CategoryMapping {
  /** Pattern to match against the relative path from contentRoot */
  pattern: string;
  /** The category name to assign */
  category: string;
}

export const CATEGORY_MAPPINGS: CategoryMapping[] = [
  { pattern: 'backend', category: 'Backend' },
  { pattern: 'frontend', category: 'Frontend' },
  { pattern: 'databases', category: 'Databases' },
  { pattern: 'infrastructure', category: 'Infrastructure' },
  { pattern: 'data-structures-and-algorithms', category: 'Data Structures & Algorithms' },
  { pattern: 'system-design', category: 'System Design' },
  { pattern: 'networking', category: 'Networking' },
  { pattern: 'operating-systems', category: 'Operating Systems' },
  { pattern: 'interview-prep', category: 'Interview Prep' },
  { pattern: 'git', category: 'Git' },
  { pattern: 'security', category: 'Security' },
  { pattern: 'testing', category: 'Testing' },
  { pattern: 'software-engineering', category: 'Software Engineering' },
];

/**
 * Resolves the category for a given file path relative to the content root.
 * Returns the category name if the path matches a mapped directory, or null if unmapped.
 */
export function resolveCategory(relativePath: string): string | null {
  const normalized = relativePath.replace(/\\/g, '/');

  for (const mapping of CATEGORY_MAPPINGS) {
    if (normalized.startsWith(mapping.pattern + '/') || normalized === mapping.pattern) {
      return mapping.category;
    }
  }

  return null;
}

/**
 * Generates a URL-friendly slug from a string.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

/**
 * Extracts the learning path order from an index.md file's content.
 * Parses markdown links in ordered lists to determine subtopic display order.
 * Returns an array of slugs derived from the linked filenames.
 * If no learning path is found, returns an empty array (falls back to alphabetical).
 */
export function extractLearningPathOrder(indexContent: string): string[] {
  const order: string[] = [];
  const linkPattern = /^\s*\d+\.\s+\[.*?\]\(\.\/([\w-]+)\.md\)/gm;
  let match: RegExpExecArray | null;
  while ((match = linkPattern.exec(indexContent)) !== null) {
    const filename = match[1];
    order.push(slugify(filename));
  }
  return order;
}
