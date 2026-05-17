import { render, screen, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MermaidRenderer } from './MermaidRenderer';

// Mock the mermaid library
vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(),
  },
}));

import mermaid from 'mermaid';

const mockedMermaid = vi.mocked(mermaid);

describe('MermaidRenderer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders SVG on successful mermaid render', async () => {
    const svgOutput = '<svg><text>Diagram</text></svg>';
    mockedMermaid.render.mockResolvedValue({ svg: svgOutput, bindFunctions: undefined, diagramType: 'flowchart-v2' } as never);

    vi.useRealTimers();
    render(<MermaidRenderer source="graph TD; A-->B" />);

    await waitFor(() => {
      const container = document.querySelector('.mermaid-renderer--success');
      expect(container).toBeInTheDocument();
      // SVG is wrapped in a responsive container with width="100%" and preserveAspectRatio
      const svgContainer = container?.querySelector('.mermaid-renderer__svg-container');
      expect(svgContainer).toBeInTheDocument();
      const svgEl = svgContainer?.querySelector('svg');
      expect(svgEl).toBeInTheDocument();
      expect(svgEl?.getAttribute('width')).toBe('100%');
      expect(svgEl?.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet');
    });
  });

  it('displays raw source with "Syntax error" label on render failure', async () => {
    mockedMermaid.render.mockRejectedValue(new Error('Parse error'));

    vi.useRealTimers();
    render(<MermaidRenderer source="invalid mermaid syntax" />);

    await waitFor(() => {
      expect(screen.getByText('Syntax error')).toBeInTheDocument();
      expect(screen.getByText('invalid mermaid syntax')).toBeInTheDocument();
    });

    const container = document.querySelector('.mermaid-renderer--error');
    expect(container).toBeInTheDocument();
  });

  it('displays raw source with "Rendering timed out" label when timeout expires', async () => {
    // Create a promise that never resolves to simulate a hang
    mockedMermaid.render.mockReturnValue(new Promise(() => {}));

    render(<MermaidRenderer source="graph TD; A-->B" timeoutMs={5000} />);

    // Initially shows loading
    expect(document.querySelector('.mermaid-renderer--loading')).toBeInTheDocument();

    // Advance past the timeout
    await act(async () => {
      vi.advanceTimersByTime(5001);
    });

    expect(screen.getByText('Rendering timed out')).toBeInTheDocument();
    expect(screen.getByText('graph TD; A-->B')).toBeInTheDocument();

    const container = document.querySelector('.mermaid-renderer--timeout');
    expect(container).toBeInTheDocument();
  });

  it('uses default 5-second timeout', async () => {
    mockedMermaid.render.mockReturnValue(new Promise(() => {}));

    render(<MermaidRenderer source="graph LR; X-->Y" />);

    // At 4999ms, should still be loading
    await act(async () => {
      vi.advanceTimersByTime(4999);
    });
    expect(document.querySelector('.mermaid-renderer--loading')).toBeInTheDocument();

    // At 5001ms, should timeout
    await act(async () => {
      vi.advanceTimersByTime(2);
    });
    expect(screen.getByText('Rendering timed out')).toBeInTheDocument();
  });

  it('shows loading state initially', () => {
    mockedMermaid.render.mockReturnValue(new Promise(() => {}));

    render(<MermaidRenderer source="graph TD; A-->B" />);

    const loading = document.querySelector('.mermaid-renderer--loading');
    expect(loading).toBeInTheDocument();
    expect(loading?.getAttribute('aria-busy')).toBe('true');
    expect(screen.getByText('Rendering diagram…')).toBeInTheDocument();
  });

  it('injects SVG via dangerouslySetInnerHTML with role="img"', async () => {
    const svgOutput = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>';
    mockedMermaid.render.mockResolvedValue({ svg: svgOutput, bindFunctions: undefined, diagramType: 'flowchart-v2' } as never);

    vi.useRealTimers();
    render(<MermaidRenderer source="graph TD; A-->B" />);

    await waitFor(() => {
      const svgContainer = document.querySelector('.mermaid-renderer__svg-container');
      expect(svgContainer).toBeInTheDocument();
      expect(svgContainer?.getAttribute('role')).toBe('img');
      expect(svgContainer?.getAttribute('aria-label')).toBe('Mermaid diagram');
    });
  });

  it('does not update state after unmount', async () => {
    mockedMermaid.render.mockReturnValue(new Promise(() => {}));

    const { unmount } = render(<MermaidRenderer source="graph TD; A-->B" />);

    unmount();

    // Advancing timers after unmount should not cause errors
    await act(async () => {
      vi.advanceTimersByTime(6000);
    });
    // If we get here without errors, the cleanup worked
  });

  it('accepts custom timeout value', async () => {
    mockedMermaid.render.mockReturnValue(new Promise(() => {}));

    render(<MermaidRenderer source="graph TD; A-->B" timeoutMs={2000} />);

    await act(async () => {
      vi.advanceTimersByTime(1999);
    });
    expect(document.querySelector('.mermaid-renderer--loading')).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(2);
    });
    expect(screen.getByText('Rendering timed out')).toBeInTheDocument();
  });
});
