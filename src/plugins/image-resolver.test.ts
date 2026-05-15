/**
 * Unit tests for image-resolver.ts
 *
 * Tests the resolveImagePath function for correct path resolution
 * and the copyImageAssets function for file copying behavior.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import { resolveImagePath, copyImageAssets } from './image-resolver';

// Mock fs/promises for copyImageAssets tests
vi.mock('fs/promises', () => ({
  default: {
    access: vi.fn(),
    mkdir: vi.fn(),
    copyFile: vi.fn(),
  },
}));

import fs from 'fs/promises';

describe('resolveImagePath', () => {
  it('resolves a simple relative image path', () => {
    const result = resolveImagePath(
      'image.png',
      '/project/docs/topic.md'
    );
    expect(result).toBe(path.normalize('/project/docs/image.png'));
  });

  it('resolves a relative path in a subdirectory', () => {
    const result = resolveImagePath(
      'images/diagram.png',
      '/project/docs/topic.md'
    );
    expect(result).toBe(path.normalize('/project/docs/images/diagram.png'));
  });

  it('resolves a path with ../ traversal', () => {
    const result = resolveImagePath(
      '../assets/image.png',
      '/project/docs/topic.md'
    );
    expect(result).toBe(path.normalize('/project/assets/image.png'));
  });

  it('resolves a path with multiple ../ traversals', () => {
    const result = resolveImagePath(
      '../../shared/img.png',
      '/project/docs/sub/topic.md'
    );
    expect(result).toBe(path.normalize('/project/shared/img.png'));
  });

  it('resolves a path with ./ prefix', () => {
    const result = resolveImagePath(
      './image.png',
      '/project/docs/topic.md'
    );
    expect(result).toBe(path.normalize('/project/docs/image.png'));
  });

  it('normalizes redundant separators', () => {
    const result = resolveImagePath(
      'images//photo.png',
      '/project/docs/topic.md'
    );
    expect(result).toBe(path.normalize('/project/docs/images/photo.png'));
  });

  it('handles deeply nested markdown file paths', () => {
    const result = resolveImagePath(
      'diagram.png',
      '/repo/content/cs/data-structures/trees/avl.md'
    );
    expect(result).toBe(
      path.normalize('/repo/content/cs/data-structures/trees/diagram.png')
    );
  });

  it('handles image path with spaces in filename', () => {
    const result = resolveImagePath(
      'image 1.png',
      '/project/Data Structures/Graph/notes.md'
    );
    expect(result).toBe(
      path.normalize('/project/Data Structures/Graph/image 1.png')
    );
  });

  it('handles mixed ../ and subdirectory in image path', () => {
    const result = resolveImagePath(
      '../sibling/assets/pic.png',
      '/project/docs/sub/topic.md'
    );
    expect(result).toBe(
      path.normalize('/project/docs/sibling/assets/pic.png')
    );
  });

  it('resolves correctly when markdown is at root level', () => {
    const result = resolveImagePath(
      'img/photo.png',
      '/readme.md'
    );
    expect(result).toBe(path.normalize('/img/photo.png'));
  });
});

describe('copyImageAssets', () => {
  const mockedFs = vi.mocked(fs);

  beforeEach(() => {
    vi.clearAllMocks();
    mockedFs.access.mockResolvedValue(undefined);
    mockedFs.mkdir.mockResolvedValue(undefined);
    mockedFs.copyFile.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('copies a single image successfully', async () => {
    const images = [
      { originalPath: 'image.png', resolvedPath: '/project/docs/image.png' },
    ];

    const results = await copyImageAssets(images, '/output/assets');

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      originalPath: 'image.png',
      outputPath: path.join('/output/assets', 'image.png'),
    });
    expect(mockedFs.copyFile).toHaveBeenCalledWith(
      '/project/docs/image.png',
      path.join('/output/assets', 'image.png')
    );
  });

  it('copies multiple images successfully', async () => {
    const images = [
      { originalPath: 'a.png', resolvedPath: '/project/a.png' },
      { originalPath: 'b.png', resolvedPath: '/project/b.png' },
    ];

    const results = await copyImageAssets(images, '/output');

    expect(results).toHaveLength(2);
    expect(results[0].originalPath).toBe('a.png');
    expect(results[1].originalPath).toBe('b.png');
  });

  it('logs warning and skips missing images', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockedFs.access.mockRejectedValueOnce(new Error('ENOENT'));

    const images = [
      { originalPath: 'missing.png', resolvedPath: '/project/missing.png' },
    ];

    const results = await copyImageAssets(images, '/output');

    expect(results).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('missing.png')
    );
    expect(mockedFs.copyFile).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('continues processing after a missing image', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // First image missing, second exists
    mockedFs.access
      .mockRejectedValueOnce(new Error('ENOENT'))
      .mockResolvedValueOnce(undefined);

    const images = [
      { originalPath: 'missing.png', resolvedPath: '/project/missing.png' },
      { originalPath: 'exists.png', resolvedPath: '/project/exists.png' },
    ];

    const results = await copyImageAssets(images, '/output');

    expect(results).toHaveLength(1);
    expect(results[0].originalPath).toBe('exists.png');
    expect(warnSpy).toHaveBeenCalledTimes(1);

    warnSpy.mockRestore();
  });

  it('creates output directory if it does not exist', async () => {
    const images = [
      { originalPath: 'img.png', resolvedPath: '/project/img.png' },
    ];

    await copyImageAssets(images, '/output/nested/dir');

    expect(mockedFs.mkdir).toHaveBeenCalledWith(
      path.dirname(path.join('/output/nested/dir', 'img.png')),
      { recursive: true }
    );
  });

  it('returns empty array for empty input', async () => {
    const results = await copyImageAssets([], '/output');
    expect(results).toHaveLength(0);
  });
});
