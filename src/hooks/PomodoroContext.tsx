/**
 * PomodoroContext — provides a single shared Pomodoro timer instance
 * to the entire component tree.
 *
 * This ensures the NavTimer (header) and PomodoroTimer (dashboard) stay
 * perfectly in sync: one interval, one state, one source of truth.
 *
 * Usage:
 *   Wrap your app (or AppShell) with <PomodoroProvider>
 *   Consume via usePomodoroContext() in any component
 */

import { createContext, useContext } from 'react';
import { usePomodoro, type UsePomodoroReturn } from './usePomodoro';

const PomodoroContext = createContext<UsePomodoroReturn | null>(null);

export function PomodoroProvider({ children }: { children: React.ReactNode }) {
  const pomodoro = usePomodoro();

  return (
    <PomodoroContext.Provider value={pomodoro}>
      {children}
    </PomodoroContext.Provider>
  );
}

/**
 * Consume the shared Pomodoro timer state.
 * Must be used within a <PomodoroProvider>.
 */
export function usePomodoroContext(): UsePomodoroReturn {
  const context = useContext(PomodoroContext);
  if (!context) {
    throw new Error('usePomodoroContext must be used within a PomodoroProvider');
  }
  return context;
}
