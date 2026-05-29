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
 * Custom topic ordering within categories.
 * Maps category directory patterns to an ordered array of topic directory names.
 * Topics listed here appear in this order; any unlisted topics sort alphabetically after.
 */
export const TOPIC_ORDER: Record<string, string[]> = {
  'data-structures-and-algorithms': [
    'fundamental-data-structures',
    'arrays-and-strings',
    'sorting-and-searching',
    'trees-and-graphs',
    'dynamic-programming',
  ],
  'backend': [
    'java',
    'spring-framework',
    'api-design',
    'messaging',
    'build-tools',
  ],
  'databases': [
    'sql-foundations',
    'postgresql',
    'oracle',
    'mongodb',
    'redis',
  ],
  'frontend': [
    'html-css',
    'javascript',
    'typescript',
    'react',
    'angular',
    'nextjs',
    'state-management',
    'web-performance',
  ],
  'infrastructure': [
    'linux',
    'docker',
    'kubernetes',
    'aws',
    'ci-cd',
    'observability',
  ],
  'interview-prep': [
    'technical',
    'soft-skills',
  ],
  'networking': [
    'protocols',
    'real-time-and-infrastructure',
  ],
  'operating-systems': [
    'processes-and-memory',
    'systems-and-io',
  ],
  'security': [
    'application-security',
    'infrastructure-security',
  ],
  'software-engineering': [
    'design-principles',
    'practices',
  ],
  'system-design': [
    'fundamentals',
    'patterns',
  ],
  'testing': [
    'unit-testing',
    'integration-testing',
    'test-strategy',
  ],
};

/**
 * Returns a comparator for sorting topics within a category.
 * If the category has a custom TOPIC_ORDER, topics are sorted by that order.
 * Topics not in the custom order are placed after ordered topics, sorted alphabetically.
 * If no custom order exists, falls back to alphabetical by title.
 */
export function getTopicSortIndex(categoryPattern: string, topicSlug: string): number {
  const order = TOPIC_ORDER[categoryPattern];
  if (!order) return -1;
  const idx = order.indexOf(topicSlug);
  return idx === -1 ? Infinity : idx;
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
