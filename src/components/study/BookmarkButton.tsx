/**
 * BookmarkButton component — toggles bookmark state for a content section.
 *
 * Displays a filled bookmark icon when the section is bookmarked,
 * and an unfilled (outline) icon when it is not.
 * Clicking toggles the bookmark state via the useBookmarks hook.
 *
 * Requirements: 6.3, 6.4
 */

import { useBookmarks } from '@/hooks/useBookmarks';

interface BookmarkButtonProps {
  /** The topic ID this section belongs to */
  topicId: string;
  /** The section ID to bookmark */
  sectionId: string;
  /** Display title for the bookmark */
  title: string;
}

/**
 * Filled bookmark SVG icon (bookmarked state).
 */
function BookmarkFilledIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M5 3a2 2 0 0 0-2 2v16l9-4 9 4V5a2 2 0 0 0-2-2H5z" />
    </svg>
  );
}

/**
 * Outline bookmark SVG icon (not bookmarked state).
 */
function BookmarkOutlineIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 3a2 2 0 0 0-2 2v16l9-4 9 4V5a2 2 0 0 0-2-2H5z" />
    </svg>
  );
}

export function BookmarkButton({ topicId, sectionId, title }: BookmarkButtonProps) {
  const { toggleBookmark, isBookmarked } = useBookmarks();
  const bookmarked = isBookmarked(topicId, sectionId);

  const handleClick = () => {
    toggleBookmark(topicId, sectionId, title);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`bookmark-button ${bookmarked ? 'bookmark-button--active' : ''}`}
      aria-label={bookmarked ? `Remove bookmark for ${title}` : `Bookmark ${title}`}
      aria-pressed={bookmarked}
      title={bookmarked ? 'Remove bookmark' : 'Add bookmark'}
    >
      {bookmarked ? <BookmarkFilledIcon /> : <BookmarkOutlineIcon />}
    </button>
  );
}
