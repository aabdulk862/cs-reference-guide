/**
 * WeeklyStats component displays a summary of study activity
 * over the past 7 days: total minutes studied and distinct topics covered.
 *
 * Requirements: 6.8
 */

import { useWeeklyStats } from '@/hooks/useWeeklyStats';

/**
 * Renders a weekly study statistics summary.
 */
export function WeeklyStats() {
  const { stats } = useWeeklyStats();

  return (
    <div className="weekly-stats" role="region" aria-label="Weekly study statistics">
      <p>
        This week: {stats.totalMinutes} minutes studied, {stats.topicsCovered} topics covered
      </p>
    </div>
  );
}
