import { useState, useCallback, useRef } from 'react';
import type { PlaygroundProps, PlaygroundState } from '@/types/interactive';

/**
 * CodePlayground component provides an editable code area with JavaScript execution
 * via a Web Worker. Supports a configurable timeout (default 5 seconds) and displays
 * runtime errors with stack traces in an output panel.
 *
 * Props:
 * - initialCode: The starting code to display in the editor
 * - language: 'javascript' | 'pseudocode' (only JS is executable)
 * - timeoutMs: Maximum execution time in milliseconds (default 5000)
 */
export function CodePlayground({
  initialCode,
  language,
  timeoutMs = 5000,
}: PlaygroundProps) {
  const [state, setState] = useState<PlaygroundState>({
    code: initialCode,
    output: '',
    error: null,
    isRunning: false,
  });

  const workerRef = useRef<Worker | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanup = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
  }, []);

  const runCode = useCallback(() => {
    if (language === 'pseudocode') {
      setState((prev) => ({
        ...prev,
        output: '',
        error: 'Pseudocode execution is not supported. Only JavaScript can be executed.',
        isRunning: false,
      }));
      return;
    }

    // Clean up any previous worker
    cleanup();

    setState((prev) => ({
      ...prev,
      output: '',
      error: null,
      isRunning: true,
    }));

    // Create a new worker for each execution
    const worker = new Worker(
      new URL('@/workers/code-runner.worker.ts', import.meta.url),
      { type: 'module' }
    );
    workerRef.current = worker;

    // Set up timeout
    timeoutRef.current = setTimeout(() => {
      cleanup();
      setState((prev) => ({
        ...prev,
        output: '',
        error: 'Execution timed out after 5 seconds',
        isRunning: false,
      }));
    }, timeoutMs);

    // Handle worker response
    worker.onmessage = (event: MessageEvent<{ output: string; error: string | null }>) => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      const { output, error } = event.data;
      setState((prev) => ({
        ...prev,
        output,
        error,
        isRunning: false,
      }));
      worker.terminate();
      workerRef.current = null;
    };

    // Handle worker errors (e.g., syntax errors in worker itself)
    worker.onerror = (event: ErrorEvent) => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setState((prev) => ({
        ...prev,
        output: '',
        error: `Worker error: ${event.message}`,
        isRunning: false,
      }));
      worker.terminate();
      workerRef.current = null;
    };

    // Send code to worker
    worker.postMessage({ type: 'run', code: state.code });
  }, [state.code, language, timeoutMs, cleanup]);

  const resetCode = useCallback(() => {
    cleanup();
    setState({
      code: initialCode,
      output: '',
      error: null,
      isRunning: false,
    });
  }, [initialCode, cleanup]);

  const handleCodeChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setState((prev) => ({ ...prev, code: e.target.value }));
    },
    []
  );

  return (
    <div className="code-playground" role="region" aria-label="Code Playground">
      <div className="code-playground__header">
        <span className="code-playground__language-badge">
          {language === 'javascript' ? 'JavaScript' : 'Pseudocode'}
        </span>
        <div className="code-playground__actions">
          <button
            className="code-playground__btn code-playground__btn--run"
            onClick={runCode}
            disabled={state.isRunning}
            aria-label="Run code"
          >
            {state.isRunning ? 'Running…' : '▶ Run'}
          </button>
          <button
            className="code-playground__btn code-playground__btn--reset"
            onClick={resetCode}
            disabled={state.isRunning}
            aria-label="Reset code to initial state"
          >
            ↺ Reset
          </button>
        </div>
      </div>

      <div className="code-playground__editor">
        <textarea
          className="code-playground__textarea"
          value={state.code}
          onChange={handleCodeChange}
          spellCheck={false}
          aria-label="Code editor"
          disabled={state.isRunning}
        />
      </div>

      <div className="code-playground__output" role="log" aria-label="Code output">
        <div className="code-playground__output-header">Output</div>
        {state.isRunning && (
          <div className="code-playground__loading" aria-live="polite">
            Executing…
          </div>
        )}
        {state.error && (
          <pre className="code-playground__error" aria-live="assertive">
            {state.error}
          </pre>
        )}
        {!state.isRunning && !state.error && state.output && (
          <pre className="code-playground__result">{state.output}</pre>
        )}
        {!state.isRunning && !state.error && !state.output && (
          <div className="code-playground__placeholder">
            Click "Run" to execute the code
          </div>
        )}
      </div>
    </div>
  );
}

export default CodePlayground;
