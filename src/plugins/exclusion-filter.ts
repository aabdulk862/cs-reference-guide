/**
 * File exclusion filter for the content parser.
 *
 * Determines whether a file should be excluded from the published app content.
 * Exclusion rules (per Requirement 7.5):
 * - Files with .tex extension
 * - Files with .css extension
 * - Files within the public/ directory
 * - Files whose name contains "Scope Document"
 * - Files within hidden directories (prefixed with a dot, e.g., .kiro/, .git/)
 */

/**
 * Normalizes a file path by converting backslashes to forward slashes.
 */
function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

/**
 * Determines whether a file should be excluded from content parsing.
 *
 * @param filePath - The file path to check (absolute or relative)
 * @returns true if the file should be excluded, false otherwise
 */
export function shouldExclude(filePath: string): boolean {
  const normalized = normalizePath(filePath);

  // Exclude .tex files
  if (normalized.endsWith('.tex')) {
    return true;
  }

  // Exclude .css files
  if (normalized.endsWith('.css')) {
    return true;
  }

  // Exclude files whose name contains "Scope Document"
  const filename = normalized.split('/').pop() || '';
  if (filename.includes('Scope Document')) {
    return true;
  }

  // Split path into segments for directory-level checks
  const segments = normalized.split('/').filter((s) => s.length > 0);

  // Exclude files within the public/ directory
  if (segments.includes('public')) {
    return true;
  }

  // Exclude files within dot-prefixed directories
  // Check if any directory segment (not the file itself) starts with a dot
  // We check all segments except the last one (the filename)
  const directorySegments = segments.slice(0, -1);
  if (directorySegments.some((segment) => segment.startsWith('.'))) {
    return true;
  }

  return false;
}
