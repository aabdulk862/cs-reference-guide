/**
 * ComplexityBadge — Color-coded Big-O notation badge.
 *
 * Maps complexity classes to a consistent color scheme used across the app:
 * - O(1)       → green  (excellent)
 * - O(log n)   → teal   (great)
 * - O(n)       → blue   (good)
 * - O(n log n) → purple (acceptable)
 * - O(n²)      → orange (caution)
 * - O(n³)      → red-orange (poor)
 * - O(2^n)     → red    (bad)
 * - O(n!)      → dark red (terrible)
 */

type ComplexityLevel = 'constant' | 'logarithmic' | 'linear' | 'linearithmic' | 'quadratic' | 'cubic' | 'exponential' | 'factorial' | 'unknown';

interface ComplexityBadgeProps {
  /** The complexity string, e.g. "O(n)", "O(n log n)", "O(1)" */
  value: string;
  /** Optional label like "Time" or "Space" */
  label?: string;
  /** Size variant */
  size?: 'sm' | 'md';
}

/** Classify a Big-O string into a complexity level */
function classifyComplexity(value: string): ComplexityLevel {
  const normalized = value.replace(/\s+/g, '').toLowerCase();

  if (/^o\(1\)$/.test(normalized)) return 'constant';
  if (/^o\(log\s*n\)$/.test(normalized) || /^o\(logn\)$/.test(normalized)) return 'logarithmic';
  if (/^o\(n\)$/.test(normalized)) return 'linear';
  if (/^o\(nlog\s*n\)$/.test(normalized) || /^o\(n\s*log\s*n\)$/.test(normalized)) return 'linearithmic';
  if (/^o\(n[²2]\)$/.test(normalized) || /^o\(n\^2\)$/.test(normalized)) return 'quadratic';
  if (/^o\(n[³3]\)$/.test(normalized) || /^o\(n\^3\)$/.test(normalized)) return 'cubic';
  if (/^o\(2\^?n\)$/.test(normalized) || /^o\(2n\)$/.test(normalized)) return 'exponential';
  if (/^o\(n[!]\)$/.test(normalized) || /^o\(n!\)$/.test(normalized)) return 'factorial';

  // Fallback heuristics
  if (normalized.includes('log')) return 'logarithmic';
  if (normalized.includes('n²') || normalized.includes('n^2') || normalized.includes('n2')) return 'quadratic';
  if (normalized.includes('2^n') || normalized.includes('2n')) return 'exponential';
  if (normalized.includes('n!')) return 'factorial';

  return 'unknown';
}

export function ComplexityBadge({ value, label, size = 'md' }: ComplexityBadgeProps) {
  const level = classifyComplexity(value);

  return (
    <span className={`complexity-badge complexity-badge--${level} complexity-badge--${size}`}>
      {label && <span className="complexity-badge__label">{label}</span>}
      <span className="complexity-badge__value">{value}</span>
    </span>
  );
}

interface ComplexityPairProps {
  time: string;
  space: string;
  why?: string;
}

/**
 * ComplexityPair — Renders time + space badges together with optional explanation.
 * Used in pattern sections, algorithm cards, etc.
 */
export function ComplexityPair({ time, space, why }: ComplexityPairProps) {
  return (
    <div className="complexity-pair">
      <div className="complexity-pair__badges">
        <ComplexityBadge value={time} label="Time" />
        <ComplexityBadge value={space} label="Space" />
      </div>
      {why && <p className="complexity-pair__why">{why}</p>}
    </div>
  );
}

export default ComplexityBadge;
