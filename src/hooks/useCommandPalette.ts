/**
 * Hook managing command palette state.
 * Listens for Ctrl+K / Cmd+K globally to open.
 * Populates items from content manifest + bookmarks + actions.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CommandPaletteItem, CommandPaletteState } from '../types/navigation';
import type { Bookmark } from '../types/study';
import type { Category } from '../types/content';
import { fuzzyFilter } from '../utils/fuzzy-match';
import * as storage from '../utils/storage';

/** Actions available in the command palette */
function createActions(navigate: ReturnType<typeof useNavigate>): CommandPaletteItem[] {
  return [
    {
      id: 'action-start-pomodoro',
      label: 'Start Pomodoro',
      type: 'action',
      action: () => {
        // Dispatch a custom event that the Pomodoro component can listen to
        window.dispatchEvent(new CustomEvent('command-palette:start-pomodoro'));
      },
      keywords: ['timer', 'focus', 'study', 'pomodoro'],
    },
    {
      id: 'action-open-dashboard',
      label: 'Open Dashboard',
      type: 'action',
      action: () => {
        navigate('/');
      },
      keywords: ['home', 'progress', 'overview', 'dashboard'],
    },
    {
      id: 'action-cheat-sheets',
      label: 'All Cheat Sheets',
      type: 'action',
      action: () => {
        navigate('/cheat-sheets');
      },
      keywords: ['cheat', 'sheets', 'quick', 'reference'],
    },
  ];
}

/** Convert categories/topics from manifest into command palette items */
function topicsToItems(
  categories: Category[],
  navigate: ReturnType<typeof useNavigate>
): CommandPaletteItem[] {
  const items: CommandPaletteItem[] = [];

  for (const category of categories) {
    for (const topic of category.topics) {
      items.push({
        id: `topic-${topic.id}`,
        label: topic.title,
        type: 'topic',
        action: () => {
          navigate(`/topic/${category.id}/${topic.slug}`);
        },
        keywords: [category.name, topic.title],
      });
    }
  }

  return items;
}

/** Convert bookmarks into command palette items */
function bookmarksToItems(
  bookmarks: Bookmark[],
  navigate: ReturnType<typeof useNavigate>
): CommandPaletteItem[] {
  return bookmarks.map((bookmark) => ({
    id: `bookmark-${bookmark.id}`,
    label: bookmark.title,
    type: 'bookmark' as const,
    action: () => {
      navigate(`/topic/${bookmark.topicId}#${bookmark.sectionId}`);
    },
    keywords: [bookmark.title, 'bookmark', 'saved'],
  }));
}

export interface UseCommandPaletteOptions {
  categories?: Category[];
}

export interface UseCommandPaletteReturn extends CommandPaletteState {
  open: () => void;
  close: () => void;
  setQuery: (query: string) => void;
  selectItem: (index: number) => void;
  moveSelection: (direction: 'up' | 'down') => void;
  executeSelected: () => void;
}

export function useCommandPalette(
  options: UseCommandPaletteOptions = {}
): UseCommandPaletteReturn {
  const { categories: passedCategories } = options;
  const navigate = useNavigate();

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQueryState] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [manifestCategories, setManifestCategories] = useState<Category[]>([]);

  /** Ref to store the element that had focus before opening */
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Load categories from manifest if not passed
  useEffect(() => {
    if (passedCategories && passedCategories.length > 0) {
      setManifestCategories(passedCategories);
      return;
    }
    async function loadManifest() {
      try {
        const response = await fetch('/content-manifest.json');
        if (!response.ok) return;
        const data = await response.json();
        setManifestCategories(data.categories ?? []);
      } catch {
        // Manifest not available
      }
    }
    loadManifest();
  }, [passedCategories]);

  const categories = passedCategories && passedCategories.length > 0 ? passedCategories : manifestCategories;

  // Build the full list of items
  const allItems = useMemo(() => {
    const stored = storage.get<{ bookmarks?: Bookmark[] } | Bookmark[]>('bookmarks', { bookmarks: [] });
    const bookmarks = Array.isArray(stored) ? stored : (stored.bookmarks ?? []);
    const topicItems = topicsToItems(categories, navigate);
    const bookmarkItems = bookmarksToItems(bookmarks, navigate);
    const actionItems = createActions(navigate);
    return [...topicItems, ...bookmarkItems, ...actionItems];
  }, [categories, navigate]);

  // Filter results based on query
  const results = useMemo(() => {
    return fuzzyFilter(query, allItems, 10);
  }, [query, allItems]);

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);

  const open = useCallback(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    setIsOpen(true);
    setQueryState('');
    setSelectedIndex(0);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setQueryState('');
    setSelectedIndex(0);
    // Return focus to previously focused element
    if (previousFocusRef.current && previousFocusRef.current.focus) {
      // Use setTimeout to ensure the palette is fully unmounted first
      setTimeout(() => {
        previousFocusRef.current?.focus();
      }, 0);
    }
  }, []);

  const setQuery = useCallback((newQuery: string) => {
    setQueryState(newQuery);
  }, []);

  const selectItem = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(index, results.length - 1));
      setSelectedIndex(clamped);
    },
    [results.length]
  );

  const moveSelection = useCallback(
    (direction: 'up' | 'down') => {
      setSelectedIndex((prev) => {
        if (results.length === 0) return 0;
        if (direction === 'up') {
          return Math.max(0, prev - 1);
        } else {
          return Math.min(results.length - 1, prev + 1);
        }
      });
    },
    [results.length]
  );

  const executeSelected = useCallback(() => {
    if (results.length > 0 && selectedIndex < results.length) {
      const item = results[selectedIndex];
      item.action();
      close();
    }
  }, [results, selectedIndex, close]);

  // Global keyboard listener for Ctrl+K / Cmd+K
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Open on Ctrl+K or Cmd+K
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) {
          close();
        } else {
          open();
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, open, close]);

  return {
    isOpen,
    query,
    results,
    selectedIndex,
    open,
    close,
    setQuery,
    selectItem,
    moveSelection,
    executeSelected,
  };
}
