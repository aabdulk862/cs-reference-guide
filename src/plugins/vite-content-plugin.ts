/**
 * Vite plugin that orchestrates the content parser pipeline at build time.
 *
 * Recursively scans the repository for .md files, applies exclusion filters,
 * parses markdown into structured JSON, resolves image paths, and generates
 * content manifests for the application to consume at runtime.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.5, 7.6
 */

import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import type { Plugin, ViteDevServer } from 'vite';
import { parseMarkdown } from './markdown-parser';
import { shouldExclude } from './exclusion-filter';
import { resolveImagePath } from './image-resolver';
import { buildSearchDocuments } from './search-indexer';
import { generateSitemap } from './sitemap-generator';
import type { ParsedContent } from '../types/content';

/**
 * Category mapping configuration.
 * Maps repository directory patterns to category names.
 */
interface CategoryMapping {
  /** Pattern to match against the relative path from contentRoot */
  pattern: string;
  /** The category name to assign */
  category: string;
}

const CATEGORY_MAPPINGS: CategoryMapping[] = [
  { pattern: 'backend', category: 'Backend' },
  { pattern: 'frontend', category: 'Frontend' },
  { pattern: 'infrastructure', category: 'Infrastructure' },
  { pattern: 'data-structures-and-algorithms', category: 'Data Structures & Algorithms' },
  { pattern: 'system-design', category: 'System Design' },
  { pattern: 'interview-prep', category: 'Interview Prep' },
  { pattern: 'git', category: 'Git' },
];

/**
 * Resolves the category for a given file path relative to the content root.
 * Returns the category name if the path matches a mapped directory, or null if unmapped.
 */
export function resolveCategory(relativePath: string): string | null {
  const normalized = relativePath.replace(/\\/g, '/');

  for (const mapping of CATEGORY_MAPPINGS) {
    // Match files directly inside the mapped directory (e.g., "backend/java.md")
    // or in subdirectories (e.g., "backend/sub/file.md")
    if (normalized.startsWith(mapping.pattern + '/') || normalized === mapping.pattern) {
      return mapping.category;
    }
  }

  return null;
}

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
 * Recursively scans a directory for .md files.
 */
async function scanMarkdownFiles(dir: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(currentDir: string): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = await fsp.readdir(currentDir, { withFileTypes: true });
    } catch {
      // Skip directories we can't read
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        results.push(fullPath);
      }
    }
  }

  await walk(dir);
  return results;
}

/** Topic entry in the content manifest */
interface ManifestTopic {
  id: string;
  slug: string;
  title: string;
  source: 'parsed';
  sectionCount: number;
  wordCount: number;
  contentPath: string;
}

/** Category entry in the content manifest */
interface ManifestCategory {
  id: string;
  name: string;
  topics: ManifestTopic[];
}

/** The full content manifest structure */
interface ContentManifest {
  categories: ManifestCategory[];
  totalTopics: number;
  totalSections: number;
  buildTimestamp: string;
}

/**
 * Processes all markdown files and generates content JSON and manifest.
 */
async function processContent(contentRoot: string, outputDir: string): Promise<void> {
  // Ensure output directory exists
  await fsp.mkdir(outputDir, { recursive: true });

  // Scan for all markdown files
  const allFiles = await scanMarkdownFiles(contentRoot);

  // Filter out excluded files and files without a category mapping
  const validFiles: Array<{ filePath: string; relativePath: string; category: string }> = [];

  for (const filePath of allFiles) {
    const relativePath = path.relative(contentRoot, filePath);

    // Apply exclusion filter
    if (shouldExclude(relativePath)) {
      continue;
    }

    // Resolve category
    const category = resolveCategory(relativePath);
    if (category === null) {
      // File doesn't match any known category mapping — skip
      continue;
    }

    validFiles.push({ filePath, relativePath, category });
  }

  // Group by category and process
  const categoryMap = new Map<string, ParsedContent[]>();

  for (const { filePath, category } of validFiles) {
    // Read file content
    let rawContent: string;
    try {
      rawContent = await fsp.readFile(filePath, 'utf-8');
    } catch {
      console.warn(`[content-plugin] Could not read file: ${filePath}`);
      continue;
    }

    // Skip empty files
    if (rawContent.trim().length === 0) {
      console.warn(`[content-plugin] Skipping empty file: ${filePath}`);
      continue;
    }

    // Parse markdown
    const parsed = parseMarkdown(rawContent, filePath, category);

    // Resolve image paths
    for (const image of parsed.images) {
      if (image.originalPath && !image.originalPath.startsWith('http')) {
        const resolved = resolveImagePath(image.originalPath, filePath);
        image.src = resolved;
      }
    }

    // Also resolve image nodes within sections
    resolveImagesInSections(parsed.sections, filePath);

    // Add to category group
    if (!categoryMap.has(category)) {
      categoryMap.set(category, []);
    }
    categoryMap.get(category)!.push(parsed);
  }

  // Generate output files
  const manifestCategories: ManifestCategory[] = [];
  let totalTopics = 0;
  let totalSections = 0;

  for (const [categoryName, contents] of categoryMap) {
    const categorySlug = slugify(categoryName);
    const categoryDir = path.join(outputDir, categorySlug);
    await fsp.mkdir(categoryDir, { recursive: true });

    const topics: ManifestTopic[] = [];

    for (const parsed of contents) {
      const topicSlug = parsed.slug;
      const topicFilePath = path.join(categoryDir, `${topicSlug}.json`);

      // Write individual topic JSON
      await fsp.writeFile(topicFilePath, JSON.stringify(parsed, null, 2), 'utf-8');

      topics.push({
        id: parsed.id,
        slug: `${categorySlug}/${topicSlug}`,
        title: parsed.title,
        source: 'parsed',
        sectionCount: parsed.metadata.sectionCount,
        wordCount: parsed.metadata.wordCount,
        contentPath: `/content/${categorySlug}/${topicSlug}.json`,
      });

      totalTopics++;
      totalSections += parsed.metadata.sectionCount;
    }

    // Detect and disambiguate duplicate topic IDs within this category
    const idCounts = new Map<string, number>();
    for (const topic of topics) {
      idCounts.set(topic.id, (idCounts.get(topic.id) || 0) + 1);
    }
    // For any IDs that appear more than once, append a counter suffix
    const idCounters = new Map<string, number>();
    for (const topic of topics) {
      if ((idCounts.get(topic.id) || 0) > 1) {
        const counter = (idCounters.get(topic.id) || 0) + 1;
        idCounters.set(topic.id, counter);
        if (counter > 1) {
          topic.id = `${topic.id}-${counter}`;
        }
      }
    }

    // Sort topics alphabetically by title
    topics.sort((a, b) => a.title.localeCompare(b.title));

    manifestCategories.push({
      id: categorySlug,
      name: categoryName,
      topics,
    });
  }

  // Sort categories alphabetically by name
  manifestCategories.sort((a, b) => a.name.localeCompare(b.name));

  // Write content manifest
  const manifest: ContentManifest = {
    categories: manifestCategories,
    totalTopics,
    totalSections,
    buildTimestamp: new Date().toISOString(),
  };

  const manifestPath = path.join(outputDir, '..', 'content-manifest.json');
  await fsp.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

  // Build and write search index from all parsed content
  const allParsedContents: ParsedContent[] = [];
  for (const contents of categoryMap.values()) {
    allParsedContents.push(...contents);
  }
  const searchDocuments = buildSearchDocuments(allParsedContents);
  const searchIndexPath = path.join(outputDir, '..', 'search-index.json');
  await fsp.writeFile(searchIndexPath, JSON.stringify(searchDocuments), 'utf-8');

  // Generate sitemap.xml alongside the manifest
  const sitemapXml = generateSitemap(manifest, 'https://cs-reference-guide.netlify.app');
  const sitemapPath = path.join(outputDir, '..', 'sitemap.xml');
  await fsp.writeFile(sitemapPath, sitemapXml, 'utf-8');

  console.log(
    `[content-plugin] Generated ${totalTopics} topics across ${manifestCategories.length} categories (${totalSections} sections total)`
  );
  console.log(
    `[content-plugin] Generated search index with ${searchDocuments.length} documents`
  );
  console.log(
    `[content-plugin] Generated sitemap.xml with ${totalTopics} URLs`
  );
}

/**
 * Recursively resolves image paths within content sections.
 */
function resolveImagesInSections(
  sections: ParsedContent['sections'],
  markdownFilePath: string
): void {
  for (const section of sections) {
    for (const node of section.content) {
      if (node.type === 'image' && node.originalPath && !node.src.startsWith('http')) {
        node.src = resolveImagePath(node.originalPath, markdownFilePath);
      }
    }
    if (section.subsections.length > 0) {
      resolveImagesInSections(section.subsections, markdownFilePath);
    }
  }
}

/**
 * Creates the Vite content parser plugin.
 *
 * @param options - Plugin options
 * @param options.contentRoot - Absolute path to the repository root containing markdown files
 * @returns A Vite plugin that processes markdown content at build time
 */
export function contentParserPlugin(options: { contentRoot: string }): Plugin {
  const { contentRoot } = options;

  return {
    name: 'vite-content-parser',
    enforce: 'pre',

    async buildStart() {
      const outputDir = path.resolve('public/content');
      console.log(`[content-plugin] Processing content from: ${contentRoot}`);
      await processContent(contentRoot, outputDir);
    },

    configureServer(server: ViteDevServer) {
      // In dev mode, process content on server start and watch for changes
      const outputDir = path.resolve('public/content');

      // Process content initially when dev server starts
      processContent(contentRoot, outputDir).catch((err) => {
        console.error('[content-plugin] Error processing content:', err);
      });

      // Watch the content root for .md file changes
      server.watcher.add(contentRoot);

      server.watcher.on('change', (changedPath: string) => {
        if (changedPath.endsWith('.md') && changedPath.startsWith(contentRoot)) {
          console.log(`[content-plugin] File changed: ${changedPath}, rebuilding content...`);
          processContent(contentRoot, outputDir).catch((err) => {
            console.error('[content-plugin] Error rebuilding content:', err);
          });
        }
      });

      server.watcher.on('add', (addedPath: string) => {
        if (addedPath.endsWith('.md') && addedPath.startsWith(contentRoot)) {
          console.log(`[content-plugin] File added: ${addedPath}, rebuilding content...`);
          processContent(contentRoot, outputDir).catch((err) => {
            console.error('[content-plugin] Error rebuilding content:', err);
          });
        }
      });
    },
  };
}
