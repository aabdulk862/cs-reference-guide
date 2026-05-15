import { Link } from 'react-router-dom';

/**
 * 404 Not Found page — displayed for unmatched routes.
 */
export default function NotFound() {
  return (
    <div className="page-not-found">
      <h2>404 — Page Not Found</h2>
      <p>The page you're looking for doesn't exist.</p>
      <Link to="/">Return to Dashboard</Link>
    </div>
  );
}
