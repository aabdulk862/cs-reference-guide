/**
 * Pomodoro timer state machine hook.
 *
 * State transitions:
 *   idle → work (on start)
 *   work → break (when work timer reaches 0)
 *   break → work (when break timer reaches 0, new cycle)
 *   any → idle (on stop)
 *
 * Persists configuration (workDuration, breakDuration) to localStorage (csguide:pomodoro).
 * Persists running timer state to localStorage (csguide:pomodoro-state) for cross-refresh restoration.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 5.1, 5.2, 5.3, 5.7, 9.1, 9.2, 9.3
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type { PomodoroState } from '../types/study';
import * as storage from '../utils/storage';

const STORAGE_KEY = 'pomodoro';
const STATE_STORAGE_KEY = 'pomodoro-state';

/** Default configuration values */
const DEFAULT_WORK_DURATION = 25; // minutes
const DEFAULT_BREAK_DURATION = 5; // minutes

/** Constraints */
const MIN_WORK = 5;
const MAX_WORK = 90;
const MIN_BREAK = 1;
const MAX_BREAK = 30;

/** Clamp a value between min and max */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Persisted config shape (only durations are persisted) */
interface PomodoroConfig {
  workDuration: number;
  breakDuration: number;
}

/** Persisted running timer state for cross-refresh restoration */
export interface PersistedTimerState {
  mode: 'work' | 'break';
  remainingSeconds: number;
  isRunning: boolean;
  lastTickAt: number; // milliseconds since epoch
  completedPomodoros: number;
  workDuration: number; // minutes
  breakDuration: number; // minutes
}

/**
 * Type guard that validates an unknown value is a valid PersistedTimerState.
 * Guards against corrupted localStorage data.
 */
export function isValidPersistedState(data: unknown): data is PersistedTimerState {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  return (
    (obj.mode === 'work' || obj.mode === 'break') &&
    typeof obj.remainingSeconds === 'number' &&
    obj.remainingSeconds >= 0 &&
    typeof obj.isRunning === 'boolean' &&
    typeof obj.lastTickAt === 'number' &&
    obj.lastTickAt > 0 &&
    typeof obj.completedPomodoros === 'number' &&
    obj.completedPomodoros >= 0 &&
    typeof obj.workDuration === 'number' &&
    obj.workDuration >= MIN_WORK && obj.workDuration <= MAX_WORK &&
    typeof obj.breakDuration === 'number' &&
    obj.breakDuration >= MIN_BREAK && obj.breakDuration <= MAX_BREAK
  );
}

/**
 * Persist the current timer state to localStorage.
 * If mode is 'idle', removes the persisted state key.
 * Otherwise serializes and stores the running state with the current timestamp.
 */
export function persistState(state: PomodoroState, now: number): void {
  if (state.mode === 'idle') {
    storage.remove(STATE_STORAGE_KEY);
    return;
  }

  const persisted: PersistedTimerState = {
    mode: state.mode,
    remainingSeconds: state.remainingSeconds,
    isRunning: state.isRunning,
    lastTickAt: now,
    completedPomodoros: state.completedPomodoros,
    workDuration: state.workDuration,
    breakDuration: state.breakDuration,
  };

  storage.set(STATE_STORAGE_KEY, persisted);
}

/**
 * Handle the case where the timer expired while the page was closed.
 * Transitions to the next mode (work→break or break→work).
 */
export function handleExpiredRestoration(persisted: PersistedTimerState): PomodoroState {
  if (persisted.mode === 'work') {
    // Work ended → transition to break
    return {
      mode: 'break',
      workDuration: persisted.workDuration,
      breakDuration: persisted.breakDuration,
      remainingSeconds: persisted.breakDuration * 60,
      isRunning: true,
      completedPomodoros: persisted.completedPomodoros + 1,
    };
  }
  // Break ended → transition to work
  return {
    mode: 'work',
    workDuration: persisted.workDuration,
    breakDuration: persisted.breakDuration,
    remainingSeconds: persisted.workDuration * 60,
    isRunning: true,
    completedPomodoros: persisted.completedPomodoros,
  };
}

/**
 * Restore timer state from localStorage.
 * Calculates elapsed time since last tick and adjusts remainingSeconds.
 * Handles clock-skew (lastTickAt in the future) by treating elapsed as 0.
 * Returns idle state if no valid persisted state exists.
 */
export function restoreState(now: number): PomodoroState {
  const persisted = storage.get<PersistedTimerState | null>(STATE_STORAGE_KEY, null);

  if (!persisted || !isValidPersistedState(persisted)) {
    const config = loadConfig();
    return {
      mode: 'idle',
      workDuration: config.workDuration,
      breakDuration: config.breakDuration,
      remainingSeconds: 0,
      isRunning: false,
      completedPomodoros: 0,
    };
  }

  if (!persisted.isRunning) {
    // Paused state — restore as-is, no time deduction
    return {
      mode: persisted.mode,
      workDuration: persisted.workDuration,
      breakDuration: persisted.breakDuration,
      remainingSeconds: persisted.remainingSeconds,
      isRunning: false,
      completedPomodoros: persisted.completedPomodoros,
    };
  }

  // Running state — calculate elapsed time
  const elapsedMs = now - persisted.lastTickAt;

  // Clock-skew edge case: if lastTickAt is in the future, treat elapsed as 0
  const elapsedSeconds = elapsedMs < 0 ? 0 : Math.floor(elapsedMs / 1000);
  const adjustedRemaining = persisted.remainingSeconds - elapsedSeconds;

  if (adjustedRemaining <= 0) {
    // Timer expired while away — trigger transition
    return handleExpiredRestoration(persisted);
  }

  return {
    mode: persisted.mode,
    workDuration: persisted.workDuration,
    breakDuration: persisted.breakDuration,
    remainingSeconds: adjustedRemaining,
    isRunning: true,
    completedPomodoros: persisted.completedPomodoros,
  };
}

/** Load persisted config from localStorage */
function loadConfig(): PomodoroConfig {
  const saved = storage.get<PomodoroConfig>(STORAGE_KEY, {
    workDuration: DEFAULT_WORK_DURATION,
    breakDuration: DEFAULT_BREAK_DURATION,
  });
  return {
    workDuration: clamp(saved.workDuration, MIN_WORK, MAX_WORK),
    breakDuration: clamp(saved.breakDuration, MIN_BREAK, MAX_BREAK),
  };
}

/** Save config to localStorage */
function saveConfig(config: PomodoroConfig): void {
  storage.set(STORAGE_KEY, config);
}

/** Notification types emitted on interval transitions */
export type PomodoroNotification = 'work-ended' | 'break-ended' | null;

export interface UsePomodoroReturn {
  state: PomodoroState;
  notification: PomodoroNotification;
  start: () => void;
  pause: () => void;
  stop: () => void;
  setWorkDuration: (minutes: number) => void;
  setBreakDuration: (minutes: number) => void;
  dismissNotification: () => void;
}

export function usePomodoro(): UsePomodoroReturn {
  const [state, setState] = useState<PomodoroState>(() => restoreState(Date.now()));

  const [notification, setNotification] = useState<PomodoroNotification>(null);

  /** Ref to track the interval timer */
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** Clear the running interval */
  const clearTimer = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  /** Start the Pomodoro from idle → work, or resume if paused */
  const start = useCallback(() => {
    setState((prev) => {
      let newState: PomodoroState;
      if (prev.mode === 'idle') {
        newState = {
          ...prev,
          mode: 'work',
          remainingSeconds: prev.workDuration * 60,
          isRunning: true,
        };
      } else if (!prev.isRunning) {
        // If paused (in work or break mode), resume
        newState = { ...prev, isRunning: true };
      } else {
        return prev;
      }
      persistState(newState, Date.now());
      return newState;
    });
  }, []);

  /** Pause the timer (preserves state) */
  const pause = useCallback(() => {
    setState((prev) => {
      if (prev.isRunning) {
        const newState = { ...prev, isRunning: false };
        persistState(newState, Date.now());
        return newState;
      }
      return prev;
    });
  }, []);

  /** Stop the timer (returns to idle) */
  const stop = useCallback(() => {
    clearTimer();
    setNotification(null);
    storage.remove(STATE_STORAGE_KEY);
    setState((prev) => ({
      ...prev,
      mode: 'idle',
      remainingSeconds: 0,
      isRunning: false,
    }));
  }, [clearTimer]);

  /** Update work duration (only when idle) */
  const setWorkDuration = useCallback((minutes: number) => {
    const clamped = clamp(Math.round(minutes), MIN_WORK, MAX_WORK);
    setState((prev) => {
      const newState = { ...prev, workDuration: clamped };
      saveConfig({ workDuration: clamped, breakDuration: prev.breakDuration });
      return newState;
    });
  }, []);

  /** Update break duration (only when idle) */
  const setBreakDuration = useCallback((minutes: number) => {
    const clamped = clamp(Math.round(minutes), MIN_BREAK, MAX_BREAK);
    setState((prev) => {
      const newState = { ...prev, breakDuration: clamped };
      saveConfig({ workDuration: prev.workDuration, breakDuration: clamped });
      return newState;
    });
  }, []);

  /** Dismiss the current notification */
  const dismissNotification = useCallback(() => {
    setNotification(null);
  }, []);

  /** Tick logic: decrement timer and handle transitions */
  useEffect(() => {
    if (!state.isRunning) {
      clearTimer();
      return;
    }

    intervalRef.current = setInterval(() => {
      setState((prev) => {
        if (!prev.isRunning) return prev;

        const newRemaining = prev.remainingSeconds - 1;

        let newState: PomodoroState;

        if (newRemaining <= 0) {
          // Transition
          if (prev.mode === 'work') {
            // work → break
            setNotification('work-ended');
            newState = {
              ...prev,
              mode: 'break',
              remainingSeconds: prev.breakDuration * 60,
              completedPomodoros: prev.completedPomodoros + 1,
            };
          } else if (prev.mode === 'break') {
            // break → work (new cycle)
            setNotification('break-ended');
            newState = {
              ...prev,
              mode: 'work',
              remainingSeconds: prev.workDuration * 60,
            };
          } else {
            newState = { ...prev, remainingSeconds: newRemaining };
          }
        } else {
          newState = { ...prev, remainingSeconds: newRemaining };
        }

        persistState(newState, Date.now());
        return newState;
      });
    }, 1000);

    return () => {
      clearTimer();
    };
  }, [state.isRunning, clearTimer]);

  /** Listen for command palette "start pomodoro" event */
  useEffect(() => {
    function handleStartPomodoro() {
      start();
    }
    window.addEventListener('command-palette:start-pomodoro', handleStartPomodoro);
    return () => {
      window.removeEventListener('command-palette:start-pomodoro', handleStartPomodoro);
    };
  }, [start]);

  return {
    state,
    notification,
    start,
    pause,
    stop,
    setWorkDuration,
    setBreakDuration,
    dismissNotification,
  };
}
