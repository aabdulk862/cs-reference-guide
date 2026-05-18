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
import {
  CATEGORY_MAPPINGS,
  resolveCategory,
  slugify,
  extractLearningPathOrder,
  type CategoryMapping,
} from './plugin-utils';
// Re-export utilities for backward compatibility with existing test imports
export { resolveCategory, extractLearningPathOrder } from './plugin-utils';
import type { ParsedContent } from '../types/content';

/**
 * Represents a multi-page topic detected in the content directory.
 * A multi-page topic is a directory containing an `index.md` file
 * and one or more subtopic `.md` files.
 */
export interface MultiPageTopic {
  /** Absolute path to the topic directory */
  dirPath: string;
  /** Absolute path to the index.md file */
  indexFile: string;
  /** Alphabetically sorted list of absolute paths to subtopic .md files */
  subtopicFiles: string[];
  /** The category this topic belongs to */
  category: string;
  /** URL-friendly slug derived from the directory name */
  topicSlug: string;
}

/**
 * Detects multi-page topics within a category directory.
 *
 * For each immediate child entry of the category directory:
 * - If it's a directory containing `index.md`, classify as MultiPageTopic
 * - If it's a directory without `index.md`, log a warning and skip
 * - If it's a `.md` file, leave it for existing single-file processing
 *
 * Requirements: 1.1, 1.2, 1.4, 1.5, 1.6
 */
export async function detectMultiPageTopics(
  contentRoot: string,
  categoryMappings: CategoryMapping[] = CATEGORY_MAPPINGS
): Promise<MultiPageTopic[]> {
  const multiPageTopics: MultiPageTopic[] = [];

  for (const mapping of categoryMappings) {
    const categoryDir = path.join(contentRoot, mapping.pattern);

    // Check if the category directory exists
    let categoryEntries: fs.Dirent[];
    try {
      categoryEntries = await fsp.readdir(categoryDir, { withFileTypes: true });
    } catch {
      // Category directory doesn't exist yet — skip
      continue;
    }

    for (const entry of categoryEntries) {
      if (!entry.isDirectory()) {
        // Single .md files → existing single-file behavior (unchanged)
        continue;
      }

      const dirPath = path.join(categoryDir, entry.name);
      const indexFilePath = path.join(dirPath, 'index.md');

      // Check if the directory contains an index.md
      let hasIndex = false;
      try {
        await fsp.access(indexFilePath, fs.constants.F_OK);
        hasIndex = true;
      } catch {
        // index.md does not exist
      }

      if (!hasIndex) {
        console.warn(
          `[content-plugin] Warning: Directory "${dirPath}" does not contain an index.md file — skipping`
        );
        continue;
      }

      // Collect subtopic files: .md files directly in this directory, excluding index.md
      // and excluding files in nested subdirectories
      const topicEntries = await fsp.readdir(dirPath, { withFileTypes: true });
      const subtopicFiles: string[] = [];

      for (const topicEntry of topicEntries) {
        if (
          topicEntry.isFile() &&
          topicEntry.name.endsWith('.md') &&
          topicEntry.name !== 'index.md'
        ) {
          subtopicFiles.push(path.join(dirPath, topicEntry.name));
        }
      }

      // Sort subtopic files alphabetically
      subtopicFiles.sort((a, b) => {
        const nameA = path.basename(a);
        const nameB = path.basename(b);
        return nameA.localeCompare(nameB);
      });

      // Log warning if subtopic count exceeds 50
      if (subtopicFiles.length > 50) {
        console.warn(
          `[content-plugin] Warning: Multi-page topic "${entry.name}" in category "${mapping.category}" has ${subtopicFiles.length} subtopics, which exceeds the recommended maximum of 50`
        );
      }

      const topicSlug = slugify(entry.name);

      multiPageTopics.push({
        dirPath,
        indexFile: indexFilePath,
        subtopicFiles,
        category: mapping.category,
        topicSlug,
      });
    }
  }

  return multiPageTopics;
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

/** Subtopic entry within a multi-page topic manifest entry */
export interface ManifestSubtopic {
  id: string;
  slug: string;
  title: string;
  wordCount: number;
}

/** Topic entry in the content manifest */
export interface ManifestTopic {
  id: string;
  slug: string;
  title: string;
  source: 'parsed';
  sectionCount: number;
  wordCount: number;
  contentPath: string;
  subtopics?: ManifestSubtopic[];
}

/** Category entry in the content manifest */
export interface ManifestCategory {
  id: string;
  name: string;
  topics: ManifestTopic[];
}

/** The full content manifest structure */
export interface ContentManifest {
  categories: ManifestCategory[];
  totalTopics: number;
  totalSections: number;
  buildTimestamp: string;
}

/**
 * Processes all markdown files and generates content JSON and manifest.
 */
export async function processContent(contentRoot: string, outputDir: string): Promise<void> {
  // Ensure output directory exists
  await fsp.mkdir(outputDir, { recursive: true });

  // Step 1: Detect multi-page topics (directories with index.md)
  const multiPageTopics = await detectMultiPageTopics(contentRoot);

  // Build a set of file paths that belong to multi-page topics
  // so they can be excluded from single-file processing
  const multiPageFilePaths = new Set<string>();
  for (const topic of multiPageTopics) {
    multiPageFilePaths.add(topic.indexFile);
    for (const subtopicFile of topic.subtopicFiles) {
      multiPageFilePaths.add(subtopicFile);
    }
  }

  // Scan for all markdown files
  const allFiles = await scanMarkdownFiles(contentRoot);

  // Filter out excluded files, files without a category mapping,
  // and files that belong to multi-page topics (handled separately)
  const validFiles: Array<{ filePath: string; relativePath: string; category: string }> = [];

  for (const filePath of allFiles) {
    // Skip files that are part of multi-page topics
    if (multiPageFilePaths.has(filePath)) {
      continue;
    }

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

  // Process multi-page topics
  for (const multiPageTopic of multiPageTopics) {
    const { indexFile, subtopicFiles, category, topicSlug } = multiPageTopic;
    const categorySlug = slugify(category);

    // Parse index.md
    let indexRawContent: string;
    try {
      indexRawContent = await fsp.readFile(indexFile, 'utf-8');
    } catch {
      console.warn(`[content-plugin] Could not read index file: ${indexFile}`);
      continue;
    }

    if (indexRawContent.trim().length === 0) {
      console.warn(`[content-plugin] Skipping empty index file: ${indexFile}`);
      continue;
    }

    const indexParsed = parseMarkdown(indexRawContent, indexFile, category);

    // Resolve image paths in index content
    for (const image of indexParsed.images) {
      if (image.originalPath && !image.originalPath.startsWith('http')) {
        const resolved = resolveImagePath(image.originalPath, indexFile);
        image.src = resolved;
      }
    }
    resolveImagesInSections(indexParsed.sections, indexFile);

    // Parse subtopic files and deduplicate slugs
    const subtopicParsedList: ParsedContent[] = [];
    const slugCounts = new Map<string, number>();

    for (const subtopicFile of subtopicFiles) {
      let subtopicRawContent: string;
      try {
        subtopicRawContent = await fsp.readFile(subtopicFile, 'utf-8');
      } catch {
        console.warn(`[content-plugin] Could not read subtopic file: ${subtopicFile}`);
        continue;
      }

      if (subtopicRawContent.trim().length === 0) {
        console.warn(`[content-plugin] Skipping empty subtopic file: ${subtopicFile}`);
        continue;
      }

      const subtopicParsed = parseMarkdown(subtopicRawContent, subtopicFile, category);

      // Derive subtopic slug from filename (without .md extension)
      const filename = path.basename(subtopicFile, '.md');
      let subtopicSlug = slugify(filename);

      // Slug deduplication: first occurrence unchanged, subsequent get -2, -3, etc.
      const currentCount = slugCounts.get(subtopicSlug) || 0;
      slugCounts.set(subtopicSlug, currentCount + 1);
      if (currentCount > 0) {
        const suffix = currentCount + 1;
        console.warn(
          `[content-plugin] Warning: Duplicate subtopic slug "${subtopicSlug}" in topic "${topicSlug}" — renaming to "${subtopicSlug}-${suffix}"`
        );
        subtopicSlug = `${subtopicSlug}-${suffix}`;
      }

      // Override the slug with the deduplicated filename-based slug
      subtopicParsed.slug = subtopicSlug;

      // Resolve image paths in subtopic content
      for (const image of subtopicParsed.images) {
        if (image.originalPath && !image.originalPath.startsWith('http')) {
          const resolved = resolveImagePath(image.originalPath, subtopicFile);
          image.src = resolved;
        }
      }
      resolveImagesInSections(subtopicParsed.sections, subtopicFile);

      subtopicParsedList.push(subtopicParsed);
    }

    // Write index JSON: {categorySlug}/{topicSlug}.json
    const categoryOutputDir = path.join(outputDir, categorySlug);
    await fsp.mkdir(categoryOutputDir, { recursive: true });
    const indexOutputPath = path.join(categoryOutputDir, `${topicSlug}.json`);
    await fsp.writeFile(indexOutputPath, JSON.stringify(indexParsed, null, 2), 'utf-8');

    // Write subtopic JSON files: {categorySlug}/{topicSlug}/{subtopicSlug}.json
    const topicOutputDir = path.join(categoryOutputDir, topicSlug);
    await fsp.mkdir(topicOutputDir, { recursive: true });

    for (const subtopicParsed of subtopicParsedList) {
      const subtopicOutputPath = path.join(topicOutputDir, `${subtopicParsed.slug}.json`);
      await fsp.writeFile(subtopicOutputPath, JSON.stringify(subtopicParsed, null, 2), 'utf-8');
    }

    // Add to category map for manifest generation and search indexing
    if (!categoryMap.has(category)) {
      categoryMap.set(category, []);
    }
    // Store index parsed content tagged with multi-page metadata for manifest generation
    // We attach subtopic data to the index entry for later manifest building
    // Extract learning path order from index.md links
    const learningPathOrder = extractLearningPathOrder(indexRawContent);
    (indexParsed as ParsedContent & { _multiPage?: { topicSlug: string; subtopics: ParsedContent[]; learningPathOrder: string[] } })._multiPage = {
      topicSlug,
      subtopics: subtopicParsedList,
      learningPathOrder,
    };
    categoryMap.get(category)!.push(indexParsed);
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
      const multiPageData = (parsed as ParsedContent & { _multiPage?: { topicSlug: string; subtopics: ParsedContent[]; learningPathOrder: string[] } })._multiPage;

      if (multiPageData) {
        // Multi-page topic: JSON already written above, just build manifest entry
        const { topicSlug: mpTopicSlug, subtopics, learningPathOrder } = multiPageData;

        // Build subtopics array — use learning path order from index.md if available,
        // otherwise fall back to alphabetical by title
        const manifestSubtopics: ManifestSubtopic[] = subtopics
          .map((s) => ({
            id: `${mpTopicSlug}-${s.slug}`,
            slug: s.slug,
            title: s.title,
            wordCount: s.metadata.wordCount,
          }));

        if (learningPathOrder.length > 0) {
          // Sort by learning path order; items not in the path go to the end alphabetically
          manifestSubtopics.sort((a, b) => {
            const indexA = learningPathOrder.indexOf(a.slug);
            const indexB = learningPathOrder.indexOf(b.slug);
            const posA = indexA === -1 ? Infinity : indexA;
            const posB = indexB === -1 ? Infinity : indexB;
            if (posA !== posB) return posA - posB;
            return a.title.localeCompare(b.title);
          });
        } else {
          manifestSubtopics.sort((a, b) => a.title.localeCompare(b.title));
        }

        // Aggregate counts: topic-level = index + all subtopics
        const aggregatedSectionCount = parsed.metadata.sectionCount + subtopics.reduce((sum, s) => sum + s.metadata.sectionCount, 0);
        const aggregatedWordCount = parsed.metadata.wordCount + subtopics.reduce((sum, s) => sum + s.metadata.wordCount, 0);

        topics.push({
          id: parsed.id,
          slug: `${categorySlug}/${mpTopicSlug}`,
          title: parsed.title,
          source: 'parsed',
          sectionCount: aggregatedSectionCount,
          wordCount: aggregatedWordCount,
          contentPath: `/content/${categorySlug}/${mpTopicSlug}.json`,
          subtopics: manifestSubtopics,
        });

        totalTopics++;
        totalSections += aggregatedSectionCount;
      } else {
        // Single-file topic
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
    }

    // Detect and disambiguate duplicate topic IDs and slugs within this category
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

    // Also disambiguate duplicate slugs (the slug suffix after category/)
    const slugCounts = new Map<string, number>();
    for (const topic of topics) {
      slugCounts.set(topic.slug, (slugCounts.get(topic.slug) || 0) + 1);
    }
    const slugCounters = new Map<string, number>();
    for (const topic of topics) {
      if ((slugCounts.get(topic.slug) || 0) > 1) {
        const counter = (slugCounters.get(topic.slug) || 0) + 1;
        slugCounters.set(topic.slug, counter);
        if (counter > 1) {
          topic.slug = `${topic.slug}-${counter}`;
          // Also update contentPath to match the new slug
          const slugPart = topic.slug.split('/').slice(1).join('/');
          topic.contentPath = `/content/${categorySlug}/${slugPart}.json`;
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

  // Build and write search index from all parsed content (including subtopics)
  // We prefix each parsed content's id with the category slug so that
  // search results can navigate to /topic/:categorySlug/:topicSlug
  const allParsedContents: ParsedContent[] = [];
  for (const [categoryName, contents] of categoryMap) {
    const catSlug = slugify(categoryName);
    for (const content of contents) {
      const multiPageData = (content as ParsedContent & { _multiPage?: { topicSlug: string; subtopics: ParsedContent[] } })._multiPage;
      const topicSlug = multiPageData ? multiPageData.topicSlug : content.slug;
      // Override id to include category prefix for correct URL generation
      const prefixedContent = { ...content, id: `${catSlug}/${topicSlug}` };
      allParsedContents.push(prefixedContent);
      // Include subtopic content in search index for multi-page topics
      if (multiPageData) {
        for (const subtopic of multiPageData.subtopics) {
          allParsedContents.push({ ...subtopic, id: `${catSlug}/${topicSlug}` });
        }
      }
    }
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
