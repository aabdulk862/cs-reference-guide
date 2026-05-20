/**
 * BigOChart — Static, polished Big-O Complexity Chart.
 *
 * A clean, non-interactive visualization matching the classic bigocheatsheet.com style.
 * Colored background zones from green (Excellent) to red (Horrible) with
 * smooth curves for each complexity class labeled directly on the chart.
 */

/** Chart layout constants */
const W = 720;
const H = 400;
const PAD = { top: 24, right: 24, bottom: 44, left: 52 };
const PW = W - PAD.left - PAD.right;
const PH = H - PAD.top - PAD.bottom;
const MAX_N = 35;
const MAX_OPS = 500;

/** Complexity curves */
const CURVES = [
  { label: 'O(1)', color: '#2d9d4e', fn: () => 1 },
  { label: 'O(log n)', color: '#3498db', fn: (n: number) => Math.log2(Math.max(n, 1)) * 8 },
  { label: 'O(n)', color: '#f39c12', fn: (n: number) => n * 12 },
  { label: 'O(n log n)', color: '#e67e22', fn: (n: number) => n * Math.log2(Math.max(n, 1)) * 4 },
  { label: 'O(n²)', color: '#e74c3c', fn: (n: number) => n * n * 0.4 },
  { label: 'O(2ⁿ)', color: '#9b59b6', fn: (n: number) => Math.pow(2, n) * 0.01 },
  { label: 'O(n!)', color: '#8e44ad', fn: (n: number) => gamma(n + 1) * 0.001 },
];

function gamma(n: number): number {
  if (n <= 1) return 1;
  let r = 1;
  for (let i = 2; i <= Math.min(n, 20); i++) r *= i;
  return r;
}

/** Map data coords → SVG coords */
function sx(n: number) { return PAD.left + (n / MAX_N) * PW; }
function sy(ops: number) { return PAD.top + PH - (Math.min(ops, MAX_OPS) / MAX_OPS) * PH; }

/** Build a smooth SVG path */
function buildPath(fn: (n: number) => number): string {
  const pts: [number, number][] = [];
  for (let n = 0.5; n <= MAX_N; n += 0.4) {
    const v = fn(n);
    if (v > MAX_OPS * 1.2) break;
    pts.push([sx(n), sy(v)]);
  }
  if (pts.length < 2) return '';
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    d += ` L ${pts[i][0].toFixed(1)} ${pts[i][1].toFixed(1)}`;
  }
  return d;
}

/** Find label position for a curve */
function labelPos(fn: (n: number) => number): { x: number; y: number } | null {
  // Walk from right to find where curve is still on-chart
  for (let n = MAX_N; n >= 2; n -= 0.5) {
    const v = fn(n);
    if (v <= MAX_OPS * 0.92) {
      return { x: sx(n), y: sy(v) };
    }
  }
  // Curve exits early — find exit point
  for (let n = 2; n <= MAX_N; n += 0.5) {
    if (fn(n) > MAX_OPS * 0.8) {
      return { x: sx(n), y: sy(MAX_OPS * 0.8) };
    }
  }
  return null;
}

export function BigOChart() {
  const yTicks = [0, 100, 200, 300, 400, 500];
  const xTicks = [0, 5, 10, 15, 20, 25, 30, 35];

  return (
    <div className="bigo-chart">
      <div className="bigo-chart__header">
        <h3 className="bigo-chart__title">Big-O Complexity Chart</h3>
      </div>

      <div className="bigo-chart__chart-container">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="bigo-chart__svg"
          role="img"
          aria-label="Big-O complexity chart showing growth rates from O(1) to O(n!)"
        >
          <defs>
            <linearGradient id="zone-gradient" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#53d769" stopOpacity="0.25" />
              <stop offset="15%" stopColor="#a8d94e" stopOpacity="0.22" />
              <stop offset="35%" stopColor="#f5d63d" stopOpacity="0.20" />
              <stop offset="60%" stopColor="#f5a623" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#e74c3c" stopOpacity="0.18" />
            </linearGradient>
          </defs>

          {/* Background gradient zone */}
          <rect
            x={PAD.left}
            y={PAD.top}
            width={PW}
            height={PH}
            fill="url(#zone-gradient)"
          />

          {/* Grid lines */}
          {yTicks.map((t) => (
            <line key={`yg-${t}`} x1={PAD.left} y1={sy(t)} x2={PAD.left + PW} y2={sy(t)}
              stroke="currentColor" strokeOpacity={0.08} strokeDasharray="3 3" />
          ))}
          {xTicks.map((t) => (
            <line key={`xg-${t}`} x1={sx(t)} y1={PAD.top} x2={sx(t)} y2={PAD.top + PH}
              stroke="currentColor" strokeOpacity={0.08} strokeDasharray="3 3" />
          ))}

          {/* Axes */}
          <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + PH}
            stroke="currentColor" strokeOpacity={0.25} strokeWidth={1} />
          <line x1={PAD.left} y1={PAD.top + PH} x2={PAD.left + PW} y2={PAD.top + PH}
            stroke="currentColor" strokeOpacity={0.25} strokeWidth={1} />

          {/* Y-axis labels */}
          {yTicks.map((t) => (
            <text key={`yl-${t}`} x={PAD.left - 8} y={sy(t)} textAnchor="end"
              dominantBaseline="middle" className="bigo-chart__tick">{t}</text>
          ))}

          {/* X-axis labels */}
          {xTicks.map((t) => (
            <text key={`xl-${t}`} x={sx(t)} y={PAD.top + PH + 18} textAnchor="middle"
              className="bigo-chart__tick">{t}</text>
          ))}

          {/* Axis titles */}
          <text x={PAD.left + PW / 2} y={H - 6} textAnchor="middle" className="bigo-chart__axis-title">
            Elements
          </text>
          <text x={14} y={PAD.top + PH / 2} textAnchor="middle" className="bigo-chart__axis-title"
            transform={`rotate(-90, 14, ${PAD.top + PH / 2})`}>
            Operations
          </text>

          {/* Curves */}
          {CURVES.map((c) => {
            const d = buildPath(c.fn);
            if (!d) return null;
            return (
              <path key={c.label} d={d} fill="none" stroke={c.color}
                strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
            );
          })}

          {/* Curve labels */}
          {CURVES.map((c) => {
            const pos = labelPos(c.fn);
            if (!pos) return null;
            return (
              <text key={`lbl-${c.label}`}
                x={Math.min(pos.x + 6, PAD.left + PW - 36)}
                y={Math.max(pos.y - 6, PAD.top + 12)}
                fill={c.color} className="bigo-chart__curve-label">
                {c.label}
              </text>
            );
          })}
        </svg>
      </div>

      {/* Legend strip */}
      <div className="bigo-chart__legend">
        <span className="bigo-chart__legend-zone bigo-chart__legend-zone--excellent">Excellent</span>
        <span className="bigo-chart__legend-zone bigo-chart__legend-zone--good">Good</span>
        <span className="bigo-chart__legend-zone bigo-chart__legend-zone--fair">Fair</span>
        <span className="bigo-chart__legend-zone bigo-chart__legend-zone--bad">Bad</span>
        <span className="bigo-chart__legend-zone bigo-chart__legend-zone--horrible">Horrible</span>
      </div>
    </div>
  );
}

export default BigOChart;
