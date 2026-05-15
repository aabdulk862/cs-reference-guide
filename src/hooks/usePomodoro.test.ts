/**
 * Tests verifying PomodoroTimer works offline.
 *
 * Validates: Requirement 19.4
 * - PomodoroTimer uses only local state (useState, useRef, localStorage)
 * - Start, pause, and reset (stop) operations require no network requests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePomodoro } from './usePomodoro';

describe('usePomodoro - offline capability (Requirement 19.4)', () => {
  let fetchSpy: unknown;
  let xhrSpy: unknown;

  beforeEach(() => {
    // Spy on global fetch and XMLHttpRequest to detect any network calls
    fetchSpy = vi.spyOn(globalThis, 'fetch');
    xhrSpy = vi.spyOn(XMLHttpRequest.prototype, 'open');

    // Clear localStorage before each test
    localStorage.clear();

    // Use fake timers for interval-based logic
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('start does not make any network requests', () => {
    const { result } = renderHook(() => usePomodoro());

    act(() => {
      result.current.start();
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhrSpy).not.toHaveBeenCalled();
    expect(result.current.state.mode).toBe('work');
    expect(result.current.state.isRunning).toBe(true);
  });

  it('pause does not make any network requests', () => {
    const { result } = renderHook(() => usePomodoro());

    act(() => {
      result.current.start();
    });

    act(() => {
      result.current.pause();
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhrSpy).not.toHaveBeenCalled();
    expect(result.current.state.isRunning).toBe(false);
    expect(result.current.state.mode).toBe('work');
  });

  it('stop (reset) does not make any network requests', () => {
    const { result } = renderHook(() => usePomodoro());

    act(() => {
      result.current.start();
    });

    act(() => {
      result.current.stop();
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhrSpy).not.toHaveBeenCalled();
    expect(result.current.state.mode).toBe('idle');
    expect(result.current.state.isRunning).toBe(false);
  });

  it('timer countdown uses only local setInterval, no network calls', () => {
    const { result } = renderHook(() => usePomodoro());

    act(() => {
      result.current.start();
    });

    // Advance time by 5 seconds
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhrSpy).not.toHaveBeenCalled();
    // Timer should have decremented
    expect(result.current.state.remainingSeconds).toBe(25 * 60 - 5);
  });

  it('persists configuration to localStorage only (no network)', () => {
    const { result } = renderHook(() => usePomodoro());

    act(() => {
      result.current.setWorkDuration(30);
    });

    act(() => {
      result.current.setBreakDuration(10);
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhrSpy).not.toHaveBeenCalled();
    expect(result.current.state.workDuration).toBe(30);
    expect(result.current.state.breakDuration).toBe(10);

    // Verify localStorage was used
    const stored = localStorage.getItem('csguide:pomodoro');
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(parsed.workDuration).toBe(30);
    expect(parsed.breakDuration).toBe(10);
  });

  it('full start/pause/resume/stop cycle works without network', () => {
    const { result } = renderHook(() => usePomodoro());

    // Start
    act(() => {
      result.current.start();
    });
    expect(result.current.state.mode).toBe('work');

    // Tick
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    // Pause
    act(() => {
      result.current.pause();
    });
    expect(result.current.state.isRunning).toBe(false);

    // Resume
    act(() => {
      result.current.start();
    });
    expect(result.current.state.isRunning).toBe(true);

    // Stop (reset)
    act(() => {
      result.current.stop();
    });
    expect(result.current.state.mode).toBe('idle');

    // No network calls throughout the entire lifecycle
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhrSpy).not.toHaveBeenCalled();
  });
});
