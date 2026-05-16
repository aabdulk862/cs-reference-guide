/**
 * Integration tests for multi-page topic processing and JSON output generation.
 * Tests the processContent pipeline with multi-page topic directories.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fsp from 'fs/promises';
import path from 'path';
import os from 'os';
import { detectMultiPageTopics, processContent } from '../vite-content-plugin';

/**
 * Helper to create a temporary content directory structure for testing.
 */
async function createTempContentDir(): Promise<string> {
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'content-test-'));
  return tmpDir;
}

/**
 * Helper to write a file, creating parent directories as needed.
 */
async function writeFile(filePath: string, content: string): Promise<void> {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, content, 'utf-8');
}

describe('Multi-Page Topic Processing', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await createTempContentDir();
  });

  afterEach(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  describe('detectMultiPageTopics', () => {
    it('detects a directory with index.md as a multi-page topic', async () => {
      const categoryDir = path.join(tmpDir, 'backend');
      await fsp.mkdir(categoryDir, { recursive: true });

      const topicDir = path.join(categoryDir, 'java');
      await fsp.mkdir(topicDir);
      await writeFile(path.join(topicDir, 'index.md'), '# Java\n\nOverview of Java.');
      await writeFile(path.join(topicDir, 'collections.md'), '# Collections\n\nJava collections.');
      await writeFile(path.join(topicDir, 'concurrency.md'), '# Concurrency\n\nJava concurrency.');

      const mappings = [{ pattern: 'backend', category: 'Backend' }];
      const topics = await detectMultiPageTopics(tmpDir, mappings);

      expect(topics).toHaveLength(1);
      expect(topics[0].topicSlug).toBe('java');
      expect(topics[0].category).toBe('Backend');
      expect(topics[0].indexFile).toBe(path.join(topicDir, 'index.md'));
      expect(topics[0].subtopicFiles).toHaveLength(2);
      // Alphabetically sorted
      expect(path.basename(topics[0].subtopicFiles[0])).toBe('collections.md');
      expect(path.basename(topics[0].subtopicFiles[1])).toBe('concurrency.md');
    });

    it('excludes files in nested subdirectories from subtopics', async () => {
      const categoryDir = path.join(tmpDir, 'backend');
      await fsp.mkdir(categoryDir, { recursive: true });

      const topicDir = path.join(categoryDir, 'java');
      await fsp.mkdir(topicDir);
      await writeFile(path.join(topicDir, 'index.md'), '# Java\n\nOverview.');
      await writeFile(path.join(topicDir, 'basics.md'), '# Basics\n\nBasics content.');

      // Nested subdirectory — should be excluded
      const nestedDir = path.join(topicDir, 'advanced');
      await fsp.mkdir(nestedDir);
      await writeFile(path.join(nestedDir, 'deep.md'), '# Deep\n\nDeep content.');

      const mappings = [{ pattern: 'backend', category: 'Backend' }];
      const topics = await detectMultiPageTopics(tmpDir, mappings);

      expect(topics).toHaveLength(1);
      expect(topics[0].subtopicFiles).toHaveLength(1);
      expect(path.basename(topics[0].subtopicFiles[0])).toBe('basics.md');
    });

    it('skips directories without index.md and logs warning', async () => {
      const categoryDir = path.join(tmpDir, 'backend');
      await fsp.mkdir(categoryDir, { recursive: true });

      const topicDir = path.join(categoryDir, 'orphan');
      await fsp.mkdir(topicDir);
      await writeFile(path.join(topicDir, 'some-file.md'), '# Some File\n\nContent.');

      const mappings = [{ pattern: 'backend', category: 'Backend' }];
      const topics = await detectMultiPageTopics(tmpDir, mappings);

      expect(topics).toHaveLength(0);
    });

    it('sorts subtopic files alphabetically by filename', async () => {
      const categoryDir = path.join(tmpDir, 'frontend');
      await fsp.mkdir(categoryDir, { recursive: true });

      const topicDir = path.join(categoryDir, 'react');
      await fsp.mkdir(topicDir);
      await writeFile(path.join(topicDir, 'index.md'), '# React\n\nOverview.');
      await writeFile(path.join(topicDir, 'z-advanced.md'), '# Advanced\n\nAdvanced.');
      await writeFile(path.join(topicDir, 'a-basics.md'), '# Basics\n\nBasics.');
      await writeFile(path.join(topicDir, 'm-hooks.md'), '# Hooks\n\nHooks.');

      const mappings = [{ pattern: 'frontend', category: 'Frontend' }];
      const topics = await detectMultiPageTopics(tmpDir, mappings);

      expect(topics).toHaveLength(1);
      expect(topics[0].subtopicFiles).toHaveLength(3);
      expect(path.basename(topics[0].subtopicFiles[0])).toBe('a-basics.md');
      expect(path.basename(topics[0].subtopicFiles[1])).toBe('m-hooks.md');
      expect(path.basename(topics[0].subtopicFiles[2])).toBe('z-advanced.md');
    });
  });

  describe('processContent with multi-page topics', () => {
    it('generates index JSON at {categorySlug}/{topicSlug}.json', async () => {
      const categoryDir = path.join(tmpDir, 'backend');
      await fsp.mkdir(categoryDir, { recursive: true });

      const topicDir = path.join(categoryDir, 'java');
      await fsp.mkdir(topicDir);
      await writeFile(
        path.join(topicDir, 'index.md'),
        '# Java Programming\n\n## Overview\n\nJava is a versatile language.'
      );
      await writeFile(
        path.join(topicDir, 'collections.md'),
        '# Collections Framework\n\n## Lists\n\nArrayList and LinkedList.'
      );

      const outputDir = path.join(tmpDir, 'output');
      await processContent(tmpDir, outputDir);

      // Verify index JSON exists
      const indexJsonPath = path.join(outputDir, 'backend', 'java.json');
      const indexJsonExists = await fsp.access(indexJsonPath).then(() => true).catch(() => false);
      expect(indexJsonExists).toBe(true);

      // Verify index JSON content
      const indexJson = JSON.parse(await fsp.readFile(indexJsonPath, 'utf-8'));
      expect(indexJson.title).toBe('Java Programming');
      expect(indexJson.category).toBe('Backend');
    });

    it('generates subtopic JSON at {categorySlug}/{topicSlug}/{subtopicSlug}.json', async () => {
      const categoryDir = path.join(tmpDir, 'backend');
      await fsp.mkdir(categoryDir, { recursive: true });

      const topicDir = path.join(categoryDir, 'java');
      await fsp.mkdir(topicDir);
      await writeFile(
        path.join(topicDir, 'index.md'),
        '# Java\n\n## Overview\n\nJava overview content.'
      );
      await writeFile(
        path.join(topicDir, 'collections.md'),
        '# Collections\n\n## Lists\n\nArrayList and LinkedList are common.'
      );
      await writeFile(
        path.join(topicDir, 'concurrency.md'),
        '# Concurrency\n\n## Threads\n\nThread management in Java.'
      );

      const outputDir = path.join(tmpDir, 'output');
      await processContent(tmpDir, outputDir);

      // Verify subtopic JSON files exist
      const collectionsPath = path.join(outputDir, 'backend', 'java', 'collections.json');
      const concurrencyPath = path.join(outputDir, 'backend', 'java', 'concurrency.json');

      const collectionsExists = await fsp.access(collectionsPath).then(() => true).catch(() => false);
      const concurrencyExists = await fsp.access(concurrencyPath).then(() => true).catch(() => false);

      expect(collectionsExists).toBe(true);
      expect(concurrencyExists).toBe(true);

      // Verify subtopic JSON content
      const collectionsJson = JSON.parse(await fsp.readFile(collectionsPath, 'utf-8'));
      expect(collectionsJson.title).toBe('Collections');
      expect(collectionsJson.slug).toBe('collections');

      const concurrencyJson = JSON.parse(await fsp.readFile(concurrencyPath, 'utf-8'));
      expect(concurrencyJson.title).toBe('Concurrency');
      expect(concurrencyJson.slug).toBe('concurrency');
    });

    it('extracts title from H1 heading in index.md', async () => {
      const categoryDir = path.join(tmpDir, 'frontend');
      await fsp.mkdir(categoryDir, { recursive: true });

      const topicDir = path.join(categoryDir, 'react');
      await fsp.mkdir(topicDir);
      await writeFile(
        path.join(topicDir, 'index.md'),
        '# React Framework\n\n## Introduction\n\nReact is a UI library.'
      );
      await writeFile(
        path.join(topicDir, 'hooks.md'),
        '# React Hooks\n\n## useState\n\nThe useState hook.'
      );

      const outputDir = path.join(tmpDir, 'output');
      await processContent(tmpDir, outputDir);

      const indexJsonPath = path.join(outputDir, 'frontend', 'react.json');
      const indexJson = JSON.parse(await fsp.readFile(indexJsonPath, 'utf-8'));
      expect(indexJson.title).toBe('React Framework');
    });

    it('generates manifest with correct contentPath for multi-page topics', async () => {
      const categoryDir = path.join(tmpDir, 'backend');
      await fsp.mkdir(categoryDir, { recursive: true });

      const topicDir = path.join(categoryDir, 'java');
      await fsp.mkdir(topicDir);
      await writeFile(
        path.join(topicDir, 'index.md'),
        '# Java\n\n## Overview\n\nJava overview.'
      );
      await writeFile(
        path.join(topicDir, 'basics.md'),
        '# Basics\n\n## Syntax\n\nJava syntax basics.'
      );

      const outputDir = path.join(tmpDir, 'output');
      await processContent(tmpDir, outputDir);

      // Read manifest
      const manifestPath = path.join(tmpDir, 'output', '..', 'content-manifest.json');
      const manifest = JSON.parse(await fsp.readFile(manifestPath, 'utf-8'));

      const backendCategory = manifest.categories.find((c: { id: string }) => c.id === 'backend');
      expect(backendCategory).toBeDefined();

      const javaTopic = backendCategory.topics.find((t: { slug: string }) => t.slug === 'backend/java');
      expect(javaTopic).toBeDefined();
      expect(javaTopic.contentPath).toBe('/content/backend/java.json');
    });

    it('coexists with single-file topics in the same category', async () => {
      const categoryDir = path.join(tmpDir, 'backend');
      await fsp.mkdir(categoryDir, { recursive: true });

      // Single-file topic
      await writeFile(
        path.join(categoryDir, 'python.md'),
        '# Python\n\n## Overview\n\nPython is a dynamic language.'
      );

      // Multi-page topic
      const topicDir = path.join(categoryDir, 'java');
      await fsp.mkdir(topicDir);
      await writeFile(
        path.join(topicDir, 'index.md'),
        '# Java\n\n## Overview\n\nJava overview.'
      );
      await writeFile(
        path.join(topicDir, 'basics.md'),
        '# Basics\n\n## Syntax\n\nJava syntax.'
      );

      const outputDir = path.join(tmpDir, 'output');
      await processContent(tmpDir, outputDir);

      // Verify both exist in manifest
      const manifestPath = path.join(tmpDir, 'output', '..', 'content-manifest.json');
      const manifest = JSON.parse(await fsp.readFile(manifestPath, 'utf-8'));

      const backendCategory = manifest.categories.find((c: { id: string }) => c.id === 'backend');
      expect(backendCategory).toBeDefined();
      expect(backendCategory.topics).toHaveLength(2);

      const pythonTopic = backendCategory.topics.find((t: { title: string }) => t.title === 'Python');
      const javaTopic = backendCategory.topics.find((t: { title: string }) => t.title === 'Java');
      expect(pythonTopic).toBeDefined();
      expect(javaTopic).toBeDefined();

      // Verify single-file JSON
      const pythonJsonPath = path.join(outputDir, 'backend', 'python.json');
      const pythonExists = await fsp.access(pythonJsonPath).then(() => true).catch(() => false);
      expect(pythonExists).toBe(true);

      // Verify multi-page JSON
      const javaIndexPath = path.join(outputDir, 'backend', 'java.json');
      const javaSubtopicPath = path.join(outputDir, 'backend', 'java', 'basics.json');
      const javaIndexExists = await fsp.access(javaIndexPath).then(() => true).catch(() => false);
      const javaSubtopicExists = await fsp.access(javaSubtopicPath).then(() => true).catch(() => false);
      expect(javaIndexExists).toBe(true);
      expect(javaSubtopicExists).toBe(true);
    });
  });
});
