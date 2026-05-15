/**
 * React hook for managing spaced repetition scheduling.
 *
 * Implements a spaced repetition system with the interval sequence [1, 3, 7, 14, 30] days.
 * Schedules first review on topic completion (all sections complete).
 * Advances interval on successful review, resets to index 0 on "Still struggling".
 * After the final interval (30 days), repeats at 30-day intervals.
 * Persists to localStorage under the key "csguide:spaced-rep".
 *
 * Requirements: 9.1, 9.3, 9.4, 9.5, 9.6
 */

import { useState, useCallback, useEffect } from 'react';
import * as storage from '@/utils/storage';
import type { SpacedRepetitionState, RepetitionSchedule } from '@/types/study';

const STORAGE_KEY = 'spaced-rep';

/** Spaced repetition interval sequence in days */
export const INTERVALS = [1, 3, 7, 14, 30] as const;

const DEFAULT_STATE: SpacedRepetitionState = { schedules: {} };

/** Item returned by getDueTopics */
export interface DueTopic {
  topicId: string;
  nextReviewDate: string;
  daysSinceLastReview: number;
  daysOverdue: number;
}

export interface UseSpacedRepetitionReturn {
  /** All schedules */
  schedules: Record<string, RepetitionSchedule>;
  /** Schedule a topic for spaced repetition (called on topic completion) */
  scheduleTopic: (topicId: string) => void;
  /** Complete a review successfully — advance to next interval */
  completeReview: (topicId: string) => void;
  /** Reset a topic to the first interval ("Still struggling") */
  resetTopic: (topicId: string) => void;
  /** Get topics that are due for review (nextReviewDate <= today), sorted by most overdue, max 20 */
  getDueTopics: () => DueTopic[];
  /** Get the schedule for a specific topic */
  getSchedule: (topicId: string) => RepetitionSchedule | undefined;
}

/**
 * Add a number of days to a date string (ISO format YYYY-MM-DD) and return a new ISO date string.
 */
export function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr + 'T00:00:00');
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

/**
 * Get today's date as an ISO date string (YYYY-MM-DD).
 */
export function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Calculate the number of days between two date strings.
 * Returns (dateA - dateB) in days.
 */
export function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA + 'T00:00:00').getTime();
  const b = new Date(dateB + 'T00:00:00').getTime();
  return Math.round((a - b) / (1000 * 60 * 60 * 24));
}

/**
 * Hook that manages spaced repetition state with localStorage persistence.
 */
export function useSpacedRepetition(): UseSpacedRepetitionReturn {
  const [state, setState] = useState<SpacedRepetitionState>(() => {
    return storage.get<SpacedRepetitionState>(STORAGE_KEY, DEFAULT_STATE);
  });

  // Persist to localStorage whenever state changes
  useEffect(() => {
    storage.set(STORAGE_KEY, state);
  }, [state]);

  /**
   * Schedule a topic for spaced repetition.
   * Creates a schedule with currentInterval=0 and nextReviewDate = today + 1 day.
   */
  const scheduleTopic = useCallback((topicId: string) => {
    setState((prev) => {
      const today = getToday();
      const nextReviewDate = addDays(today, INTERVALS[0]);

      const schedule: RepetitionSchedule = {
        topicId,
        completedDate: today,
        currentInterval: 0,
        nextReviewDate,
        reviewCount: 0,
      };

      return {
        schedules: {
          ...prev.schedules,
          [topicId]: schedule,
        },
      };
    });
  }, []);

  /**
   * Complete a review successfully.
   * Advances currentInterval (capped at last index).
   * Sets nextReviewDate = today + intervals[newIndex].
   * After the final interval (30 days), next review = today + 30.
   */
  const completeReview = useCallback((topicId: string) => {
    setState((prev) => {
      const existing = prev.schedules[topicId];
      if (!existing) return prev;

      const today = getToday();
      const lastIndex = INTERVALS.length - 1;

      // Advance interval, capped at last index
      const newInterval = Math.min(existing.currentInterval + 1, lastIndex);

      // After completing the final interval, repeat at 30-day intervals
      const daysToAdd = INTERVALS[newInterval];
      const nextReviewDate = addDays(today, daysToAdd);

      const updatedSchedule: RepetitionSchedule = {
        ...existing,
        currentInterval: newInterval,
        nextReviewDate,
        reviewCount: existing.reviewCount + 1,
        completedDate: today,
      };

      return {
        schedules: {
          ...prev.schedules,
          [topicId]: updatedSchedule,
        },
      };
    });
  }, []);

  /**
   * Reset a topic to the first interval ("Still struggling").
   * Sets currentInterval=0 and nextReviewDate = today + 1 day.
   */
  const resetTopic = useCallback((topicId: string) => {
    setState((prev) => {
      const existing = prev.schedules[topicId];
      if (!existing) return prev;

      const today = getToday();
      const nextReviewDate = addDays(today, INTERVALS[0]);

      const updatedSchedule: RepetitionSchedule = {
        ...existing,
        currentInterval: 0,
        nextReviewDate,
        completedDate: today,
      };

      return {
        schedules: {
          ...prev.schedules,
          [topicId]: updatedSchedule,
        },
      };
    });
  }, []);

  /**
   * Get topics that are due for review.
   * Returns topics where nextReviewDate <= today, sorted by most overdue first, max 20 items.
   */
  const getDueTopics = useCallback((): DueTopic[] => {
    const today = getToday();
    const dueTopics: DueTopic[] = [];

    for (const schedule of Object.values(state.schedules)) {
      if (schedule.nextReviewDate <= today) {
        const daysOverdue = daysBetween(today, schedule.nextReviewDate);
        const daysSinceLastReview = daysBetween(today, schedule.completedDate);

        dueTopics.push({
          topicId: schedule.topicId,
          nextReviewDate: schedule.nextReviewDate,
          daysSinceLastReview,
          daysOverdue,
        });
      }
    }

    // Sort by most overdue first (highest daysOverdue first)
    dueTopics.sort((a, b) => b.daysOverdue - a.daysOverdue);

    // Return at most 20 items
    return dueTopics.slice(0, 20);
  }, [state.schedules]);

  /**
   * Get the schedule for a specific topic.
   */
  const getSchedule = useCallback(
    (topicId: string): RepetitionSchedule | undefined => {
      return state.schedules[topicId];
    },
    [state.schedules]
  );

  return {
    schedules: state.schedules,
    scheduleTopic,
    completeReview,
    resetTopic,
    getDueTopics,
    getSchedule,
  };
}
