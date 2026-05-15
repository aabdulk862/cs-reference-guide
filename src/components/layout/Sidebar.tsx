import { SidebarNavigation } from '../navigation/Sidebar';

/**
 * Persistent sidebar wrapper.
 * Provides the structural slot in the layout and renders the full
 * navigation tree with collapsible categories and visited indicators.
 *
 * Requirements: 2.1, 2.6
 */
export function Sidebar() {
  return (
    <aside className="app-sidebar" aria-label="Topic navigation">
      <SidebarNavigation />
    </aside>
  );
}
