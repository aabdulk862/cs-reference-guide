import { useState, useEffect, useCallback } from 'react';
import { onSWUpdate, type SWUpdateEvent } from '@/utils/service-worker';

export interface SWNotification {
  id: string;
  type: SWUpdateEvent['type'];
  message: string;
  action?: {
    label: string;
    handler: () => void;
  };
}

let notificationCounter = 0;

/**
 * Hook that listens for service worker update events and exposes
 * non-blocking notifications for the UI.
 *
 * - 'update-available': shows a notification with a "Refresh" action
 * - 'cache-failed': shows a notification that offline access is unavailable
 * - 'cache-complete': no notification shown (silent success)
 *
 * Requirements: 19.5, 19.6, 19.7
 */
export function useSWNotifications() {
  const [notifications, setNotifications] = useState<SWNotification[]>([]);

  useEffect(() => {
    onSWUpdate((event: SWUpdateEvent) => {
      if (event.type === 'update-available') {
        const id = `sw-${Date.now()}-${++notificationCounter}`;
        setNotifications((prev) => [
          ...prev,
          {
            id,
            type: event.type,
            message: event.message,
            action: {
              label: 'Refresh',
              handler: () => window.location.reload(),
            },
          },
        ]);
      } else if (event.type === 'cache-failed') {
        const id = `sw-${Date.now()}-${++notificationCounter}`;
        setNotifications((prev) => [
          ...prev,
          {
            id,
            type: event.type,
            message: event.message,
          },
        ]);
      }
      // 'cache-complete' is silent — no notification needed
    });
  }, []);

  const dismiss = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  return { notifications, dismiss };
}
