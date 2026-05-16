# Declaration Files and Module Systems

## Quick Reference

- Declaration files (`.d.ts`) provide type information for JavaScript code without modifying source; they contain only type declarations and produce no JavaScript output
- `declare module "package"` types third-party libraries lacking type definitions; `declare global` extends the global scope
- Module augmentation extends existing type declarations without modifying the original package using `declare module` in a module file
- TypeScript resolves types through: co-located `.d.ts` files, `types`/`typings` in package.json, `@types/` packages, and `typeRoots` configuration
- `/// <reference types="..." />` triple-slash directives include global type definitions (Vite client types, Jest matchers)
- The `declare` keyword introduces ambient declarations that describe runtime values without defining them
- `export =` and `import = require()` handle CommonJS interop; `esModuleInterop` enables default import syntax for CJS modules
- `isolatedModules` flag ensures each file can be independently transpiled, required for tools like esbuild and SWC

## When to Use

Declaration files are necessary when consuming JavaScript libraries that do not ship their own types, when extending third-party type definitions with additional properties (Express middleware adding fields to Request), when typing global variables injected by build tools or CDN scripts, and when publishing TypeScript libraries that need to expose types to consumers. Module augmentation is essential for plugin architectures where middleware or extensions add capabilities to existing objects. Understanding type resolution is critical for debugging "cannot find module" errors, resolving conflicting type definitions from multiple sources, and configuring monorepo projects where packages reference each other. The `isolatedModules` flag and its implications matter for projects using fast transpilers (esbuild, SWC, Babel) that process files independently without full program type information.

## Code Examples

```typescript
// Writing declaration files for untyped JavaScript libraries
// types/legacy-analytics.d.ts

declare module "legacy-analytics" {
  export interface AnalyticsConfig {
    apiKey: string;
    endpoint: string;
    batchSize?: number;
    flushInterval?: number;
    debug?: boolean;
    onError?: (error: Error) => void;
  }

  export interface TrackEvent {
    name: string;
    properties?: Record<string, string | number | boolean | null>;
    timestamp?: Date;
    userId?: string;
  }

  export interface IdentifyTraits {
    email?: string;
    name?: string;
    plan?: string;
    [key: string]: unknown;
  }

  export function initialize(config: AnalyticsConfig): void;
  export function track(event: TrackEvent): Promise<void>;
  export function identify(userId: string, traits?: IdentifyTraits): void;
  export function page(name: string, properties?: Record<string, string>): void;
  export function flush(): Promise<void>;
  export function reset(): void;

  // Default export for the analytics instance
  const analytics: {
    initialize: typeof initialize;
    track: typeof track;
    identify: typeof identify;
    page: typeof page;
    flush: typeof flush;
    reset: typeof reset;
  };
  export default analytics;
}

// Typing a module that exports a class with static methods
declare module "connection-pool" {
  export interface PoolConfig {
    min: number;
    max: number;
    idleTimeoutMs?: number;
    acquireTimeoutMs?: number;
  }

  export interface PoolClient {
    query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
    release(): void;
  }

  export default class Pool {
    constructor(config: PoolConfig);
    acquire(): Promise<PoolClient>;
    release(client: PoolClient): void;
    drain(): Promise<void>;
    readonly size: number;
    readonly available: number;
    readonly pending: number;
  }
}


// Global augmentation: extending Window, Process, and built-in types
// types/global.d.ts

declare global {
  interface Window {
    __APP_CONFIG__: {
      apiUrl: string;
      environment: 'development' | 'staging' | 'production';
      version: string;
      featureFlags: Record<string, boolean>;
      sentryDsn?: string;
    };
    __INITIAL_STATE__?: Record<string, unknown>;
    dataLayer: Array<Record<string, unknown>>; // Google Tag Manager
  }

  // Extend NodeJS namespace for custom environment variables
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV: 'development' | 'production' | 'test';
      DATABASE_URL: string;
      REDIS_URL: string;
      JWT_SECRET: string;
      PORT?: string;
      LOG_LEVEL?: 'debug' | 'info' | 'warn' | 'error';
    }
  }

  // Extend Array with a custom utility method
  interface Array<T> {
    groupBy<K extends string | number>(
      keyFn: (item: T) => K
    ): Record<K, T[]>;
  }
}

// Must export something to make this a module (required for declare global)
export {};
```

```typescript
// Module augmentation: extending third-party library types

// Extending Express Request with middleware-added properties
// types/express-augmentation.d.ts
import 'express';

declare module 'express' {
  interface Request {
    // Added by authentication middleware
    userId?: string;
    userRole?: 'admin' | 'user' | 'moderator';
    permissions?: string[];

    // Added by request ID middleware
    requestId: string;

    // Added by rate limiting middleware
    rateLimit?: {
      remaining: number;
      resetAt: Date;
      limit: number;
    };
  }
}

// Extending React Router with typed route params
import 'react-router-dom';

declare module 'react-router-dom' {
  interface RouteParams {
    categorySlug: string;
    topicSlug: string;
    subtopicSlug?: string;
  }
}

// Extending Zustand store with custom middleware types
import 'zustand';

declare module 'zustand' {
  interface StoreMutators<S, A> {
    'custom-logger': Write<Cast<S, object>, { logHistory: string[] }>;
  }
}


// Ambient namespace declarations for global libraries loaded via CDN
// types/vendor.d.ts

declare namespace google.maps {
  class Map {
    constructor(element: HTMLElement, options: MapOptions);
    setCenter(latLng: LatLngLiteral): void;
    setZoom(zoom: number): void;
    panTo(latLng: LatLngLiteral): void;
    fitBounds(bounds: LatLngBounds): void;
    addListener(event: string, handler: Function): MapsEventListener;
  }

  interface MapOptions {
    center: LatLngLiteral;
    zoom: number;
    mapTypeId?: 'roadmap' | 'satellite' | 'hybrid' | 'terrain';
    disableDefaultUI?: boolean;
    styles?: MapTypeStyle[];
  }

  interface LatLngLiteral {
    lat: number;
    lng: number;
  }

  interface LatLngBounds {
    extend(point: LatLngLiteral): void;
    contains(point: LatLngLiteral): boolean;
  }

  interface MapsEventListener {
    remove(): void;
  }

  interface MapTypeStyle {
    featureType?: string;
    elementType?: string;
    stylers: Array<Record<string, string | number>>;
  }

  class Marker {
    constructor(options: MarkerOptions);
    setPosition(latLng: LatLngLiteral): void;
    setMap(map: Map | null): void;
    addListener(event: string, handler: Function): MapsEventListener;
  }

  interface MarkerOptions {
    position: LatLngLiteral;
    map?: Map;
    title?: string;
    icon?: string | Icon;
    draggable?: boolean;
  }

  interface Icon {
    url: string;
    scaledSize?: Size;
  }

  class Size {
    constructor(width: number, height: number);
  }
}

// Stripe.js loaded via CDN
declare namespace Stripe {
  function create(publishableKey: string): StripeInstance;

  interface StripeInstance {
    elements(options?: ElementsOptions): Elements;
    confirmPayment(options: ConfirmPaymentOptions): Promise<PaymentResult>;
    createToken(element: Element): Promise<TokenResult>;
  }

  interface Elements {
    create(type: 'card' | 'cardNumber' | 'cardExpiry' | 'cardCvc', options?: ElementOptions): Element;
  }

  interface Element {
    mount(selector: string): void;
    unmount(): void;
    on(event: 'change' | 'ready' | 'focus' | 'blur', handler: Function): void;
  }

  interface ElementsOptions {
    clientSecret?: string;
    appearance?: { theme: 'stripe' | 'night' | 'flat' };
  }

  interface ElementOptions {
    style?: Record<string, Record<string, string>>;
    placeholder?: string;
  }

  interface ConfirmPaymentOptions {
    elements: Elements;
    confirmParams: { return_url: string };
  }

  interface PaymentResult {
    error?: { message: string; type: string };
    paymentIntent?: { id: string; status: string };
  }

  interface TokenResult {
    error?: { message: string };
    token?: { id: string; card: { last4: string; brand: string } };
  }
}
```

```typescript
// TypeScript module resolution and project configuration

// tsconfig.json paths for monorepo module resolution
// {
//   "compilerOptions": {
//     "baseUrl": ".",
//     "paths": {
//       "@app/*": ["src/*"],
//       "@shared/*": ["packages/shared/src/*"],
//       "@ui/*": ["packages/ui/src/*"]
//     },
//     "typeRoots": ["./types", "./node_modules/@types"],
//     "types": ["vite/client", "vitest/globals"]
//   }
// }

// Conditional exports in package.json for dual CJS/ESM packages
// {
//   "name": "my-library",
//   "types": "./dist/index.d.ts",
//   "main": "./dist/cjs/index.js",
//   "module": "./dist/esm/index.js",
//   "exports": {
//     ".": {
//       "types": "./dist/index.d.ts",
//       "import": "./dist/esm/index.js",
//       "require": "./dist/cjs/index.js"
//     },
//     "./utils": {
//       "types": "./dist/utils.d.ts",
//       "import": "./dist/esm/utils.js",
//       "require": "./dist/cjs/utils.js"
//     }
//   }
// }

// Publishing a library with proper type exports
// src/index.ts - library entry point
export interface PluginConfig {
  name: string;
  version: string;
  hooks: Partial<PluginHooks>;
}

export interface PluginHooks {
  onInit: () => void | Promise<void>;
  onDestroy: () => void | Promise<void>;
  onError: (error: Error) => void;
}

export interface Plugin {
  readonly name: string;
  readonly version: string;
  init(): Promise<void>;
  destroy(): Promise<void>;
}

export function createPlugin(config: PluginConfig): Plugin {
  return {
    name: config.name,
    version: config.version,
    async init() {
      await config.hooks.onInit?.();
    },
    async destroy() {
      await config.hooks.onDestroy?.();
    },
  };
}

// Re-export types for consumers
export type { PluginConfig, PluginHooks, Plugin };


// isolatedModules considerations: what breaks without full program info
// These patterns require full type information and break with isolatedModules:

// 1. const enums (inlined at compile time, need cross-file info)
// const enum Direction { Up, Down, Left, Right } // Error with isolatedModules

// Use regular enums or union types instead:
enum Direction { Up = 'UP', Down = 'DOWN', Left = 'LEFT', Right = 'RIGHT' }
// Or preferably:
type DirectionType = 'up' | 'down' | 'left' | 'right';

// 2. Re-exporting types without 'type' keyword
// export { MyInterface } from './types'; // Ambiguous with isolatedModules
export type { PluginConfig } from './types'; // Explicit type-only re-export

// 3. Namespace merging across files
// Namespaces that span multiple files need full program context
// Use modules instead of namespaces for isolatedModules compatibility
```

## Common Pitfalls

1. **Incorrect module resolution causing "cannot find module" errors**: TypeScript has multiple resolution strategies (node, bundler, classic) that search different paths. The most common issue is mismatched `moduleResolution` settings: using `"node"` when the project uses ESM-style imports with package.json `exports` field requires `"bundler"` or `"node16"` resolution. Check that `typeRoots`, `paths`, and `baseUrl` are configured correctly, and verify that `@types/` packages match the library version.

2. **Declaration merging conflicts from multiple type sources**: When both a library's bundled types and an `@types/` package exist, TypeScript may merge them incorrectly or use the wrong version. Remove `@types/` packages for libraries that ship their own types. Use `"types"` in tsconfig to explicitly control which global type packages are included rather than auto-discovering everything in `node_modules/@types`.

3. **Forgetting to export from augmentation files**: Module augmentation with `declare module` only works in files that are themselves modules (have at least one import or export statement). A file with only `declare module "express" { ... }` and no imports/exports is treated as a script, and the augmentation becomes a module declaration rather than an augmentation. Add `export {}` at the end if no other exports exist.

4. **Global type pollution from ambient declarations**: Declarations in `.d.ts` files without import/export statements are global and affect the entire project. This can cause unexpected type availability and conflicts. Prefer module-scoped declarations (files with imports/exports) and use `declare global { }` blocks explicitly when global augmentation is intended.

5. **Type-only imports not being preserved by transpilers**: When using `isolatedModules` with tools like esbuild or SWC, regular imports of types may be preserved in the output (causing runtime errors for non-existent modules). Always use `import type { ... }` for type-only imports to ensure they are erased by any transpiler, not just `tsc`.

6. **Overly permissive ambient declarations hiding real type errors**: Writing `declare module "*"` or `declare module "*.svg"` with broad return types (`any` or `string`) silences errors but removes type safety for those imports. Be as specific as possible in ambient declarations, and use proper module declaration patterns that reflect the actual runtime shape of the imported values.

## Real-World Use Cases

- **Typing legacy JavaScript libraries in enterprise codebases**: Large organizations often have internal JavaScript libraries built over years without types. Writing declaration files for these libraries enables gradual TypeScript adoption: new code gets full type safety when consuming the library, while the library source remains JavaScript. The declarations serve as living documentation of the API contract.

- **Express middleware type composition**: Each Express middleware adds properties to the Request object (authentication adds `req.userId`, rate limiting adds `req.rateLimit`, request tracing adds `req.requestId`). Module augmentation lets each middleware package declare its additions, and downstream route handlers see the accumulated type with all middleware-added properties available and correctly typed.

- **Monorepo package type resolution**: In monorepos with multiple packages that reference each other, TypeScript path mappings and project references ensure that importing `@myorg/shared` resolves to the source TypeScript files during development (for fast feedback) and to compiled declaration files in production builds. Proper configuration prevents "cannot find module" errors across package boundaries.

- **Build tool and bundler type integration**: Vite, Webpack, and other bundlers handle non-JavaScript imports (CSS modules, SVG files, JSON, WASM) that TypeScript does not understand natively. Declaration files like `vite/client` provide types for these imports (`import styles from './app.module.css'` returns `Record<string, string>`), enabling type-safe usage of bundler-specific features.

- **SDK and API client library publishing**: Libraries published to npm must include declaration files so TypeScript consumers get type safety without needing the library's source code. Proper `exports` configuration in package.json ensures that both ESM and CJS consumers resolve the correct declaration files, and `typesVersions` field supports different type definitions for different TypeScript versions.

## Interview Questions

**Q: What is the difference between `declare module` for module declaration versus module augmentation?**

A: In a script file (no imports/exports), `declare module "foo" { ... }` creates a new module declaration — it defines the types for a module that does not have its own types. In a module file (has imports/exports), `declare module "foo" { ... }` augments an existing module — it adds new declarations to a module that already has types. The distinction depends entirely on whether the file containing the declaration is itself a module. Augmentation merges with existing declarations; declaration replaces or creates them. This is why augmentation files need `export {}` if they have no other exports.

**Q: How does TypeScript resolve types for a package, and what is the resolution order?**

A: TypeScript resolves types in this order: (1) Check if the package has a `types` or `typings` field in its package.json pointing to a `.d.ts` file. (2) Check for an `index.d.ts` in the package root. (3) Check for a matching `@types/` package in node_modules (e.g., `@types/express` for the `express` package). (4) Check `typeRoots` configuration for custom type directories. (5) Check `paths` mappings in tsconfig for aliased modules. The `moduleResolution` setting (`node`, `node16`, `bundler`) affects which of these strategies are used and in what order. The `exports` field in package.json (with `"types"` condition) takes precedence in `node16` and `bundler` resolution modes.

**Q: What is `isolatedModules` and why do modern build tools require it?**

A: `isolatedModules` ensures each TypeScript file can be transpiled independently without knowledge of other files in the program. Tools like esbuild, SWC, and Babel process files one at a time for speed, unlike `tsc` which analyzes the entire program. With `isolatedModules`, patterns that require cross-file information are disallowed: const enums (values inlined from other files), namespace merging across files, and re-exports that might be types (ambiguous without program context). Using `import type` and `export type` explicitly marks type-only imports for safe erasure by any transpiler.

**Q: How would you type a plugin system where plugins can extend a base configuration interface?**

A: Use module augmentation combined with declaration merging on interfaces. Define a base `PluginRegistry` interface in the core package. Each plugin augments this interface with its own configuration: `declare module '@core/plugins' { interface PluginRegistry { myPlugin: MyPluginConfig } }`. The core system uses `keyof PluginRegistry` to enumerate available plugins and `PluginRegistry[K]` to access each plugin's typed configuration. This pattern is used by Fastify for route schemas, Pinia for store definitions, and Vue Router for route meta types.

**Q: What are triple-slash directives and when are they still necessary?**

A: Triple-slash directives (`/// <reference types="..." />`) are special comments that include type definitions. They are largely replaced by `types` in tsconfig.json but remain necessary in specific cases: (1) In declaration files that need to reference other type packages without importing them. (2) For global type augmentation in files that are not modules. (3) In `vite-env.d.ts` to include Vite's client types (`/// <reference types="vite/client" />`). (4) For test setup files that need global matchers (`/// <reference types="vitest/globals" />`). They must appear at the top of the file before any code.

## Production Tips

- **Use `moduleResolution: "bundler"` for modern Vite and webpack projects**: The `"bundler"` resolution mode (TypeScript 5.0+) matches how modern bundlers actually resolve modules, supporting package.json `exports` field, extensionless imports, and conditional exports. This eliminates the mismatch between what TypeScript resolves and what the bundler resolves, preventing "works in IDE but fails at build" issues.

- **Publish libraries with proper `exports` and `typesVersions` configuration**: Modern npm packages should use the `exports` field in package.json with explicit `"types"` conditions for each entry point. This ensures consumers using different module systems (ESM, CJS) and different TypeScript versions all resolve the correct type definitions. Test your published types with `attw` (Are The Types Wrong) to catch resolution issues before publishing.

- **Keep declaration files minimal and focused**: When writing `.d.ts` files for untyped libraries, declare only the API surface your project actually uses rather than attempting to type the entire library. This reduces maintenance burden and avoids incorrect declarations for features you have not tested. Add declarations incrementally as you use more of the library's API.

## Related Topics

- [Type System Fundamentals](./type-system-fundamentals.md) — Understanding structural typing is essential for writing correct declaration files
- [Generics and Constraints](./generics-and-constraints.md) — Generic declarations in `.d.ts` files enable type-safe library APIs
- [Patterns and Best Practices](./patterns-and-best-practices.md) — Module organization patterns determine how declaration files are structured
