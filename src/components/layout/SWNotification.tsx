import { useSWNotifications } from '@/hooks/useSWNotifications';

/**
 * Renders non-blocking notifications from the service worker.
 * Displays update-available and cache-failed messages with optional actions.
 *
 * Requirements: 19.5, 19.6, 19.7
 */
export function SWNotification() {
  const { notifications, dismiss } = useSWNotifications();

  if (notifications.length === 0) {
    return null;
  }

  return (
    <div className="sw-notifications" aria-live="polite" role="region" aria-label="App notifications">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className={`sw-notification sw-notification--${notification.type}`}
          role="alert"
        >
          <span className="sw-notification__message">{notification.message}</span>
          <div className="sw-notification__actions">
            {notification.action && (
              <button
                className="sw-notification__action-btn"
                onClick={notification.action.handler}
                type="button"
              >
                {notification.action.label}
              </button>
            )}
            <button
              className="sw-notification__dismiss-btn"
              onClick={() => dismiss(notification.id)}
              type="button"
              aria-label="Dismiss notification"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
