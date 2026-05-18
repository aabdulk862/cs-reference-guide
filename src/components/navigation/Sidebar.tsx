import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { get, set } from '../../utils/storage';
import { SkeletonSidebar } from '../layout/Skeleton';
import type { ManifestCategory, ContentManifest } from '../../types/manifest';

/** localStorage key for persisting expanded categories */
const NAV_STATE_KEY = 'nav-state';

/** Category groups for sidebar organization */
const CATEGORY_GROUPS: { label: string; icon: string; categoryIds: string[] }[] = [
  { label: 'Fundamentals', icon: '🧠', categoryIds: ['data-structures-algorithms', 'operating-systems', 'networking'] },
  { label: 'Server-Side', icon: '⚙️', categoryIds: ['backend', 'databases'] },
  { label: 'Client-Side', icon: '🎨', categoryIds: ['frontend'] },
  { label: 'Architecture', icon: '🏗️', categoryIds: ['system-design', 'software-engineering', 'security'] },
  { label: 'Infrastructure', icon: '🚀', categoryIds: ['infrastructure', 'git'] },
  { label: 'Quality', icon: '✅', categoryIds: ['testing'] },
  { label: 'Interview', icon: '🎯', categoryIds: ['interview-prep'] },
];

interface NavState {
  expandedCategories: string[];
  expandedTopics: string[];
}

/**
 * Sidebar navigation component.
 * Renders the category tree from content-manifest.json with collapsible
 * categories, visited/unvisited indicators, and persisted expansion state.
 *
 * Requirements: 2.1, 2.6
 */
export function SidebarNavigation() {
  const [manifest, setManifest] = useState<ContentManifest | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Track whether initial state has been loaded from localStorage
  const initialLoadDone = useRef(false);

  const { categorySlug, topicSlug, subtopicSlug } = useParams<{
    categorySlug: string;
    topicSlug: string;
    subtopicSlug: string;
  }>();

  // Load content manifest on mount
  useEffect(() => {
    async function loadManifest() {
      try {
        const response = await fetch('/content-manifest.json');
        if (!response.ok) {
          throw new Error(`Failed to load manifest: ${response.status}`);
        }
        const data: ContentManifest = await response.json();
        setManifest(data);
      } catch (err) {
        // If manifest doesn't exist yet (dev mode), show empty state
        setError(err instanceof Error ? err.message : 'Failed to load navigation');
      }
    }
    loadManifest();
  }, []);

  // Load persisted nav state (expanded categories and topics) from localStorage.
  // If localStorage is unavailable (handled by storage utility's in-memory fallback),
  // defaults to all collapsed — the auto-expand effect below will open the active subtopic's parent.
  useEffect(() => {
    const navState = get<NavState>(NAV_STATE_KEY, { expandedCategories: [], expandedTopics: [] });
    setExpandedCategories(new Set(navState.expandedCategories));
    setExpandedTopics(new Set(navState.expandedTopics ?? []));
    initialLoadDone.current = true;
  }, []);

  // Auto-expand parent topic and category when a subtopic route is active.
  // This ensures that navigating directly to a subtopic URL (e.g., via bookmark)
  // reveals the subtopic in the sidebar without requiring manual expansion.
  // Also handles localStorage unavailable: defaults to collapsed except active subtopic's parent.
  useEffect(() => {
    if (subtopicSlug && categorySlug && topicSlug) {
      const topicKey = `${categorySlug}/${topicSlug}`;

      setExpandedCategories((prev) => {
        if (prev.has(categorySlug)) return prev;
        const next = new Set(prev);
        next.add(categorySlug);
        return next;
      });

      setExpandedTopics((prev) => {
        if (prev.has(topicKey)) return prev;
        const next = new Set(prev);
        next.add(topicKey);
        return next;
      });
    }
  }, [subtopicSlug, categorySlug, topicSlug]);

  // Persist expanded state (categories + topics) to localStorage
  const persistExpandedState = useCallback((categories: Set<string>, topics: Set<string>) => {
    const navState: NavState = {
      expandedCategories: Array.from(categories),
      expandedTopics: Array.from(topics),
    };
    set(NAV_STATE_KEY, navState);
  }, []);

  // Persist expansion state whenever it changes due to auto-expand or manual toggle.
  // Skips the initial render to avoid overwriting localStorage with empty state.
  const isFirstPersist = useRef(true);
  useEffect(() => {
    if (isFirstPersist.current) {
      isFirstPersist.current = false;
      return;
    }
    if (initialLoadDone.current) {
      persistExpandedState(expandedCategories, expandedTopics);
    }
  }, [expandedCategories, expandedTopics, persistExpandedState]);

  const toggleCategory = useCallback((categoryId: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  }, []);

  const toggleTopic = useCallback((topicKey: string) => {
    setExpandedTopics((prev) => {
      const next = new Set(prev);
      if (next.has(topicKey)) {
        next.delete(topicKey);
      } else {
        next.add(topicKey);
      }
      return next;
    });
  }, []);

  const handleCategoryKeyDown = useCallback(
    (e: React.KeyboardEvent, categoryId: string) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleCategory(categoryId);
      }
    },
    [toggleCategory]
  );

  const handleTopicKeyDown = useCallback(
    (e: React.KeyboardEvent, topicKey: string) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleTopic(topicKey);
      }
    },
    [toggleTopic]
  );

  if (error && !manifest) {
    return (
      <nav className="sidebar-nav" aria-label="Topic navigation">
        <p className="sidebar-empty">No content available yet.</p>
      </nav>
    );
  }

  if (!manifest) {
    return (
      <nav className="sidebar-nav" aria-label="Topic navigation">
        <SkeletonSidebar />
      </nav>
    );
  }

  return (
    <nav className="sidebar-nav" aria-label="Topic navigation">
      <div className="sidebar-quick-links">
        <Link to="/cheat-sheets" className="sidebar-quick-link">
          📋 All Cheat Sheets
        </Link>
      </div>
      <ul className="sidebar-category-list" role="tree">
        {CATEGORY_GROUPS.map((group) => {
          const groupCategories = group.categoryIds
            .map((id) => manifest.categories.find((c) => c.id === id))
            .filter((c): c is ManifestCategory => c !== undefined);

          if (groupCategories.length === 0) return null;

          return (
            <li key={group.label} className="sidebar-group" role="none">
              <span className="sidebar-group__label">
                <span className="sidebar-group__icon" aria-hidden="true">{group.icon}</span>
                {group.label}
              </span>
              <ul className="sidebar-group__categories" role="group">
                {groupCategories.map((category) => {
          const isExpanded = expandedCategories.has(category.id);
          return (
            <li
              key={category.id}
              className={`sidebar-category${categorySlug === category.id ? ' sidebar-category--has-active' : ''}`}
              role="treeitem"
              aria-expanded={isExpanded}
            >
              <button
                className="sidebar-category-toggle"
                onClick={() => toggleCategory(category.id)}
                onKeyDown={(e) => handleCategoryKeyDown(e, category.id)}
                aria-expanded={isExpanded}
                aria-controls={`category-topics-${category.id}`}
                type="button"
              >
                <span
                  className={`sidebar-category-chevron ${isExpanded ? 'expanded' : ''}`}
                  aria-hidden="true"
                >
                  ▶
                </span>
                <span className="sidebar-category-name">{category.name}</span>
                <span className="sidebar-category-count" aria-label={`${category.topics.length} topics`}>
                  {category.topics.length}
                </span>
              </button>

              {isExpanded && (
                <ul
                  className="sidebar-topic-list"
                  id={`category-topics-${category.id}`}
                  role="group"
                >
                  {category.topics.map((topic) => {
                    const topicSlugPart = topic.slug.split('/')[1] ?? topic.id;
                    const isMultiPage = topic.subtopics && topic.subtopics.length > 0;
                    const topicKey = `${category.id}/${topicSlugPart}`;
                    const isTopicExpanded = expandedTopics.has(topicKey);
                    const isActive =
                      categorySlug === category.id && topicSlug === topicSlugPart && !subtopicSlug;

                    if (isMultiPage) {
                      const isTopicActive = categorySlug === category.id && topicSlug === topicSlugPart;
                      return (
                        <li key={topic.id} className={`sidebar-topic${isTopicActive ? ' sidebar-topic--has-active' : ''}`} role="treeitem" aria-expanded={isTopicExpanded}>
                          <button
                            className={`sidebar-topic-toggle ${isActive ? 'active' : ''}`}
                            onClick={() => toggleTopic(topicKey)}
                            onKeyDown={(e) => handleTopicKeyDown(e, topicKey)}
                            aria-expanded={isTopicExpanded}
                            aria-controls={`topic-subtopics-${topic.id}`}
                            type="button"
                          >
                            <span
                              className={`sidebar-topic-chevron ${isTopicExpanded ? 'expanded' : ''}`}
                              aria-hidden="true"
                            >
                              ▶
                            </span>
                            <span className="sidebar-topic-title">{topic.title}</span>
                          </button>

                          {isTopicExpanded && (
                            <ul
                              className="sidebar-subtopic-list"
                              id={`topic-subtopics-${topic.id}`}
                              role="group"
                            >
                              {topic.subtopics!.map((subtopic) => {
                                const isSubtopicActive =
                                  categorySlug === category.id &&
                                  topicSlug === topicSlugPart &&
                                  subtopicSlug === subtopic.slug;

                                return (
                                  <li key={subtopic.id} className="sidebar-subtopic" role="treeitem">
                                    <Link
                                      to={`/topic/${category.id}/${topicSlugPart}/${subtopic.slug}`}
                                      className={`sidebar-subtopic-link ${isSubtopicActive ? 'active' : ''}`}
                                      aria-current={isSubtopicActive ? 'page' : undefined}
                                    >
                                      <span className="sidebar-subtopic-title">{subtopic.title}</span>
                                    </Link>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </li>
                      );
                    }

                    return (
                      <li key={topic.id} className="sidebar-topic" role="treeitem">
                        <Link
                          to={`/topic/${category.id}/${topicSlugPart}`}
                          className={`sidebar-topic-link ${isActive ? 'active' : ''}`}
                          aria-current={isActive ? 'page' : undefined}
                        >
                          <span className="sidebar-topic-title">{topic.title}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
                })}
              </ul>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
