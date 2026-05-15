/**
 * SettingsPage — user preferences page with theme toggle, daily goal slider,
 * and notification toggle. All selections persist to localStorage under
 * `csguide:settings`.
 *
 * Requirements: 13.4, 13.7
 */

import { useState, useEffect, useCallback } from 'react';
import * as storage from '@/utils/storage';

const SETTINGS_KEY = 'settings';

type Theme = 'light' | 'dark';

interface Settings {
  theme: Theme;
  dailyGoalTopics: number;
  notifications: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  dailyGoalTopics: 5,
  notifications: true,
};

/**
 * Load settings from localStorage, falling back to defaults.
 */
function loadSettings(): Settings {
  const stored = storage.get<Partial<Settings> | null>(SETTINGS_KEY, null);
  if (!stored) {
    return { ...DEFAULT_SETTINGS };
  }
  return {
    theme: stored.theme === 'light' || stored.theme === 'dark' ? stored.theme : DEFAULT_SETTINGS.theme,
    dailyGoalTopics:
      typeof stored.dailyGoalTopics === 'number' &&
      stored.dailyGoalTopics >= 1 &&
      stored.dailyGoalTopics <= 20
        ? stored.dailyGoalTopics
        : DEFAULT_SETTINGS.dailyGoalTopics,
    notifications: typeof stored.notifications === 'boolean' ? stored.notifications : DEFAULT_SETTINGS.notifications,
  };
}

/**
 * Apply theme to the document root element.
 */
function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>(loadSettings);

  // Persist settings to localStorage whenever they change
  useEffect(() => {
    storage.set(SETTINGS_KEY, settings);
  }, [settings]);

  // Apply theme when it changes
  useEffect(() => {
    applyTheme(settings.theme);
    // Also sync the standalone theme key used by ThemeToggle component
    storage.set('theme', settings.theme);
  }, [settings.theme]);

  const handleThemeChange = useCallback((theme: Theme) => {
    setSettings((prev) => ({ ...prev, theme }));
  }, []);

  const handleDailyGoalChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (value >= 1 && value <= 20) {
      setSettings((prev) => ({ ...prev, dailyGoalTopics: value }));
    }
  }, []);

  const handleNotificationsChange = useCallback(() => {
    setSettings((prev) => ({ ...prev, notifications: !prev.notifications }));
  }, []);

  return (
    <div className="page-settings">
      <h2>Settings</h2>

      {/* Theme Selection */}
      <section className="settings-section" aria-labelledby="settings-theme-heading">
        <h3 id="settings-theme-heading">Theme</h3>
        <p className="settings-section__description">
          Choose your preferred color scheme.
        </p>
        <div className="settings-theme-toggle" role="radiogroup" aria-labelledby="settings-theme-heading">
          <button
            type="button"
            className={`settings-theme-btn ${settings.theme === 'light' ? 'settings-theme-btn--active' : ''}`}
            onClick={() => handleThemeChange('light')}
            role="radio"
            aria-checked={settings.theme === 'light'}
          >
            <span className="settings-theme-btn__icon" aria-hidden="true">☀️</span>
            <span className="settings-theme-btn__label">Light</span>
          </button>
          <button
            type="button"
            className={`settings-theme-btn ${settings.theme === 'dark' ? 'settings-theme-btn--active' : ''}`}
            onClick={() => handleThemeChange('dark')}
            role="radio"
            aria-checked={settings.theme === 'dark'}
          >
            <span className="settings-theme-btn__icon" aria-hidden="true">🌙</span>
            <span className="settings-theme-btn__label">Dark</span>
          </button>
        </div>
      </section>

      {/* Daily Goal Slider */}
      <section className="settings-section" aria-labelledby="settings-goal-heading">
        <h3 id="settings-goal-heading">Daily Goal</h3>
        <p className="settings-section__description">
          Set how many topics you want to study each day.
        </p>
        <div className="settings-slider">
          <label htmlFor="daily-goal-slider" className="settings-slider__label">
            Topics per day: <strong>{settings.dailyGoalTopics}</strong>
          </label>
          <input
            id="daily-goal-slider"
            type="range"
            min={1}
            max={20}
            step={1}
            value={settings.dailyGoalTopics}
            onChange={handleDailyGoalChange}
            className="settings-slider__input"
            aria-valuemin={1}
            aria-valuemax={20}
            aria-valuenow={settings.dailyGoalTopics}
          />
          <div className="settings-slider__range">
            <span>1</span>
            <span>20</span>
          </div>
        </div>
      </section>

      {/* Notifications Toggle */}
      <section className="settings-section" aria-labelledby="settings-notifications-heading">
        <h3 id="settings-notifications-heading">Notifications</h3>
        <p className="settings-section__description">
          Enable or disable study reminders and update notifications.
        </p>
        <div className="settings-toggle">
          <label htmlFor="notifications-toggle" className="settings-toggle__label">
            <span className="settings-toggle__text">
              {settings.notifications ? 'Enabled' : 'Disabled'}
            </span>
            <span
              className={`settings-toggle__switch ${settings.notifications ? 'settings-toggle__switch--on' : ''}`}
              aria-hidden="true"
            >
              <span className="settings-toggle__switch-knob" />
            </span>
          </label>
          <input
            id="notifications-toggle"
            type="checkbox"
            checked={settings.notifications}
            onChange={handleNotificationsChange}
            className="settings-toggle__input"
            aria-label="Toggle notifications"
          />
        </div>
      </section>
    </div>
  );
}
