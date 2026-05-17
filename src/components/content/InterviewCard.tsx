import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';

interface InterviewCardProps {
  question: string;
  answer: string;
}

/**
 * InterviewCard renders a Q/A pair with the question always visible
 * and the answer hidden behind a "Show Answer" toggle button.
 * Resets to collapsed state on route change.
 */
export function InterviewCard({ question, answer }: InterviewCardProps) {
  const [expanded, setExpanded] = useState(false);
  const location = useLocation();

  // Reset to collapsed when the route changes
  useEffect(() => {
    setExpanded(false);
  }, [location.pathname]);

  return (
    <div className="interview-card">
      <p className="interview-card__question">{question}</p>
      <button
        className="interview-card__toggle"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        {expanded ? 'Hide Answer' : 'Show Answer'}
      </button>
      <div
        className={`interview-card__answer ${expanded ? 'interview-card__answer--expanded' : ''}`}
        aria-hidden={!expanded}
      >
        <p className="interview-card__answer-text">{answer}</p>
      </div>
    </div>
  );
}

export default InterviewCard;
