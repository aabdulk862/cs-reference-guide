/**
 * QuickReferenceCard component.
 * Displays a visually distinct summary card at the top of each topic page
 * with a bulleted list of key points (max 7 items, each ≤ 2 sentences).
 *
 * Validates: Requirement 3.5
 */

import { useState } from 'react';

interface QuickReferenceCardProps {
  /** Array of quick reference items to display (max 7 shown) */
  items: string[];
  /** Optional title for the card (defaults to "Quick Reference") */
  title?: string;
}

/**
 * Truncates a string to at most 2 sentences.
 * A sentence is defined as text ending with '.', '!', or '?'.
 */
function truncateToTwoSentences(text: string): string {
  const sentenceEndings = /[.!?]/g;
  let count = 0;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = sentenceEndings.exec(text)) !== null) {
    count++;
    if (count === 2) {
      lastIndex = match.index + 1;
      break;
    }
  }

  if (count >= 2) {
    return text.slice(0, lastIndex).trim();
  }

  // If fewer than 2 sentences found, return the full text
  return text;
}

export function QuickReferenceCard({
  items,
  title = 'Quick Reference',
}: QuickReferenceCardProps) {
  const [copied, setCopied] = useState(false);

  // Don't render if no items provided
  if (!items || items.length === 0) {
    return null;
  }

  // Display at most 7 items
  const displayItems = items.slice(0, 7);

  const handleCopyAll = () => {
    const text = displayItems.map((item) => truncateToTwoSentences(item)).join('\n• ');
    navigator.clipboard.writeText('• ' + text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="quick-reference-card" role="region" aria-label={title}>
      <div className="quick-reference-header">
        <h3 className="quick-reference-title">{title}</h3>
        <button
          type="button"
          className="quick-reference-copy-btn"
          onClick={handleCopyAll}
          aria-label="Copy all quick reference items"
        >
          {copied ? '✓ Copied' : 'Copy all'}
        </button>
      </div>
      <ul className="quick-reference-list">
        {displayItems.map((item, index) => (
          <li key={index} className="quick-reference-item">
            {truncateToTwoSentences(item)}
          </li>
        ))}
      </ul>
    </div>
  );
}
