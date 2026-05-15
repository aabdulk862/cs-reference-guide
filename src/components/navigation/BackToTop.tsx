import { useState, useEffect, useCallback } from 'react';

/**
 * Floating "Back to top" button that appears when the user scrolls
 * past the first viewport height. Smooth scrolls to top on activation.
 *
 * Requirements: 20.4
 */
export function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const scrolledPastViewport = window.scrollY > window.innerHeight;
      setVisible(scrolledPastViewport);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    // Check initial scroll position
    handleScroll();

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <button
      className="back-to-top"
      onClick={scrollToTop}
      aria-label="Back to top"
      title="Back to top"
      type="button"
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M10 4L4 10H8V16H12V10H16L10 4Z"
          fill="currentColor"
        />
      </svg>
    </button>
  );
}
