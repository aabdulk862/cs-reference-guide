/**
 * Analytics event system for the CS Reference Guide.
 *
 * Exposes callable event hooks for page view, search query, and topic completion
 * events. An analytics provider can subscribe to these events without modifying
 * application code.
 *
 * @see Requirements 21.5
 */

export type AnalyticsEvent =
  | { type: 'page_view'; path: string }
  | { type: 'search_query'; query: string }
  | { type: 'topic_complete'; topicId: string };

export type AnalyticsSubscriber = (event: AnalyticsEvent) => void;

const subscribers: Set<AnalyticsSubscriber> = new Set();

/**
 * Subscribe to analytics events. Returns an unsubscribe function.
 */
export function subscribe(handler: AnalyticsSubscriber): () => void {
  subscribers.add(handler);
  return () => {
    subscribers.delete(handler);
  };
}

/**
 * Track a page view event.
 */
export function trackPageView(path: string): void {
  const event: AnalyticsEvent = { type: 'page_view', path };
  notify(event);
}

/**
 * Track a search query event.
 */
export function trackSearch(query: string): void {
  const event: AnalyticsEvent = { type: 'search_query', query };
  notify(event);
}

/**
 * Track a topic completion event.
 */
export function trackTopicComplete(topicId: string): void {
  const event: AnalyticsEvent = { type: 'topic_complete', topicId };
  notify(event);
}

/**
 * Notify all subscribers of an event. Errors in individual subscribers
 * are caught so one failing subscriber does not prevent others from receiving events.
 */
function notify(event: AnalyticsEvent): void {
  subscribers.forEach((handler) => {
    try {
      handler(event);
    } catch {
      // Silently ignore subscriber errors to prevent cascading failures
    }
  });
}

/**
 * Reset all subscribers. Intended for testing only.
 * @internal
 */
export function _resetForTesting(): void {
  subscribers.clear();
}
