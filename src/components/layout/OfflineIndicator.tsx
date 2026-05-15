import { useOnlineStatus } from '@/hooks/useOnlineStatus';

/**
 * Displays an "Offline" badge in the header when the browser loses
 * network connectivity. Hidden when online.
 *
 * Requirements: 19.3
 */
export function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  if (isOnline) {
    return null;
  }

  return (
    <span
      className="offline-indicator"
      role="status"
      aria-live="polite"
      aria-label="You are offline"
    >
      Offline
    </span>
  );
}
