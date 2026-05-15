/**
 * Daily Goal Tracker component.
 *
 * Displays a configurable daily study goal with a progress bar
 * showing elapsed minutes and percentage toward the target.
 *
 * Requirements: 5.6
 */

import { useState } from 'react';
import { useDailyGoal } from '@/hooks/useDailyGoal';

/**
 * DailyGoal component renders:
 * - A progress bar showing elapsed vs target minutes
 * - Percentage display
 * - A control to configure the target (5-480 minutes)
 */
export function DailyGoal() {
  const { goal, setTarget, getProgress } = useDailyGoal();
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(String(goal.targetMinutes));

  const progress = getProgress();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseInt(inputValue, 10);
    if (!isNaN(parsed)) {
      setTarget(parsed);
    }
    setIsEditing(false);
  };

  const handleEditClick = () => {
    setInputValue(String(goal.targetMinutes));
    setIsEditing(true);
  };

  return (
    <div className="daily-goal" role="region" aria-label="Daily study goal">
      <div className="daily-goal__header">
        <h3 className="daily-goal__title">Daily Goal</h3>
        {!isEditing && (
          <button
            className="daily-goal__edit-btn"
            onClick={handleEditClick}
            aria-label="Edit daily goal target"
            type="button"
          >
            Edit
          </button>
        )}
      </div>

      {isEditing ? (
        <form className="daily-goal__form" onSubmit={handleSubmit}>
          <label htmlFor="daily-goal-input" className="daily-goal__label">
            Target (5-480 minutes):
          </label>
          <input
            id="daily-goal-input"
            className="daily-goal__input"
            type="number"
            min={5}
            max={480}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            aria-describedby="daily-goal-range"
          />
          <span id="daily-goal-range" className="daily-goal__range-hint">
            Min: 5, Max: 480
          </span>
          <div className="daily-goal__form-actions">
            <button type="submit" className="daily-goal__save-btn">
              Save
            </button>
            <button
              type="button"
              className="daily-goal__cancel-btn"
              onClick={() => setIsEditing(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          <div
            className="daily-goal__progress-bar"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${goal.elapsedMinutes} of ${goal.targetMinutes} minutes (${progress}%)`}
          >
            <div
              className="daily-goal__progress-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="daily-goal__status">
            {goal.elapsedMinutes} of {goal.targetMinutes} minutes ({progress}%)
          </p>
        </>
      )}
    </div>
  );
}
