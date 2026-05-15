import { useState, useEffect } from 'react';
import * as storage from '@/utils/storage';

const LAST_VIEWED_KEY = 'last-viewed';
const RESUME_THRESHOLD_MS = 60_000; // 60 seconds

/** Shape of the last-viewed data stored in localStorage */
interface LastViewedData {
  topicId: string;
  sectionId: string;
  timestamp: number;
}

/**
 * Save the user's last-viewed location to localStorage.
 * Call this whenever the user navigates to a Content_Section.
 */
export function saveLastViewed(topicId: string, sectionId: string): void {
  const data: LastViewedData = {
    topicId,
    sectionId,
    timestamp: Date.now(),
  };
  storage.set(LAST_VIEWED_KEY, data);
}

/**
 * ResumePrompt displays a "Continue where you left off" banner
 * when the user returns to the app after at least 60 seconds
 * since their last session. Links to the last viewed Content_Section.
 *
 * Requirements: 6.7
 */
export function ResumePrompt() {
  const [lastViewed, setLastViewed] = useState<LastViewedData | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const data = storage.get<LastViewedData | null>(LAST_VIEWED_KEY, null);
    if (data && data.topicId && data.sectionId && data.timestamp) {
      const elapsed = Date.now() - data.timestamp;
      if (elapsed > RESUME_THRESHOLD_MS) {
        setLastViewed(data);
      }
    }
  }, []);

  if (!lastViewed || dismissed) {
    return null;
  }

  const resumeUrl = `/topic/${lastViewed.topicId}#${lastViewed.sectionId}`;

  return (
    <div className="resume-prompt" role="complementary" aria-label="Resume studying">
      <a href={resumeUrl} className="resume-prompt__link">
        Continue where you left off
      </a>
      <button
        className="resume-prompt__close"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss resume prompt"
        type="button"
      >
        ×
      </button>
    </div>
  );
}

export default ResumePrompt;
