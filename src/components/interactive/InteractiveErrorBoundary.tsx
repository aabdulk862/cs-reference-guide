import { Component, type ReactNode, type ErrorInfo } from 'react';

interface InteractiveErrorBoundaryProps {
  children: ReactNode;
  interactiveType: string;
}

interface InteractiveErrorBoundaryState {
  hasError: boolean;
  errorMessage: string | null;
}

/**
 * Error boundary specifically for interactive components.
 * Catches render errors and displays an inline error message
 * without crashing the surrounding ContentCard or page.
 *
 * Validates: Requirement 11.7
 */
export class InteractiveErrorBoundary extends Component<
  InteractiveErrorBoundaryProps,
  InteractiveErrorBoundaryState
> {
  constructor(props: InteractiveErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: null };
  }

  static getDerivedStateFromError(error: Error): InteractiveErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || 'An unexpected error occurred',
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error(
      `Interactive component "${this.props.interactiveType}" failed to render:`,
      error,
      errorInfo
    );
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          className="content-card__interactive-error"
          role="alert"
          aria-live="polite"
        >
          <span className="content-card__interactive-error-icon" aria-hidden="true">
            ⚠
          </span>
          <span className="content-card__interactive-error-message">
            Interactive component could not be loaded.
          </span>
        </div>
      );
    }

    return this.props.children;
  }
}

export default InteractiveErrorBoundary;
