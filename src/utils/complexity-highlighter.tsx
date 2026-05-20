/**
 * Complexity Highlighter — Detects Big-O notation in text and renders
 * color-coded inline badges automatically.
 *
 * Matches patterns like O(1), O(n), O(n log n), O(n²), O(2ⁿ), O(n!), etc.
 * Wraps them in <span> elements with the appropriate complexity-level class.
 */

import React from 'react';

type ComplexityLevel = 'constant' | 'logarithmic' | 'linear' | 'linearithmic' | 'quadratic' | 'cubic' | 'exponential' | 'factorial' | 'unknown';

/**
 * Regex to match Big-O notation in text.
 * Matches: O(1), O(n), O(log n), O(n log n), O(n²), O(n^2), O(2ⁿ), O(2^n), O(n!), O(k), O(V+E), O(n·m), etc.
 */
const BIG_O_REGEX = /O\([^)]+\)/g;

/** Classify a Big-O string into a complexity level for coloring */
function classifyComplexity(value: string): ComplexityLevel {
  const normalized = value.replace(/\s+/g, '').toLowerCase();

  // Exact matches first
  if (/^o\(1\)$/.test(normalized)) return 'constant';
  if (/^o\(logn\)$/.test(normalized) || /^o\(log\s*n\)$/i.test(value.replace(/\s+/g, ' ').toLowerCase())) return 'logarithmic';
  if (/^o\(n\)$/.test(normalized)) return 'linear';
  if (/^o\(k\)$/.test(normalized)) return 'linear';

  // Compound patterns
  if (/o\(nlogn\)/.test(normalized) || /o\(n\s*log\s*n\)/i.test(value.replace(/\s+/g, ''))) return 'linearithmic';
  if (/o\(nlogk\)/.test(normalized)) return 'linearithmic';

  // Quadratic+
  if (/o\(n[²2]\)/.test(normalized) || /o\(n\^2\)/.test(normalized)) return 'quadratic';
  if (/o\(n[³3]\)/.test(normalized) || /o\(n\^3\)/.test(normalized)) return 'cubic';

  // Exponential
  if (/o\(2[ⁿn]\)/.test(normalized) || /o\(2\^n\)/.test(normalized)) return 'exponential';

  // Factorial
  if (/o\(n[!]\)/.test(normalized) || /o\(n!\)/.test(normalized)) return 'factorial';

  // Heuristic fallbacks
  if (/log/.test(normalized) && /n/.test(normalized) && !/nlog/.test(normalized)) return 'logarithmic';
  if (/nlog/.test(normalized)) return 'linearithmic';
  if (/n²|n\^2|n2/.test(normalized)) return 'quadratic';
  if (/2\^n|2ⁿ|2n/.test(normalized)) return 'exponential';
  if (/n!/.test(normalized)) return 'factorial';
  if (/v\+e|v\s*\+\s*e/.test(normalized)) return 'linear';
  if (/α/.test(normalized)) return 'constant'; // O(α(n)) ≈ constant

  return 'unknown';
}

/**
 * Takes a plain text string and returns React nodes with Big-O notations
 * wrapped in colored inline badges.
 */
export function highlightComplexity(text: string): React.ReactNode {
  if (!text || !BIG_O_REGEX.test(text)) {
    return text;
  }

  // Reset regex lastIndex
  BIG_O_REGEX.lastIndex = 0;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = BIG_O_REGEX.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    // Add the highlighted complexity notation
    const notation = match[0];
    const level = classifyComplexity(notation);
    parts.push(
      <span key={match.index} className={`complexity-inline complexity-inline--${level}`}>
        {notation}
      </span>
    );

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text after last match
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return <>{parts}</>;
}
