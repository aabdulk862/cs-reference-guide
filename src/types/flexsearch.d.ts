/**
 * Type declarations for flexsearch 0.7.x
 * FlexSearch doesn't ship its own types and @types/flexsearch is not available.
 */

declare module 'flexsearch' {
  interface DocumentOptions<T> {
    document: {
      id: string;
      index: string[];
      store?: string[] | boolean;
    };
    tokenize?: 'strict' | 'forward' | 'reverse' | 'full';
    cache?: boolean | number;
    resolution?: number;
  }

  interface SearchOptions {
    limit?: number;
    enrich?: boolean;
  }

  interface EnrichedResult<T> {
    field: string;
    result: Array<string | number>;
  }

  class FlexDocument<T = Record<string, unknown>> {
    constructor(options: DocumentOptions<T>);
    add(doc: T): void;
    add(id: string | number, doc: T): void;
    search(query: string, options?: SearchOptions): EnrichedResult<T>[];
    search(query: string, limit?: number): EnrichedResult<T>[];
    remove(id: string | number): void;
    update(doc: T): void;
  }

  class Index {
    constructor(options?: {
      tokenize?: 'strict' | 'forward' | 'reverse' | 'full';
      cache?: boolean | number;
      resolution?: number;
    });
    add(id: string | number, content: string): void;
    search(query: string, options?: SearchOptions): Array<string | number>;
    search(query: string, limit?: number): Array<string | number>;
    remove(id: string | number): void;
    update(id: string | number, content: string): void;
  }

  interface FlexSearchStatic {
    Document: typeof FlexDocument;
    Index: typeof Index;
  }

  const FlexSearch: FlexSearchStatic;

  export default FlexSearch;
  export { FlexDocument as Document, Index };
}
