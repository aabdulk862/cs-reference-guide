/**
 * Sitemap generator for the content parser pipeline.
 *
 * Generates a valid XML sitemap from the content manifest at build time,
 * listing all topic URLs for search engine discovery.
 *
 * Requirements: 21.3
 */

/**
 * A topic entry within a manifest category.
 */
interface ManifestTopic {
  id: string;
  slug: string;
  title: string;
  source: string;
  sectionCount: number;
  wordCount: number;
  contentPath: string;
}

/**
 * A category entry in the content manifest.
 */
interface ManifestCategory {
  id: string;
  name: string;
  topics: ManifestTopic[];
}

/**
 * The content manifest structure consumed by the sitemap generator.
 */
export interface ContentManifest {
  categories: ManifestCategory[];
  totalTopics: number;
  totalSections: number;
  buildTimestamp: string;
}

/**
 * A single entry in the sitemap.
 */
export interface SitemapEntry {
  loc: string;
  lastmod?: string;
  changefreq?: 'daily' | 'weekly' | 'monthly';
  priority?: number;
}

/**
 * Escapes special XML characters in a string.
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generates a valid XML sitemap string from a content manifest.
 *
 * Produces a `<urlset>` containing one `<url>` element per topic in the manifest,
 * with each `<loc>` pointing to the topic's route: `/topic/{categorySlug}/{topicSlug}`.
 *
 * @param manifest - The content manifest containing all categories and topics
 * @param baseUrl - The base URL of the deployed site (e.g., "https://example.com")
 * @returns A well-formed XML string representing the sitemap
 */
export function generateSitemap(manifest: ContentManifest, baseUrl: string): string {
  // Normalize baseUrl: remove trailing slash if present
  const normalizedBase = baseUrl.replace(/\/+$/, '');

  const urlEntries: string[] = [];

  for (const category of manifest.categories) {
    for (const topic of category.topics) {
      // The topic slug already contains "categorySlug/topicSlug" format
      const loc = `${normalizedBase}/topic/${topic.slug}`;
      urlEntries.push(
        `  <url>\n    <loc>${escapeXml(loc)}</loc>\n  </url>`
      );
    }
  }

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urlEntries,
    '</urlset>',
  ].join('\n');

  return xml;
}
