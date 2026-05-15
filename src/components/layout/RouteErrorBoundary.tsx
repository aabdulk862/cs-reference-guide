import { Component, type ReactNode, type ErrorInfo } from 'react';

interface RouteErrorBoundaryProps {
  children: ReactNode;
}

interface RouteErrorBoundaryState {
  hasError: boolean;
  errorMessage: string | null;
}

/**
 * Route-level error boundary that wraps page components.
 * Catches rendering errors and displays a user-friendly error message
 * with a reload button, preventing blank screens on route-level failures.
 *
 * Validates: Requirement 21.4
 */
export class RouteErrorBoundary extends Component<
  RouteErrorBoundaryProps,
  RouteErrorBoundaryState
> {
  constructor(props: RouteErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: null };
  }

  static getDerivedStateFromError(error: Error): RouteErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || 'An unexpected error occurred',
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Route rendering error:', error, errorInfo);
  }

  handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="route-error-boundary" role="alert" aria-live="assertive">
          <div className="route-error-boundary__content">
            <span className="route-error-boundary__icon" aria-hidden="true">
              ⚠️
            </span>
            <h2 className="route-error-boundary__title">Something went wrong</h2>
            <p className="route-error-boundary__message">
              An error occurred while rendering this page. Please try reloading.
            </p>
            <button
              className="route-error-boundary__reload-btn"
              onClick={this.handleReload}
              type="button"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default RouteErrorBoundary;
