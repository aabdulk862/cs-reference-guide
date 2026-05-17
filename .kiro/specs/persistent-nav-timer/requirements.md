# Requirements Document

## Introduction

This feature moves the Pomodoro timer into the application header (navigation bar) so it remains visible across all pages, replacing the existing study session elapsed-time display. The timer's running state is persisted to localStorage using a timestamp-based strategy, ensuring that Pomodoro intervals remain accurate across page navigations and full page refreshes.

## Glossary

- **Nav_Timer**: The compact Pomodoro timer UI rendered inline within the application header bar
- **Pomodoro_Hook**: The `usePomodoro` React hook that manages timer state, transitions, and persistence logic
- **Storage_Utility**: The `csguide:`-namespaced localStorage abstraction at `src/utils/storage.ts`
- **Timer_State**: The persisted object containing mode, remainingSeconds, isRunning, lastTickAt, and completedPomodoros
- **Header**: The top-level `<header>` component rendered on every page of the application
- **Work_Mode**: The Pomodoro interval where the user is focused on studying
- **Break_Mode**: The Pomodoro interval where the user rests between work sessions

## Requirements

### Requirement 1: Header Placement

**User Story:** As a user, I want the Pomodoro timer always visible in the navigation bar, so that I can monitor my study intervals without navigating to a specific page.

#### Acceptance Criteria

1. THE Header SHALL render the Nav_Timer in the `header-center` region, replacing the existing study session elapsed-time display.
2. THE Nav_Timer SHALL remain visible and functional on every page of the application regardless of the current route.
3. THE Header SHALL NOT render the study session elapsed-time timer or its placeholder when the Nav_Timer is present.

### Requirement 2: Inline Timer Controls

**User Story:** As a user, I want to see the countdown, mode label, and control buttons directly in the header, so that I can manage my Pomodoro session without opening a separate panel.

#### Acceptance Criteria

1. THE Nav_Timer SHALL display the current countdown in MM:SS format.
2. THE Nav_Timer SHALL display the current mode label as "Work" during Work_Mode and "Break" during Break_Mode.
3. WHILE the Pomodoro_Hook is in idle mode, THE Nav_Timer SHALL display a start button to begin a work interval.
4. WHILE the Pomodoro_Hook is running, THE Nav_Timer SHALL display a pause button and a stop button inline.
5. WHILE the Pomodoro_Hook is paused, THE Nav_Timer SHALL display a play (resume) button and a stop button inline.
6. THE Nav_Timer SHALL display all controls (countdown, mode label, play/pause, stop) without requiring a popover, dropdown, or modal.

### Requirement 3: Timestamp-Based State Persistence

**User Story:** As a user, I want my running Pomodoro timer to survive page refreshes and navigations, so that my intervals remain accurate even if I reload the browser.

#### Acceptance Criteria

1. WHEN the Pomodoro_Hook starts or resumes the timer, THE Pomodoro_Hook SHALL persist a `lastTickAt` timestamp (milliseconds since epoch) to the Storage_Utility under the `csguide:pomodoro-state` key.
2. WHEN the Pomodoro_Hook ticks each second, THE Pomodoro_Hook SHALL update the persisted `lastTickAt` timestamp in the Storage_Utility.
3. WHEN the application loads and a persisted Timer_State with `isRunning: true` exists, THE Pomodoro_Hook SHALL calculate the real elapsed time as the difference between `Date.now()` and the stored `lastTickAt` value, and subtract that elapsed time from `remainingSeconds`.
4. IF the calculated remaining time after restoration is less than or equal to zero, THEN THE Pomodoro_Hook SHALL trigger the appropriate mode transition (work-to-break or break-to-work) as if the timer had reached zero naturally.
5. WHEN the Pomodoro_Hook stops or the timer returns to idle, THE Pomodoro_Hook SHALL remove the persisted Timer_State from the Storage_Utility.

### Requirement 4: Persisted State Shape

**User Story:** As a developer, I want a well-defined persisted state shape, so that restoration logic is predictable and testable.

#### Acceptance Criteria

1. THE Pomodoro_Hook SHALL persist the following fields to `csguide:pomodoro-state`: `mode` (work or break), `remainingSeconds` (number), `isRunning` (boolean), `lastTickAt` (number, milliseconds since epoch), `completedPomodoros` (number), `workDuration` (number, minutes), and `breakDuration` (number, minutes).
2. THE Pomodoro_Hook SHALL serialize the Timer_State as JSON via the Storage_Utility `set` method.
3. THE Pomodoro_Hook SHALL deserialize the Timer_State via the Storage_Utility `get` method with a fallback to idle defaults when the key is absent or corrupted.

### Requirement 5: Cross-Page Navigation Continuity

**User Story:** As a user, I want the timer to keep counting down seamlessly when I navigate between pages within the app, so that client-side routing does not interrupt my Pomodoro session.

#### Acceptance Criteria

1. THE Pomodoro_Hook SHALL maintain its running interval across React Router navigations without resetting or pausing.
2. WHEN the Header component re-mounts due to a route change, THE Pomodoro_Hook SHALL restore the running timer state from the persisted Timer_State and resume ticking without visible interruption.
3. THE Nav_Timer SHALL display a continuous countdown with no visible flicker or reset during client-side page transitions.

### Requirement 6: Mode Transitions

**User Story:** As a user, I want the timer to automatically switch between work and break intervals, so that I follow the Pomodoro technique without manual intervention.

#### Acceptance Criteria

1. WHEN the countdown reaches zero during Work_Mode, THE Pomodoro_Hook SHALL transition to Break_Mode, set `remainingSeconds` to `breakDuration * 60`, increment `completedPomodoros` by one, and persist the updated Timer_State.
2. WHEN the countdown reaches zero during Break_Mode, THE Pomodoro_Hook SHALL transition to Work_Mode, set `remainingSeconds` to `workDuration * 60`, and persist the updated Timer_State.
3. WHEN a mode transition occurs, THE Pomodoro_Hook SHALL emit a notification event (`work-ended` or `break-ended`) for the UI to display.

### Requirement 7: Compact Visual Design

**User Story:** As a user, I want the timer to fit naturally in the header without crowding other elements, so that the navigation bar remains usable.

#### Acceptance Criteria

1. THE Nav_Timer SHALL occupy the `header-center` region with a maximum width that does not overlap the `header-left` or `header-right` regions.
2. THE Nav_Timer SHALL use icon-based buttons (play, pause, stop) with a minimum touch target of 44x44 CSS pixels for accessibility.
3. THE Nav_Timer SHALL use a font size no smaller than 16px for the countdown display.
4. WHILE the Pomodoro_Hook is in idle mode, THE Nav_Timer SHALL display a compact idle state (start button with a label or icon) that does not leave the header-center region empty.

### Requirement 8: Accessibility

**User Story:** As a user relying on assistive technology, I want the timer to be fully accessible, so that I can operate it with a screen reader or keyboard.

#### Acceptance Criteria

1. THE Nav_Timer SHALL use `role="timer"` on the countdown element and update `aria-label` with the current remaining time on each tick.
2. THE Nav_Timer SHALL provide `aria-label` attributes on all control buttons describing their action (e.g., "Start Pomodoro", "Pause timer", "Stop timer").
3. THE Nav_Timer SHALL announce mode transitions via an `aria-live="polite"` region.
4. THE Nav_Timer SHALL support full keyboard operability — all buttons are focusable and activatable via Enter or Space keys.

### Requirement 9: Storage Namespace Isolation

**User Story:** As a developer, I want the persisted running state stored separately from the configuration, so that stopping the timer does not erase saved work/break duration preferences.

#### Acceptance Criteria

1. THE Pomodoro_Hook SHALL persist running state to the key `pomodoro-state` (resolved to `csguide:pomodoro-state` by the Storage_Utility), separate from the existing `pomodoro` key used for configuration.
2. THE Pomodoro_Hook SHALL continue to persist work/break duration configuration to the existing `csguide:pomodoro` key.
3. WHEN the timer is stopped, THE Pomodoro_Hook SHALL remove only the `csguide:pomodoro-state` key and leave the `csguide:pomodoro` configuration key intact.
