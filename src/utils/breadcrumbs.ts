/**
 * Breadcrumb generation utility.
 * Pure function that generates breadcrumb items from a URL path and display name mapping.
 */

/** A single breadcrumb item in the navigation trail */
export interface BreadcrumbItem {
  label: string;
  path: string;
  isLast: boolean;
}

/**
 * Generates a breadcrumb array from path segments and a display name mapping.
 *
 * For a path like ["topic", "backend", "java"], this produces:
 * [
 *   { label: "Backend", path: "/category/backend", isLast: false },
 *   { label: "Java", path: "/topic/backend/java", isLast: true }
 * ]
 *
 * The "topic" prefix segment is skipped from display. The category segment
 * links to /category/:slug. The topic segment links to the full topic path.
 *
 * The last breadcrumb always has isLast=true and should not be rendered as a link.
 *
 * @param segments - URL path segments (e.g., from splitting the pathname)
 * @param displayNames - Mapping from slug to human-readable display name
 * @returns Array of BreadcrumbItem
 */
export function generateBreadcrumbs(
  segments: string[],
  displayNames: Record<string, string>
): BreadcrumbItem[] {
  if (segments.length === 0) {
    return [];
  }

  // Handle /topic/:categorySlug/:topicSlug pattern
  if (segments[0] === 'topic' && segments.length >= 2) {
    const items: BreadcrumbItem[] = [];
    const categorySlug = segments[1];
    const categoryLabel = displayNames[categorySlug] ?? toTitleCase(categorySlug);

    // Category breadcrumb links to /category/:slug
    items.push({
      label: categoryLabel,
      path: `/category/${categorySlug}`,
      isLast: segments.length === 2,
    });

    // Topic breadcrumb (if present)
    if (segments.length >= 3) {
      const topicSlug = segments[2];
      const topicLabel = displayNames[topicSlug] ?? toTitleCase(topicSlug);
      items.push({
        label: topicLabel,
        path: `/topic/${categorySlug}/${topicSlug}`,
        isLast: true,
      });
    }

    return items;
  }

  // Handle /category/:categorySlug pattern
  if (segments[0] === 'category' && segments.length >= 2) {
    const categorySlug = segments[1];
    const categoryLabel = displayNames[categorySlug] ?? toTitleCase(categorySlug);
    return [
      {
        label: categoryLabel,
        path: `/category/${categorySlug}`,
        isLast: true,
      },
    ];
  }

  // Default: build breadcrumbs from segments as-is
  return segments.map((segment, index) => {
    const pathSegments = segments.slice(0, index + 1);
    const path = '/' + pathSegments.join('/');
    const label = displayNames[segment] ?? toTitleCase(segment);
    const isLast = index === segments.length - 1;

    return { label, path, isLast };
  });
}

/**
 * Converts a slug (kebab-case) to title case as a fallback display name.
 * e.g., "data-structures" → "Data Structures"
 */
function toTitleCase(slug: string): string {
  return slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
