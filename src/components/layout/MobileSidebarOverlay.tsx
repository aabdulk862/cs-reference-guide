import { useEffect, useRef } from 'react';
import { SidebarNavigation } from '../navigation/Sidebar';

interface MobileSidebarOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Mobile sidebar overlay component.
 * Renders the sidebar navigation as a full-height overlay anchored to the left edge
 * of the screen, visible only on viewports < 768px.
 * Dismisses on tap outside (backdrop click) or close button press.
 * Returns focus to main content on close.
 *
 * Requirements: 18.1, 18.2
 */
export function MobileSidebarOverlay({ isOpen, onClose }: MobileSidebarOverlayProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Focus the close button when overlay opens
  useEffect(() => {
    if (isOpen) {
      // Small delay to allow the DOM to render
      requestAnimationFrame(() => {
        closeButtonRef.current?.focus();
      });
    }
  }, [isOpen]);

  // Handle Escape key to close
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Prevent body scroll when overlay is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="mobile-sidebar-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Navigation menu"
    >
      {/* Backdrop - tap outside to dismiss */}
      <div
        className="mobile-sidebar-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Sidebar panel */}
      <aside
        ref={panelRef}
        className="mobile-sidebar-panel"
        aria-label="Topic navigation"
      >
        <div className="mobile-sidebar-header">
          <span className="mobile-sidebar-title">Navigation</span>
          <button
            ref={closeButtonRef}
            className="mobile-sidebar-close-btn"
            aria-label="Close navigation menu"
            type="button"
            onClick={onClose}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="mobile-sidebar-content">
          <SidebarNavigation />
        </div>
      </aside>
    </div>
  );
}
