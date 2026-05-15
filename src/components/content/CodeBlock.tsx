import { useState, useCallback, useRef } from 'react';

export interface CodeBlockProps {
  /** The source code to display */
  code: string;
  /** Programming language for syntax highlighting and label */
  language: string;
  /** Whether the code is runnable in a playground (informational) */
  runnable?: boolean;
}

/**
 * Syntax-highlighted code block with one-click copy button.
 * Displays code in a pre/code block with language annotation,
 * a language label in the header, and a copy button that shows
 * "Copied ✓" confirmation for 2 seconds after activation.
 *
 * Validates: Requirement 3.3
 */
export function CodeBlock({ code, language, runnable = false }: CodeBlockProps) {
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopy = useCallback(async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(code);
      } else {
        // Fallback for environments without clipboard API
        fallbackCopy(code);
      }

      setCopyState('copied');

      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Reset after 2 seconds
      timeoutRef.current = setTimeout(() => {
        setCopyState('idle');
        timeoutRef.current = null;
      }, 2000);
    } catch {
      // If clipboard API fails, try fallback
      try {
        fallbackCopy(code);
        setCopyState('copied');

        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = setTimeout(() => {
          setCopyState('idle');
          timeoutRef.current = null;
        }, 2000);
      } catch {
        // Silently fail if both methods unavailable
      }
    }
  }, [code]);

  const highlightedCode = applyBasicHighlighting(code, language);

  return (
    <div className="codeblock-container" data-language={language}>
      <div className="codeblock-header">
        <span className="codeblock-language">{language}</span>
        <div className="codeblock-actions">
          {runnable && (
            <span className="codeblock-runnable-badge" aria-label="Runnable code">
              ▶ Runnable
            </span>
          )}
          <button
            type="button"
            className={`codeblock-copy-btn ${copyState === 'copied' ? 'codeblock-copy-btn--copied' : ''}`}
            onClick={handleCopy}
            aria-label={copyState === 'copied' ? 'Copied to clipboard' : 'Copy code to clipboard'}
          >
            {copyState === 'copied' ? 'Copied ✓' : 'Copy'}
          </button>
        </div>
      </div>
      <pre className="codeblock-pre">
        <code
          className={`codeblock-code language-${language}`}
          dangerouslySetInnerHTML={{ __html: highlightedCode }}
        />
      </pre>
    </div>
  );
}

/**
 * Fallback copy method using document.execCommand('copy')
 * for environments where navigator.clipboard is unavailable.
 */
function fallbackCopy(text: string): void {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '-9999px';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

/**
 * Apply basic syntax highlighting via CSS class spans.
 * Uses a tokenization approach to avoid nested/conflicting replacements.
 * Wraps recognized tokens in <span> elements with appropriate
 * CSS classes that map to the design system's syntax colors.
 *
 * Supported highlights:
 * - Keywords (kw): language-specific reserved words
 * - Strings (str): single/double quoted strings and template literals
 * - Comments (comment): single-line and multi-line comments
 * - Numbers (num): numeric literals
 * - Functions (fn): function calls and declarations
 */
function applyBasicHighlighting(code: string, language: string): string {
  const keywords = getKeywords(language);
  const lang = language.toLowerCase();
  const useHashComments = ['python', 'ruby', 'bash', 'shell', 'sh'].includes(lang);

  // Build a combined regex that matches tokens in priority order.
  // Earlier alternatives take priority (comments > strings > numbers > keywords > functions).
  const parts: string[] = [];

  // Multi-line comments: /* ... */
  parts.push('(\\/\\*[\\s\\S]*?\\*\\/)');
  // Single-line comments: // ...
  parts.push('(\\/\\/[^\\n]*)');
  // Hash comments
  if (useHashComments) {
    parts.push('(#[^\\n]*)');
  }
  // Double-quoted strings
  parts.push('("(?:[^"\\\\]|\\\\.)*")');
  // Single-quoted strings
  parts.push("('(?:[^'\\\\]|\\\\.)*')");
  // Template literals
  parts.push('(`(?:[^`\\\\]|\\\\.)*`)');
  // Numbers
  parts.push('(\\b\\d+\\.?\\d*(?:e[+-]?\\d+)?\\b)');
  // Keywords (word boundary match)
  if (keywords.length > 0) {
    parts.push(`(\\b(?:${keywords.join('|')})\\b)`);
  }
  // Function calls: identifier followed by (
  parts.push('(\\b[a-zA-Z_]\\w*(?=\\s*\\())');

  const combinedRegex = new RegExp(parts.join('|'), 'g');

  // Determine group indices for classification
  let groupIdx = 0;
  const commentGroups: number[] = [];
  // Multi-line comment
  commentGroups.push(++groupIdx);
  // Single-line comment
  commentGroups.push(++groupIdx);
  // Hash comment
  if (useHashComments) {
    commentGroups.push(++groupIdx);
  }
  const stringGroups: number[] = [];
  // Double-quoted string
  stringGroups.push(++groupIdx);
  // Single-quoted string
  stringGroups.push(++groupIdx);
  // Template literal
  stringGroups.push(++groupIdx);
  // Number
  const numberGroup = ++groupIdx;
  // Keywords
  let keywordGroup = -1;
  if (keywords.length > 0) {
    keywordGroup = ++groupIdx;
  }
  // Function
  const fnGroup = ++groupIdx;

  let result = '';
  let lastIndex = 0;

  // Reset regex
  combinedRegex.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = combinedRegex.exec(code)) !== null) {
    // Append text before this match (escaped)
    if (match.index > lastIndex) {
      result += escapeHtml(code.slice(lastIndex, match.index));
    }

    const matchedText = match[0];
    const escapedMatch = escapeHtml(matchedText);

    // Determine which group matched
    let className = '';
    for (let i = 1; i <= groupIdx; i++) {
      if (match[i] !== undefined) {
        if (commentGroups.includes(i)) {
          className = 'comment';
        } else if (stringGroups.includes(i)) {
          className = 'str';
        } else if (i === numberGroup) {
          className = 'num';
        } else if (i === keywordGroup) {
          className = 'kw';
        } else if (i === fnGroup) {
          className = 'fn';
        }
        break;
      }
    }

    if (className) {
      result += `<span class="${className}">${escapedMatch}</span>`;
    } else {
      result += escapedMatch;
    }

    lastIndex = match.index + matchedText.length;
  }

  // Append remaining text
  if (lastIndex < code.length) {
    result += escapeHtml(code.slice(lastIndex));
  }

  return result;
}

/** Escape HTML special characters */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Returns language-specific keywords for syntax highlighting.
 */
function getKeywords(language: string): string[] {
  const lang = language.toLowerCase();

  const keywordMap: Record<string, string[]> = {
    javascript: [
      'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for',
      'while', 'do', 'switch', 'case', 'break', 'continue', 'new', 'this',
      'class', 'extends', 'import', 'export', 'default', 'from', 'async',
      'await', 'try', 'catch', 'finally', 'throw', 'typeof', 'instanceof',
      'null', 'undefined', 'true', 'false', 'yield', 'of', 'in',
    ],
    typescript: [
      'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for',
      'while', 'do', 'switch', 'case', 'break', 'continue', 'new', 'this',
      'class', 'extends', 'import', 'export', 'default', 'from', 'async',
      'await', 'try', 'catch', 'finally', 'throw', 'typeof', 'instanceof',
      'null', 'undefined', 'true', 'false', 'yield', 'of', 'in',
      'interface', 'type', 'enum', 'implements', 'abstract', 'private',
      'protected', 'public', 'readonly', 'static', 'as', 'is', 'keyof',
      'never', 'unknown', 'any', 'void',
    ],
    java: [
      'public', 'private', 'protected', 'static', 'final', 'abstract',
      'class', 'interface', 'extends', 'implements', 'new', 'return',
      'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break',
      'continue', 'try', 'catch', 'finally', 'throw', 'throws', 'void',
      'int', 'long', 'double', 'float', 'boolean', 'char', 'byte',
      'short', 'null', 'true', 'false', 'this', 'super', 'import',
      'package', 'instanceof', 'synchronized', 'volatile', 'transient',
    ],
    python: [
      'def', 'class', 'return', 'if', 'elif', 'else', 'for', 'while',
      'break', 'continue', 'import', 'from', 'as', 'try', 'except',
      'finally', 'raise', 'with', 'yield', 'lambda', 'pass', 'None',
      'True', 'False', 'and', 'or', 'not', 'in', 'is', 'global',
      'nonlocal', 'del', 'assert', 'async', 'await',
    ],
    sql: [
      'SELECT', 'FROM', 'WHERE', 'INSERT', 'UPDATE', 'DELETE', 'CREATE',
      'DROP', 'ALTER', 'TABLE', 'INDEX', 'VIEW', 'JOIN', 'LEFT', 'RIGHT',
      'INNER', 'OUTER', 'ON', 'AND', 'OR', 'NOT', 'IN', 'BETWEEN',
      'LIKE', 'ORDER', 'BY', 'GROUP', 'HAVING', 'LIMIT', 'OFFSET',
      'AS', 'NULL', 'IS', 'SET', 'VALUES', 'INTO', 'DISTINCT', 'COUNT',
      'SUM', 'AVG', 'MAX', 'MIN', 'UNION', 'ALL', 'EXISTS', 'CASE',
      'WHEN', 'THEN', 'ELSE', 'END', 'PRIMARY', 'KEY', 'FOREIGN',
      'REFERENCES', 'CONSTRAINT', 'DEFAULT', 'CHECK', 'UNIQUE',
    ],
    css: [
      'import', 'media', 'keyframes', 'font-face', 'supports',
    ],
    bash: [
      'if', 'then', 'else', 'elif', 'fi', 'for', 'while', 'do', 'done',
      'case', 'esac', 'function', 'return', 'exit', 'echo', 'export',
      'local', 'readonly', 'shift', 'source', 'set', 'unset',
    ],
    shell: [
      'if', 'then', 'else', 'elif', 'fi', 'for', 'while', 'do', 'done',
      'case', 'esac', 'function', 'return', 'exit', 'echo', 'export',
      'local', 'readonly', 'shift', 'source', 'set', 'unset',
    ],
    go: [
      'func', 'return', 'if', 'else', 'for', 'range', 'switch', 'case',
      'break', 'continue', 'package', 'import', 'var', 'const', 'type',
      'struct', 'interface', 'map', 'chan', 'go', 'defer', 'select',
      'nil', 'true', 'false', 'make', 'new', 'append', 'len', 'cap',
    ],
    rust: [
      'fn', 'let', 'mut', 'const', 'if', 'else', 'for', 'while', 'loop',
      'match', 'return', 'struct', 'enum', 'impl', 'trait', 'pub', 'use',
      'mod', 'self', 'super', 'crate', 'where', 'async', 'await', 'move',
      'true', 'false', 'Some', 'None', 'Ok', 'Err', 'unsafe', 'ref',
    ],
  };

  // Also support 'js' and 'ts' aliases
  if (lang === 'js' || lang === 'jsx') return keywordMap.javascript || [];
  if (lang === 'ts' || lang === 'tsx') return keywordMap.typescript || [];
  if (lang === 'sh') return keywordMap.bash || [];

  return keywordMap[lang] || [];
}
