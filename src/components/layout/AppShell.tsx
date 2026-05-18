import { Suspense, useState, useCallback, useRef, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { MobileSidebarOverlay } from './MobileSidebarOverlay';
import { LoadingFallback } from './LoadingFallback';
import { SWNotification } from './SWNotification';
import { RouteErrorBoundary } from './RouteErrorBoundary';
import { CommandPalette } from '../navigation/CommandPalette';
import { BottomNav } from '../navigation/BottomNav';
import { BackToTop } from '../navigation/BackToTop';
import { useCommandPalette } from '../../hooks/useCommandPalette';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { useBookmarks } from '../../hooks/useBookmarks';
import { PomodoroProvider } from '../../hooks/PomodoroContext';
import { RouteTransition } from './RouteTransition';
import { get, set } from '../../utils/storage';

const SIDEBAR_COLLAPSED_KEY = 'sidebar-collapsed';

/**
 * Main application layout shell.
 * Provides the persistent structure: header, sidebar, and main content area.
 * The main content area wraps child routes in a Suspense boundary for code-splitting.
 * Includes the command palette overlay (Ctrl+K / Cmd+K).
 * On mobile (< 768px), the sidebar is hidden and accessible via a hamburger menu
 * that opens a full-height overlay anchored to the left edge.
 * On desktop, the sidebar can be collapsed/expanded via a toggle button.
 *
 * Requirements: 18.1, 18.2
 */
export function AppShell() {
  const commandPalette = useCommandPalette();
  const { toggleBookmark } = useBookmarks();
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    return get<boolean>(SIDEBAR_COLLAPSED_KEY, false);
  });
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const location = useLocation();

  // Keyboard shortcuts: /, [, ], b
  const handleBookmarkToggle = useCallback(() => {
    // Extract topic info from the current URL path
    const match = location.pathname.match(/^\/topic\/([^/]+)\/([^/]+)/);
    if (match) {
      const topicId = `${match[1]}/${match[2]}`;
      // Toggle bookmark for the first section of the current topic
      toggleBookmark(topicId, 'top', match[2].replace(/-/g, ' '));
    }
  }, [location.pathname, toggleBookmark]);

  useKeyboardShortcuts({ onBookmarkToggle: handleBookmarkToggle });

  const openMobileSidebar = useCallback(() => {
    setIsMobileSidebarOpen(true);
  }, []);

  const closeMobileSidebar = useCallback(() => {
    setIsMobileSidebarOpen(false);
    // Return focus to the hamburger menu button (main content trigger)
    hamburgerRef.current?.focus();
  }, []);

  const toggleSidebarCollapsed = useCallback(() => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      set(SIDEBAR_COLLAPSED_KEY, next);
      return next;
    });
  }, []);

  // Close mobile sidebar on route change
  useEffect(() => {
    setIsMobileSidebarOpen(false);
  }, [location.pathname]);

  return (
    <PomodoroProvider>
    <div className={`app-shell${isSidebarCollapsed ? ' app-shell--sidebar-collapsed' : ''}`}>
      <Header
        onOpenCommandPalette={commandPalette.open}
        onOpenMobileSidebar={openMobileSidebar}
        hamburgerRef={hamburgerRef}
      />
      <div className="app-body">
        <div className={`app-sidebar-wrapper${isSidebarCollapsed ? ' app-sidebar-wrapper--collapsed' : ''}`}>
          <Sidebar />
          <button
            className="sidebar-collapse-btn"
            onClick={toggleSidebarCollapsed}
            aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            type="button"
          >
            <span className="sidebar-collapse-btn__icon" aria-hidden="true">
              {isSidebarCollapsed ? '›' : '‹'}
            </span>
          </button>
        </div>
        <main className="app-main" id="main-content">
          <RouteErrorBoundary>
            <Suspense fallback={<LoadingFallback />}>
              <RouteTransition>
                <Outlet />
              </RouteTransition>
            </Suspense>
          </RouteErrorBoundary>
        </main>
      </div>
      <MobileSidebarOverlay
        isOpen={isMobileSidebarOpen}
        onClose={closeMobileSidebar}
      />
      <CommandPalette
        isOpen={commandPalette.isOpen}
        query={commandPalette.query}
        results={commandPalette.results}
        selectedIndex={commandPalette.selectedIndex}
        onQueryChange={commandPalette.setQuery}
        onClose={commandPalette.close}
        onMoveSelection={commandPalette.moveSelection}
        onExecuteSelected={commandPalette.executeSelected}
        onSelectItem={commandPalette.selectItem}
      />
      <BottomNav />
      <BackToTop />
      <SWNotification />
    </div>
    </PomodoroProvider>
  );
}
