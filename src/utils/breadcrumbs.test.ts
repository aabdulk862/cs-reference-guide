import { describe, it, expect } from 'vitest';
import { generateBreadcrumbs, type BreadcrumbItem } from './breadcrumbs';

describe('generateBreadcrumbs', () => {
  const displayNames: Record<string, string> = {
    topic: 'Topics',
    'data-structures': 'Data Structures',
    array: 'Array',
    algorithms: 'Algorithms',
    'binary-search': 'Binary Search',
  };

  it('returns empty array for empty segments', () => {
    const result = generateBreadcrumbs([], displayNames);
    expect(result).toEqual([]);
  });

  it('generates single breadcrumb for one segment', () => {
    const result = generateBreadcrumbs(['topic'], displayNames);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual<BreadcrumbItem>({
      label: 'Topics',
      path: '/topic',
      isLast: true,
    });
  });

  it('generates breadcrumbs for category → topic path', () => {
    const result = generateBreadcrumbs(['topic', 'data-structures', 'array'], displayNames);
    expect(result).toHaveLength(3);

    expect(result[0]).toEqual<BreadcrumbItem>({
      label: 'Topics',
      path: '/topic',
      isLast: false,
    });
    expect(result[1]).toEqual<BreadcrumbItem>({
      label: 'Data Structures',
      path: '/topic/data-structures',
      isLast: false,
    });
    expect(result[2]).toEqual<BreadcrumbItem>({
      label: 'Array',
      path: '/topic/data-structures/array',
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
    const result = generateBreadcrumbs(['unknown-category', 'some-topic'], {});
    expect(result[0].label).toBe('Unknown Category');
    expect(result[1].label).toBe('Some Topic');
  });

  it('breadcrumb array length equals path depth', () => {
    const segments = ['topic', 'data-structures', 'array'];
    const result = generateBreadcrumbs(segments, displayNames);
    expect(result).toHaveLength(segments.length);
  });

  it('each breadcrumb label matches the corresponding segment display name', () => {
    const segments = ['topic', 'data-structures', 'array'];
    const result = generateBreadcrumbs(segments, displayNames);

    segments.forEach((segment, index) => {
      expect(result[index].label).toBe(displayNames[segment]);
    });
  });

  it('builds cumulative paths correctly', () => {
    const result = generateBreadcrumbs(['a', 'b', 'c'], {});
    expect(result[0].path).toBe('/a');
    expect(result[1].path).toBe('/a/b');
    expect(result[2].path).toBe('/a/b/c');
  });
});
