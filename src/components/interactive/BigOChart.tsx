import { useState, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

/** Complexity class definition */
interface ComplexityClass {
  id: string;
  label: string;
  color: string;
  fn: (n: number) => number;
}

const COMPLEXITY_CLASSES: ComplexityClass[] = [
  { id: 'o1', label: 'O(1)', color: '#22c55e', fn: () => 1 },
  { id: 'ologn', label: 'O(log n)', color: '#3b82f6', fn: (n) => Math.log2(n) },
  { id: 'on', label: 'O(n)', color: '#f59e0b', fn: (n) => n },
  { id: 'onlogn', label: 'O(n log n)', color: '#8b5cf6', fn: (n) => n * Math.log2(n) },
  { id: 'on2', label: 'O(n²)', color: '#ef4444', fn: (n) => n * n },
  { id: 'o2n', label: 'O(2^n)', color: '#ec4899', fn: (n) => Math.pow(2, n) },
];

/** Maximum Y value to cap exponential/quadratic growth for display */
const MAX_Y_VALUE = 10000;

/** Number of data points to generate */
const DATA_POINTS = 50;

/** Generate chart data for n = 1 to DATA_POINTS */
function generateChartData(classes: ComplexityClass[]) {
  const data = [];
  for (let n = 1; n <= DATA_POINTS; n++) {
    const point: Record<string, number> = { n };
    for (const cls of classes) {
      const raw = cls.fn(n);
      point[cls.id] = Math.min(raw, MAX_Y_VALUE);
    }
    data.push(point);
  }
  return data;
}

/**
 * BigOChart — Interactive Big O comparison chart.
 *
 * Displays time complexity curves for common algorithm classes.
 * Users can toggle up to 10 algorithms on/off via checkboxes.
 * Supports optional logarithmic Y-axis scale for better visibility.
 *
 * Requirements: 4.7
 */
export function BigOChart() {
  const [enabledClasses, setEnabledClasses] = useState<Set<string>>(
    () => new Set(COMPLEXITY_CLASSES.map((c) => c.id))
  );
  const [useLogScale, setUseLogScale] = useState(false);

  const chartData = useMemo(() => generateChartData(COMPLEXITY_CLASSES), []);

  const toggleClass = (id: string) => {
    setEnabledClasses((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (enabledClasses.size === COMPLEXITY_CLASSES.length) {
      setEnabledClasses(new Set());
    } else {
      setEnabledClasses(new Set(COMPLEXITY_CLASSES.map((c) => c.id)));
    }
  };

  return (
    <div className="bigo-chart">
      <div className="bigo-chart__header">
        <h3 className="bigo-chart__title">Big O Complexity Comparison</h3>
        <label className="bigo-chart__scale-toggle">
          <input
            type="checkbox"
            checked={useLogScale}
            onChange={(e) => setUseLogScale(e.target.checked)}
          />
          Logarithmic Y-axis
        </label>
      </div>

      <div className="bigo-chart__controls">
        <button
          className="bigo-chart__toggle-all"
          onClick={toggleAll}
          type="button"
        >
          {enabledClasses.size === COMPLEXITY_CLASSES.length
            ? 'Deselect All'
            : 'Select All'}
        </button>

        <fieldset className="bigo-chart__checkboxes">
          <legend className="bigo-chart__legend-label">
            Toggle complexity classes
          </legend>
          {COMPLEXITY_CLASSES.map((cls) => (
            <label key={cls.id} className="bigo-chart__checkbox-label">
              <input
                type="checkbox"
                checked={enabledClasses.has(cls.id)}
                onChange={() => toggleClass(cls.id)}
              />
              <span
                className="bigo-chart__color-swatch"
                style={{ backgroundColor: cls.color }}
                aria-hidden="true"
              />
              {cls.label}
            </label>
          ))}
        </fieldset>
      </div>

      <div className="bigo-chart__chart-container">
        <ResponsiveContainer width="100%" height={400}>
          <LineChart
            data={chartData}
            margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
          >
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis
              dataKey="n"
              label={{ value: 'Input Size (n)', position: 'bottom', offset: 0 }}
            />
            <YAxis
              scale={useLogScale ? 'log' : 'auto'}
              domain={useLogScale ? [1, MAX_Y_VALUE] : [0, 'auto']}
              allowDataOverflow
              label={{
                value: 'Operations',
                angle: -90,
                position: 'insideLeft',
              }}
            />
            <Tooltip
              formatter={(value: number, name: string) => {
                const cls = COMPLEXITY_CLASSES.find((c) => c.id === name);
                const displayValue =
                  value >= MAX_Y_VALUE ? `≥${MAX_Y_VALUE}` : value.toFixed(1);
                return [displayValue, cls?.label ?? name];
              }}
              labelFormatter={(label) => `n = ${label}`}
            />
            <Legend />
            {COMPLEXITY_CLASSES.map(
              (cls) =>
                enabledClasses.has(cls.id) && (
                  <Line
                    key={cls.id}
                    type="monotone"
                    dataKey={cls.id}
                    name={cls.label}
                    stroke={cls.color}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                    isAnimationActive={false}
                  />
                )
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default BigOChart;
