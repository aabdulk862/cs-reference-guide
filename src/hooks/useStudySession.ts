/**
 * Hook managing the study session and focus timer.
 *
 * Behaviors:
 * - Auto-starts on first Content_Section navigation (when startSession is called)
 * - Ticks elapsed time every second via setInterval(1000)
 * - Pauses when document.visibilityState === 'hidden'
 * - Resumes when tab becomes visible again
 * - Saves to localStorage (csguide:session) on beforeunload and visibilitychange
 * - Restores from localStorage on mount
 * - Formats elapsed time as HH:MM:SS
 *
 * Requirements: 5.4, 5.8
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { StudySession } from '../types/study';
import * as storage from '../utils/storage';

const SESSION_KEY = 'session';

const DEFAULT_SESSION: StudySession = {
  startTime: 0,
  elapsedSeconds: 0,
  isActive: false,
  lastTopicId: '',
  lastSectionId: '',
};

/**
 * Format elapsed seconds as HH:MM:SS.
 */
export function formatElapsedTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');

  return `${hh}:${mm}:${ss}`;
}

export interface UseStudySessionReturn {
  /** Current session state */
  session: StudySession;
  /** Formatted elapsed time as HH:MM:SS */
  formattedTime: string;
  /** Start or resume a session when navigating to a content section */
  startSession: (topicId: string, sectionId: string) => void;
  /** End the current session */
  endSession: () => void;
  /** Whether the timer is currently paused (tab hidden) */
  isPaused: boolean;
}

export function useStudySession(): UseStudySessionReturn {
  const [session, setSession] = useState<StudySession>(() => {
    return storage.get<StudySession>(SESSION_KEY, DEFAULT_SESSION);
  });
  const [isPaused, setIsPaused] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionRef = useRef<StudySession>(session);

  // Keep ref in sync with state for use in event handlers
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  /**
   * Save current session to localStorage.
   */
  const saveSession = useCallback((currentSession: StudySession) => {
    storage.set(SESSION_KEY, currentSession);
  }, []);

  /**
   * Start the interval timer that ticks every second.
   */
  const startTicking = useCallback(() => {
    if (intervalRef.current !== null) return; // Already ticking

    intervalRef.current = setInterval(() => {
      setSession((prev) => {
        const updated = { ...prev, elapsedSeconds: prev.elapsedSeconds + 1 };
        sessionRef.current = updated;
        return updated;
      });
    }, 1000);
  }, []);

  /**
   * Stop the interval timer.
   */
  const stopTicking = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  /**
   * Start or resume a study session when navigating to a content section.
   */
  const startSession = useCallback(
    (topicId: string, sectionId: string) => {
      setSession((prev) => {
        const now = Date.now();
        const updated: StudySession = {
          startTime: prev.isActive ? prev.startTime : now,
          elapsedSeconds: prev.elapsedSeconds,
          isActive: true,
          lastTopicId: topicId,
          lastSectionId: sectionId,
        };
        sessionRef.current = updated;
        saveSession(updated);
        return updated;
      });
    },
    [saveSession]
  );

  /**
   * End the current study session.
   */
  const endSession = useCallback(() => {
    stopTicking();
    const ended: StudySession = {
      ...DEFAULT_SESSION,
    };
    setSession(ended);
    sessionRef.current = ended;
    saveSession(ended);
  }, [stopTicking, saveSession]);

  // Start/stop ticking based on session active state and visibility
  useEffect(() => {
    if (session.isActive && !isPaused) {
      startTicking();
    } else {
      stopTicking();
    }

    return () => {
      stopTicking();
    };
  }, [session.isActive, isPaused, startTicking, stopTicking]);

  // Handle visibility change: pause when hidden, resume when visible
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        setIsPaused(true);
        // Save session when tab becomes hidden
        saveSession(sessionRef.current);
      } else {
        setIsPaused(false);
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [saveSession]);

  // Save session on beforeunload (close/refresh)
  useEffect(() => {
    function handleBeforeUnload() {
      saveSession(sessionRef.current);
    }

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [saveSession]);

  const formattedTime = formatElapsedTime(session.elapsedSeconds);

  return {
    session,
    formattedTime,
    startSession,
    endSession,
    isPaused,
  };
}
