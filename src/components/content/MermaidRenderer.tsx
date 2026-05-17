import { useState, useEffect, useRef, useId, useCallback } from 'react';
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

/**
 * Reads the current theme from the document root's data-theme attribute.
 * Returns 'dark' or 'light'. Defaults to 'dark' if not set.
 */
function getCurrentTheme(): 'dark' | 'light' {
  if (typeof document === 'undefined') return 'dark';
  const attr = document.documentElement.getAttribute('data-theme');
  return attr === 'light' ? 'light' : 'dark';
}

/**
 * Returns the mermaid theme name for the given app theme.
 */
function getMermaidTheme(appTheme: 'dark' | 'light'): 'dark' | 'default' {
  return appTheme === 'dark' ? 'dark' : 'default';
}

// Initialize mermaid with sensible defaults based on current theme
mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'loose',
  theme: getMermaidTheme(getCurrentTheme()),
});

/**
 * Custom hook that observes the document root's data-theme attribute
 * and returns the current theme value.
 */
function useDocumentTheme(): 'dark' | 'light' {
  const [theme, setTheme] = useState<'dark' | 'light'>(getCurrentTheme);

  useEffect(() => {
    const root = document.documentElement;

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (
          mutation.type === 'attributes' &&
          mutation.attributeName === 'data-theme'
        ) {
          setTheme(getCurrentTheme());
        }
      }
    });

    observer.observe(root, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    return () => observer.disconnect();
  }, []);

  return theme;
}

/**
 * Processes rendered SVG to make it responsive:
 * - Removes fixed width/height attributes set by mermaid
 * - Sets width="100%" for responsive scaling
 * - Adds preserveAspectRatio="xMidYMid meet" to scale proportionally
 */
function makeResponsiveSvg(svgString: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');
  const svgEl = doc.querySelector('svg');

  if (svgEl) {
    // Remove fixed dimensions that mermaid sets
    svgEl.removeAttribute('height');
    // Set width to 100% so it scales to fit the container
    svgEl.setAttribute('width', '100%');
    // Preserve aspect ratio so diagram scales proportionally
    svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  }

  return svgEl ? svgEl.outerHTML : svgString;
}

/**
 * Renders Mermaid diagram source as an SVG graphic.
 *
 * - On success: injects the rendered SVG via dangerouslySetInnerHTML
 * - On error: displays raw source with a "Syntax error" label
 * - On timeout (>5s default): displays raw source with "Rendering timed out" label
 * - On theme change: cancels in-flight render, re-initializes mermaid with new theme,
 *   and re-renders the diagram within 1000ms
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5
 */
export function MermaidRenderer({ source, timeoutMs = 5000 }: MermaidRendererProps) {
  const [state, setState] = useState<RenderState>({
    status: 'loading',
    svg: null,
    errorMessage: null,
  });

  const uniqueId = useId();
  const renderCountRef = useRef(0);
  const abortedRef = useRef(false);
  const theme = useDocumentTheme();

  const renderDiagram = useCallback(() => {
    // Increment render count to create a unique diagram ID per render attempt
    renderCountRef.current += 1;
    const currentRenderCount = renderCountRef.current;
    const diagramId = `mermaid-${uniqueId.replace(/:/g, '')}-${currentRenderCount}`;

    abortedRef.current = false;
    setState({ status: 'loading', svg: null, errorMessage: null });

    // Re-initialize mermaid with the current theme
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'loose',
      theme: getMermaidTheme(theme),
    });

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
          const responsiveSvg = makeResponsiveSvg(svg);
          setState({ status: 'rendered', svg: responsiveSvg, errorMessage: null });
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

    // Return cleanup function
    return () => {
      abortedRef.current = true;
      didComplete = true;
      if (timeoutHandle) clearTimeout(timeoutHandle);
    };
  }, [source, timeoutMs, theme, uniqueId]);

  useEffect(() => {
    const cleanup = renderDiagram();
    return cleanup;
  }, [renderDiagram]);

  if (state.status === 'loading') {
    return (
      <div className="mermaid-renderer mermaid-renderer--loading" aria-busy="true">
        <span className="mermaid-renderer__label">Rendering diagram…</span>
      </div>
    );
  }

  if (state.status === 'rendered' && state.svg) {
    return (
      <div className="mermaid-renderer mermaid-renderer--success">
        <div
          className="mermaid-renderer__svg-container"
          dangerouslySetInnerHTML={{ __html: state.svg }}
          role="img"
          aria-label="Mermaid diagram"
        />
      </div>
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
