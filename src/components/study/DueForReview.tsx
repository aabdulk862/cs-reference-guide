/**
 * DueForReview component displays topics that are due for spaced repetition review.
 *
 * Loads spaced repetition state from localStorage (csguide:spaced-rep),
 * filters schedules where nextReviewDate <= today, sorts by most overdue first
 * (currentDate - nextReviewDate descending), and displays up to 20 items
 * with topic name and days since last review.
 *
 * Requirements: 9.2
 */

import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useSpacedRepetition, type DueTopic } from '@/hooks/useSpacedRepetition';

/** Manifest types for resolving topic IDs to display names */
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

/** Resolved due topic with display name and link path */
interface ResolvedDueTopic extends DueTopic {
  title: string;
  linkPath: string;
}

/**
 * DueForReview displays a list of topics that are due for spaced repetition review.
 * Topics are sorted by most overdue first, limited to 20 items.
 */
export function DueForReview() {
  const { getDueTopics } = useSpacedRepetition();
  const [topicMap, setTopicMap] = useState<Map<string, { title: string; categoryId: string; slug: string }>>(new Map());
  const [manifestLoaded, setManifestLoaded] = useState(false);

  // Load content manifest to resolve topic IDs to names
  useEffect(() => {
    async function loadManifest() {
      try {
        const response = await fetch('/content-manifest.json');
        if (!response.ok) {
          setManifestLoaded(true);
          return;
        }
        const data: ContentManifest = await response.json();
        const map = new Map<string, { title: string; categoryId: string; slug: string }>();
        for (const category of data.categories) {
          for (const topic of category.topics) {
            map.set(topic.id, {
              title: topic.title,
              categoryId: category.id,
              slug: topic.slug,
            });
          }
        }
        setTopicMap(map);
      } catch {
        // Manifest not available — use topic IDs as fallback names
      } finally {
        setManifestLoaded(true);
      }
    }
    loadManifest();
  }, []);

  const dueTopics = getDueTopics();

  // Resolve topic names and link paths
  const resolvedTopics: ResolvedDueTopic[] = useMemo(() => {
    return dueTopics.map((dueTopic) => {
      const info = topicMap.get(dueTopic.topicId);
      const title = info?.title ?? dueTopic.topicId;
      const linkPath = info
        ? `/topic/${info.categoryId}/${info.slug}`
        : `/topic/${dueTopic.topicId}`;

      return {
        ...dueTopic,
        title,
        linkPath,
      };
    });
  }, [dueTopics, topicMap]);

  if (!manifestLoaded) {
    return (
      <div className="due-for-review" role="region" aria-label="Due for review">
        <h2 className="due-for-review__heading">Due for Review</h2>
        <p className="due-for-review__loading">Loading...</p>
      </div>
    );
  }

  if (resolvedTopics.length === 0) {
    return (
      <div className="due-for-review" role="region" aria-label="Due for review">
        <h2 className="due-for-review__heading">Due for Review</h2>
        <p className="due-for-review__empty">No topics due for review</p>
      </div>
    );
  }

  return (
    <div className="due-for-review" role="region" aria-label="Due for review">
      <h2 className="due-for-review__heading">Due for Review</h2>
      <ul className="due-for-review__list" aria-label="Topics due for review">
        {resolvedTopics.map((topic) => (
          <li key={topic.topicId} className="due-for-review__item">
            <div className="due-for-review__info">
              <Link
                to={topic.linkPath}
                className="due-for-review__topic-link"
              >
                {topic.title}
              </Link>
              <span className="due-for-review__days">
                {topic.daysSinceLastReview === 1
                  ? '1 day since last review'
                  : `${topic.daysSinceLastReview} days since last review`}
              </span>
            </div>
            <div className="due-for-review__actions">
              <Link
                to={topic.linkPath}
                className="due-for-review__review-btn"
                aria-label={`Review ${topic.title}`}
              >
                Review
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default DueForReview;
