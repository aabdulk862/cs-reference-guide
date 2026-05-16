import { describe, it, expect } from 'vitest';
import { generateBreadcrumbs, type BreadcrumbItem } from './breadcrumbs';

describe('generateBreadcrumbs', () => {
  const displayNames: Record<string, string> = {
    topic: 'Topics',
    'data-structures': 'Data Structures',
    array: 'Array',
    algorithms: 'Algorithms',
    'binary-search': 'Binary Search',
    backend: 'Backend',
    java: 'Java',
  };

  it('returns empty array for empty segments', () => {
    const result = generateBreadcrumbs([], displayNames);
    expect(result).toEqual([]);
  });

  it('generates breadcrumbs for topic/category/topic path', () => {
    const result = generateBreadcrumbs(['topic', 'data-structures', 'array'], displayNames);
    expect(result).toHaveLength(2);

    expect(result[0]).toEqual<BreadcrumbItem>({
      label: 'Data Structures',
      path: '/category/data-structures',
      isLast: false,
    });
    expect(result[1]).toEqual<BreadcrumbItem>({
      label: 'Array',
      path: '/topic/data-structures/array',
      isLast: true,
    });
  });

  it('generates single breadcrumb for topic/category (no topic slug)', () => {
    const result = generateBreadcrumbs(['topic', 'backend'], displayNames);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual<BreadcrumbItem>({
      label: 'Backend',
      path: '/category/backend',
      isLast: true,
    });
  });

  it('generates breadcrumb for /category/:slug path', () => {
    const result = generateBreadcrumbs(['category', 'backend'], displayNames);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual<BreadcrumbItem>({
      label: 'Backend',
      path: '/category/backend',
      isLast: true,
    });
  });

  it('last breadcrumb always has isLast=true', () => {
    const result = generateBreadcrumbs(['topic', 'algorithms', 'binary-search'], displayNames);
    const lastItem = result[result.length - 1];
    expect(lastItem.isLast).toBe(true);

    // All other items should have isLast=false
    result.slice(0, -1).forEach((item) => {
      expect(item.isLast).toBe(false);
    });
  });

  it('falls back to title case for unknown slugs', () => {
    const result = generateBreadcrumbs(['topic', 'unknown-category', 'some-topic'], {});
    expect(result[0].label).toBe('Unknown Category');
    expect(result[1].label).toBe('Some Topic');
  });

  it('category breadcrumb links to /category/ route', () => {
    const result = generateBreadcrumbs(['topic', 'backend', 'java'], displayNames);
    expect(result[0].path).toBe('/category/backend');
  });

  it('topic breadcrumb links to full /topic/ route', () => {
    const result = generateBreadcrumbs(['topic', 'backend', 'java'], displayNames);
    expect(result[1].path).toBe('/topic/backend/java');
  });

  it('handles non-topic paths with default cumulative behavior', () => {
    const result = generateBreadcrumbs(['settings'], {});
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('/settings');
    expect(result[0].isLast).toBe(true);
  });

  it('builds cumulative paths for generic routes', () => {
    const result = generateBreadcrumbs(['a', 'b', 'c'], {});
    expect(result[0].path).toBe('/a');
    expect(result[1].path).toBe('/a/b');
    expect(result[2].path).toBe('/a/b/c');
  });

  describe('4-segment subtopic paths', () => {
    const names: Record<string, string> = {
      backend: 'Backend',
      java: 'Java',
      concurrency: 'Concurrency & Multithreading',
      frontend: 'Frontend',
      react: 'React',
      hooks: 'React Hooks',
    };

    it('generates 3 breadcrumb items for 4-segment path', () => {
      const result = generateBreadcrumbs(
        ['topic', 'backend', 'java', 'concurrency'],
        names
      );
      expect(result).toHaveLength(3);
    });

    it('first item links to /category/{categorySlug}', () => {
      const result = generateBreadcrumbs(
        ['topic', 'backend', 'java', 'concurrency'],
        names
      );
      expect(result[0]).toEqual<BreadcrumbItem>({
        label: 'Backend',
        path: '/category/backend',
        isLast: false,
      });
    });

    it('second item links to /topic/{categorySlug}/{topicSlug} and is not isLast', () => {
      const result = generateBreadcrumbs(
        ['topic', 'backend', 'java', 'concurrency'],
        names
      );
      expect(result[1]).toEqual<BreadcrumbItem>({
        label: 'Java',
        path: '/topic/backend/java',
        isLast: false,
      });
    });

    it('third item has isLast=true (non-clickable subtopic)', () => {
      const result = generateBreadcrumbs(
        ['topic', 'backend', 'java', 'concurrency'],
        names
      );
      expect(result[2]).toEqual<BreadcrumbItem>({
        label: 'Concurrency & Multithreading',
        path: '/topic/backend/java/concurrency',
        isLast: true,
      });
    });

    it('uses display names from mapping for human-readable labels', () => {
      const result = generateBreadcrumbs(
        ['topic', 'frontend', 'react', 'hooks'],
        names
      );
      expect(result[0].label).toBe('Frontend');
      expect(result[1].label).toBe('React');
      expect(result[2].label).toBe('React Hooks');
    });

    it('falls back to title case for unknown subtopic slugs', () => {
      const result = generateBreadcrumbs(
        ['topic', 'backend', 'java', 'unknown-subtopic'],
        names
      );
      expect(result[2].label).toBe('Unknown Subtopic');
    });

    it('does not change existing 3-segment behavior', () => {
      const result = generateBreadcrumbs(['topic', 'backend', 'java'], names);
      expect(result).toHaveLength(2);
      expect(result[1].isLast).toBe(true);
    });
  });
});
