/**
 * AllCheatSheets component — lists all topic cheat sheets grouped by category
 * for rapid browsing. Includes a search/filter input to narrow results.
 *
 * Each topic card links to /topic/:categorySlug/:topicSlug?view=cheat-sheet
 * so the topic page opens directly in cheat sheet view.
 *
 * Requirements: 20.4
 */

import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';

/** Manifest types matching the content-manifest.json structure */
interface ManifestTopic {
  id: string;
  slug: string;
  title: string;
  source: 'parsed' | 'authored';
  sectionCount: number;
  wordCount: number;
  contentPath: string;
}

interface ManifestCategory {
  id: string;
  name: string;
  topics: ManifestTopic[];
}

interface ContentManifest {
  categories: ManifestCategory[];
  totalTopics: number;
  totalSections: number;
  buildTimestamp: string;
}

/** A grouped category with its filtered topics */
interface CategoryGroup {
  id: string;
  name: string;
  topics: ManifestTopic[];
}

/**
 * AllCheatSheets renders a searchable, category-grouped list of all topic
 * cheat sheets. Each card links to the topic page with view=cheat-sheet.
 */
export function AllCheatSheets() {
  const [manifest, setManifest] = useState<ContentManifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch content manifest on mount
  useEffect(() => {
    async function loadManifest() {
      try {
        const response = await fetch('/content-manifest.json');
        if (!response.ok) {
          throw new Error(`Failed to load content manifest: ${response.status}`);
        }
        const data: ContentManifest = await response.json();
        setManifest(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load cheat sheets');
      } finally {
        setLoading(false);
      }
    }
    loadManifest();
  }, []);

  // Filter and group topics by category based on search query
  const categoryGroups: CategoryGroup[] = useMemo(() => {
    if (!manifest) return [];

    const query = searchQuery.trim().toLowerCase();

    return manifest.categories
      .map((category) => {
        const filteredTopics = query
          ? category.topics.filter(
              (topic) =>
                topic.title.toLowerCase().includes(query) ||
                category.name.toLowerCase().includes(query)
            )
          : category.topics;

        return {
          id: category.id,
          name: category.name,
          topics: filteredTopics,
        };
      })
      .filter((group) => group.topics.length > 0);
  }, [manifest, searchQuery]);

  // Total count of visible topics
  const visibleTopicCount = useMemo(
    () => categoryGroups.reduce((sum, group) => sum + group.topics.length, 0),
    [categoryGroups]
  );

  if (loading) {
    return (
      <div className="all-cheat-sheets" aria-busy="true">
        <p className="all-cheat-sheets__loading">Loading cheat sheets...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="all-cheat-sheets">
        <p className="all-cheat-sheets__error" role="alert">
          {error}
        </p>
      </div>
    );
  }

  return (
    <div className="all-cheat-sheets">
      <header className="all-cheat-sheets__header">
        <h2 className="all-cheat-sheets__title">All Cheat Sheets</h2>
        <p className="all-cheat-sheets__subtitle">
          Quick-reference summaries for every topic — 500 words or less.
        </p>
      </header>

      {/* Search/filter input */}
      <div className="all-cheat-sheets__search">
        <label htmlFor="cheat-sheet-search" className="all-cheat-sheets__search-label">
          Filter cheat sheets
        </label>
        <input
          id="cheat-sheet-search"
          type="search"
          className="all-cheat-sheets__search-input"
          placeholder="Search topics..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="Filter cheat sheets by topic or category name"
        />
        <span className="all-cheat-sheets__result-count" aria-live="polite">
          {visibleTopicCount} {visibleTopicCount === 1 ? 'topic' : 'topics'} found
        </span>
      </div>

      {/* Category groups */}
      {categoryGroups.length === 0 ? (
        <p className="all-cheat-sheets__empty" role="status">
          No cheat sheets match your search. Try a different keyword.
        </p>
      ) : (
        <div className="all-cheat-sheets__groups">
          {categoryGroups.map((group) => (
            <section
              key={group.id}
              className="all-cheat-sheets__category"
              aria-labelledby={`category-heading-${group.id}`}
            >
              <h3
                id={`category-heading-${group.id}`}
                className="all-cheat-sheets__category-heading"
              >
                {group.name}
                <span className="all-cheat-sheets__category-count">
                  ({group.topics.length})
                </span>
              </h3>

              <div className="all-cheat-sheets__grid">
                {group.topics.map((topic) => {
                  const topicSlugPart = topic.slug.split('/')[1] ?? topic.slug;
                  return (
                    <Link
                      key={topic.id}
                      to={`/topic/${group.id}/${topicSlugPart}?view=cheat-sheet`}
                      className="all-cheat-sheets__card"
                    >
                      <span className="all-cheat-sheets__card-title">
                        {topic.title}
                      </span>
                      <span className="all-cheat-sheets__card-meta">
                        <span className="all-cheat-sheets__card-category">
                          {group.name}
                        </span>
                        <span className="all-cheat-sheets__card-words">
                          {topic.wordCount > 500 ? '≤500' : topic.wordCount} words
                        </span>
                      </span>
                      <span className="all-cheat-sheets__card-summary">
                        {topic.sectionCount} {topic.sectionCount === 1 ? 'section' : 'sections'}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
