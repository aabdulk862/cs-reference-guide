/**
 * React hook for managing bookmarks.
 *
 * Provides toggle, query, and list functionality for bookmarks.
 * Persists bookmark state to localStorage under the key "csguide:bookmarks".
 *
 * Requirements: 6.3, 6.4, 6.5
 */

import { useState, useCallback, useEffect } from 'react';
import * as storage from '@/utils/storage';
import type { Bookmark, BookmarkState } from '@/types/study';

const STORAGE_KEY = 'bookmarks';

const DEFAULT_STATE: BookmarkState = { bookmarks: [] };

interface UseBookmarksReturn {
  /** All bookmarks */
  bookmarks: Bookmark[];
  /** Toggle a bookmark: add if not present, remove if present */
  toggleBookmark: (topicId: string, sectionId: string, title: string) => void;
  /** Check if a specific section is bookmarked */
  isBookmarked: (topicId: string, sectionId: string) => boolean;
  /** Get all bookmarks */
  getBookmarks: () => Bookmark[];
}

/**
 * Generate a unique ID for a bookmark based on topicId and sectionId.
 */
function generateBookmarkId(topicId: string, sectionId: string): string {
  return `${topicId}::${sectionId}`;
}

/**
 * Hook that manages bookmark state with localStorage persistence.
 */
export function useBookmarks(): UseBookmarksReturn {
  const [state, setState] = useState<BookmarkState>(() => {
    return storage.get<BookmarkState>(STORAGE_KEY, DEFAULT_STATE);
  });

  // Persist to localStorage whenever state changes
  useEffect(() => {
    storage.set(STORAGE_KEY, state);
  }, [state]);

  const toggleBookmark = useCallback((topicId: string, sectionId: string, title: string) => {
    setState((prev) => {
      const id = generateBookmarkId(topicId, sectionId);
      const existingIndex = prev.bookmarks.findIndex((b) => b.id === id);

      if (existingIndex >= 0) {
        // Remove the bookmark
        const updated = prev.bookmarks.filter((_, i) => i !== existingIndex);
        return { bookmarks: updated };
      } else {
        // Add the bookmark
        const newBookmark: Bookmark = {
          id,
          topicId,
          sectionId,
          title,
          createdAt: new Date().toISOString(),
        };
        return { bookmarks: [...prev.bookmarks, newBookmark] };
      }
    });
  }, []);

  const isBookmarked = useCallback((topicId: string, sectionId: string): boolean => {
    const id = generateBookmarkId(topicId, sectionId);
    return state.bookmarks.some((b) => b.id === id);
  }, [state.bookmarks]);

  const getBookmarks = useCallback((): Bookmark[] => {
    return state.bookmarks;
  }, [state.bookmarks]);

  return {
    bookmarks: state.bookmarks,
    toggleBookmark,
    isBookmarked,
    getBookmarks,
  };
}
