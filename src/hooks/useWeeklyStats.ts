/**
 * React hook for managing weekly study statistics.
 *
 * Aggregates daily study records over the past 7 days,
 * tracking total minutes studied and distinct topics covered.
 * Persists state to localStorage under csguide:weekly-stats.
 *
 * Requirements: 6.8
 */

import { useState, useEffect, useCallback } from 'react';
import * as storage from '@/utils/storage';
import type { WeeklyStats, DailyStudyRecord } from '@/types/study';

const STORAGE_KEY = 'weekly-stats';

/** Get the date 7 days ago as an ISO date string (YYYY-MM-DD) */
function getSevenDaysAgo(): string {
  const date = new Date();
  date.setDate(date.getDate() - 7);
  return date.toISOString().split('T')[0];
}

/** Filter records to only include the past 7 days */
function filterRecentRecords(records: DailyStudyRecord[]): DailyStudyRecord[] {
  const cutoff = getSevenDaysAgo();
  return records.filter((record) => record.date > cutoff);
}

/** Compute aggregate stats from daily records */
function computeAggregates(records: DailyStudyRecord[]): Pick<WeeklyStats, 'totalMinutes' | 'topicsCovered'> {
  const totalMinutes = records.reduce((sum, r) => sum + r.elapsedMinutes, 0);
  const allTopicIds = new Set<string>();
  for (const record of records) {
    for (const id of record.topicIds) {
      allTopicIds.add(id);
    }
  }
  return { totalMinutes, topicsCovered: allTopicIds.size };
}

/** Build a complete WeeklyStats object from daily records */
function buildWeeklyStats(records: DailyStudyRecord[]): WeeklyStats {
  const filtered = filterRecentRecords(records);
  const { totalMinutes, topicsCovered } = computeAggregates(filtered);
  return { totalMinutes, topicsCovered, dailyRecords: filtered };
}

const DEFAULT_STATS: WeeklyStats = {
  totalMinutes: 0,
  topicsCovered: 0,
  dailyRecords: [],
};

interface UseWeeklyStatsReturn {
  /** Current weekly stats */
  stats: WeeklyStats;
  /** Add or update a daily study record */
  addStudyRecord: (date: string, minutes: number, topicIds: string[]) => void;
}

/**
 * Hook that manages weekly study statistics with localStorage persistence.
 */
export function useWeeklyStats(): UseWeeklyStatsReturn {
  const [stats, setStats] = useState<WeeklyStats>(() => {
    const stored = storage.get<WeeklyStats>(STORAGE_KEY, DEFAULT_STATS);
    return buildWeeklyStats(stored.dailyRecords);
  });

  // On mount, load from localStorage and filter to past 7 days
  useEffect(() => {
    const stored = storage.get<WeeklyStats>(STORAGE_KEY, DEFAULT_STATS);
    const updated = buildWeeklyStats(stored.dailyRecords);
    setStats(updated);
    // Persist the filtered version back
    storage.set(STORAGE_KEY, updated);
  }, []);

  const addStudyRecord = useCallback((date: string, minutes: number, topicIds: string[]) => {
    setStats((prev) => {
      // Find existing record for this date
      const existingIndex = prev.dailyRecords.findIndex((r) => r.date === date);
      let updatedRecords: DailyStudyRecord[];

      if (existingIndex >= 0) {
        // Update existing record: add minutes and merge topicIds
        updatedRecords = prev.dailyRecords.map((record, i) => {
          if (i !== existingIndex) return record;
          const mergedTopicIds = Array.from(
            new Set([...record.topicIds, ...topicIds])
          );
          return {
            ...record,
            elapsedMinutes: record.elapsedMinutes + minutes,
            topicIds: mergedTopicIds,
          };
        });
      } else {
        // Add new record
        updatedRecords = [...prev.dailyRecords, { date, elapsedMinutes: minutes, topicIds }];
      }

      const newStats = buildWeeklyStats(updatedRecords);
      // Persist on every change
      storage.set(STORAGE_KEY, newStats);
      return newStats;
    });
  }, []);

  return { stats, addStudyRecord };
}
