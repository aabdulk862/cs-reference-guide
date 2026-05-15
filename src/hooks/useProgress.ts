/**
 * React hook for tracking reading progress across topics and sections.
 *
 * Tracks section completion via scroll observation (IntersectionObserver).
 * Marks a section as complete when the user scrolls to ≥90% of its height.
 * Calculates per-topic and overall progress percentages.
 * Persists all progress data to localStorage (csguide:progress).
 *
 * Requirements: 6.1, 6.2, 6.5
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import * as storage from '@/utils/storage';

const STORAGE_KEY = 'progress';

/** Scroll threshold (90%) to mark a section as complete */
const COMPLETION_THRESHOLD = 0.9;

/**
 * Serialized progress data shape stored in localStorage.
 * Uses string arrays instead of Sets for JSON compatibility.
 */
export interface ProgressData {
  completedSections: Record<string, string[]>; // topicId -> sectionId[]
  topicProgress: Record<string, number>; // topicId -> percentage
  overallProgress: number;
}

/**
 * Topic section count registry used for percentage calculations.
 * Maps topicId -> total number of sections in that topic.
 */
type TopicSectionCounts = Record<string, number>;

/** Return type for the useProgress hook */
export interface UseProgressReturn {
  /** Current progress data */
  progressData: ProgressData;
  /** Mark a section as complete for a given topic */
  markSectionComplete: (topicId: string, sectionId: string) => void;
  /** Get progress percentage for a specific topic */
  getTopicProgress: (topicId: string) => number;
  /** Get overall progress percentage across all topics */
  getOverallProgress: () => number;
  /** Register the total section count for a topic (needed for percentage calculation) */
  registerTopicSections: (topicId: string, totalSections: number) => void;
  /** Create an IntersectionObserver callback for a section element */
  observeSection: (topicId: string, sectionId: string) => (element: HTMLElement | null) => void;
}

/** Default empty progress state */
const DEFAULT_PROGRESS: ProgressData = {
  completedSections: {},
  topicProgress: {},
  overallProgress: 0,
};

/**
 * Calculate the progress percentage for a topic.
 * Returns floor(completed / total * 100), or 0 if total is 0.
 */
export function calculateTopicProgress(
  completedCount: number,
  totalCount: number
): number {
  if (totalCount <= 0) return 0;
  return Math.floor((completedCount / totalCount) * 100);
}

/**
 * Calculate overall progress across all topics.
 * Returns floor(totalCompleted / totalSections * 100), or 0 if totalSections is 0.
 */
export function calculateOverallProgress(
  completedSections: Record<string, string[]>,
  topicSectionCounts: TopicSectionCounts
): number {
  const totalCompleted = Object.values(completedSections).reduce(
    (sum, sections) => sum + sections.length,
    0
  );
  const totalSections = Object.values(topicSectionCounts).reduce(
    (sum, count) => sum + count,
    0
  );
  if (totalSections <= 0) return 0;
  return Math.floor((totalCompleted / totalSections) * 100);
}

/**
 * Hook for tracking reading progress across topics and sections.
 */
export function useProgress(): UseProgressReturn {
  const [progressData, setProgressData] = useState<ProgressData>(() => {
    return storage.get<ProgressData>(STORAGE_KEY, DEFAULT_PROGRESS);
  });

  const topicSectionCountsRef = useRef<TopicSectionCounts>({});
  const observersRef = useRef<Map<string, IntersectionObserver>>(new Map());

  // Persist to localStorage whenever progressData changes
  useEffect(() => {
    storage.set(STORAGE_KEY, progressData);
  }, [progressData]);

  // Cleanup observers on unmount
  useEffect(() => {
    return () => {
      for (const observer of observersRef.current.values()) {
        observer.disconnect();
      }
      observersRef.current.clear();
    };
  }, []);

  /**
   * Register the total number of sections for a topic.
   * This is needed to calculate per-topic and overall percentages.
   */
  const registerTopicSections = useCallback((topicId: string, totalSections: number) => {
    topicSectionCountsRef.current[topicId] = totalSections;
  }, []);

  /**
   * Mark a section as complete for a given topic.
   * Recalculates topic and overall percentages.
   */
  const markSectionComplete = useCallback((topicId: string, sectionId: string) => {
    setProgressData((prev) => {
      const topicSections = prev.completedSections[topicId] ?? [];

      // Already marked complete — no-op
      if (topicSections.includes(sectionId)) {
        return prev;
      }

      const updatedTopicSections = [...topicSections, sectionId];
      const updatedCompletedSections = {
        ...prev.completedSections,
        [topicId]: updatedTopicSections,
      };

      // Calculate per-topic progress
      const totalForTopic = topicSectionCountsRef.current[topicId] ?? updatedTopicSections.length;
      const updatedTopicProgress = {
        ...prev.topicProgress,
        [topicId]: calculateTopicProgress(updatedTopicSections.length, totalForTopic),
      };

      // Calculate overall progress
      const overallProgress = calculateOverallProgress(
        updatedCompletedSections,
        topicSectionCountsRef.current
      );

      return {
        completedSections: updatedCompletedSections,
        topicProgress: updatedTopicProgress,
        overallProgress,
      };
    });
  }, []);

  /**
   * Get progress percentage for a specific topic.
   */
  const getTopicProgress = useCallback(
    (topicId: string): number => {
      return progressData.topicProgress[topicId] ?? 0;
    },
    [progressData.topicProgress]
  );

  /**
   * Get overall progress percentage across all topics.
   */
  const getOverallProgress = useCallback((): number => {
    return progressData.overallProgress;
  }, [progressData.overallProgress]);

  /**
   * Create a ref callback that sets up an IntersectionObserver for a section element.
   * When the user scrolls to ≥90% of the section's height, it marks the section complete.
   */
  const observeSection = useCallback(
    (topicId: string, sectionId: string) => {
      return (element: HTMLElement | null) => {
        const observerKey = `${topicId}:${sectionId}`;

        // Disconnect any existing observer for this section
        const existingObserver = observersRef.current.get(observerKey);
        if (existingObserver) {
          existingObserver.disconnect();
          observersRef.current.delete(observerKey);
        }

        if (!element) return;

        const observer = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (entry.intersectionRatio >= COMPLETION_THRESHOLD) {
                markSectionComplete(topicId, sectionId);
                // Once complete, stop observing
                observer.disconnect();
                observersRef.current.delete(observerKey);
              }
            }
          },
          {
            threshold: COMPLETION_THRESHOLD,
          }
        );

        observer.observe(element);
        observersRef.current.set(observerKey, observer);
      };
    },
    [markSectionComplete]
  );

  return {
    progressData,
    markSectionComplete,
    getTopicProgress,
    getOverallProgress,
    registerTopicSections,
    observeSection,
  };
}
