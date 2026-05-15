import { NavLink, useLocation } from 'react-router-dom';

/**
 * Fixed bottom navigation bar for mobile viewports (< 768px).
 * Displays up to 5 primary navigation items with minimum 44×44px touch targets
 * and 8px spacing between items.
 *
 * Requirements: 18.3, 18.6
 */

interface BottomNavItem {
  icon: string;
  label: string;
  path: string;
}

const NAV_ITEMS: BottomNavItem[] = [
  { icon: '🏠', label: 'Home', path: '/' },
  { icon: '📚', label: 'Topics', path: '/progress' },
  { icon: '🔍', label: 'Search', path: '/search' },
  { icon: '🔖', label: 'Bookmarks', path: '/cheat-sheets' },
  { icon: '⚙️', label: 'Settings', path: '/settings' },
];

export function BottomNav() {
  const location = useLocation();

  return (
    <nav className="bottom-nav" aria-label="Mobile navigation">
      {NAV_ITEMS.map((item) => {
        const isActive =
          item.path === '/'
            ? location.pathname === '/'
            : location.pathname.startsWith(item.path);

        return (
          <NavLink
            key={item.path}
            to={item.path}
            className={`bottom-nav__item ${isActive ? 'bottom-nav__item--active' : ''}`}
            aria-label={item.label}
            aria-current={isActive ? 'page' : undefined}
          >
            <span className="bottom-nav__icon" aria-hidden="true">
              {item.icon}
            </span>
            <span className="bottom-nav__label">{item.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
