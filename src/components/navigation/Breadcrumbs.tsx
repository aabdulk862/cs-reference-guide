import { Link, useLocation } from 'react-router-dom';
import { generateBreadcrumbs, type BreadcrumbItem } from '../../utils/breadcrumbs';

/**
 * Default display names for known category and topic slugs.
 * This mapping converts URL slugs to human-readable labels.
 * Additional names can be provided via props for dynamic content.
 */
const DEFAULT_DISPLAY_NAMES: Record<string, string> = {
  topic: 'Topics',
  'data-structures': 'Data Structures',
  algorithms: 'Algorithms',
  git: 'Git',
  'system-design': 'System Design',
  'interview-prep': 'Interview Prep',
  java: 'Java',
  'spring-framework': 'Spring Framework',
  'build-tools': 'Build Tools',
  databases: 'Databases',
  messaging: 'Messaging',
  ai: 'AI',
  'operating-systems': 'Operating Systems',
  networking: 'Networking',
  'design-patterns': 'Design Patterns',
  devops: 'DevOps',
  testing: 'Testing',
  'behavioral-interview': 'Behavioral Interview',
  'coding-patterns': 'Coding Patterns',
  'cheat-sheets': 'Cheat Sheets',
};

interface BreadcrumbsProps {
  /** Additional display name overrides (e.g., from loaded topic data) */
  displayNames?: Record<string, string>;
}

/**
 * Breadcrumb navigation component.
 * Renders a trail of links showing the current location in the topic hierarchy.
 * Uses the current route path to generate breadcrumb items.
 * The last item is rendered as plain text (not a link) with aria-current="page".
 *
 * Validates: Requirement 2.2
 */
export function Breadcrumbs({ displayNames = {} }: BreadcrumbsProps) {
  const location = useLocation();

  // Parse path segments, filtering out empty strings from leading/trailing slashes
  const segments = location.pathname
    .split('/')
    .filter((segment) => segment.length > 0);

  // Don't render breadcrumbs on the home page
  if (segments.length === 0) {
    return null;
  }

  const mergedDisplayNames = { ...DEFAULT_DISPLAY_NAMES, ...displayNames };
  const breadcrumbs: BreadcrumbItem[] = generateBreadcrumbs(segments, mergedDisplayNames);

  return (
    <nav aria-label="Breadcrumb" className="breadcrumbs">
      <ol className="breadcrumb-list">
        <li className="breadcrumb-item">
          <Link to="/" className="breadcrumb-link">
            Home
          </Link>
          <span className="breadcrumb-separator" aria-hidden="true">
            /
          </span>
        </li>
        {breadcrumbs.map((crumb) => (
          <li key={crumb.path} className="breadcrumb-item">
            {crumb.isLast ? (
              <span className="breadcrumb-current" aria-current="page">
                {crumb.label}
              </span>
            ) : (
              <>
                <Link to={crumb.path} className="breadcrumb-link">
                  {crumb.label}
                </Link>
                <span className="breadcrumb-separator" aria-hidden="true">
                  /
                </span>
              </>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
