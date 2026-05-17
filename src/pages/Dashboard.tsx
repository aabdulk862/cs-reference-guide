/**
 * Dashboard page — the landing page of the application.
 * Shows overall progress, bookmarks, weekly stats, due-for-review list,
 * daily goal, pomodoro timer, resume prompt, and recently studied topics.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useBookmarks } from '@/hooks/useBookmarks';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';
import { WeeklyStats } from '@/components/study/WeeklyStats';
import { DueForReview } from '@/components/study/DueForReview';
import { DailyGoal } from '@/components/study/DailyGoal';
import { PomodoroTimer } from '@/components/study/PomodoroTimer';
import { ResumePrompt } from '@/components/study/ResumePrompt';
import * as storage from '@/utils/storage';
import type { Bookmark } from '@/types/study';

/** Manifest types for progress calculation */
interface ManifestCategory {
  id: string;
  name: string;
  topics: { id: string; title: string; slug: string; subtopics?: { id: string; slug: string; title: string }[] }[];
}

interface ContentManifest {
  categories: ManifestCategory[];
  totalTopics: number;
}

/** Recently studied topic entry stored in localStorage */
interface RecentTopic {
  topicId: string;
  timestamp: number;
  title?: string;
  categorySlug?: string;
  topicSlug?: string;
}

const RECENT_TOPICS_KEY = 'recent-topics';

function BookmarksList({ bookmarks }: { bookmarks: Bookmark[] }) {
  if (bookmarks.length === 0) {
    return (
      <div className="dashboard-bookmarks__empty">
        <p>No bookmarks yet. Bookmark sections while studying to find them here.</p>
      </div>
    );
  }

  return (
    <ul className="dashboard-bookmarks__list">
      {bookmarks.map((bookmark) => (
        <li key={bookmark.id} className="dashboard-bookmarks__item">
          <Link
            to={`/topic/${bookmark.topicId}#${bookmark.sectionId}`}
            className="dashboard-bookmarks__link"
          >
            <span className="dashboard-bookmarks__title">{bookmark.title}</span>
            <span className="dashboard-bookmarks__meta">
              {new Date(bookmark.createdAt).toLocaleDateString()}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function RecentlyStudied({ recentTopics }: { recentTopics: RecentTopic[] }) {
  if (recentTopics.length === 0) {
    return (
      <div className="dashboard-recent__empty">
        <p>No recently studied topics. Start studying to see your history here.</p>
      </div>
    );
  }

  return (
    <ul className="dashboard-recent__list">
      {recentTopics.map((topic) => {
        const linkPath = topic.categorySlug && topic.topicSlug
          ? `/topic/${topic.categorySlug}/${topic.topicSlug}`
          : `/topic/${topic.topicId}`;
        const displayTitle = topic.title || topic.topicId;

        return (
          <li key={`${topic.topicId}-${topic.timestamp}`} className="dashboard-recent__item">
            <Link to={linkPath} className="dashboard-recent__link">
              <span className="dashboard-recent__title">{displayTitle}</span>
              <span className="dashboard-recent__meta">
                {new Date(topic.timestamp).toLocaleDateString()}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export default function Dashboard() {
  const { bookmarks } = useBookmarks();
  const [totalTopics, setTotalTopics] = useState<number>(0);
  const [topicsCompleted, setTopicsCompleted] = useState<number>(0);
  const [overallPercentage, setOverallPercentage] = useState<number>(0);
  const [recentTopics, setRecentTopics] = useState<RecentTopic[]>([]);
  const [categories, setCategories] = useState<ManifestCategory[]>([]);

  // Set document meta for non-topic page (app name + generic description)
  useDocumentMeta({
    title: 'CS Reference Guide',
    description: 'Interactive Computer Science reference for senior-level interview preparation covering data structures, algorithms, system design, and more.',
  });

  // Fetch content-manifest.json to calculate progress overview
  useEffect(() => {
    async function loadManifest() {
      try {
        const response = await fetch('/content-manifest.json');
        if (!response.ok) {
          setTotalTopics(0);
          setTopicsCompleted(0);
          setOverallPercentage(0);
          return;
        }
        const data: ContentManifest = await response.json();
        setTotalTopics(data.totalTopics);
        setCategories(data.categories);

        // Count manually completed topics from localStorage
        const completed = storage.get<string[]>('completed-topics', []);
        const completedCount = completed.length;
        setTopicsCompleted(completedCount);

        // Calculate overall percentage based on total subtopics
        let totalSubtopics = 0;
        for (const cat of data.categories) {
          for (const topic of cat.topics) {
            totalSubtopics += (topic.subtopics?.length ?? 1);
          }
        }
        const percentage = totalSubtopics > 0
          ? Math.round((completedCount / totalSubtopics) * 100)
          : 0;
        setOverallPercentage(percentage);
      } catch {
        setTotalTopics(0);
        setTopicsCompleted(0);
        setOverallPercentage(0);
      }
    }
    loadManifest();
  }, []);

  // Load recently studied topics from localStorage
  useEffect(() => {
    const recent = storage.get<RecentTopic[]>(RECENT_TOPICS_KEY, []);
    // Sort by most recent first and limit to 5
    const sorted = [...recent]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 5);
    setRecentTopics(sorted);
  }, []);

  return (
    <div className="page-dashboard">
      <h2>Dashboard</h2>
      <p className="page-dashboard__subtitle">Track your progress and pick up where you left off.</p>

      {/* Resume Prompt */}
      <section className="dashboard-widget" aria-label="Resume prompt">
        <ResumePrompt />
      </section>

      {/* Progress Overview */}
      <section className="dashboard-progress" aria-labelledby="progress-heading">
        <h3 id="progress-heading">Progress Overview</h3>
        <div className="dashboard-progress__stats">
          <div className="dashboard-progress__stat">
            <span className="dashboard-progress__stat-value">{topicsCompleted}</span>
            <span className="dashboard-progress__stat-label">Completed</span>
          </div>
          <div className="dashboard-progress__stat">
            <span className="dashboard-progress__stat-value">{totalTopics}</span>
            <span className="dashboard-progress__stat-label">Total Topics</span>
          </div>
          <div className="dashboard-progress__stat">
            <span className="dashboard-progress__stat-value">
              {overallPercentage}%
            </span>
            <span className="dashboard-progress__stat-label">Overall Progress</span>
          </div>
        </div>
      </section>

      {/* Study Widgets Grid */}
      <div className="dashboard-widgets">
        <section className="dashboard-widget" aria-label="Weekly statistics">
          <WeeklyStats />
        </section>

        <section className="dashboard-widget" aria-label="Daily goal">
          <DailyGoal />
        </section>

        <section className="dashboard-widget" aria-label="Pomodoro timer">
          <PomodoroTimer />
        </section>
      </div>

      {/* Due for Review */}
      <section className="dashboard-review" aria-label="Due for review">
        <DueForReview />
      </section>

      {/* Browse Categories */}
      {categories.length > 0 && (
        <section className="dashboard-categories" aria-labelledby="categories-heading">
          <h3 id="categories-heading">Browse Categories</h3>
          <div className="dashboard-categories__grid">
            {categories.map((category) => (
              <Link
                key={category.id}
                to={`/category/${category.id}`}
                className="dashboard-categories__card"
              >
                <span className="dashboard-categories__name">{category.name}</span>
                <span className="dashboard-categories__count">
                  {category.topics.length} {category.topics.length === 1 ? 'topic' : 'topics'}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Bookmarks & Recently Studied — side by side on larger screens */}
      <div className="dashboard-bottom-grid">
        {/* Bookmarks */}
        <section className="dashboard-bookmarks" aria-labelledby="bookmarks-heading">
          <h3 id="bookmarks-heading">Bookmarks</h3>
          <BookmarksList bookmarks={bookmarks} />
        </section>

        {/* Recently Studied */}
        <section className="dashboard-recent" aria-labelledby="recent-heading">
          <h3 id="recent-heading">Recently Studied</h3>
          <RecentlyStudied recentTopics={recentTopics} />
        </section>
      </div>
    </div>
  );
}
