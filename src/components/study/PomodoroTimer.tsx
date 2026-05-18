/**
 * Pomodoro Timer UI component.
 *
 * Displays timer controls (start, pause, stop), configurable work/break durations,
 * remaining time, and banner notifications on interval transitions.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.7
 */

import { usePomodoroContext } from '@/hooks/PomodoroContext';

/** Format seconds into MM:SS display */
function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function PomodoroTimer() {
  const {
    state,
    notification,
    start,
    pause,
    stop,
    setWorkDuration,
    setBreakDuration,
    dismissNotification,
  } = usePomodoroContext();

  const isIdle = state.mode === 'idle';

  return (
    <div className="pomodoro-timer" role="region" aria-label="Pomodoro Timer">
      {/* Notification Banner */}
      {notification && (
        <div
          className={`pomodoro-notification pomodoro-notification--${notification}`}
          role="alert"
          aria-live="polite"
        >
          <span className="pomodoro-notification__message">
            {notification === 'work-ended'
              ? 'Work interval complete! Time for a break.'
              : 'Break is over! Ready to get back to work?'}
          </span>
          <button
            className="pomodoro-notification__dismiss"
            onClick={dismissNotification}
            aria-label="Dismiss notification"
            type="button"
          >
            ✕
          </button>
        </div>
      )}

      {/* Timer Display */}
      <div className="pomodoro-timer__display">
        <span className="pomodoro-timer__mode" aria-label="Current mode">
          {state.mode === 'idle' ? 'Ready' : state.mode === 'work' ? 'Work' : 'Break'}
        </span>
        <span className="pomodoro-timer__time" aria-label="Time remaining">
          {isIdle ? formatTime(state.workDuration * 60) : formatTime(state.remainingSeconds)}
        </span>
        {state.completedPomodoros > 0 && (
          <span className="pomodoro-timer__count" aria-label="Completed pomodoros">
            🍅 {state.completedPomodoros}
          </span>
        )}
      </div>

      {/* Controls */}
      <div className="pomodoro-timer__controls">
        {isIdle ? (
          <button
            className="pomodoro-timer__btn pomodoro-timer__btn--start"
            onClick={start}
            type="button"
            aria-label="Start Pomodoro"
          >
            Start
          </button>
        ) : (
          <>
            {state.isRunning ? (
              <button
                className="pomodoro-timer__btn pomodoro-timer__btn--pause"
                onClick={pause}
                type="button"
                aria-label="Pause timer"
              >
                Pause
              </button>
            ) : (
              <button
                className="pomodoro-timer__btn pomodoro-timer__btn--resume"
                onClick={start}
                type="button"
                aria-label="Resume timer"
              >
                Resume
              </button>
            )}
            <button
              className="pomodoro-timer__btn pomodoro-timer__btn--stop"
              onClick={stop}
              type="button"
              aria-label="Stop timer"
            >
              Stop
            </button>
          </>
        )}
      </div>

      {/* Configuration (only when idle) */}
      {isIdle && (
        <div className="pomodoro-timer__config">
          <label className="pomodoro-timer__config-item">
            <span>Work</span>
            <input
              type="number"
              min={5}
              max={90}
              value={state.workDuration}
              onChange={(e) => setWorkDuration(Number(e.target.value))}
              aria-label="Work duration in minutes"
            />
            <span>min</span>
          </label>
          <label className="pomodoro-timer__config-item">
            <span>Break</span>
            <input
              type="number"
              min={1}
              max={30}
              value={state.breakDuration}
              onChange={(e) => setBreakDuration(Number(e.target.value))}
              aria-label="Break duration in minutes"
            />
            <span>min</span>
          </label>
        </div>
      )}
    </div>
  );
}
