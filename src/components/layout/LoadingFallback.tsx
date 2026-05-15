import { SkeletonPage } from './Skeleton';

/**
 * Loading fallback component displayed inside Suspense boundaries
 * while lazy-loaded route components are being fetched.
 * Displays skeleton placeholder shapes corresponding to the page's
 * structural elements (header, cards) until content is ready.
 *
 * Requirements: 20.2
 */
export function LoadingFallback() {
  return <SkeletonPage />;
}
