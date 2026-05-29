/**
 * Pre-render script for crawlability.
 *
 * Reads the built content-manifest.json and generates static HTML files
 * for each content route with proper meta tags (title, description).
 * This gives search engine crawlers the metadata they need while the SPA
 * hydrates for interactive users.
 *
 * Run as a post-build step: `node --import tsx scripts/prerender.ts`
 *
 * Requirements: 12.2, 12.3, 12.4
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(__dirname, '../dist');
const manifestPath = resolve(distDir, 'content-manifest.json');

// --- Types ---

interface ManifestSubtopic {
  id: string;
  slug: string;
  title: string;
  wordCount: number;
}

interface ManifestTopic {
  id: string;
  slug: string;
  title: string;
  source: string;
  sectionCount: number;
  wordCount: number;
  contentPath: string;
  subtopics?: ManifestSubtopic[];
}

interface ManifestCategory {
  id: string;
  name: string;
  topics: ManifestTopic[];
}

interface ContentManifest {
  categories: ManifestCategory[];
  totalTopics: number;
  totalSections: number;
  buildTimestamp: string;
}

// --- Helpers ---

/**
 * Truncate text preserving whole words, matching useDocumentMeta behavior.
 */
function truncatePreservingWords(text: string, maxLength: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return trimmed;

  const limit = maxLength - 1;
  const slice = trimmed.slice(0, limit);
  const lastSpace = slice.lastIndexOf(' ');

  if (lastSpace <= 0) {
    return trimmed.slice(0, limit) + '…';
  }
  return trimmed.slice(0, lastSpace) + '…';
}

/**
 * Extract script and link tags from the built index.html to reuse in pre-rendered pages.
 */
function extractAssetTags(indexHtml: string): { scripts: string; styles: string; headExtras: string } {
  const scripts: string[] = [];
  const styles: string[] = [];
  const headExtras: string[] = [];

  // Extract script tags (module scripts and regular scripts)
  const scriptRegex = /<script[^>]*src="[^"]*"[^>]*><\/script>/g;
  const moduleScriptRegex = /<script[^>]*type="module"[^>]*src="[^"]*"[^>]*><\/script>/g;
  let match: RegExpExecArray | null;

  match = moduleScriptRegex.exec(indexHtml);
  while (match) {
    scripts.push(match[0]);
    match = moduleScriptRegex.exec(indexHtml);
  }

  // Extract non-module scripts (like registerSW.js)
  const allScripts = indexHtml.match(scriptRegex) || [];
  for (const s of allScripts) {
    if (!s.includes('type="module"')) {
      scripts.push(s);
    }
  }

  // Extract stylesheet links
  const styleRegex = /<link[^>]*rel="stylesheet"[^>]*>/g;
  match = styleRegex.exec(indexHtml);
  while (match) {
    styles.push(match[0]);
    match = styleRegex.exec(indexHtml);
  }

  // Extract modulepreload links
  const preloadRegex = /<link[^>]*rel="modulepreload"[^>]*>/g;
  match = preloadRegex.exec(indexHtml);
  while (match) {
    headExtras.push(match[0]);
    match = preloadRegex.exec(indexHtml);
  }

  return {
    scripts: scripts.join('\n    '),
    styles: styles.join('\n    '),
    headExtras: headExtras.join('\n    '),
  };
}

/**
 * Generate an HTML page with meta tags for a given route.
 */
function generateHtml(options: {
  title: string;
  description: string;
  canonicalPath: string;
  scripts: string;
  styles: string;
  headExtras: string;
}): string {
  const { title, description, canonicalPath, scripts, styles, headExtras } = options;

  const safeTitle = truncatePreservingWords(title, 60).replace(/"/g, '&quot;');
  const safeDescription = truncatePreservingWords(description, 160).replace(/"/g, '&quot;');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
    <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
    <link rel="icon" type="image/x-icon" href="/favicon.ico" />
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
    <link rel="manifest" href="/manifest.json" />
    <meta name="theme-color" content="#6366f1" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${safeTitle}</title>
    <meta name="description" content="${safeDescription}" />
    <meta property="og:title" content="${safeTitle}" />
    <meta property="og:description" content="${safeDescription}" />
    <meta property="og:image" content="/icons/icon-512.png" />
    <link rel="canonical" href="${canonicalPath}" />
    ${headExtras}
    ${styles}
    ${scripts}
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`;
}

// --- Main ---

function main(): void {
  if (!existsSync(manifestPath)) {
    console.warn('[prerender] content-manifest.json not found in dist/. Skipping pre-render.');
    return;
  }

  if (!existsSync(resolve(distDir, 'index.html'))) {
    console.warn('[prerender] dist/index.html not found. Skipping pre-render.');
    return;
  }

  const manifest: ContentManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  const indexHtml = readFileSync(resolve(distDir, 'index.html'), 'utf-8');
  const { scripts, styles, headExtras } = extractAssetTags(indexHtml);

  let pagesGenerated = 0;

  for (const category of manifest.categories) {
    for (const topic of category.topics) {
      // Topic route: /topic/{categorySlug}/{topicSlug}
      // topic.slug is already "categorySlug/topicSlug" format
      const topicRoute = `/topic/${topic.slug}`;
      const topicTitle = `${topic.title} - CS Reference Guide`;
      const topicDescription = `Learn about ${topic.title} in ${category.name}. Comprehensive reference covering ${topic.sectionCount} sections with code examples and interview preparation.`;

      const topicDir = resolve(distDir, `topic/${topic.slug}`);
      mkdirSync(topicDir, { recursive: true });
      writeFileSync(
        resolve(topicDir, 'index.html'),
        generateHtml({
          title: topicTitle,
          description: topicDescription,
          canonicalPath: topicRoute,
          scripts,
          styles,
          headExtras,
        })
      );
      pagesGenerated++;

      // Subtopic routes: /topic/{categorySlug}/{topicSlug}/{subtopicSlug}
      if (topic.subtopics) {
        for (const subtopic of topic.subtopics) {
          const subtopicRoute = `/topic/${topic.slug}/${subtopic.slug}`;
          const subtopicTitle = `${subtopic.title} - ${topic.title} - CS Reference Guide`;
          const subtopicDescription = `${subtopic.title} in ${topic.title}. In-depth reference with code examples, common pitfalls, and interview questions.`;

          const subtopicDir = resolve(topicDir, subtopic.slug);
          mkdirSync(subtopicDir, { recursive: true });
          writeFileSync(
            resolve(subtopicDir, 'index.html'),
            generateHtml({
              title: subtopicTitle,
              description: subtopicDescription,
              canonicalPath: subtopicRoute,
              scripts,
              styles,
              headExtras,
            })
          );
          pagesGenerated++;
        }
      }
    }
  }

  // Also generate pages for category routes: /category/{categorySlug}
  for (const category of manifest.categories) {
    const categoryRoute = `/category/${category.id}`;
    const categoryTitle = `${category.name} - CS Reference Guide`;
    const categoryDescription = `Browse ${category.name} topics. ${category.topics.length} topics covering essential concepts for software engineers.`;

    const categoryDir = resolve(distDir, `category/${category.id}`);
    mkdirSync(categoryDir, { recursive: true });
    writeFileSync(
      resolve(categoryDir, 'index.html'),
      generateHtml({
        title: categoryTitle,
        description: categoryDescription,
        canonicalPath: categoryRoute,
        scripts,
        styles,
        headExtras,
      })
    );
    pagesGenerated++;
  }

  console.log(`[prerender] Generated ${pagesGenerated} static HTML pages in dist/`);
}

main();
