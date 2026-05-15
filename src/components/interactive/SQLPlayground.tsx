import { useState, useEffect, useRef, useCallback } from 'react';
import type { Database, QueryExecResult } from 'sql.js';

/**
 * Sample schema and data for the SQL playground.
 * A simple employees/departments dataset for practicing SQL queries.
 */
const SAMPLE_SCHEMA_SQL = `CREATE TABLE departments (id INTEGER PRIMARY KEY, name TEXT);
CREATE TABLE employees (id INTEGER PRIMARY KEY, name TEXT, department_id INTEGER, salary REAL);
INSERT INTO departments VALUES (1, 'Engineering'), (2, 'Marketing'), (3, 'Sales');
INSERT INTO employees VALUES (1, 'Alice', 1, 95000), (2, 'Bob', 1, 88000), (3, 'Charlie', 2, 72000), (4, 'Diana', 3, 68000), (5, 'Eve', 1, 102000);`;

const SCHEMA_DESCRIPTION = [
  {
    name: 'departments',
    columns: [
      { name: 'id', type: 'INTEGER', constraint: 'PRIMARY KEY' },
      { name: 'name', type: 'TEXT', constraint: '' },
    ],
  },
  {
    name: 'employees',
    columns: [
      { name: 'id', type: 'INTEGER', constraint: 'PRIMARY KEY' },
      { name: 'name', type: 'TEXT', constraint: '' },
      { name: 'department_id', type: 'INTEGER', constraint: 'FK → departments.id' },
      { name: 'salary', type: 'REAL', constraint: '' },
    ],
  },
];

const DEFAULT_QUERY = `SELECT e.name, d.name AS department, e.salary
FROM employees e
JOIN departments d ON e.department_id = d.id
ORDER BY e.salary DESC;`;

/**
 * SQL Playground component that provides an interactive SQL execution environment.
 * Uses sql.js (SQLite compiled to WASM) for client-side SQL execution.
 * Pre-loads a sample dataset and displays query results in table format.
 *
 * Validates: Requirement 13.2
 */
export function SQLPlayground() {
  const [db, setDb] = useState<Database | null>(null);
  const [query, setQuery] = useState(DEFAULT_QUERY);
  const [results, setResults] = useState<QueryExecResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [schemaOpen, setSchemaOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Initialize sql.js and create the database with sample data
  useEffect(() => {
    let cancelled = false;

    async function initDatabase() {
      try {
        const initSqlJs = (await import('sql.js')).default;
        const SQL = await initSqlJs({
          locateFile: (file: string) => `https://sql.js.org/dist/${file}`,
        });

        if (cancelled) return;

        const database = new SQL.Database();
        database.run(SAMPLE_SCHEMA_SQL);
        setDb(database);
        setIsLoading(false);
      } catch (err) {
        if (cancelled) return;
        setLoadError(
          err instanceof Error
            ? `Failed to load SQL engine: ${err.message}`
            : 'Failed to load SQL engine'
        );
        setIsLoading(false);
      }
    }

    initDatabase();

    return () => {
      cancelled = true;
    };
  }, []);

  // Clean up database on unmount
  useEffect(() => {
    return () => {
      if (db) {
        db.close();
      }
    };
  }, [db]);

  const runQuery = useCallback(() => {
    if (!db) return;

    setError(null);
    setResults([]);

    try {
      const queryResults = db.exec(query);
      setResults(queryResults);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'An unknown error occurred'
      );
    }
  }, [db, query]);

  const resetQuery = useCallback(() => {
    setQuery(DEFAULT_QUERY);
    setResults([]);
    setError(null);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Ctrl+Enter or Cmd+Enter to run query
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        runQuery();
      }
    },
    [runQuery]
  );

  if (isLoading) {
    return (
      <div className="sql-playground" aria-busy="true">
        <div className="sql-playground__loading">
          <span className="sql-playground__spinner" aria-hidden="true" />
          Loading SQL engine...
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="sql-playground">
        <div className="sql-playground__error" role="alert">
          {loadError}
        </div>
      </div>
    );
  }

  return (
    <div className="sql-playground">
      <div className="sql-playground__header">
        <h3 className="sql-playground__title">SQL Playground</h3>
        <button
          type="button"
          className="sql-playground__schema-toggle"
          onClick={() => setSchemaOpen(!schemaOpen)}
          aria-expanded={schemaOpen}
          aria-controls="sql-schema-panel"
        >
          {schemaOpen ? '▾ Hide Schema' : '▸ Show Schema'}
        </button>
      </div>

      {schemaOpen && (
        <div
          id="sql-schema-panel"
          className="sql-playground__schema"
          role="region"
          aria-label="Database schema"
        >
          {SCHEMA_DESCRIPTION.map((table) => (
            <div key={table.name} className="sql-playground__table-schema">
              <h4 className="sql-playground__table-name">{table.name}</h4>
              <table className="sql-playground__schema-table">
                <thead>
                  <tr>
                    <th>Column</th>
                    <th>Type</th>
                    <th>Constraint</th>
                  </tr>
                </thead>
                <tbody>
                  {table.columns.map((col) => (
                    <tr key={col.name}>
                      <td>{col.name}</td>
                      <td>{col.type}</td>
                      <td>{col.constraint}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      <div className="sql-playground__editor">
        <label htmlFor="sql-query-input" className="sql-playground__label">
          SQL Query
          <span className="sql-playground__hint">
            (Ctrl+Enter to run)
          </span>
        </label>
        <textarea
          id="sql-query-input"
          ref={textareaRef}
          className="sql-playground__textarea"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={6}
          spellCheck={false}
          aria-label="SQL query input"
        />
      </div>

      <div className="sql-playground__actions">
        <button
          type="button"
          className="sql-playground__run-btn"
          onClick={runQuery}
          disabled={!db || !query.trim()}
        >
          ▶ Run Query
        </button>
        <button
          type="button"
          className="sql-playground__reset-btn"
          onClick={resetQuery}
        >
          ↺ Reset
        </button>
      </div>

      {error && (
        <div className="sql-playground__error" role="alert">
          <strong>Error:</strong> {error}
        </div>
      )}

      {results.length > 0 && (
        <div className="sql-playground__results" role="region" aria-label="Query results">
          {results.map((result, idx) => (
            <div key={idx} className="sql-playground__result-set">
              <div className="sql-playground__result-info">
                {result.values.length} row{result.values.length !== 1 ? 's' : ''} returned
              </div>
              <div className="sql-playground__table-wrapper">
                <table className="sql-playground__result-table">
                  <thead>
                    <tr>
                      {result.columns.map((col) => (
                        <th key={col}>{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.values.map((row, rowIdx) => (
                      <tr key={rowIdx}>
                        {row.map((cell, cellIdx) => (
                          <td key={cellIdx}>
                            {cell === null ? (
                              <span className="sql-playground__null">NULL</span>
                            ) : (
                              String(cell)
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {results.length === 0 && !error && query.trim() && (
        <div className="sql-playground__empty">
          Click "Run Query" or press Ctrl+Enter to execute your SQL.
        </div>
      )}
    </div>
  );
}

export default SQLPlayground;
