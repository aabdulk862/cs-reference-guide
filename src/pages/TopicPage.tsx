/**
 * TopicPage — Composes the full topic view.
 *
 * Supports three rendering modes:
 * 1. Subtopic view: when subtopicSlug is present, fetches and renders subtopic content
 * 2. Multi-page overview: when topic has subtopics, renders index content + subtopic links
 * 3. Single-file topic: existing behavior for topics without subtopics
 *
 * Completion is manual — a "Mark as complete" button at the bottom of each page.
 *
 * Requirements: 3.3, 3.4, 3.5, 3.6, 3.7
 */

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { SubtopicView } from '../components/content/SubtopicView';
import { MultiPageOverview } from '../components/content/MultiPageOverview';
import { SingleFileView } from '../components/content/SingleFileView';
import { useDocumentMeta } from '../hooks/useDocumentMeta';
import type { ContentView } from '../utils/content-views';
import { get, set } from '../utils/storage';
import { useDailyGoal } from '../hooks/useDailyGoal';
import type { ContentSection } from '../types/content';
import type { ManifestTopic, ContentManifest } from '../types/manifest';

/** Shape of the topic JSON loaded at runtime */
interface TopicData {
  id: string;
  slug: string;
  title: string;
  category: string;
  sections: ContentSection[];
}

/** Storage key for manual completion state */
const COMPLETED_KEY = 'completed-topics';

/** Get the set of completed topic/subtopic IDs */
function getCompletedTopics(): Set<string> {
  const completed = get<string[]>(COMPLETED_KEY, []);
  return new Set(completed);
}

/** Toggle completion for a topic/subtopic ID */
function toggleCompletion(topicId: string): boolean {
  const completed = get<string[]>(COMPLETED_KEY, []);
  const completedSet = new Set(completed);
  if (completedSet.has(topicId)) {
    completedSet.delete(topicId);
    set(COMPLETED_KEY, Array.from(completedSet));
    return false;
  } else {
    completedSet.add(topicId);
    set(COMPLETED_KEY, Array.from(completedSet));
    return true;
  }
}

function findTopicInManifest(
  manifest: ContentManifest,
  categorySlug: string,
  topicSlug: string
): ManifestTopic | undefined {
  const category = manifest.categories.find((c) => c.id === categorySlug);
  if (!category) return undefined;
  return category.topics.find((t) => {
    const slugPart = t.slug.split('/')[1] ?? t.id;
    return slugPart === topicSlug;
  });
}

export default function TopicPage() {
  const { categorySlug, topicSlug, subtopicSlug } = useParams<{
    categorySlug: string;
    topicSlug: string;
    subtopicSlug: string;
  }>();

  const [topicData, setTopicData] = useState<TopicData | null>(null);
  const [manifest, setManifest] = useState<ContentManifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [subtopicNotFound, setSubtopicNotFound] = useState(false);
  const [activeView, setActiveView] = useState<ContentView>('full');
  const [isCompleted, setIsCompleted] = useState(false);

  // Daily goal: track time spent on page
  const { addMinutes } = useDailyGoal();
  const pageEntryTime = useRef<number>(Date.now());

  useEffect(() => {
    pageEntryTime.current = Date.now();
    return () => {
      const elapsed = Math.floor((Date.now() - pageEntryTime.current) / 60000);
      if (elapsed >= 1) {
        addMinutes(elapsed);
      }
    };
  }, [categorySlug, topicSlug, subtopicSlug, addMinutes]);

  // Fetch manifest on mount
  useEffect(() => {
    let cancelled = false;
    async function loadManifest() {
      try {
        const response = await fetch('/content-manifest.json');
        if (!response.ok) return;
        const data: ContentManifest = await response.json();
        if (!cancelled) setManifest(data);
      } catch { /* Manifest not available */ }
    }
    loadManifest();
    return () => { cancelled = true; };
  }, []);

  // Fetch topic/subtopic content JSON
  useEffect(() => {
    if (!categorySlug || !topicSlug) {
      setError('Invalid topic path.');
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setNotFound(false);
    setSubtopicNotFound(false);

    const contentPath = subtopicSlug
      ? `/content/${categorySlug}/${topicSlug}/${subtopicSlug}.json`
      : `/content/${categorySlug}/${topicSlug}.json`;

    fetch(contentPath)
      .then((response) => {
        if (!response.ok) {
          if (response.status === 404) {
            throw new Error(subtopicSlug ? 'SUBTOPIC_NOT_FOUND' : 'TOPIC_NOT_FOUND');
          }
          throw new Error(`Failed to load topic: ${response.status}`);
        }
        return response.json();
      })
      .then((data: TopicData) => {
        if (!cancelled) {
          setTopicData(data);
          // Check completion state
          const completionId = subtopicSlug
            ? `${categorySlug}/${topicSlug}/${subtopicSlug}`
            : `${categorySlug}/${topicSlug}`;
          setIsCompleted(getCompletedTopics().has(completionId));
          setLoading(false);

          // Track recently studied topics
          const recentKey = 'recent-topics';
          const recent = get<Array<{ topicId: string; title: string; categorySlug: string; topicSlug: string; timestamp: number }>>(recentKey, []);
          const topicIdForRecent = subtopicSlug
            ? `${categorySlug}/${topicSlug}/${subtopicSlug}`
            : `${categorySlug}/${topicSlug}`;
          const filtered = recent.filter((r) => r.topicId !== topicIdForRecent);
          filtered.unshift({
            topicId: topicIdForRecent,
            title: data.title,
            categorySlug: categorySlug!,
            topicSlug: subtopicSlug ? `${topicSlug}/${subtopicSlug}` : topicSlug!,
            timestamp: Date.now(),
          });
          set(recentKey, filtered.slice(0, 10));
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          if (err.message === 'TOPIC_NOT_FOUND') setNotFound(true);
          else if (err.message === 'SUBTOPIC_NOT_FOUND') setSubtopicNotFound(true);
          else setError(err.message);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [categorySlug, topicSlug, subtopicSlug]);

  const handleViewChange = useCallback((view: ContentView) => {
    setActiveView(view);
  }, []);

  const handleToggleComplete = useCallback(() => {
    const completionId = subtopicSlug
      ? `${categorySlug}/${topicSlug}/${subtopicSlug}`
      : `${categorySlug}/${topicSlug}`;
    const newState = toggleCompletion(completionId);
    setIsCompleted(newState);
  }, [categorySlug, topicSlug, subtopicSlug]);

  const manifestTopic = useMemo(() => {
    if (!manifest || !categorySlug || !topicSlug) return undefined;
    return findTopicInManifest(manifest, categorySlug, topicSlug);
  }, [manifest, categorySlug, topicSlug]);

  const hasSubtopics = useMemo(() => {
    return manifestTopic?.subtopics && manifestTopic.subtopics.length > 0;
  }, [manifestTopic]);

  const firstSectionSummary = useMemo(() => {
    if (!topicData || !topicData.sections.length) return '';
    const firstSection = topicData.sections[0];
    for (const node of firstSection.content) {
      if (node.type === 'paragraph' && node.text.trim().length > 0) {
        return node.text.trim();
      }
    }
    return firstSection.heading || '';
  }, [topicData]);

  useDocumentMeta({
    title: topicData?.title ?? 'CS Reference Guide',
    description: firstSectionSummary,
  });

  if (loading) {
    return (
      <div className="page-topic page-topic--loading" data-category={categorySlug} role="status" aria-live="polite">
        <p>Loading topic content…</p>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="page-topic page-topic--error" data-category={categorySlug} role="alert">
        <h2>Topic not found</h2>
        <p>The topic you're looking for doesn't exist.</p>
        <Link to="/">Return to Dashboard</Link>
      </div>
    );
  }

  if (subtopicNotFound) {
    const isSingleFileTopic = manifest && manifestTopic && !hasSubtopics;
    return (
      <div className="page-topic page-topic--error" data-category={categorySlug} role="alert">
        <h2>{isSingleFileTopic ? 'Page not found' : 'Subtopic not found'}</h2>
        <p>
          {isSingleFileTopic
            ? 'This topic does not have subtopics.'
            : "The subtopic you're looking for doesn't exist within this topic."}
        </p>
        <Link to={`/topic/${categorySlug}/${topicSlug}`}>
          {isSingleFileTopic ? 'View topic' : 'Back to topic overview'}
        </Link>
      </div>
    );
  }

  if (error || !topicData) {
    return (
      <div className="page-topic page-topic--error" data-category={categorySlug} role="alert">
        <h2>Unable to load topic</h2>
        <p>{error ?? 'Topic data is unavailable.'}</p>
      </div>
    );
  }

  const breadcrumbDisplayNames: Record<string, string> = {};
  if (topicSlug) {
    breadcrumbDisplayNames[topicSlug] = manifestTopic?.title ?? topicData.title;
  }
  if (subtopicSlug && topicData) {
    breadcrumbDisplayNames[subtopicSlug] = topicData.title;
  }

  if (subtopicSlug) {
    return (
      <SubtopicView
        topicData={topicData}
        categorySlug={categorySlug!}
        topicSlug={topicSlug!}
        subtopicSlug={subtopicSlug}
        subtopics={manifestTopic?.subtopics ?? []}
        breadcrumbDisplayNames={breadcrumbDisplayNames}
        activeView={activeView}
        onViewChange={handleViewChange}
        isCompleted={isCompleted}
        onToggleComplete={handleToggleComplete}
      />
    );
  }

  if (hasSubtopics && manifestTopic?.subtopics) {
    return (
      <MultiPageOverview
        topicData={topicData}
        subtopics={manifestTopic.subtopics}
        categorySlug={categorySlug!}
        topicSlug={topicSlug!}
        breadcrumbDisplayNames={breadcrumbDisplayNames}
        activeView={activeView}
        onViewChange={handleViewChange}
        isCompleted={isCompleted}
        onToggleComplete={handleToggleComplete}
      />
    );
  }

  return (
    <SingleFileView
      topicData={topicData}
      categorySlug={categorySlug!}
      breadcrumbDisplayNames={breadcrumbDisplayNames}
      activeView={activeView}
      onViewChange={handleViewChange}
      isCompleted={isCompleted}
      onToggleComplete={handleToggleComplete}
    />
  );
}
