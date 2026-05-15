import { useState, useEffect, useRef, useId } from 'react';
import mermaid from 'mermaid';

export interface MermaidRendererProps {
  /** The Mermaid diagram source text */
  source: string;
  /** Timeout in milliseconds before aborting render (default: 5000) */
  timeoutMs?: number;
}

type RenderStatus = 'loading' | 'rendered' | 'error' | 'timeout';

interface RenderState {
  status: RenderStatus;
  svg: string | null;
  errorMessage: string | null;
}

// Initialize mermaid with sensible defaults
mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'strict',
  theme: 'default',
});

/**
 * Renders Mermaid diagram source as an SVG graphic.
 *
 * - On success: injects the rendered SVG via dangerouslySetInnerHTML
 * - On error: displays raw source with a "Syntax error" label
 * - On timeout (>5s default): displays raw source with "Rendering timed out" label
 *
 * Validates: Requirements 14.2, 14.3, 14.4
 */
export function MermaidRenderer({ source, timeoutMs = 5000 }: MermaidRendererProps) {
  const [state, setState] = useState<RenderState>({
    status: 'loading',
    svg: null,
    errorMessage: null,
  });

  const uniqueId = useId();
  const diagramId = `mermaid-${uniqueId.replace(/:/g, '')}`;
  const abortedRef = useRef(false);

  useEffect(() => {
    abortedRef.current = false;
    setState({ status: 'loading', svg: null, errorMessage: null });

    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    let didComplete = false;

    // Set up the timeout
    timeoutHandle = setTimeout(() => {
      if (!didComplete) {
        abortedRef.current = true;
        setState({
          status: 'timeout',
          svg: null,
          errorMessage: 'Rendering timed out',
        });
      }
    }, timeoutMs);

    // Attempt to render
    mermaid
      .render(diagramId, source)
      .then(({ svg }) => {
        if (!abortedRef.current) {
          didComplete = true;
          if (timeoutHandle) clearTimeout(timeoutHandle);
          setState({ status: 'rendered', svg, errorMessage: null });
        }
      })
      .catch((err: unknown) => {
        if (!abortedRef.current) {
          didComplete = true;
          if (timeoutHandle) clearTimeout(timeoutHandle);
          const message = err instanceof Error ? err.message : 'Unknown error';
          setState({ status: 'error', svg: null, errorMessage: message });
        }
      });

    return () => {
      abortedRef.current = true;
      didComplete = true;
      if (timeoutHandle) clearTimeout(timeoutHandle);
    };
  }, [source, timeoutMs, diagramId]);

  if (state.status === 'loading') {
    return (
      <div className="mermaid-renderer mermaid-renderer--loading" aria-busy="true">
        <span className="mermaid-renderer__label">Rendering diagram…</span>
      </div>
    );
  }

  if (state.status === 'rendered' && state.svg) {
    return (
      <div
        className="mermaid-renderer mermaid-renderer--success"
        dangerouslySetInnerHTML={{ __html: state.svg }}
        role="img"
        aria-label="Mermaid diagram"
      />
    );
  }

  if (state.status === 'timeout') {
    return (
      <div className="mermaid-renderer mermaid-renderer--timeout">
        <span className="mermaid-renderer__label">Rendering timed out</span>
        <pre className="mermaid-renderer__source">
          <code>{source}</code>
        </pre>
      </div>
    );
  }

  // Error state
  return (
    <div className="mermaid-renderer mermaid-renderer--error">
      <span className="mermaid-renderer__label">Syntax error</span>
      <pre className="mermaid-renderer__source">
        <code>{source}</code>
      </pre>
    </div>
  );
}
