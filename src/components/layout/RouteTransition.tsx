import { useRef, useState, useEffect, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * RouteTransition wraps page content and applies a fade transition
 * (200ms) between route changes. When the route changes, the content
 * fades out to opacity 0, then fades back in to opacity 1.
 *
 * Requirements: 20.1
 */
interface RouteTransitionProps {
  children: ReactNode;
  /** Transition duration in ms (default 200, must be 150-300) */
  duration?: number;
}

export function RouteTransition({ children, duration = 200 }: RouteTransitionProps) {
  const location = useLocation();
  const [isVisible, setIsVisible] = useState(true);
  const previousPathRef = useRef(location.pathname);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (location.pathname !== previousPathRef.current) {
      previousPathRef.current = location.pathname;
      // Fade out, then fade back in after the duration
      setIsVisible(false);

      timeoutRef.current = setTimeout(() => {
        setIsVisible(true);
      }, duration);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [location.pathname, duration]);

  return (
    <div
      className="route-transition"
      style={{
        opacity: isVisible ? 1 : 0,
        transition: `opacity ${duration}ms ease-in-out`,
      }}
    >
      {children}
    </div>
  );
}
