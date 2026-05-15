/**
 * Content view toggle component.
 *
 * Allows users to switch between Full Content, Cheat Sheet (≤500 words),
 * and ELI5 (≤3 sentences) views. Persists the last selected view preference
 * in localStorage.
 *
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6
 */

import { useEffect, useState } from 'react';
import { get, set } from '../../utils/storage';
import type { ContentView } from '../../utils/content-views';

const STORAGE_KEY = 'view-preference';

const VIEW_OPTIONS: { value: ContentView; label: string; description: string }[] = [
  { value: 'full', label: 'Full', description: 'Complete content' },
  { value: 'cheat-sheet', label: 'Cheat Sheet', description: 'Key points (≤500 words)' },
  { value: 'eli5', label: 'ELI5', description: 'Simple explanation (≤3 sentences)' },
];

interface ViewToggleProps {
  /** Callback fired when the selected view changes */
  onChange: (view: ContentView) => void;
  /** Optional initial view override (otherwise restored from localStorage) */
  initialView?: ContentView;
}

/**
 * ViewToggle renders three toggle buttons for switching content views.
 * The active button is visually highlighted. The selected view is persisted
 * to localStorage under the key `csguide:view-preference`.
 */
export function ViewToggle({ onChange, initialView }: ViewToggleProps) {
  const [activeView, setActiveView] = useState<ContentView>(() => {
    if (initialView) return initialView;
    return get<ContentView>(STORAGE_KEY, 'full');
  });

  // Notify parent of initial view on mount
  useEffect(() => {
    onChange(activeView);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleViewChange(view: ContentView) {
    setActiveView(view);
    set(STORAGE_KEY, view);
    onChange(view);
  }

  return (
    <div className="view-toggle" role="group" aria-label="Content view mode">
      {VIEW_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`view-toggle-btn${activeView === option.value ? ' view-toggle-btn--active' : ''}`}
          onClick={() => handleViewChange(option.value)}
          aria-pressed={activeView === option.value}
          title={option.description}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
