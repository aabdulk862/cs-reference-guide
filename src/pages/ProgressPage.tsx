/**
 * Progress page — displays per-category completion based on manual topic completion.
 * Reads from the `completed-topics` localStorage key (set by the "Mark as complete" button).
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { get } from '@/utils/storage';
import type { ContentManifest } from '@/types/manifest';

interface CategoryProgress {
  id: string;
  name: string;
  completedTopics: number;
  totalTopics: number;
  percentage: number;
  topics: { slug: string; title: string; completed: boolean }[];
}

export default function ProgressPage() {
  const [categoryProgress, setCategoryProgress] = useState<CategoryProgress[]>([]);
  const [overallCompleted, setOverallCompleted] = useState(0);
  const [overallTotal, setOverallTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const response = await fetch('/content-manifest.json');
        if (!response.ok) return;
        const manifest: ContentManifest = await response.json();

        const completedSet = new Set(get<string[]>('completed-topics', []));

        const progress: CategoryProgress[] = manifest.categories.map((category) => {
          const topics = category.topics.map((topic) => {
            const topicSlugPart = topic.slug.split('/')[1] ?? topic.id;
            const completionId = `${category.id}/${topicSlugPart}`;
            const isCompleted = completedSet.has(completionId);
            return {
              slug: topicSlugPart,
              title: topic.title,
              completed: isCompleted,
            };
          });

          const completedTopics = topics.filter((t) => t.completed).length;
          const totalTopics = topics.length;
          const percentage = totalTopics > 0
            ? Math.round((completedTopics / totalTopics) * 100)
            : 0;

          return {
            id: category.id,
            name: category.name,
            completedTopics,
            totalTopics,
            percentage,
            topics,
          };
        });

        setCategoryProgress(progress);
        setOverallCompleted(progress.reduce((sum, c) => sum + c.completedTopics, 0));
        setOverallTotal(progress.reduce((sum, c) => sum + c.totalTopics, 0));
      } catch {
        // Manifest not available
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const overallPercentage = overallTotal > 0
    ? Math.round((overallCompleted / overallTotal) * 100)
    : 0;

  if (loading) {
    return (
      <div className="page-progress">
        <p>Loading progress…</p>
      </div>
    );
  }

  return (
    <div className="page-progress">
      <header className="progress-header">
        <h1>Progress</h1>
        <p className="progress-header__subtitle">
          {overallCompleted} of {overallTotal} topics completed
        </p>
      </header>

      {/* Overall progress bar */}
      <section className="progress-overall">
        <div className="progress-overall__stats">
          <span className="progress-overall__percentage">{overallPercentage}%</span>
        </div>
        <div
          className="progress-bar"
          role="progressbar"
          aria-valuenow={overallPercentage}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Overall progress"
        >
          <div className="progress-bar__fill" style={{ width: `${overallPercentage}%` }} />
        </div>
      </section>

      {/* Per-category cards */}
      <section className="progress-categories">
        {categoryProgress.map((category) => (
          <div key={category.id} className="progress-category-card">
            <div className="progress-category-card__header">
              <h2 className="progress-category-card__name">{category.name}</h2>
              <span className="progress-category-card__stats">
                {category.completedTopics}/{category.totalTopics}
              </span>
            </div>
            <div
              className="progress-bar progress-bar--sm"
              role="progressbar"
              aria-valuenow={category.percentage}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${category.name} progress`}
            >
              <div className="progress-bar__fill" style={{ width: `${category.percentage}%` }} />
            </div>
            <ul className="progress-category-card__topics">
              {category.topics.map((topic) => (
                <li
                  key={topic.slug}
                  className={`progress-topic ${topic.completed ? 'progress-topic--completed' : ''}`}
                >
                  <Link to={`/topic/${category.id}/${topic.slug}`} className="progress-topic__link">
                    <span className="progress-topic__status">
                      {topic.completed ? '✓' : '○'}
                    </span>
                    <span className="progress-topic__title">{topic.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
