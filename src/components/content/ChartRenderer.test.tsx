import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChartRenderer } from './ChartRenderer';

// Mock ResizeObserver for Recharts ResponsiveContainer
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

describe('ChartRenderer', () => {
  const validLineData = [
    { n: 10, time: 1 },
    { n: 20, time: 4 },
    { n: 30, time: 9 },
  ];

  describe('error states', () => {
    it('shows error when chartType is unsupported', () => {
      render(
        <ChartRenderer
          chartType={'pie' as 'line'}
          data={validLineData}
          xKey="n"
          yKeys={['time']}
        />
      );
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/Unsupported chart type/)).toBeInTheDocument();
    });

    it('shows error when required fields are missing', () => {
      render(
        <ChartRenderer
          chartType={'line'}
          data={validLineData}
          xKey=""
          yKeys={['time']}
        />
      );
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/Missing required fields.*xKey/)).toBeInTheDocument();
    });

    it('shows error when yKeys is empty', () => {
      render(
        <ChartRenderer
          chartType={'line'}
          data={validLineData}
          xKey="n"
          yKeys={[]}
        />
      );
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/Missing required fields.*yKeys/)).toBeInTheDocument();
    });

    it('shows empty state when data array is empty', () => {
      render(
        <ChartRenderer
          chartType="line"
          data={[]}
          xKey="n"
          yKeys={['time']}
          title="Test Chart"
        />
      );
      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.getByText('No data available')).toBeInTheDocument();
      expect(screen.getByText('Test Chart')).toBeInTheDocument();
    });
  });

  describe('rendering', () => {
    it('renders a line chart with valid data', () => {
      const { container } = render(
        <ChartRenderer
          chartType="line"
          data={validLineData}
          xKey="n"
          yKeys={['time']}
          title="Performance"
        />
      );
      expect(screen.getByText('Performance')).toBeInTheDocument();
      expect(container.querySelector('.chart-renderer')).toBeInTheDocument();
      expect(container.querySelector('.chart-renderer--error')).not.toBeInTheDocument();
    });

    it('renders a bar chart with valid data', () => {
      const { container } = render(
        <ChartRenderer
          chartType="bar"
          data={validLineData}
          xKey="n"
          yKeys={['time']}
        />
      );
      expect(container.querySelector('.chart-renderer')).toBeInTheDocument();
      expect(container.querySelector('.chart-renderer--error')).not.toBeInTheDocument();
    });

    it('renders an area chart with valid data', () => {
      const { container } = render(
        <ChartRenderer
          chartType="area"
          data={validLineData}
          xKey="n"
          yKeys={['time']}
        />
      );
      expect(container.querySelector('.chart-renderer')).toBeInTheDocument();
      expect(container.querySelector('.chart-renderer--error')).not.toBeInTheDocument();
    });

    it('shows legend when multiple yKeys are provided', () => {
      const multiSeriesData = [
        { n: 10, linear: 10, quadratic: 100 },
        { n: 20, linear: 20, quadratic: 400 },
      ];
      const { container } = render(
        <ChartRenderer
          chartType="line"
          data={multiSeriesData}
          xKey="n"
          yKeys={['linear', 'quadratic']}
        />
      );
      // Component renders without error for multi-series data
      expect(container.querySelector('.chart-renderer')).toBeInTheDocument();
      expect(container.querySelector('.chart-renderer--error')).not.toBeInTheDocument();
    });

    it('hides legend when single yKey is provided', () => {
      const { container } = render(
        <ChartRenderer
          chartType="line"
          data={validLineData}
          xKey="n"
          yKeys={['time']}
        />
      );
      expect(container.querySelector('.recharts-legend-wrapper')).not.toBeInTheDocument();
    });

    it('renders with accessible role and label', () => {
      render(
        <ChartRenderer
          chartType="line"
          data={validLineData}
          xKey="n"
          yKeys={['time']}
          title="My Chart"
        />
      );
      expect(screen.getByRole('img', { name: 'My Chart' })).toBeInTheDocument();
    });

    it('uses chartType as fallback aria-label when no title', () => {
      render(
        <ChartRenderer
          chartType="bar"
          data={validLineData}
          xKey="n"
          yKeys={['time']}
        />
      );
      expect(screen.getByRole('img', { name: 'bar chart' })).toBeInTheDocument();
    });
  });
});
