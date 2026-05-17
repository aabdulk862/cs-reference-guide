import { Link, NavLink } from 'react-router-dom';
import { SearchBar } from '@/components/navigation/SearchBar';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { OfflineIndicator } from '@/components/layout/OfflineIndicator';
import { NavTimer } from '@/components/layout/NavTimer';

interface HeaderProps {
  onOpenCommandPalette?: () => void;
  onOpenMobileSidebar?: () => void;
  hamburgerRef?: React.RefObject<HTMLButtonElement>;
}

/**
 * Top header bar for the application.
 * Contains the app title, focus timer, search bar, and command palette trigger area.
 * On mobile (< 768px), displays a hamburger menu icon to open the sidebar overlay.
 * On desktop, includes quick-access navigation links for feature parity with mobile bottom nav.
 *
 * Requirements: 5.4, 18.1
 */
export function Header({ onOpenCommandPalette, onOpenMobileSidebar, hamburgerRef }: HeaderProps) {

  return (
    <header className="app-header">
      <div className="header-left">
        <button
          ref={hamburgerRef as React.RefObject<HTMLButtonElement>}
          className="hamburger-menu-btn"
          aria-label="Open navigation menu"
          type="button"
          onClick={onOpenMobileSidebar}
        >
          <svg
            className="hamburger-icon"
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
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <h1 className="app-title"><Link to="/">The Ultimate CS Study Guide</Link></h1>
        <nav className="header-nav" aria-label="Quick navigation">
          <NavLink to="/progress" className="header-nav__link">Progress</NavLink>
          <NavLink to="/search" className="header-nav__link">Search</NavLink>
          <NavLink to="/settings" className="header-nav__link">Settings</NavLink>
        </nav>
      </div>
      <div className="header-center">
        <NavTimer />
      </div>
      <div className="header-right">
        <OfflineIndicator />
        <SearchBar />
        <ThemeToggle />
        <button
          className="command-palette-trigger"
          aria-label="Open command palette (Ctrl+K)"
          type="button"
          onClick={onOpenCommandPalette}
        >
          <kbd>⌘K</kbd>
        </button>
      </div>
    </header>
  );
}
