import { Link, useParams } from 'react-router-dom';
import type { PrereqLink } from '../../types/content';

export interface PrereqBadgesProps {
  links: PrereqLink[];
}

/**
 * Resolves a relative markdown path to an app route path.
 *
 * Path patterns:
 * - `./path.md` → `/topic/:categorySlug/:topicSlug/path`
 * - `../other-topic/file.md` → `/topic/:categorySlug/other-topic/file`
 * - `../../other-category/topic/file.md` → `/topic/other-category/topic/file`
 */
export function resolvePrereqPath(
  relativePath: string,
  categorySlug: string | undefined,
  topicSlug: string | undefined
): string {
  // Strip .md extension
  const stripped = relativePath.replace(/\.md$/, '');

  // Handle relative paths
  if (stripped.startsWith('./')) {
    // Same topic directory: ./file → /topic/category/topic/file
    const subtopic = stripped.slice(2);
    return `/topic/${categorySlug}/${topicSlug}/${subtopic}`;
  }

  if (stripped.startsWith('../')) {
    // Count parent traversals
    const parts = stripped.split('/');
    let parentCount = 0;
    let i = 0;
    while (i < parts.length && parts[i] === '..') {
      parentCount++;
      i++;
    }
    const remaining = parts.slice(i);

    if (parentCount === 1 && remaining.length >= 2) {
      // ../other-topic/file → /topic/category/other-topic/file
      return `/topic/${categorySlug}/${remaining.join('/')}`;
    }

    if (parentCount === 2 && remaining.length >= 3) {
      // ../../other-category/topic/file → /topic/other-category/topic/file
      return `/topic/${remaining.join('/')}`;
    }

    // Fallback: just use remaining parts
    return `/topic/${remaining.join('/')}`;
  }

  // Absolute-style path or no prefix: treat as subtopic in current context
  return `/topic/${categorySlug}/${topicSlug}/${stripped}`;
}

/**
 * PrereqBadges renders prerequisite link badges as a horizontal flex row
 * of pill-shaped, clickable badges with an icon and display text.
 *
 * Each badge navigates to the referenced topic using client-side routing.
 * Meets WCAG AA contrast requirements in both light and dark themes.
 *
 * Validates: Requirements 8.3, 8.4, 8.5, 8.6
 */
export function PrereqBadges({ links }: PrereqBadgesProps) {
  const { categorySlug, topicSlug } = useParams<{
    categorySlug: string;
    topicSlug: string;
  }>();

  if (links.length === 0) {
    return null;
  }

  return (
    <nav className="prereq-badges" aria-label="Prerequisites">
      <span className="prereq-badges__label">Prerequisites:</span>
      <div className="prereq-badges__list">
        {links.map((link, index) => {
          const href = resolvePrereqPath(link.path, categorySlug, topicSlug);
          return (
            <Link
              key={index}
              to={href}
              className="prereq-badge"
              aria-label={`Prerequisite: ${link.text}`}
            >
              <span className="prereq-badge__icon" aria-hidden="true">
                📚
              </span>
              <span className="prereq-badge__text">{link.text}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export default PrereqBadges;
