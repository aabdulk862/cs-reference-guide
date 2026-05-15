/**
 * Unit tests for the sitemap generator.
 *
 * Validates: Requirements 21.3
 */

import { describe, it, expect } from 'vitest';
import { generateSitemap, ContentManifest } from './sitemap-generator';

describe('generateSitemap', () => {
  it('generates valid XML with urlset root element', () => {
    const manifest: ContentManifest = {
      categories: [],
      totalTopics: 0,
      totalSections: 0,
      buildTimestamp: '2025-01-15T10:00:00Z',
    };

    const xml = generateSitemap(manifest, 'https://example.com');

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain('</urlset>');
  });

  it('generates one <url> element per topic in the manifest', () => {
    const manifest: ContentManifest = {
      categories: [
        {
          id: 'backend',
          name: 'Backend',
          topics: [
            {
              id: 'java',
              slug: 'backend/java',
              title: 'Java',
              source: 'parsed',
              sectionCount: 5,
              wordCount: 2000,
              contentPath: '/content/backend/java.json',
            },
            {
              id: 'spring',
              slug: 'backend/spring-framework',
              title: 'Spring Framework',
              source: 'parsed',
              sectionCount: 3,
              wordCount: 1500,
              contentPath: '/content/backend/spring-framework.json',
            },
          ],
        },
        {
          id: 'frontend',
          name: 'Frontend',
          topics: [
            {
              id: 'react',
              slug: 'frontend/react',
              title: 'React',
              source: 'parsed',
              sectionCount: 5,
              wordCount: 1800,
              contentPath: '/content/frontend/react.json',
            },
          ],
        },
      ],
      totalTopics: 3,
      totalSections: 13,
      buildTimestamp: '2025-01-15T10:00:00Z',
    };

    const xml = generateSitemap(manifest, 'https://example.com');

    // Should have exactly 3 <url> elements
    const urlMatches = xml.match(/<url>/g);
    expect(urlMatches).toHaveLength(3);

    // Verify each topic URL is present
    expect(xml).toContain('<loc>https://example.com/topic/backend/java</loc>');
    expect(xml).toContain('<loc>https://example.com/topic/backend/spring-framework</loc>');
    expect(xml).toContain('<loc>https://example.com/topic/frontend/react</loc>');
  });

  it('normalizes trailing slash from baseUrl', () => {
    const manifest: ContentManifest = {
      categories: [
        {
          id: 'git',
          name: 'Git',
          topics: [
            {
              id: 'git-commands',
              slug: 'git/git-commands',
              title: 'Git Commands',
              source: 'parsed',
              sectionCount: 2,
              wordCount: 500,
              contentPath: '/content/git/git-commands.json',
            },
          ],
        },
      ],
      totalTopics: 1,
      totalSections: 2,
      buildTimestamp: '2025-01-15T10:00:00Z',
    };

    const xml = generateSitemap(manifest, 'https://example.com/');

    expect(xml).toContain('<loc>https://example.com/topic/git/git-commands</loc>');
    expect(xml).not.toContain('https://example.com//');
  });

  it('escapes special XML characters in URLs', () => {
    const manifest: ContentManifest = {
      categories: [
        {
          id: 'backend',
          name: 'Backend',
          topics: [
            {
              id: 'data-amp-structures',
              slug: 'backend/data&structures',
              title: 'Data & Structures',
              source: 'parsed',
              sectionCount: 1,
              wordCount: 100,
              contentPath: '/content/backend/data&structures.json',
            },
          ],
        },
      ],
      totalTopics: 1,
      totalSections: 1,
      buildTimestamp: '2025-01-15T10:00:00Z',
    };

    const xml = generateSitemap(manifest, 'https://example.com');

    // The & should be escaped as &amp;
    expect(xml).toContain('&amp;');
    expect(xml).not.toMatch(/<loc>[^<]*[^;]&[^a]/); // No unescaped &
  });

  it('produces well-formed XML structure', () => {
    const manifest: ContentManifest = {
      categories: [
        {
          id: 'system-design',
          name: 'System Design',
          topics: [
            {
              id: 'cap-theorem',
              slug: 'system-design/cap-theorem',
              title: 'CAP Theorem',
              source: 'parsed',
              sectionCount: 4,
              wordCount: 1200,
              contentPath: '/content/system-design/cap-theorem.json',
            },
          ],
        },
      ],
      totalTopics: 1,
      totalSections: 4,
      buildTimestamp: '2025-01-15T10:00:00Z',
    };

    const xml = generateSitemap(manifest, 'https://example.com');

    // Verify structure: XML declaration, urlset open, url elements, urlset close
    const lines = xml.split('\n');
    expect(lines[0]).toBe('<?xml version="1.0" encoding="UTF-8"?>');
    expect(lines[1]).toBe('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(lines[lines.length - 1]).toBe('</urlset>');
  });

  it('returns empty urlset for manifest with no topics', () => {
    const manifest: ContentManifest = {
      categories: [
        {
          id: 'empty-category',
          name: 'Empty',
          topics: [],
        },
      ],
      totalTopics: 0,
      totalSections: 0,
      buildTimestamp: '2025-01-15T10:00:00Z',
    };

    const xml = generateSitemap(manifest, 'https://example.com');

    expect(xml).not.toContain('<url>');
    expect(xml).toContain('<urlset');
    expect(xml).toContain('</urlset>');
  });
});
