/**
 * CategoryPage — displays all topics in a category with completion status.
 *
 * Fetches the content manifest and finds the category matching the
 * :categorySlug route parameter. Shows each topic's title and its
 * completion status (not started, in progress, or complete).
 *
 * Renders the NotFound page when the categorySlug doesn't match any
 * category in the manifest.
 *
 * Requirements: 13.5, 13.6, 13.7
 */

import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { get } from '../utils/storage';
import { Breadcrumbs } from '../components/navigation/Breadcrumbs';
import NotFound from './NotFound';

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

/** Progress data shape from localStorage */
interface ProgressData {
  completedSections: Record<string, string[]>;
  topicProgress: Record<string, number>;
  overallProgress: number;
}

/** Completion status for a topic */
type CompletionStatus = 'not-started' | 'in-progress' | 'complete';

/** Determine the completion status of a topic based on progress data */
function getTopicCompletionStatus(
  topicId: string,
  progressData: ProgressData
): CompletionStatus {
  const sections = progressData.completedSections?.[topicId];
  if (!sections || sections.length === 0) {
    return 'not-started';
  }
  const progress = progressData.topicProgress?.[topicId] ?? 0;
  if (progress >= 100) {
    return 'complete';
  }
  return 'in-progress';
}

/** Human-readable label for completion status */
function getStatusLabel(status: CompletionStatus): string {
  switch (status) {
    case 'not-started':
      return 'Not Started';
    case 'in-progress':
      return 'In Progress';
    case 'complete':
      return 'Complete';
  }
}

/** Icon for completion status */
function getStatusIcon(status: CompletionStatus): string {
  switch (status) {
    case 'not-started':
      return '○';
    case 'in-progress':
      return '◐';
    case 'complete':
      return '✓';
  }
}

export default function CategoryPage() {
  const { categorySlug } = useParams<{ categorySlug: string }>();

  const [manifest, setManifest] = useState<ContentManifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const rawProgress = get<ProgressData>('progress', {
    completedSections: {},
    topicProgress: {},
    overallProgress: 0,
  });

  // Ensure all fields exist even if localStorage has partial data
  const progressData: ProgressData = {
    completedSections: rawProgress.completedSections ?? {},
    topicProgress: rawProgress.topicProgress ?? {},
    overallProgress: rawProgress.overallProgress ?? 0,
  };

  // Fetch content manifest
  useEffect(() => {
    let cancelled = false;

    async function loadManifest() {
      try {
        const response = await fetch('/content-manifest.json');
        if (!response.ok) {
          if (!cancelled) {
            setNotFound(true);
            setLoading(false);
          }
          return;
        }
        const data: ContentManifest = await response.json();
        if (!cancelled) {
          setManifest(data);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setNotFound(true);
          setLoading(false);
        }
      }
    }

    loadManifest();
    return () => {
      cancelled = true;
    };
  }, []);

  // Loading state
  if (loading) {
    return (
      <div className="page-category page-category--loading" role="status" aria-live="polite">
        <p>Loading category…</p>
      </div>
    );
  }

  // Find the matching category
  const category = manifest?.categories.find((c) => c.id === categorySlug);

  // Render NotFound for invalid categorySlug
  if (notFound || !category) {
    return <NotFound />;
  }

  return (
    <div className="page-category">
      <Breadcrumbs displayNames={{ [categorySlug!]: category.name }} />
      <h2 className="page-category__title">{category.name}</h2>
      <p className="page-category__count">
        {category.topics.length} {category.topics.length === 1 ? 'topic' : 'topics'}
      </p>

      <ul className="page-category__topic-list">
        {category.topics.map((topic) => {
          const topicSlugPart = topic.slug.split('/')[1] ?? topic.id;
          const status = getTopicCompletionStatus(topic.id, progressData);
          const statusLabel = getStatusLabel(status);
          const statusIcon = getStatusIcon(status);

          return (
            <li key={topic.id} className="page-category__topic-item">
              <Link
                to={`/topic/${category.id}/${topicSlugPart}`}
                className="page-category__topic-link"
              >
                <span
                  className={`page-category__status-icon page-category__status-icon--${status}`}
                  aria-hidden="true"
                >
                  {statusIcon}
                </span>
                <span className="page-category__topic-title">{topic.title}</span>
                <span className={`page-category__status-badge page-category__status-badge--${status}`}>
                  {statusLabel}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
