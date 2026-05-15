import { useState, useCallback, useRef } from 'react';

export interface EnhancedCodeBlockProps {
  /** Programming language for syntax highlighting and label */
  language: string;
  /** The source code to display */
  code: string;
  /** Whether the code is runnable in a playground (informational) */
  runnable?: boolean;
}

export type CopyButtonStatus = 'idle' | 'copied' | 'error';

/**
 * Enhanced code block with language label, syntax highlighting, and copy button.
 * Displays a language label in the header (hidden when language is empty),
 * a copy button that writes to navigator.clipboard.writeText(),
 * a "Copied" confirmation state for 2 seconds, and an error state for 1 second.
 *
 * Validates: Requirements 16.1, 16.2, 16.3, 16.4, 16.5, 16.6
 */
export function EnhancedCodeBlock({ language, code, runnable = false }: EnhancedCodeBlockProps) {
  const [copyStatus, setCopyStatus] = useState<CopyButtonStatus>('idle');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopy = useCallback(async () => {
    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    try {
      await navigator.clipboard.writeText(code);
      setCopyStatus('copied');

      // Reset after 2 seconds
      timeoutRef.current = setTimeout(() => {
        setCopyStatus('idle');
        timeoutRef.current = null;
      }, 2000);
    } catch {
      setCopyStatus('error');

      // Reset after 1 second
      timeoutRef.current = setTimeout(() => {
        setCopyStatus('idle');
        timeoutRef.current = null;
      }, 1000);
    }
  }, [code]);

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => {
      const next = !prev;
      if (next) {
        document.body.style.overflow = 'hidden';
      } else {
        document.body.style.overflow = '';
      }
      return next;
    });
  }, []);

  const highlightedCode = applyBasicHighlighting(code, language);

  const copyButtonLabel = copyStatus === 'copied'
    ? 'Copied to clipboard'
    : copyStatus === 'error'
      ? 'Failed to copy'
      : 'Copy code to clipboard';

  const copyButtonText = copyStatus === 'copied'
    ? 'Copied ✓'
    : copyStatus === 'error'
      ? 'Error'
      : 'Copy';

  const copyButtonClass = `codeblock-copy-btn${
    copyStatus === 'copied' ? ' codeblock-copy-btn--copied' : ''
  }${copyStatus === 'error' ? ' codeblock-copy-btn--error' : ''}`;

  return (
    <div
      className={`codeblock-container${isFullscreen ? ' codeblock-container--fullscreen' : ''}`}
      data-language={language}
    >
      <div className="codeblock-header">
        {language ? (
          <span className="codeblock-language">{language}</span>
        ) : (
          <span />
        )}
        <div className="codeblock-actions">
          {runnable && (
            <span className="codeblock-runnable-badge" aria-label="Runnable code">
              ▶ Runnable
            </span>
          )}
          <button
            type="button"
            className="codeblock-expand-btn"
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'View code fullscreen'}
          >
            {isFullscreen ? '✕' : '⛶'}
          </button>
          <button
            type="button"
            className={copyButtonClass}
            onClick={handleCopy}
            aria-label={copyButtonLabel}
          >
            {copyButtonText}
          </button>
        </div>
      </div>
      <pre className="codeblock-pre">
        <code
          className={`codeblock-code${language ? ` language-${language}` : ''}`}
          dangerouslySetInnerHTML={{ __html: highlightedCode }}
        />
      </pre>
      {isFullscreen && (
        <div className="codeblock-fullscreen-footer">
          <span className="codeblock-fullscreen-hint">
            Scroll freely · Tap ✕ to close
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Apply basic syntax highlighting via CSS class spans.
 * Uses a tokenization approach to avoid nested/conflicting replacements.
 */
function applyBasicHighlighting(code: string, language: string): string {
  const keywords = getKeywords(language);
  const lang = language.toLowerCase();
  const useHashComments = ['python', 'ruby', 'bash', 'shell', 'sh'].includes(lang);

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

  let groupIdx = 0;
  const commentGroups: number[] = [];
  commentGroups.push(++groupIdx);
  commentGroups.push(++groupIdx);
  if (useHashComments) {
    commentGroups.push(++groupIdx);
  }
  const stringGroups: number[] = [];
  stringGroups.push(++groupIdx);
  stringGroups.push(++groupIdx);
  stringGroups.push(++groupIdx);
  const numberGroup = ++groupIdx;
  let keywordGroup = -1;
  if (keywords.length > 0) {
    keywordGroup = ++groupIdx;
  }
  const fnGroup = ++groupIdx;

  let result = '';
  let lastIndex = 0;

  combinedRegex.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = combinedRegex.exec(code)) !== null) {
    if (match.index > lastIndex) {
      result += escapeHtml(code.slice(lastIndex, match.index));
    }

    const matchedText = match[0];
    const escapedMatch = escapeHtml(matchedText);

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

  if (lang === 'js' || lang === 'jsx') return keywordMap.javascript || [];
  if (lang === 'ts' || lang === 'tsx') return keywordMap.typescript || [];
  if (lang === 'sh') return keywordMap.bash || [];

  return keywordMap[lang] || [];
}

export default EnhancedCodeBlock;
