# Implementation Plan: Persistent Nav Timer

## Overview

This plan refactors the `usePomodoro` hook to use timestamp-based persistence, creates a compact `NavTimer` component for the header, and wires everything together so the Pomodoro timer is always visible and survives page refreshes and navigations.

## Tasks

- [x] 1. Add PersistedTimerState interface and persistence helpers
  - [x] 1.1 Create the `PersistedTimerState` interface and validation/persistence functions in `src/hooks/usePomodoro.ts`
    - Add `PersistedTimerState` interface with fields: `mode`, `remainingSeconds`, `isRunning`, `lastTickAt`, `completedPomodoros`, `workDuration`, `breakDuration`
    - Implement `isValidPersistedState(data: unknown): data is PersistedTimerState` validation guard
    - Implement `persistState(state: PomodoroState, now: number): void` that writes to `pomodoro-state` key or removes it when idle
    - Implement `restoreState(now: number): PomodoroState` that reads from `pomodoro-state`, calculates elapsed time, and handles expired timers
    - Implement `handleExpiredRestoration(persisted: PersistedTimerState): PomodoroState` for mode transitions when timer expired while away
    - Handle clock-skew edge case: if `lastTickAt` is in the future, treat elapsed as 0
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3_

  - [ ]* 1.2 Write property test for persisted state shape completeness (Property 2)
    - **Property 2: Persisted state shape completeness**
    - Generate arbitrary valid PomodoroState with mode 'work' or 'break', persist it, and verify the resulting JSON contains all required fields with correct types and valid ranges
    - **Validates: Requirements 4.1, 3.1**

  - [ ]* 1.3 Write property test for corrupted state fallback (Property 4)
    - **Property 4: Corrupted state fallback to idle**
    - Generate arbitrary invalid values (null, non-objects, missing fields, out-of-range values), store them at `pomodoro-state`, and verify `restoreState` returns idle state without throwing
    - **Validates: Requirements 4.3**

- [x] 2. Refactor `usePomodoro` hook for timestamp-based persistence and restoration
  - [x] 2.1 Refactor `usePomodoro` to initialize state via `restoreState(Date.now())` and persist on every tick
    - Replace `useState<PomodoroState>` initializer with `restoreState(Date.now())`
    - In the `setInterval` tick callback, call `persistState(newState, Date.now())` after each state update
    - On `start()` and resume, persist state immediately with current timestamp
    - On `stop()`, call `storage.remove('pomodoro-state')` to clear running state
    - Keep existing `csguide:pomodoro` config persistence for work/break duration unchanged
    - Maintain the existing `command-palette:start-pomodoro` event listener
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 5.1, 5.2, 9.1, 9.2, 9.3_

  - [ ]* 2.2 Write property test for restoration elapsed-time correctness (Property 3)
    - **Property 3: Restoration elapsed-time correctness**
    - Generate valid persisted states with `isRunning: true` and arbitrary `lastTickAt` in the past, restore at a generated `now`, and verify `remainingSeconds = max(0, persisted.remainingSeconds - floor((now - lastTickAt) / 1000))`, with mode transition triggered when result ≤ 0
    - **Validates: Requirements 3.3, 3.4**

  - [ ]* 2.3 Write property test for mode transition correctness (Property 5)
    - **Property 5: Mode transition correctness**
    - Generate running timer states where `remainingSeconds` reaches zero, verify: work→break sets `remainingSeconds = breakDuration × 60` and increments `completedPomodoros`; break→work sets `remainingSeconds = workDuration × 60`
    - **Validates: Requirements 6.1, 6.2**

  - [ ]* 2.4 Write property test for storage key isolation on stop (Property 6)
    - **Property 6: Storage key isolation on stop**
    - Set both `csguide:pomodoro` and `csguide:pomodoro-state` keys, call `stop()`, verify only `csguide:pomodoro-state` is removed while `csguide:pomodoro` remains unchanged
    - **Validates: Requirements 9.3**

- [x] 3. Checkpoint - Ensure hook refactoring is solid
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Create NavTimer component
  - [x] 4.1 Create `src/components/layout/NavTimer.tsx` with compact inline timer UI
    - Consume `usePomodoro` hook directly (no props)
    - Render countdown in MM:SS format using `role="timer"` with `aria-label` updated each tick (e.g., "25 minutes 30 seconds remaining")
    - Display mode label ("Work" / "Break") when not idle
    - Render icon-based control buttons: start (idle), pause + stop (running), resume + stop (paused)
    - All buttons must have `aria-label` attributes and minimum 44×44px touch targets
    - Include `aria-live="polite"` region for mode transition announcements
    - Display compact idle state with start button when timer is not active
    - Use BEM class names: `.nav-timer`, `.nav-timer__countdown`, `.nav-timer__mode`, `.nav-timer__btn`, `.nav-timer__btn--start`, `.nav-timer__btn--pause`, `.nav-timer__btn--resume`, `.nav-timer__btn--stop`, `.nav-timer__idle`, `.nav-timer__live-region`
    - _Requirements: 1.1, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 7.1, 7.2, 7.3, 7.4, 8.1, 8.2, 8.3, 8.4_

  - [ ]* 4.2 Write property test for time formatting round-trip (Property 1)
    - **Property 1: Time formatting round-trip**
    - Generate arbitrary integers in [0, 5999], format as MM:SS, parse back, and verify the original value is recovered
    - **Validates: Requirements 2.1**

  - [ ]* 4.3 Write unit tests for NavTimer component
    - Test that idle state renders start button
    - Test that running state renders pause + stop buttons with mode label and countdown
    - Test that paused state renders resume + stop buttons
    - Test accessibility attributes: `role="timer"`, `aria-label` on buttons, `aria-live` region present
    - _Requirements: 2.3, 2.4, 2.5, 7.4, 8.1, 8.2, 8.3_

- [x] 5. Add NavTimer styles to `src/index.css`
  - [x] 5.1 Add CSS for `.nav-timer` and all child elements in `src/index.css`
    - Style `.nav-timer` as a flex container centered in `header-center` with max-width constraint
    - Style `.nav-timer__countdown` with minimum 16px font size
    - Style `.nav-timer__btn` variants with 44×44px minimum touch targets and icon-based appearance
    - Style `.nav-timer__mode` label
    - Style `.nav-timer__idle` compact state
    - Style `.nav-timer__live-region` as visually hidden (sr-only) but accessible
    - Ensure no overlap with `header-left` or `header-right` regions
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 6. Wire NavTimer into Header and remove old study session timer
  - [x] 6.1 Modify `src/components/layout/Header.tsx` to render NavTimer in `header-center`
    - Remove `useStudySession` import and related logic
    - Import `NavTimer` from `@/components/layout/NavTimer`
    - Replace the `header-center` content (focus-timer / timer-placeholder) with `<NavTimer />`
    - _Requirements: 1.1, 1.2, 1.3, 5.1, 5.2, 5.3_

  - [ ]* 6.2 Write unit tests for Header rendering NavTimer
    - Verify Header renders NavTimer component in header-center
    - Verify no study session elapsed-time display or placeholder is rendered
    - _Requirements: 1.1, 1.3_

- [x] 7. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The design uses TypeScript throughout — all implementation uses TypeScript
- The `usePomodoro` hook's public API (`UsePomodoroReturn`) remains unchanged; only internal persistence logic changes

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "5.1"] },
    { "id": 3, "tasks": ["4.1"] },
    { "id": 4, "tasks": ["4.2", "4.3", "6.1"] },
    { "id": 5, "tasks": ["6.2"] }
  ]
}
```
