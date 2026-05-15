/**
 * Progress page — displays per-category completion bars.
 * Completion is calculated as topics with at least one section marked complete
 * divided by total topics per category.
 *
 * Requirements: 13.1, 13.7
 */

import { useState, useEffect } from 'react';
import { useProgress } from '@/hooks/useProgress';

/** Manifest types for progress calculation */
interface ManifestTopic {
  id: string;
  slug: string;
  title: string;
}

interface ManifestCategory {
  id: string;
  name: string;
  topics: ManifestTopic[];
}

interface ContentManifest {
  categories: ManifestCategory[];
  totalTopics: number;
}

/** Per-category progress data for rendering */
interface CategoryProgress {
  id: string;
  name: string;
  completedTopics: number;
  totalTopics: number;
  percentage: number;
}

export default function ProgressPage() {
  const { progressData } = useProgress();
  const [categoryProgress, setCategoryProgress] = useState<CategoryProgress[]>([]);
  const [overallCompleted, setOverallCompleted] = useState(0);
  const [overallTotal, setOverallTotal] = useState(0);

  useEffect(() => {
    async function loadManifest() {
      try {
        const response = await fetch('/content-manifest.json');
        if (!response.ok) return;
        const manifest: ContentManifest = await response.json();

        const progress: CategoryProgress[] = manifest.categories.map((category) => {
          const completedTopics = category.topics.filter((topic) => {
            const sections = progressData.completedSections[topic.id];
            return sections && sections.length > 0;
          }).length;

          const totalTopics = category.topics.length;
          const percentage = totalTopics > 0
            ? Math.round((completedTopics / totalTopics) * 100)
            : 0;

          return {
            id: category.id,
            name: category.name,
            completedTopics,
            totalTopics,
            percentage,
          };
        });

        setCategoryProgress(progress);

        const totalCompleted = progress.reduce((sum, c) => sum + c.completedTopics, 0);
        const total = progress.reduce((sum, c) => sum + c.totalTopics, 0);
        setOverallCompleted(totalCompleted);
        setOverallTotal(total);
      } catch {
        // Manifest not available — leave at defaults
      }
    }

    loadManifest();
  }, [progressData.completedSections]);

  const overallPercentage = overallTotal > 0
    ? Math.round((overallCompleted / overallTotal) * 100)
    : 0;

  return (
    <div className="page-progress">
      <h2>Progress</h2>

      {/* Overall summary */}
      <section className="progress-summary" aria-labelledby="progress-summary-heading">
        <h3 id="progress-summary-heading">Overall</h3>
        <div className="progress-summary__stats">
          <span className="progress-summary__completed">
            {overallCompleted} / {overallTotal} topics started
          </span>
          <span className="progress-summary__percentage">{overallPercentage}%</span>
        </div>
        <div
          className="progress-bar"
          role="progressbar"
          aria-valuenow={overallPercentage}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Overall progress"
        >
          <div
            className="progress-bar__fill"
            style={{ width: `${overallPercentage}%` }}
          />
        </div>
      </section>

      {/* Per-category completion bars */}
      <section className="progress-categories" aria-labelledby="progress-categories-heading">
        <h3 id="progress-categories-heading">By Category</h3>
        {categoryProgress.length === 0 ? (
          <p className="progress-categories__empty">
            No categories found. Build the content manifest to see progress.
          </p>
        ) : (
          <ul className="progress-categories__list">
            {categoryProgress.map((category) => (
              <li key={category.id} className="progress-category">
                <div className="progress-category__header">
                  <span className="progress-category__name">{category.name}</span>
                  <span className="progress-category__stats">
                    {category.completedTopics} / {category.totalTopics} ({category.percentage}%)
                  </span>
                </div>
                <div
                  className="progress-bar"
                  role="progressbar"
                  aria-valuenow={category.percentage}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${category.name} progress`}
                >
                  <div
                    className="progress-bar__fill"
                    style={{ width: `${category.percentage}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
