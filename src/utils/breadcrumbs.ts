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
 * For a path like ["data-structures", "array"], this produces:
 * [
 *   { label: "Data Structures", path: "/topic/data-structures", isLast: false },
 *   { label: "Array", path: "/topic/data-structures/array", isLast: true }
 * ]
 *
 * The last breadcrumb always has isLast=true and should not be rendered as a link.
 *
 * @param segments - URL path segments (e.g., from splitting the pathname)
 * @param displayNames - Mapping from slug to human-readable display name
 * @returns Array of BreadcrumbItem with length equal to segments.length
 */
export function generateBreadcrumbs(
  segments: string[],
  displayNames: Record<string, string>
): BreadcrumbItem[] {
  if (segments.length === 0) {
    return [];
  }

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
