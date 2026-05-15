/**
 * Web Worker for executing user-provided JavaScript code in a sandboxed context.
 * Receives code via postMessage, executes it using Function() constructor,
 * captures console output, and posts back results or errors.
 */

// Message types
interface RunCodeMessage {
  type: 'run';
  code: string;
}

interface WorkerResult {
  output: string;
  error: string | null;
}

// Override console methods to capture output
const outputLines: string[] = [];

const capturedConsole = {
  log: (...args: unknown[]) => {
    outputLines.push(args.map(formatValue).join(' '));
  },
  warn: (...args: unknown[]) => {
    outputLines.push(`[warn] ${args.map(formatValue).join(' ')}`);
  },
  error: (...args: unknown[]) => {
    outputLines.push(`[error] ${args.map(formatValue).join(' ')}`);
  },
  info: (...args: unknown[]) => {
    outputLines.push(`[info] ${args.map(formatValue).join(' ')}`);
  },
};

function formatValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

self.onmessage = (event: MessageEvent<RunCodeMessage>) => {
  if (event.data.type !== 'run') return;

  const { code } = event.data;

  // Clear previous output
  outputLines.length = 0;

  try {
    // Create a function with console override and execute the code
    const fn = new Function('console', code);
    fn(capturedConsole);

    const result: WorkerResult = {
      output: outputLines.join('\n'),
      error: null,
    };
    self.postMessage(result);
  } catch (err: unknown) {
    const error = err instanceof Error
      ? `${err.name}: ${err.message}${err.stack ? '\n' + err.stack : ''}`
      : String(err);

    const result: WorkerResult = {
      output: outputLines.join('\n'),
      error,
    };
    self.postMessage(result);
  }
};
