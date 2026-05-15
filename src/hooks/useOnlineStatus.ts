import { useState, useEffect } from 'react';

/**
 * Hook that tracks browser online/offline status.
 * Returns `true` when the browser is online, `false` when offline.
 *
 * Uses the `navigator.onLine` property for initial state and listens
 * to `online`/`offline` window events for real-time updates.
 *
 * Requirements: 19.3
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
