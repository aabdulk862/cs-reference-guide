/**
 * Unit tests for the analytics event system.
 * Tests cover: subscribe/unsubscribe, trackPageView, trackSearch, trackTopicComplete,
 * multiple subscribers, error isolation, and unsubscribe cleanup.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  subscribe,
  trackPageView,
  trackSearch,
  trackTopicComplete,
  _resetForTesting,
} from './analytics';
import type { AnalyticsEvent } from './analytics';

describe('analytics event system', () => {
  beforeEach(() => {
    _resetForTesting();
  });

  describe('subscribe', () => {
    it('should return an unsubscribe function', () => {
      const handler = vi.fn();
      const unsubscribe = subscribe(handler);
      expect(typeof unsubscribe).toBe('function');
    });

    it('should receive events after subscribing', () => {
      const handler = vi.fn();
      subscribe(handler);
      trackPageView('/home');
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({ type: 'page_view', path: '/home' });
    });

    it('should stop receiving events after unsubscribing', () => {
      const handler = vi.fn();
      const unsubscribe = subscribe(handler);
      trackPageView('/before');
      expect(handler).toHaveBeenCalledTimes(1);

      unsubscribe();
      trackPageView('/after');
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should support multiple subscribers', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      subscribe(handler1);
      subscribe(handler2);

      trackSearch('react hooks');
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
      expect(handler1).toHaveBeenCalledWith({ type: 'search_query', query: 'react hooks' });
      expect(handler2).toHaveBeenCalledWith({ type: 'search_query', query: 'react hooks' });
    });

    it('should not duplicate events for the same handler subscribed once', () => {
      const handler = vi.fn();
      subscribe(handler);
      trackPageView('/test');
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('trackPageView', () => {
    it('should emit a page_view event with the given path', () => {
      const events: AnalyticsEvent[] = [];
      subscribe((e) => events.push(e));

      trackPageView('/topic/backend/java');
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({ type: 'page_view', path: '/topic/backend/java' });
    });

    it('should handle empty path', () => {
      const events: AnalyticsEvent[] = [];
      subscribe((e) => events.push(e));

      trackPageView('');
      expect(events[0]).toEqual({ type: 'page_view', path: '' });
    });
  });

  describe('trackSearch', () => {
    it('should emit a search_query event with the given query', () => {
      const events: AnalyticsEvent[] = [];
      subscribe((e) => events.push(e));

      trackSearch('binary tree traversal');
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({ type: 'search_query', query: 'binary tree traversal' });
    });

    it('should handle empty query', () => {
      const events: AnalyticsEvent[] = [];
      subscribe((e) => events.push(e));

      trackSearch('');
      expect(events[0]).toEqual({ type: 'search_query', query: '' });
    });
  });

  describe('trackTopicComplete', () => {
    it('should emit a topic_complete event with the given topicId', () => {
      const events: AnalyticsEvent[] = [];
      subscribe((e) => events.push(e));

      trackTopicComplete('backend/docker-containerization');
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        type: 'topic_complete',
        topicId: 'backend/docker-containerization',
      });
    });
  });

  describe('error isolation', () => {
    it('should not prevent other subscribers from receiving events when one throws', () => {
      const failingHandler = vi.fn(() => {
        throw new Error('Subscriber error');
      });
      const workingHandler = vi.fn();

      subscribe(failingHandler);
      subscribe(workingHandler);

      trackPageView('/test');
      expect(failingHandler).toHaveBeenCalledTimes(1);
      expect(workingHandler).toHaveBeenCalledTimes(1);
    });

    it('should not throw when a subscriber throws', () => {
      subscribe(() => {
        throw new Error('boom');
      });

      expect(() => trackPageView('/safe')).not.toThrow();
    });
  });

  describe('no subscribers', () => {
    it('should not throw when tracking events with no subscribers', () => {
      expect(() => trackPageView('/no-one-listening')).not.toThrow();
      expect(() => trackSearch('no-one-listening')).not.toThrow();
      expect(() => trackTopicComplete('no-one-listening')).not.toThrow();
    });
  });
});
