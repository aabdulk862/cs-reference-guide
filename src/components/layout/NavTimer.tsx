import { useEffect, useRef } from 'react';
import { usePomodoroContext } from '@/hooks/PomodoroContext';

/**
 * Compact inline Pomodoro timer for the header bar.
 *
 * Consumes the usePomodoro hook directly and renders:
 * - Countdown in MM:SS format with role="timer"
 * - Mode label ("Work" / "Break") when active
 * - Icon-based control buttons with accessible labels
 * - aria-live region for mode transition announcements
 *
 * Requirements: 1.1, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 7.1, 7.2, 7.3, 7.4, 8.1, 8.2, 8.3, 8.4
 */
export function NavTimer() {
  const { state, notification, start, pause, stop, dismissNotification } = usePomodoroContext();
  const liveRegionRef = useRef<HTMLSpanElement>(null);

  // Format remainingSeconds as MM:SS
  const minutes = Math.floor(state.remainingSeconds / 60);
  const seconds = state.remainingSeconds % 60;
  const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  // Compute accessible time label
  const timerAriaLabel =
    state.mode === 'idle'
      ? 'Pomodoro timer idle'
      : `${minutes} minute${minutes !== 1 ? 's' : ''} ${seconds} second${seconds !== 1 ? 's' : ''} remaining`;

  // Capitalize mode label
  const modeLabel = state.mode === 'work' ? 'Work' : state.mode === 'break' ? 'Break' : '';

  // Announce mode transitions via aria-live region, then dismiss
  useEffect(() => {
    if (notification && liveRegionRef.current) {
      const message =
        notification === 'work-ended'
          ? 'Work session ended. Break started.'
          : 'Break ended. Work session started.';
      liveRegionRef.current.textContent = message;

      // Dismiss after a short delay to ensure screen readers pick it up
      const timeout = setTimeout(() => {
        dismissNotification();
      }, 1000);

      return () => clearTimeout(timeout);
    }
  }, [notification, dismissNotification]);

  // Idle state: compact start button
  if (state.mode === 'idle') {
    return (
      <div className="nav-timer">
        <div className="nav-timer__idle">
          <button
            className="nav-timer__btn nav-timer__btn--start"
            aria-label="Start Pomodoro"
            type="button"
            onClick={start}
          >
            <span aria-hidden="true">▶</span> Start
          </button>
        </div>
        <span
          ref={liveRegionRef}
          className="nav-timer__live-region"
          aria-live="polite"
          aria-atomic="true"
        />
      </div>
    );
  }

  // Active state (work or break, running or paused)
  return (
    <div className="nav-timer">
      <span className="nav-timer__mode">{modeLabel}</span>
      <span
        className="nav-timer__countdown"
        role="timer"
        aria-label={timerAriaLabel}
      >
        {formattedTime}
      </span>
      <div className="nav-timer__controls">
        {state.isRunning ? (
          <button
            className="nav-timer__btn nav-timer__btn--pause"
            aria-label="Pause timer"
            type="button"
            onClick={pause}
          >
            <span aria-hidden="true">⏸</span>
          </button>
        ) : (
          <button
            className="nav-timer__btn nav-timer__btn--resume"
            aria-label="Resume timer"
            type="button"
            onClick={start}
          >
            <span aria-hidden="true">▶</span>
          </button>
        )}
        <button
          className="nav-timer__btn nav-timer__btn--stop"
          aria-label="Stop timer"
          type="button"
          onClick={stop}
        >
          <span aria-hidden="true">⏹</span>
        </button>
      </div>
      <span
        ref={liveRegionRef}
        className="nav-timer__live-region"
        aria-live="polite"
        aria-atomic="true"
      />
    </div>
  );
}
