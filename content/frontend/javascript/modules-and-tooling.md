# Modules and Tooling

## Quick Reference

- ES Modules (ESM) use static `import`/`export` declarations that enable tree-shaking; they are the standard module system for modern JavaScript
- CommonJS (CJS) uses `require()`/`module.exports` with synchronous, runtime-evaluated loading; it is Node.js's original module system
- Dynamic `import()` returns a Promise resolving to the module namespace, enabling code splitting and conditional loading
- ES Modules have live bindings (importing modules see updated values); CommonJS exports are copied values at require time
- `<script type="module">` loads ES Modules in browsers with deferred execution, strict mode, and CORS requirements
- Bundlers (Vite, Webpack, Rollup) resolve imports, tree-shake unused exports, split code into chunks, and transform syntax
- Package.json `"exports"` field defines entry points for different conditions (import, require, types, browser, node)
- Top-level `await` in ES Modules pauses module evaluation until the awaited Promise resolves

## When to Use

ES Modules should be the default for all new JavaScript and TypeScript projects. They provide static analysis for tree-shaking (removing unused code from bundles), clear dependency graphs for bundler optimization, and standardized syntax that works in browsers, Node.js, and Deno without transpilation. Use CommonJS only when maintaining legacy Node.js code or when a dependency requires it. Dynamic imports are appropriate for route-level code splitting (loading page components on navigation), feature-level splitting (loading heavy libraries only when needed), and conditional polyfill loading (importing polyfills only in browsers that need them). Understanding module resolution is critical for configuring bundlers, debugging import errors, publishing npm packages that work across environments, and optimizing bundle size through strategic code splitting.

## Code Examples

```javascript
// ES Module patterns: named exports, default exports, and re-exports

// utils/validation.js — Named exports for utility functions
export function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function isURL(value) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

export function isInRange(value, min, max) {
  return value >= min && value <= max;
}

// Grouped export (equivalent to individual exports above)
export { isEmail, isURL, isInRange };


// services/api.js — Default export for primary functionality
const API_BASE = '/api/v1';

async function request(method, path, options = {}) {
  const url = `${API_BASE}${path}`;
  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });

  if (!response.ok) {
    const error = new Error(`API Error: ${response.status}`);
    error.status = response.status;
    error.response = response;
    throw error;
  }

  return response.json();
}

// Default export: the primary thing this module provides
export default {
  get: (path, options) => request('GET', path, options),
  post: (path, body, options) => request('POST', path, { ...options, body }),
  put: (path, body, options) => request('PUT', path, { ...options, body }),
  delete: (path, options) => request('DELETE', path, options),
};

// Named exports alongside default (both are valid)
export { API_BASE, request };


// index.js — Barrel file with re-exports
export { default as api } from './services/api.js';
export { isEmail, isURL, isInRange } from './utils/validation.js';
export { default as Logger } from './utils/logger.js';
export * from './types/constants.js'; // Re-export all named exports
// Note: export * does NOT re-export default exports


// Dynamic import for code splitting
async function loadEditor() {
  // Webpack/Vite magic comment for chunk naming
  const { EditorView, basicSetup } = await import(
    /* webpackChunkName: "editor" */
    '@codemirror/view'
  );
  const { javascript } = await import(
    /* webpackChunkName: "editor" */
    '@codemirror/lang-javascript'
  );

  return new EditorView({
    extensions: [basicSetup, javascript()],
    parent: document.getElementById('editor'),
  });
}

// Conditional loading based on feature detection
async function loadPolyfills() {
  const polyfills = [];

  if (!globalThis.structuredClone) {
    polyfills.push(import('core-js/actual/structured-clone'));
  }
  if (!globalThis.AbortSignal?.timeout) {
    polyfills.push(import('abort-controller/polyfill'));
  }

  await Promise.all(polyfills);
}

// Route-level code splitting in React
const routes = {
  '/dashboard': () => import('./pages/Dashboard.js'),
  '/settings': () => import('./pages/Settings.js'),
  '/analytics': () => import('./pages/Analytics.js'),
};

async function navigateTo(path) {
  const loader = routes[path];
  if (!loader) throw new Error(`Unknown route: ${path}`);

  const module = await loader();
  const Page = module.default;
  renderPage(Page);
}
```

```javascript
// CommonJS patterns and ESM interoperability

// CommonJS module (legacy Node.js pattern)
// config.cjs
const path = require('path');
const fs = require('fs');

const CONFIG_PATH = path.resolve(__dirname, '../config.json');

function loadConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
  return JSON.parse(raw);
}

// CommonJS exports
module.exports = { loadConfig, CONFIG_PATH };
// Or: module.exports = loadConfig; (single default-like export)


// ESM importing CommonJS (Node.js with "type": "module" in package.json)
import config from './config.cjs'; // CJS module.exports becomes default import
// import { loadConfig } from './config.cjs'; // Named imports from CJS may not work

// CJS importing ESM (must use dynamic import)
// const esmModule = require('./esm-module.js'); // ERROR: Cannot require ESM
async function loadESM() {
  const { default: api, request } = await import('./services/api.js');
  return api;
}


// Package.json exports field for dual CJS/ESM packages
// package.json
// {
//   "name": "my-library",
//   "type": "module",
//   "exports": {
//     ".": {
//       "types": "./dist/index.d.ts",
//       "import": "./dist/esm/index.js",
//       "require": "./dist/cjs/index.cjs",
//       "default": "./dist/esm/index.js"
//     },
//     "./utils": {
//       "types": "./dist/utils.d.ts",
//       "import": "./dist/esm/utils.js",
//       "require": "./dist/cjs/utils.cjs"
//     },
//     "./package.json": "./package.json"
//   },
//   "main": "./dist/cjs/index.cjs",
//   "module": "./dist/esm/index.js",
//   "types": "./dist/index.d.ts"
// }


// Top-level await in ES Modules
// db.js — Module initialization with top-level await
const connection = await createDatabaseConnection({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT ?? '5432'),
  database: process.env.DB_NAME,
});

// Module consumers get the initialized connection
export { connection };
export async function query(sql, params) {
  return connection.query(sql, params);
}

// Importing module waits for initialization to complete
// app.js
import { query } from './db.js'; // Waits for db.js top-level await
const users = await query('SELECT * FROM users WHERE active = $1', [true]);
```

```javascript
// Bundler configuration and optimization patterns

// vite.config.js — Modern bundler configuration
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Manual chunk splitting for optimal caching
        manualChunks: {
          // Vendor chunks: change rarely, cached long-term
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'ui-vendor': ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu'],
          // Feature chunks: loaded on demand
          'editor': ['@codemirror/view', '@codemirror/lang-javascript'],
          'charts': ['recharts', 'd3-scale'],
        },
      },
    },
    // Target modern browsers for smaller output
    target: 'es2020',
    // Chunk size warning threshold
    chunkSizeWarningLimit: 500, // KB
  },
  // Dependency optimization
  optimizeDeps: {
    include: ['react', 'react-dom'], // Pre-bundle for faster dev startup
    exclude: ['@my-org/local-package'], // Don't pre-bundle local packages
  },
});


// Tree-shaking: how to write tree-shakeable code
// BAD: barrel file that imports everything
// import { Button, Input, Modal, Table, ... } from './components';
// Even if you only use Button, the bundler may include all components

// GOOD: direct imports for tree-shaking
import { Button } from './components/Button.js';
import { Input } from './components/Input.js';

// BAD: side effects prevent tree-shaking
// utils.js
let counter = 0; // Module-level side effect
export function increment() { return ++counter; }
export function getCount() { return counter; }
// Bundler cannot remove getCount even if unused because module has side effects

// GOOD: pure functions are safely tree-shakeable
// math.js
export function add(a, b) { return a + b; }
export function multiply(a, b) { return a * b; }
// Bundler can safely remove unused exports

// package.json sideEffects field for library authors
// {
//   "sideEffects": false,  // All files are pure (safe to tree-shake)
//   // Or specify files with side effects:
//   "sideEffects": ["./src/polyfills.js", "*.css"]
// }


// Module resolution debugging
// Node.js ESM resolution algorithm (simplified):
// 1. Check package.json "exports" field (if present, takes precedence)
// 2. Check package.json "main" field
// 3. Look for index.js in the package directory
// 4. For relative imports: exact path, then .js, .mjs, .cjs extensions

// Common resolution issues and fixes:
// Error: "Cannot find module './utils'" in ESM
// Fix: Add file extension: import { helper } from './utils.js';
// (ESM requires explicit extensions unlike CJS)

// Error: "require() of ES Module not supported"
// Fix: Use dynamic import: const mod = await import('./esm-module.js');

// Error: "__dirname is not defined in ES module scope"
// Fix: import { fileURLToPath } from 'url';
//      const __dirname = path.dirname(fileURLToPath(import.meta.url));
```

## Common Pitfalls

1. **Circular dependencies causing undefined imports**: When module A imports from B and B imports from A, one of them receives an incomplete (partially initialized) module object. The module that is evaluated second sees `undefined` for imports from the first module that have not been initialized yet. Break circular dependencies by extracting shared code into a third module, using lazy imports (dynamic import inside functions), or restructuring the dependency graph.

2. **Forgetting file extensions in ES Module imports**: Unlike CommonJS where `require('./utils')` automatically resolves to `utils.js`, ES Modules in Node.js require explicit file extensions: `import { helper } from './utils.js'`. Omitting the extension works in bundlers (Vite, Webpack) that add resolution logic, but fails in native Node.js ESM. This discrepancy between development (bundler) and production (Node.js) causes deployment failures.

3. **Barrel files defeating tree-shaking**: A barrel file (`index.js`) that re-exports everything from a directory (`export * from './Button'; export * from './Modal'; ...`) can prevent tree-shaking if any re-exported module has side effects. Bundlers must include the entire barrel if they cannot prove all modules are side-effect-free. Use direct imports to specific files for optimal bundle size, or ensure all modules are marked as side-effect-free.

4. **Mixing `require()` and `import` in the same file**: A file is either a CommonJS module or an ES Module, determined by file extension (`.mjs`/`.cjs`) or the nearest package.json `"type"` field. Using `require()` in an ES Module or `import` in a CommonJS module causes syntax errors. Use dynamic `import()` (which works in both) when you need to load ESM from CJS.

5. **Not understanding live bindings vs copied values**: ES Module imports are live bindings — if the exporting module changes a value, the importing module sees the update. CommonJS exports are copied at require time — subsequent changes in the exporting module are not reflected. This difference causes subtle bugs when migrating from CJS to ESM, especially with mutable state like counters or configuration that changes after initialization.

6. **Over-splitting code into too many small chunks**: While code splitting improves initial load time, creating dozens of tiny chunks (under 10KB each) can hurt performance due to HTTP/2 multiplexing overhead, connection limits, and chunk loading waterfalls where one chunk depends on another. Group related functionality into meaningful chunks (route-level, feature-level) and use bundler analysis tools to find the optimal split points.

## Real-World Use Cases

- **Micro-frontend architectures**: Large organizations use ES Module federation (Webpack Module Federation, Vite's module federation plugin) to compose independently deployed frontend applications at runtime. Each micro-frontend is a separate build that exports components as ES Modules, loaded dynamically by the shell application. This enables independent team deployments without coordinating releases.

- **Monorepo package management**: Monorepos (Turborepo, Nx, Lerna) use package.json `exports` and TypeScript path mappings to create internal packages that are consumed like npm packages but resolved to source code during development. This provides fast feedback loops (no build step for internal packages) while maintaining clean module boundaries and enabling independent publishing.

- **Progressive web application loading strategies**: PWAs use dynamic imports with service worker caching to implement sophisticated loading strategies: critical path modules are precached during service worker installation, route modules are cached on first navigation, and heavy feature modules (editors, charts) are cached on demand. The module graph determines the caching strategy.

- **Server-side rendering with selective hydration**: Next.js and Remix use the module system to determine which code runs on the server versus the client. Server-only modules (database access, file system) are tree-shaken from the client bundle. Client-only modules (event handlers, browser APIs) are excluded from server rendering. The `"use client"` and `"use server"` directives in React Server Components leverage module boundaries for this separation.

- **Plugin systems with dynamic module loading**: VS Code extensions, Webpack plugins, and Babel plugins use dynamic imports to load plugin modules at runtime based on configuration. The host application defines a plugin interface, and plugins export conforming modules that are discovered and loaded on demand. This enables extensibility without bundling all possible plugins into the core application.

## Interview Questions

**Q: What is the difference between ES Modules and CommonJS, and why does it matter for bundlers?**

A: ES Modules use static `import`/`export` declarations that must appear at the top level — the dependency graph is known at parse time without executing code. CommonJS uses `require()` which is a runtime function that can appear anywhere (inside conditionals, loops, functions) with dynamic paths. This static vs dynamic distinction matters because bundlers can only tree-shake (remove unused exports) from ES Modules where they can statically determine which exports are used. CommonJS requires including the entire module because the bundler cannot know which exports will be accessed at runtime. Additionally, ES Modules have live bindings (imports reflect current values) while CommonJS copies values at require time.

**Q: How does tree-shaking work and what prevents it?**

A: Tree-shaking is dead code elimination based on the ES Module import/export graph. The bundler starts from entry points, follows import statements to build a dependency graph, marks all referenced exports as "used," and removes everything else. It is prevented by: side effects (module-level code that runs on import, like polyfills or global mutations), dynamic property access (`obj[key]` where key is unknown), CommonJS modules (cannot statically analyze require), barrel files that re-export modules with side effects, and eval or indirect references that the bundler cannot trace. The `"sideEffects": false` field in package.json tells bundlers that all files in a package are safe to tree-shake.

**Q: Explain dynamic `import()` and its use cases.**

A: Dynamic `import()` is a function-like expression that returns a Promise resolving to the module's namespace object. Unlike static imports, it can be used anywhere in code (inside functions, conditionals, loops) and accepts dynamic paths (variables, template literals). Use cases include: route-level code splitting (load page components on navigation), conditional feature loading (load polyfills only when needed), lazy loading heavy dependencies (editors, chart libraries), and plugin systems (load modules based on configuration). In React, `React.lazy(() => import('./Component'))` wraps dynamic import for component-level code splitting with Suspense.

**Q: What is the `exports` field in package.json and why is it important?**

A: The `exports` field defines the public entry points of a package, replacing the older `main` and `module` fields with a more powerful conditional system. It maps import paths to different files based on conditions: `"import"` for ESM consumers, `"require"` for CJS consumers, `"types"` for TypeScript, `"browser"` for browser environments, and `"default"` as fallback. It also encapsulates the package — paths not listed in `exports` cannot be imported, preventing consumers from depending on internal files. This enables dual CJS/ESM packages, platform-specific builds, and clean public APIs while hiding implementation details.

**Q: How do you debug module resolution issues in Node.js?**

A: Start by checking: (1) The `"type"` field in the nearest package.json determines if `.js` files are ESM or CJS. (2) File extensions matter in ESM — use `.js`, `.mjs`, or `.cjs` explicitly. (3) The `exports` field in dependency package.json may restrict importable paths. (4) Use `node --experimental-loader` or `NODE_DEBUG=module` for resolution tracing. (5) Check for duplicate packages in node_modules (different versions of the same package). (6) Verify `tsconfig.json` `moduleResolution` matches the runtime (`node16` for Node.js ESM, `bundler` for Vite/Webpack). Common fixes include adding explicit extensions, using `createRequire` for CJS interop in ESM, and checking that the package's `exports` field includes the path you are importing.

## Production Tips

- **Analyze bundle size regularly with visualization tools**: Run `npx vite-bundle-visualizer` or `webpack-bundle-analyzer` after every significant dependency addition. Identify unexpectedly large modules, duplicate dependencies (same library at different versions), and opportunities for code splitting. Set CI checks that fail when bundle size exceeds a threshold.

- **Use import maps or bundler aliases for dependency management**: Configure path aliases (`@/components`, `@/utils`) in your bundler to avoid deep relative imports (`../../../components/Button`). This makes imports readable, simplifies refactoring (moving files does not break imports), and enables swapping implementations (mock modules in tests) without changing import statements throughout the codebase.

- **Mark packages as side-effect-free for optimal tree-shaking**: If your library has no module-level side effects (no global mutations, no polyfills, no CSS imports at the top level), add `"sideEffects": false` to package.json. This tells bundlers they can safely remove any unused exports without worrying about losing important side effects. For packages with some side-effectful files (CSS, polyfills), list them explicitly: `"sideEffects": ["*.css", "./src/polyfills.js"]`.

## Related Topics

- [Core Language and ES6+](./core-language.md) — ES Modules are an ES6 feature; understanding import/export syntax is foundational
- [Asynchronous JavaScript](./asynchronous-javascript.md) — Dynamic import() returns Promises; top-level await works in ES Modules
- [TypeScript](../typescript/index.md) — TypeScript module resolution, declaration files, and isolatedModules affect how modules are processed
