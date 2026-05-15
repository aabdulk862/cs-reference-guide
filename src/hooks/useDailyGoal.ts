/**
 * React hook for managing daily study goal state.
 *
 * Loads the daily goal from localStorage (csguide:daily-goal) on mount.
 * If the stored date differs from today's local date, resets elapsedMinutes
 * to 0 while preserving the targetMinutes.
 *
 * Exposes: setTarget, addMinutes, getProgress
 *
 * Requirements: 5.6
 */

import { useState, useCallback, useEffect } from 'react';
import type { DailyGoal } from '@/types/study';
import * as storage from '@/utils/storage';

const STORAGE_KEY = 'daily-goal';
const DEFAULT_TARGET = 30;
const MIN_TARGET = 5;
const MAX_TARGET = 480;

/**
 * Get today's date as an ISO date string (YYYY-MM-DD) in local timezone.
 */
export function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Clamp a target value to the valid range [5, 480].
 */
export function clampTarget(minutes: number): number {
  return Math.max(MIN_TARGET, Math.min(MAX_TARGET, Math.round(minutes)));
}

/**
 * Calculate progress percentage: floor(elapsed / target * 100), capped at 100.
 */
export function calculateProgress(elapsedMinutes: number, targetMinutes: number): number {
  if (targetMinutes <= 0) return 0;
  const raw = Math.floor((elapsedMinutes / targetMinutes) * 100);
  return Math.min(100, raw);
}

/**
 * Create a default DailyGoal for today.
 */
function createDefaultGoal(): DailyGoal {
  return {
    targetMinutes: DEFAULT_TARGET,
    elapsedMinutes: 0,
    date: getTodayDateString(),
  };
}

/**
 * Load the daily goal from storage, resetting elapsed if the date has changed.
 */
export function loadDailyGoal(): DailyGoal {
  const stored = storage.get<DailyGoal | null>(STORAGE_KEY, null);
  const today = getTodayDateString();

  if (!stored) {
    return createDefaultGoal();
  }

  // If stored date !== today, reset elapsed but keep target
  if (stored.date !== today) {
    return {
      targetMinutes: stored.targetMinutes,
      elapsedMinutes: 0,
      date: today,
    };
  }

  return stored;
}

interface UseDailyGoalReturn {
  /** Current daily goal state */
  goal: DailyGoal;
  /** Set the target minutes (clamped to 5-480) */
  setTarget: (minutes: number) => void;
  /** Add elapsed minutes to today's progress */
  addMinutes: (minutes: number) => void;
  /** Get current progress percentage (0-100) */
  getProgress: () => number;
}

/**
 * Hook that manages the daily study goal with localStorage persistence.
 */
export function useDailyGoal(): UseDailyGoalReturn {
  const [goal, setGoal] = useState<DailyGoal>(loadDailyGoal);

  // Persist to localStorage whenever goal changes
  useEffect(() => {
    storage.set(STORAGE_KEY, goal);
  }, [goal]);

  const setTarget = useCallback((minutes: number) => {
    setGoal((prev) => {
      const today = getTodayDateString();
      const newGoal: DailyGoal = {
        targetMinutes: clampTarget(minutes),
        elapsedMinutes: prev.date === today ? prev.elapsedMinutes : 0,
        date: today,
      };
      return newGoal;
    });
  }, []);

  const addMinutes = useCallback((minutes: number) => {
    if (minutes <= 0) return;
    setGoal((prev) => {
      const today = getTodayDateString();
      const elapsed = prev.date === today ? prev.elapsedMinutes : 0;
      const newGoal: DailyGoal = {
        targetMinutes: prev.targetMinutes,
        elapsedMinutes: elapsed + minutes,
        date: today,
      };
      return newGoal;
    });
  }, []);

  const getProgress = useCallback((): number => {
    return calculateProgress(goal.elapsedMinutes, goal.targetMinutes);
  }, [goal.elapsedMinutes, goal.targetMinutes]);

  return { goal, setTarget, addMinutes, getProgress };
}
