/**
 * Type declarations for sql.js 1.x
 * sql.js doesn't ship its own TypeScript types.
 */

declare module 'sql.js' {
  interface SqlJsStatic {
    Database: new (data?: ArrayLike<number> | Buffer | null) => Database;
  }

  interface Database {
    run(sql: string, params?: BindParams): Database;
    exec(sql: string, params?: BindParams): QueryExecResult[];
    close(): void;
  }

  interface QueryExecResult {
    columns: string[];
    values: SqlValue[][];
  }

  type SqlValue = string | number | Uint8Array | null;
  type BindParams = SqlValue[] | Record<string, SqlValue>;

  interface SqlJsConfig {
    locateFile?: (filename: string) => string;
  }

  export default function initSqlJs(config?: SqlJsConfig): Promise<SqlJsStatic>;
  export type { SqlJsStatic, Database, QueryExecResult, SqlValue, BindParams };
}
