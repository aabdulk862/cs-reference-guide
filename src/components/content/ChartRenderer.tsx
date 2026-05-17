import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

/**
 * Default color palette for chart series.
 * Uses CSS custom properties where available, with fallback hex values
 * that work well in both dark and light themes.
 */
const CHART_COLORS = [
  'var(--chart-color-1, #646cff)',
  'var(--chart-color-2, #22c55e)',
  'var(--chart-color-3, #f59e0b)',
  'var(--chart-color-4, #ef4444)',
  'var(--chart-color-5, #8b5cf6)',
  'var(--chart-color-6, #ec4899)',
];

export interface ChartRendererProps {
  chartType: 'line' | 'bar' | 'area';
  data: Record<string, unknown>[];
  xKey: string;
  yKeys: string[];
  title?: string;
}

/**
 * Validates the chart configuration and returns an error message if invalid.
 */
function validateConfig(props: ChartRendererProps): string | null {
  const { chartType, data, xKey, yKeys } = props;

  const missingFields: string[] = [];

  if (!chartType) {
    missingFields.push('type');
  } else if (!['line', 'bar', 'area'].includes(chartType)) {
    return `Unsupported chart type: "${chartType}". Supported types are: line, bar, area.`;
  }

  if (!data) {
    missingFields.push('data');
  } else if (!Array.isArray(data)) {
    missingFields.push('data (must be an array)');
  }

  if (!xKey) {
    missingFields.push('xKey');
  }

  if (!yKeys || !Array.isArray(yKeys) || yKeys.length === 0) {
    missingFields.push('yKeys');
  }

  if (missingFields.length > 0) {
    return `Missing required fields: ${missingFields.join(', ')}`;
  }

  return null;
}

/**
 * ChartRenderer — Renders line, bar, or area charts from structured data
 * using Recharts. Designed to be lazy-loaded via React.lazy in ContentCard.
 *
 * Features:
 * - ResponsiveContainer with 16:9 aspect ratio
 * - Line/Bar/Area chart based on chartType
 * - Legend shown only when yKeys.length > 1
 * - Labeled axes from xKey and yKeys
 * - Theme-aware colors from CSS custom properties
 * - Error states: invalid config, empty data
 *
 * Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9
 */
export function ChartRenderer({ chartType, data, xKey, yKeys, title }: ChartRendererProps) {
  // Validate configuration
  const validationError = validateConfig({ chartType, data, xKey, yKeys, title });
  if (validationError) {
    return (
      <div className="chart-renderer chart-renderer--error" role="alert">
        <span className="chart-renderer__error-icon" aria-hidden="true">⚠</span>
        <span className="chart-renderer__error-message">{validationError}</span>
      </div>
    );
  }

  // Handle empty data
  if (data.length === 0) {
    return (
      <div className="chart-renderer chart-renderer--empty" role="status">
        {title && <h4 className="chart-renderer__title">{title}</h4>}
        <div className="chart-renderer__empty-message">No data available</div>
      </div>
    );
  }

  const showLegend = yKeys.length > 1;

  const renderChart = () => {
    const commonProps = {
      data,
      margin: { top: 20, right: 30, left: 20, bottom: 20 },
    };

    const axisElements = (
      <>
        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
        <XAxis
          dataKey={xKey}
          label={{ value: xKey, position: 'bottom', offset: 0 }}
          tick={{ fontSize: 12 }}
        />
        <YAxis
          label={{
            value: yKeys.length === 1 ? yKeys[0] : '',
            angle: -90,
            position: 'insideLeft',
          }}
          tick={{ fontSize: 12 }}
        />
        <Tooltip />
        {showLegend && <Legend />}
      </>
    );

    switch (chartType) {
      case 'line':
        return (
          <LineChart {...commonProps}>
            {axisElements}
            {yKeys.map((key, i) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={CHART_COLORS[i % CHART_COLORS.length]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            ))}
          </LineChart>
        );

      case 'bar':
        return (
          <BarChart {...commonProps}>
            {axisElements}
            {yKeys.map((key, i) => (
              <Bar
                key={key}
                dataKey={key}
                fill={CHART_COLORS[i % CHART_COLORS.length]}
              />
            ))}
          </BarChart>
        );

      case 'area':
        return (
          <AreaChart {...commonProps}>
            {axisElements}
            {yKeys.map((key, i) => (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                stroke={CHART_COLORS[i % CHART_COLORS.length]}
                fill={CHART_COLORS[i % CHART_COLORS.length]}
                fillOpacity={0.3}
              />
            ))}
          </AreaChart>
        );

      default:
        return null;
    }
  };

  return (
    <div className="chart-renderer" role="img" aria-label={title || `${chartType} chart`}>
      {title && <h4 className="chart-renderer__title">{title}</h4>}
      <div className="chart-renderer__container">
        <ResponsiveContainer width="100%" aspect={16 / 9}>
          {renderChart()!}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default ChartRenderer;
