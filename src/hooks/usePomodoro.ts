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
 *
 * Requirements: 5.1, 5.2, 5.3, 5.7
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type { PomodoroState } from '../types/study';
import * as storage from '../utils/storage';

const STORAGE_KEY = 'pomodoro';

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
  const config = loadConfig();

  const [state, setState] = useState<PomodoroState>({
    mode: 'idle',
    workDuration: config.workDuration,
    breakDuration: config.breakDuration,
    remainingSeconds: 0,
    isRunning: false,
    completedPomodoros: 0,
  });

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
      if (prev.mode === 'idle') {
        return {
          ...prev,
          mode: 'work',
          remainingSeconds: prev.workDuration * 60,
          isRunning: true,
        };
      }
      // If paused (in work or break mode), resume
      if (!prev.isRunning) {
        return { ...prev, isRunning: true };
      }
      return prev;
    });
  }, []);

  /** Pause the timer (preserves state) */
  const pause = useCallback(() => {
    setState((prev) => {
      if (prev.isRunning) {
        return { ...prev, isRunning: false };
      }
      return prev;
    });
  }, []);

  /** Stop the timer (returns to idle) */
  const stop = useCallback(() => {
    clearTimer();
    setNotification(null);
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

        if (newRemaining <= 0) {
          // Transition
          if (prev.mode === 'work') {
            // work → break
            setNotification('work-ended');
            return {
              ...prev,
              mode: 'break',
              remainingSeconds: prev.breakDuration * 60,
              completedPomodoros: prev.completedPomodoros + 1,
            };
          } else if (prev.mode === 'break') {
            // break → work (new cycle)
            setNotification('break-ended');
            return {
              ...prev,
              mode: 'work',
              remainingSeconds: prev.workDuration * 60,
            };
          }
        }

        return { ...prev, remainingSeconds: newRemaining };
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
