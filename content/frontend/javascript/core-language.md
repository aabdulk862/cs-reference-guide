# Core Language and ES6+

## Quick Reference

- `let` and `const` are block-scoped and exist in a temporal dead zone until declaration; `const` prevents reassignment but not mutation
- Arrow functions (`=>`) lexically bind `this`, have no `arguments` object, and cannot be used as constructors
- Destructuring extracts values from arrays and objects into variables in a single statement, with support for defaults and rest elements
- Spread (`...`) expands iterables into elements or copies object properties; rest collects remaining items into an array
- Template literals use backticks for string interpolation (`${expr}`), multi-line strings, and tagged template functions
- Optional chaining (`?.`) short-circuits to `undefined` on null/undefined; nullish coalescing (`??`) provides defaults for null/undefined only
- `Symbol` creates unique identifiers for object properties; `WeakMap`/`WeakSet` hold weak references that allow garbage collection
- `Proxy` and `Reflect` enable metaprogramming by intercepting fundamental object operations

## When to Use

ES6+ features should be the default for all modern JavaScript development. Block scoping with `let` and `const` eliminates entire categories of bugs related to variable hoisting and shared loop variables. Arrow functions are the standard for callbacks, array methods, and any function that should not have its own `this` binding. Destructuring dramatically reduces boilerplate when working with function parameters, API responses, and configuration objects. The spread operator enables immutable data patterns essential for React state management and Redux reducers. Optional chaining and nullish coalescing replace verbose null-checking chains with concise, readable expressions. These features are supported in all modern browsers and Node.js 14+, and are transpiled by Babel or TypeScript for older targets. There is no reason to use `var`, manual `this` binding, or string concatenation in new code.

## Code Examples

```javascript
// Block scoping, destructuring, and default parameters
function createPaginatedQuery({
  page = 1,
  pageSize = 20,
  sortBy = 'createdAt',
  sortOrder = 'desc',
  filters = {},
} = {}) {
  const offset = (page - 1) * pageSize;
  const limit = pageSize;

  // Destructure filters with defaults
  const { status, dateRange, search, ...customFilters } = filters;

  const conditions = [];
  if (status) conditions.push({ field: 'status', op: 'eq', value: status });
  if (dateRange) {
    const { start, end } = dateRange;
    conditions.push({ field: 'createdAt', op: 'between', value: [start, end] });
  }
  if (search) conditions.push({ field: 'name', op: 'contains', value: search });

  // Spread custom filters into additional conditions
  Object.entries(customFilters).forEach(([field, value]) => {
    conditions.push({ field, op: 'eq', value });
  });

  return { offset, limit, sortBy, sortOrder, conditions };
}

// Usage with partial options
const query = createPaginatedQuery({
  page: 3,
  filters: { status: 'active', search: 'react' },
});


// Arrow functions and lexical this binding
class EventTracker {
  #events = [];
  #listeners = new Map();

  // Arrow function preserves `this` in callbacks
  track = (eventName, properties = {}) => {
    const event = {
      name: eventName,
      properties,
      timestamp: Date.now(),
      sessionId: this.#getSessionId(),
    };
    this.#events.push(event);
    this.#notifyListeners(eventName, event);
    return event;
  };

  subscribe = (eventName, callback) => {
    if (!this.#listeners.has(eventName)) {
      this.#listeners.set(eventName, new Set());
    }
    this.#listeners.get(eventName).add(callback);

    // Return unsubscribe function (arrow preserves closure)
    return () => this.#listeners.get(eventName)?.delete(callback);
  };

  #getSessionId() {
    return globalThis.sessionStorage?.getItem('sessionId') ?? 'anonymous';
  }

  #notifyListeners(eventName, event) {
    this.#listeners.get(eventName)?.forEach(cb => cb(event));
    this.#listeners.get('*')?.forEach(cb => cb(event));
  }

  getEvents = (filter) => {
    if (!filter) return [...this.#events];
    return this.#events.filter(e =>
      Object.entries(filter).every(([key, value]) =>
        key === 'name' ? e.name === value : e.properties[key] === value
      )
    );
  };
}

// Can safely pass methods as callbacks without .bind()
const tracker = new EventTracker();
const button = document.querySelector('#submit');
button?.addEventListener('click', () => tracker.track('button_click', { id: 'submit' }));
```

```javascript
// Template literals with tagged templates
function highlight(strings, ...values) {
  return strings.reduce((result, str, i) => {
    const value = i < values.length
      ? `<mark class="highlight">${values[i]}</mark>`
      : '';
    return result + str + value;
  }, '');
}

const searchTerm = 'JavaScript';
const result = highlight`Found ${searchTerm} in ${3} documents`;
// "Found <mark class="highlight">JavaScript</mark> in <mark class="highlight">3</mark> documents"

// SQL tagged template for parameterized queries (prevents injection)
function sql(strings, ...values) {
  const text = strings.reduce((query, str, i) => {
    return query + str + (i < values.length ? `$${i + 1}` : '');
  }, '');
  return { text, values };
}

const userId = 'usr_123';
const status = 'active';
const query = sql`SELECT * FROM users WHERE id = ${userId} AND status = ${status}`;
// { text: "SELECT * FROM users WHERE id = $1 AND status = $2", values: ["usr_123", "active"] }


// Optional chaining and nullish coalescing in real-world patterns
function getUserDisplayInfo(user) {
  return {
    name: user?.profile?.displayName ?? user?.name ?? 'Anonymous',
    avatar: user?.profile?.avatar?.url ?? '/default-avatar.png',
    location: user?.address?.city
      ? `${user.address.city}, ${user.address.country ?? 'Unknown'}`
      : null,
    memberSince: user?.createdAt?.toLocaleDateString?.() ?? 'Unknown',
    // Nullish coalescing distinguishes null/undefined from falsy values
    notificationCount: user?.notifications?.unread ?? 0, // 0 is valid, don't replace
    bio: user?.profile?.bio ?? '', // empty string is valid
  };
}


// Proxy for reactive state observation
function createReactiveState(initialState, onChange) {
  const handlers = {
    set(target, property, value, receiver) {
      const oldValue = target[property];
      if (oldValue === value) return true;

      const result = Reflect.set(target, property, value, receiver);
      if (result) {
        onChange(property, value, oldValue);
      }
      return result;
    },

    deleteProperty(target, property) {
      const oldValue = target[property];
      const result = Reflect.deleteProperty(target, property);
      if (result) {
        onChange(property, undefined, oldValue);
      }
      return result;
    },
  };

  return new Proxy({ ...initialState }, handlers);
}

const state = createReactiveState(
  { count: 0, name: 'World' },
  (prop, newVal, oldVal) => {
    console.log(`${prop}: ${oldVal} → ${newVal}`);
    // Trigger re-render, update DOM, etc.
  }
);

state.count = 1;  // Logs: "count: 0 → 1"
state.name = 'React'; // Logs: "name: World → React"
```

```javascript
// Modern iteration patterns with Symbol.iterator and generators
class Range {
  #start;
  #end;
  #step;

  constructor(start, end, step = 1) {
    this.#start = start;
    this.#end = end;
    this.#step = step;
  }

  // Make Range iterable with for...of
  [Symbol.iterator]() {
    let current = this.#start;
    const end = this.#end;
    const step = this.#step;

    return {
      next() {
        if (current <= end) {
          const value = current;
          current += step;
          return { value, done: false };
        }
        return { done: true };
      },
    };
  }

  // Utility methods that leverage iterability
  toArray() {
    return [...this];
  }

  map(fn) {
    return [...this].map(fn);
  }

  filter(fn) {
    return [...this].filter(fn);
  }
}

const range = new Range(1, 10, 2);
for (const n of range) {
  console.log(n); // 1, 3, 5, 7, 9
}

const squares = new Range(1, 5).map(n => n ** 2); // [1, 4, 9, 16, 25]


// WeakMap for private data and metadata without memory leaks
const metadata = new WeakMap();

class Component {
  constructor(name) {
    this.name = name;
    metadata.set(this, {
      renderCount: 0,
      lastRendered: null,
      mountedAt: Date.now(),
    });
  }

  render() {
    const meta = metadata.get(this);
    meta.renderCount++;
    meta.lastRendered = Date.now();
    // When Component is garbage collected, metadata entry is automatically removed
  }

  getStats() {
    const meta = metadata.get(this);
    return {
      renders: meta.renderCount,
      uptime: Date.now() - meta.mountedAt,
      lastRendered: meta.lastRendered,
    };
  }
}
```

## Common Pitfalls

1. **Using `var` in loops with closures**: Variables declared with `var` are function-scoped, so closures created inside a loop all share the same variable binding. After the loop completes, all closures reference the final value. Using `let` creates a new binding per iteration, giving each closure its own copy. This is the most classic JavaScript bug and still appears in legacy codebases and interview questions.

2. **Mutating `const` objects and assuming immutability**: `const` prevents reassignment of the binding (`const x = 1; x = 2` is an error) but does not make the value immutable. A `const` object can have properties added, modified, or deleted. For true immutability, use `Object.freeze()` (shallow) or libraries like Immer. In React, this distinction matters because `const state = {}; state.count = 1` mutates without triggering re-renders.

3. **Implicit type coercion with `==` and `+`**: The `==` operator performs type coercion, producing counterintuitive results (`[] == false` is `true`, `"" == 0` is `true`). The `+` operator concatenates when either operand is a string (`"5" + 3` is `"53"`). Always use `===` for comparisons and explicit type conversion (`Number()`, `String()`) when needed. ESLint's `eqeqeq` rule enforces this.

4. **Arrow functions as object methods losing `this`**: Arrow functions lexically bind `this` from their enclosing scope, which means they do not get their own `this` when used as object methods. `const obj = { name: 'test', getName: () => this.name }` returns `undefined` because `this` refers to the outer scope, not `obj`. Use regular function syntax for object methods that need `this`.

5. **Shallow copy with spread creating shared references**: The spread operator (`{...obj}` or `[...arr]`) creates a shallow copy. Nested objects and arrays are still shared by reference between the original and the copy. Mutating a nested property on the copy mutates the original. Use `structuredClone()` for deep copies or Immer for immutable update patterns.

6. **Optional chaining on assignment targets**: Optional chaining (`?.`) works for reading properties and calling methods but cannot be used on the left side of an assignment. `obj?.prop = value` is a syntax error. You must check for null/undefined explicitly before assigning: `if (obj) obj.prop = value`.

## Real-World Use Cases

- **React state management with immutable patterns**: React requires immutable state updates to trigger re-renders. Spread syntax, destructuring, and array methods (map, filter, reduce) are used constantly to create new state objects without mutating the previous state. Understanding these ES6+ features is essential for writing correct React components and Redux reducers.

- **Node.js API servers with modern syntax**: Express and Fastify handlers use destructuring for request parameters (`const { id } = req.params`), optional chaining for nested body fields, template literals for dynamic SQL and log messages, and arrow functions for middleware chains. ES Modules enable tree-shaking and top-level await for server initialization.

- **Build tool configuration and scripting**: Vite, Webpack, and ESLint configurations use ES6+ features extensively. Tagged templates power CSS-in-JS libraries (styled-components), Proxy enables reactive state in Vue 3, and Symbols provide unique keys for framework internals that do not collide with user code.

- **Serverless functions and edge computing**: AWS Lambda and Cloudflare Workers execute JavaScript in isolated environments where startup time matters. ES Module top-level await initializes connections, destructuring extracts event properties, and optional chaining safely navigates variable event structures across different trigger types.

- **CLI tools and automation scripts**: Node.js CLI tools use destructuring for argument parsing, template literals for colored terminal output, Proxy for configuration validation, and generators for streaming file processing. The npm ecosystem provides thousands of utilities that leverage modern JavaScript patterns.

## Interview Questions

**Q: What is the temporal dead zone and how does it affect `let` and `const`?**

A: The temporal dead zone (TDZ) is the period between entering a block scope and the point where a `let` or `const` variable is declared. Accessing the variable during this period throws a `ReferenceError`, unlike `var` which returns `undefined` when accessed before its declaration (due to hoisting). The TDZ exists to catch bugs where code accidentally uses a variable before it is initialized. It applies from the start of the block (not the function) to the declaration statement, making the error deterministic and easy to locate.

**Q: Explain the difference between shallow and deep copying in JavaScript.**

A: Shallow copy (`{...obj}`, `Object.assign()`, `[...arr]`) creates a new top-level object but shares references to nested objects. Modifying a nested property on the copy affects the original. Deep copy (`structuredClone()`, `JSON.parse(JSON.stringify())`) creates completely independent copies at all nesting levels. `structuredClone` handles circular references, Maps, Sets, and Dates correctly, while the JSON approach fails on these types and loses functions and `undefined` values. Choose shallow copy for flat objects and deep copy for nested structures that must be independently mutable.

**Q: How do Proxy and Reflect work together, and what are practical use cases?**

A: Proxy wraps an object and intercepts fundamental operations (get, set, delete, has, etc.) through handler traps. Reflect provides the default behavior for each trap, allowing you to perform the original operation after custom logic. Together they enable: reactive state systems (Vue 3 reactivity), validation layers (reject invalid property assignments), access control (restrict property access based on permissions), logging and debugging (trace all property accesses), and lazy initialization (load data only when accessed). Reflect ensures correct behavior for edge cases like inherited properties and receiver binding.

**Q: What is the difference between `??` (nullish coalescing) and `||` (logical OR) for default values?**

A: `||` returns the right operand when the left is any falsy value (false, 0, '', null, undefined, NaN). `??` returns the right operand only when the left is null or undefined. This distinction matters when 0, empty string, or false are valid values: `userCount ?? 10` preserves 0 as a valid count, while `userCount || 10` incorrectly replaces 0 with 10. Use `??` for defaults where the value might legitimately be falsy; use `||` only when all falsy values should trigger the default.

**Q: Explain Symbol and its use cases in JavaScript.**

A: Symbol creates a unique, immutable primitive value that can be used as an object property key. Unlike string keys, Symbols never collide with other properties, making them ideal for: framework-internal properties that should not conflict with user code, implementing well-known protocols (Symbol.iterator for iteration, Symbol.toPrimitive for type conversion), creating truly private-like properties that do not appear in `Object.keys()` or `JSON.stringify()`, and defining metadata on objects without polluting their public interface. Symbols are not enumerable by default and require `Object.getOwnPropertySymbols()` to discover.

## Production Tips

- **Use `structuredClone()` for deep copying instead of JSON round-tripping**: The `JSON.parse(JSON.stringify(obj))` pattern fails silently on Dates (converts to strings), Maps, Sets, RegExp, undefined values, and circular references. `structuredClone()` (available in all modern environments since 2022) handles all these cases correctly and is faster for large objects. It is the correct default for deep copying in production code.

- **Prefer `Object.hasOwn()` over `hasOwnProperty`**: The `Object.hasOwn(obj, prop)` static method (ES2022) is safer than `obj.hasOwnProperty(prop)` because it works on objects created with `Object.create(null)` (which lack inherited methods) and cannot be shadowed by a property named `hasOwnProperty` on the object itself. It is also more concise and readable.

- **Use `AbortController` for cancellable operations**: Every fetch request, event listener, and timer in production code should be cancellable. `AbortController` provides a standard mechanism: pass `signal` to fetch, addEventListener, and custom async operations. Cancel all pending operations on component unmount, route change, or user cancellation to prevent memory leaks and stale state updates.

## Related Topics

- [Closures and Scope](./closures-and-scope.md) — Closures build on lexical scoping rules that ES6 block scoping refines
- [Asynchronous JavaScript](./asynchronous-javascript.md) — Promises and async/await are ES6+ features that transform async programming
- [TypeScript](../typescript/index.md) — TypeScript adds static types to JavaScript while compiling down to these ES6+ features
