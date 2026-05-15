/**
 * Command Palette component.
 * Modal overlay centered on viewport with fuzzy search.
 * Opens on Ctrl+K / Cmd+K, closes on Escape or click outside.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7
 */

import { useEffect, useRef, useCallback } from 'react';
import type { CommandPaletteItem } from '../../types/navigation';

export interface CommandPaletteProps {
  isOpen: boolean;
  query: string;
  results: CommandPaletteItem[];
  selectedIndex: number;
  onQueryChange: (query: string) => void;
  onClose: () => void;
  onMoveSelection: (direction: 'up' | 'down') => void;
  onExecuteSelected: () => void;
  onSelectItem: (index: number) => void;
}

/** Type label badge colors */
const TYPE_STYLES: Record<CommandPaletteItem['type'], { label: string; className: string }> = {
  topic: { label: 'Topic', className: 'command-palette-badge--topic' },
  bookmark: { label: 'Bookmark', className: 'command-palette-badge--bookmark' },
  action: { label: 'Action', className: 'command-palette-badge--action' },
};

export function CommandPalette({
  isOpen,
  query,
  results,
  selectedIndex,
  onQueryChange,
  onClose,
  onMoveSelection,
  onExecuteSelected,
  onSelectItem,
}: CommandPaletteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Auto-focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selectedEl = listRef.current.children[selectedIndex] as HTMLElement | undefined;
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  // Handle keyboard events within the palette
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
        case 'ArrowDown':
          e.preventDefault();
          onMoveSelection('down');
          break;
        case 'ArrowUp':
          e.preventDefault();
          onMoveSelection('up');
          break;
        case 'Enter':
          e.preventDefault();
          onExecuteSelected();
          break;
      }
    },
    [onClose, onMoveSelection, onExecuteSelected]
  );

  // Handle click outside to close
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === overlayRef.current) {
        onClose();
      }
    },
    [onClose]
  );

  if (!isOpen) {
    return null;
  }

  return (
    <div
      ref={overlayRef}
      className="command-palette-overlay"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div className="command-palette" onKeyDown={handleKeyDown}>
        <div className="command-palette-input-wrapper">
          <input
            ref={inputRef}
            type="text"
            className="command-palette-input"
            placeholder="Search topics, bookmarks, and actions..."
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            aria-label="Search command palette"
            aria-activedescendant={
              results.length > 0 ? `command-palette-item-${selectedIndex}` : undefined
            }
            aria-controls="command-palette-results"
            role="combobox"
            aria-expanded={results.length > 0}
            aria-autocomplete="list"
          />
        </div>

        <ul
          id="command-palette-results"
          ref={listRef}
          className="command-palette-results"
          role="listbox"
          aria-label="Search results"
        >
          {results.length === 0 && query.trim().length > 0 ? (
            <li className="command-palette-no-results" role="option" aria-selected={false}>
              No results found
            </li>
          ) : (
            results.map((item, index) => {
              const typeStyle = TYPE_STYLES[item.type];
              const isSelected = index === selectedIndex;

              return (
                <li
                  key={item.id}
                  id={`command-palette-item-${index}`}
                  className={`command-palette-item ${isSelected ? 'command-palette-item--selected' : ''}`}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onSelectItem(index);
                    onExecuteSelected();
                  }}
                  onMouseEnter={() => onSelectItem(index)}
                >
                  <span className="command-palette-item-label">{item.label}</span>
                  <span className={`command-palette-badge ${typeStyle.className}`}>
                    {typeStyle.label}
                  </span>
                </li>
              );
            })
          )}
        </ul>

        <div className="command-palette-footer">
          <span className="command-palette-hint">
            <kbd>↑↓</kbd> navigate <kbd>↵</kbd> select <kbd>esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}
