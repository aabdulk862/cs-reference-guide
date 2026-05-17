import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { usePomodoro } from '@/hooks/usePomodoro';

/**
 * Fixed bottom navigation bar for mobile viewports (< 768px).
 * Displays up to 5 primary navigation items with minimum 44×44px touch targets
 * and 8px spacing between items.
 *
 * The timer item opens a floating sheet with Pomodoro controls above the nav bar.
 *
 * Requirements: 18.3, 18.6
 */

interface BottomNavItem {
  icon: string;
  label: string;
  path: string;
}

const NAV_ITEMS: BottomNavItem[] = [
  { icon: '🏠', label: 'Home', path: '/' },
  { icon: '📚', label: 'Topics', path: '/progress' },
  { icon: '🔍', label: 'Search', path: '/search' },
  { icon: '⚙️', label: 'Settings', path: '/settings' },
];

export function BottomNav() {
  const location = useLocation();
  const [timerOpen, setTimerOpen] = useState(false);
  const { state, notification, start, pause, stop, dismissNotification } = usePomodoro();

  const isTimerActive = state.mode !== 'idle';

  // Format countdown
  const minutes = Math.floor(state.remainingSeconds / 60);
  const seconds = state.remainingSeconds % 60;
  const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const modeLabel = state.mode === 'work' ? 'Work' : state.mode === 'break' ? 'Break' : '';

  // Dismiss notification after it's shown
  if (notification) {
    setTimeout(() => dismissNotification(), 1500);
  }

  return (
    <>
      {/* Floating timer sheet */}
      {timerOpen && (
        <div className="bottom-timer-sheet" role="dialog" aria-label="Pomodoro timer controls">
          <div className="bottom-timer-sheet__content">
            {state.mode === 'idle' ? (
              <div className="bottom-timer-sheet__idle">
                <span className="bottom-timer-sheet__label">Start a Pomodoro</span>
                <button
                  className="bottom-timer-sheet__btn bottom-timer-sheet__btn--start"
                  aria-label="Start Pomodoro"
                  type="button"
                  onClick={() => { start(); setTimerOpen(false); }}
                >
                  ▶ Start
                </button>
              </div>
            ) : (
              <div className="bottom-timer-sheet__active">
                <span className="bottom-timer-sheet__mode">{modeLabel}</span>
                <span className="bottom-timer-sheet__countdown" role="timer" aria-label={`${minutes} minutes ${seconds} seconds remaining`}>
                  {formattedTime}
                </span>
                <div className="bottom-timer-sheet__controls">
                  {state.isRunning ? (
                    <button
                      className="bottom-timer-sheet__btn bottom-timer-sheet__btn--pause"
                      aria-label="Pause timer"
                      type="button"
                      onClick={pause}
                    >
                      ⏸ Pause
                    </button>
                  ) : (
                    <button
                      className="bottom-timer-sheet__btn bottom-timer-sheet__btn--resume"
                      aria-label="Resume timer"
                      type="button"
                      onClick={start}
                    >
                      ▶ Resume
                    </button>
                  )}
                  <button
                    className="bottom-timer-sheet__btn bottom-timer-sheet__btn--stop"
                    aria-label="Stop timer"
                    type="button"
                    onClick={() => { stop(); setTimerOpen(false); }}
                  >
                    ⏹ Stop
                  </button>
                </div>
              </div>
            )}
            {notification && (
              <span className="bottom-timer-sheet__notification" aria-live="polite">
                {notification === 'work-ended' ? 'Work done! Break time.' : 'Break over! Back to work.'}
              </span>
            )}
          </div>
        </div>
      )}

      <nav className="bottom-nav" aria-label="Mobile navigation">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.path === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(item.path);

          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={`bottom-nav__item ${isActive ? 'bottom-nav__item--active' : ''}`}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className="bottom-nav__icon" aria-hidden="true">
                {item.icon}
              </span>
              <span className="bottom-nav__label">{item.label}</span>
            </NavLink>
          );
        })}

        {/* Timer toggle button */}
        <button
          type="button"
          className={`bottom-nav__item bottom-nav__timer-btn ${isTimerActive ? 'bottom-nav__item--active' : ''}`}
          aria-label={isTimerActive ? `Timer: ${formattedTime} ${modeLabel}` : 'Timer'}
          aria-expanded={timerOpen}
          onClick={() => setTimerOpen((prev) => !prev)}
        >
          <span className="bottom-nav__icon" aria-hidden="true">
            {isTimerActive ? '⏱' : '🍅'}
          </span>
          <span className="bottom-nav__label">
            {isTimerActive ? formattedTime : 'Timer'}
          </span>
        </button>
      </nav>
    </>
  );
}
