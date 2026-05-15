/**
 * Skeleton loading state components.
 * Display placeholder shapes corresponding to the page's structural elements
 * (header, cards, sidebar) while content is loading.
 *
 * Requirements: 20.2
 */

interface SkeletonProps {
  className?: string;
}

/**
 * Base skeleton block with pulse animation.
 */
export function SkeletonBlock({ className = '' }: SkeletonProps) {
  return (
    <div className={`skeleton-block ${className}`} aria-hidden="true" />
  );
}

/**
 * Skeleton placeholder for the page header area.
 * Mimics a title line and a subtitle/breadcrumb line.
 */
export function SkeletonHeader() {
  return (
    <div className="skeleton-header" aria-hidden="true">
      <div className="skeleton-block skeleton-header__title" />
      <div className="skeleton-block skeleton-header__subtitle" />
    </div>
  );
}

/**
 * Skeleton placeholder for a content card.
 * Mimics a heading, several text lines, and a code block area.
 */
export function SkeletonCard() {
  return (
    <div className="skeleton-card" aria-hidden="true">
      <div className="skeleton-block skeleton-card__heading" />
      <div className="skeleton-card__body">
        <div className="skeleton-block skeleton-card__line skeleton-card__line--full" />
        <div className="skeleton-block skeleton-card__line skeleton-card__line--full" />
        <div className="skeleton-block skeleton-card__line skeleton-card__line--medium" />
        <div className="skeleton-block skeleton-card__line skeleton-card__line--short" />
      </div>
      <div className="skeleton-block skeleton-card__code" />
    </div>
  );
}

/**
 * Skeleton placeholder for the sidebar navigation.
 * Mimics category headings and topic list items.
 */
export function SkeletonSidebar() {
  return (
    <div className="skeleton-sidebar" aria-hidden="true">
      <div className="skeleton-sidebar__group">
        <div className="skeleton-block skeleton-sidebar__category" />
        <div className="skeleton-block skeleton-sidebar__item" />
        <div className="skeleton-block skeleton-sidebar__item skeleton-sidebar__item--short" />
        <div className="skeleton-block skeleton-sidebar__item" />
      </div>
      <div className="skeleton-sidebar__group">
        <div className="skeleton-block skeleton-sidebar__category" />
        <div className="skeleton-block skeleton-sidebar__item skeleton-sidebar__item--short" />
        <div className="skeleton-block skeleton-sidebar__item" />
      </div>
      <div className="skeleton-sidebar__group">
        <div className="skeleton-block skeleton-sidebar__category" />
        <div className="skeleton-block skeleton-sidebar__item" />
        <div className="skeleton-block skeleton-sidebar__item" />
        <div className="skeleton-block skeleton-sidebar__item skeleton-sidebar__item--short" />
      </div>
    </div>
  );
}

/**
 * Full-page skeleton layout combining header, cards, and sidebar.
 * Used as the Suspense fallback while route content is loading.
 */
export function SkeletonPage() {
  return (
    <div className="skeleton-page" role="status" aria-label="Loading content">
      <div className="skeleton-page__content">
        <SkeletonHeader />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );
}
