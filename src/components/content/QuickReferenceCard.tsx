/**
 * QuickReferenceCard component.
 * Displays a visually distinct summary card at the top of each topic page
 * with a bulleted list of key points (max 7 items, each ≤ 2 sentences).
 *
 * Validates: Requirement 3.5
 */

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
  // Don't render if no items provided
  if (!items || items.length === 0) {
    return null;
  }

  // Display at most 7 items
  const displayItems = items.slice(0, 7);

  return (
    <div className="quick-reference-card" role="region" aria-label={title}>
      <h3 className="quick-reference-title">{title}</h3>
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
