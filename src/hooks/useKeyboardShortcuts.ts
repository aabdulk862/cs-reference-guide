/**
 * Hook for global keyboard shortcuts.
 *
 * Shortcuts:
 * - `/` — Focus the search input
 * - `[` — Navigate to the previous topic
 * - `]` — Navigate to the next topic
 * - `b` — Toggle bookmark for the current topic
 *
 * Guard: shortcuts only fire when no <input>, <textarea>, or [contenteditable]
 * element currently has focus.
 *
 * Requirements: 20.3
 */

import { useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';

/** Flat topic entry for navigation ordering */
interface TopicEntry {
  categorySlug: string;
  topicSlug: string;
}

/** Manifest shape (minimal for navigation) */
interface ManifestCategory {
  id: string;
  name: string;
  topics: { id: string; slug: string; title: string }[];
}

interface ContentManifest {
  categories: ManifestCategory[];
}

/**
 * Returns true if the currently focused element is an input-like element
 * where keyboard shortcuts should NOT fire.
 */
export function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;

  const tagName = el.tagName.toLowerCase();
  if (tagName === 'input' || tagName === 'textarea') {
    return true;
  }

  if (el.hasAttribute('contenteditable') && el.getAttribute('contenteditable') !== 'false') {
    return true;
  }

  return false;
}

export interface UseKeyboardShortcutsOptions {
  /** Callback to toggle bookmark on the current topic */
  onBookmarkToggle?: () => void;
}

export function useKeyboardShortcuts(options: UseKeyboardShortcutsOptions = {}): void {
  const { onBookmarkToggle } = options;
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ categorySlug?: string; topicSlug?: string }>();

  // Cache the manifest topics list for prev/next navigation
  const topicsRef = useRef<TopicEntry[]>([]);
  const manifestLoadedRef = useRef(false);

  // Load the content manifest once for topic ordering
  useEffect(() => {
    if (manifestLoadedRef.current) return;

    async function loadManifest() {
      try {
        const response = await fetch('/content-manifest.json');
        if (!response.ok) return;
        const data: ContentManifest = await response.json();

        // Flatten all topics in order: category by category, topic by topic
        const flatTopics: TopicEntry[] = [];
        for (const category of data.categories) {
          for (const topic of category.topics) {
            flatTopics.push({
              categorySlug: category.id,
              topicSlug: topic.slug,
            });
          }
        }
        topicsRef.current = flatTopics;
        manifestLoadedRef.current = true;
      } catch {
        // Manifest not available — navigation shortcuts won't work
      }
    }

    loadManifest();
  }, []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Guard: do not dispatch shortcuts when an input element has focus
      if (isInputFocused()) return;

      // Don't interfere with modifier key combos (Ctrl+C, Cmd+K, etc.)
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      switch (event.key) {
        case '/': {
          event.preventDefault();
          // Focus the search input in the header
          const searchInput = document.querySelector<HTMLInputElement>('.search-input');
          if (searchInput) {
            searchInput.focus();
          }
          break;
        }

        case '[': {
          event.preventDefault();
          // Navigate to previous topic
          const currentIndex = getCurrentTopicIndex(params.categorySlug, params.topicSlug, topicsRef.current);
          if (currentIndex > 0) {
            const prev = topicsRef.current[currentIndex - 1];
            const slug = prev.topicSlug.includes('/') ? prev.topicSlug.split('/').pop()! : prev.topicSlug;
            navigate(`/topic/${prev.categorySlug}/${slug}`);
          }
          break;
        }

        case ']': {
          event.preventDefault();
          // Navigate to next topic
          const currentIdx = getCurrentTopicIndex(params.categorySlug, params.topicSlug, topicsRef.current);
          if (currentIdx >= 0 && currentIdx < topicsRef.current.length - 1) {
            const next = topicsRef.current[currentIdx + 1];
            const slug = next.topicSlug.includes('/') ? next.topicSlug.split('/').pop()! : next.topicSlug;
            navigate(`/topic/${next.categorySlug}/${slug}`);
          }
          break;
        }

        case 'b': {
          event.preventDefault();
          // Toggle bookmark for the current topic
          if (onBookmarkToggle) {
            onBookmarkToggle();
          }
          break;
        }

        default:
          break;
      }
    },
    [navigate, params.categorySlug, params.topicSlug, onBookmarkToggle, location]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);
}

/**
 * Find the index of the current topic in the flat topics list.
 * Returns -1 if not found or not on a topic page.
 */
function getCurrentTopicIndex(
  categorySlug: string | undefined,
  topicSlug: string | undefined,
  topics: TopicEntry[]
): number {
  if (!categorySlug || !topicSlug || topics.length === 0) return -1;

  return topics.findIndex(
    (t) => t.categorySlug === categorySlug && (t.topicSlug === topicSlug || t.topicSlug === `${categorySlug}/${topicSlug}`)
  );
}
