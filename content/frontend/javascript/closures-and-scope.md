# Closures and Scope

## Quick Reference

- A closure is formed when a function retains access to variables from its lexical scope even after the outer function has returned
- Lexical scoping means variable lookup follows the static structure of the code (where functions are defined), not where they are called
- Closures capture variables by reference, not by value — if the closed-over variable changes, the closure sees the updated value
- The scope chain is the ordered list of scopes searched during variable resolution: local → enclosing functions → global
- Block scope (`let`/`const`) creates new bindings per iteration in loops, solving the classic closure-in-loop bug
- IIFEs (Immediately Invoked Function Expressions) create isolated scopes, historically used for module patterns before ES Modules
- Closures keep their entire scope chain alive, preventing garbage collection of captured variables until the closure is unreachable
- JavaScript has function scope (`var`), block scope (`let`/`const`), module scope (ES Modules), and global scope

## When to Use

Closures are not an optional feature you choose to use — they are a fundamental consequence of lexical scoping combined with first-class functions, and they occur in virtually every JavaScript program. You leverage closures intentionally when creating data privacy (encapsulating state that should not be directly accessible), implementing partial application and currying (pre-filling function arguments for reuse), building factory functions (generating configured instances), creating memoization caches (storing computed results between calls), and implementing the module pattern (exposing public APIs while hiding internals). In React, every hook is a closure over component state, every event handler closes over the current render's props and state, and every useEffect cleanup function closes over the values from its render cycle. Understanding closures deeply is essential for debugging stale closure bugs, preventing memory leaks in long-lived applications, and writing correct asynchronous code.

## Code Examples

```javascript
// Closure for data privacy and encapsulation
function createBankAccount(initialBalance, owner) {
  let balance = initialBalance;
  const transactions = [];

  function recordTransaction(type, amount) {
    transactions.push({
      type,
      amount,
      balance,
      timestamp: Date.now(),
      id: crypto.randomUUID(),
    });
  }

  return {
    getBalance() {
      return balance;
    },

    getOwner() {
      return owner;
    },

    deposit(amount) {
      if (amount <= 0) throw new Error('Deposit must be positive');
      balance += amount;
      recordTransaction('deposit', amount);
      return balance;
    },

    withdraw(amount) {
      if (amount <= 0) throw new Error('Withdrawal must be positive');
      if (amount > balance) throw new Error('Insufficient funds');
      balance -= amount;
      recordTransaction('withdrawal', amount);
      return balance;
    },

    getStatement() {
      // Returns a copy to prevent external mutation
      return [...transactions];
    },
  };
}

const account = createBankAccount(1000, 'Alice');
account.deposit(500);   // 1500
account.withdraw(200);  // 1300
account.getBalance();   // 1300
// account.balance       // undefined — truly private
// account.transactions  // undefined — truly private


// Closure for partial application and function factories
function createLogger(prefix, options = {}) {
  const { timestamp = true, level = 'info', output = console } = options;

  // The returned functions close over prefix, timestamp, level, and output
  return {
    info(message, ...args) {
      if (['info', 'debug'].includes(level)) {
        const ts = timestamp ? `[${new Date().toISOString()}]` : '';
        output.log(`${ts} [${prefix}] INFO:`, message, ...args);
      }
    },

    warn(message, ...args) {
      const ts = timestamp ? `[${new Date().toISOString()}]` : '';
      output.warn(`${ts} [${prefix}] WARN:`, message, ...args);
    },

    error(message, ...args) {
      const ts = timestamp ? `[${new Date().toISOString()}]` : '';
      output.error(`${ts} [${prefix}] ERROR:`, message, ...args);
    },

    child(childPrefix) {
      // Creates a new closure with extended prefix
      return createLogger(`${prefix}:${childPrefix}`, options);
    },
  };
}

const logger = createLogger('App', { level: 'debug' });
const dbLogger = logger.child('Database');
const authLogger = logger.child('Auth');

dbLogger.info('Connection established');  // [timestamp] [App:Database] INFO: Connection established
authLogger.warn('Token expiring soon');   // [timestamp] [App:Auth] WARN: Token expiring soon
```

```javascript
// Memoization using closures for caching expensive computations
function memoize(fn, options = {}) {
  const { maxSize = 100, ttl = null, keyFn = JSON.stringify } = options;
  const cache = new Map();
  const accessOrder = []; // LRU tracking

  function memoized(...args) {
    const key = keyFn(args);

    if (cache.has(key)) {
      const entry = cache.get(key);

      // Check TTL expiration
      if (ttl && Date.now() - entry.timestamp > ttl) {
        cache.delete(key);
      } else {
        // Move to end of access order (most recently used)
        const idx = accessOrder.indexOf(key);
        if (idx > -1) accessOrder.splice(idx, 1);
        accessOrder.push(key);
        return entry.value;
      }
    }

    // Compute and cache
    const value = fn.apply(this, args);

    cache.set(key, { value, timestamp: Date.now() });
    accessOrder.push(key);

    // Evict least recently used if over capacity
    while (cache.size > maxSize) {
      const evictKey = accessOrder.shift();
      cache.delete(evictKey);
    }

    return value;
  }

  // Expose cache management via closure
  memoized.cache = {
    size: () => cache.size,
    clear: () => { cache.clear(); accessOrder.length = 0; },
    has: (args) => cache.has(keyFn(args)),
    delete: (args) => {
      const key = keyFn(args);
      cache.delete(key);
      const idx = accessOrder.indexOf(key);
      if (idx > -1) accessOrder.splice(idx, 1);
    },
  };

  return memoized;
}

// Usage
const expensiveCalculation = memoize(
  (n) => {
    // Simulate expensive work
    let result = 0;
    for (let i = 0; i < n * 1000000; i++) result += Math.random();
    return result;
  },
  { maxSize: 50, ttl: 60000 } // Cache up to 50 results for 60 seconds
);


// Closure-based middleware pipeline (Express-like pattern)
function createMiddlewarePipeline() {
  const middlewares = [];

  function use(middleware) {
    middlewares.push(middleware);
    return pipeline; // Enable chaining
  }

  function execute(context) {
    let index = 0;

    function next() {
      if (index >= middlewares.length) return;
      const middleware = middlewares[index++];
      // Each middleware closes over its own `next` reference
      return middleware(context, next);
    }

    return next();
  }

  const pipeline = { use, execute };
  return pipeline;
}

const pipeline = createMiddlewarePipeline();

pipeline
  .use((ctx, next) => {
    ctx.startTime = Date.now();
    next();
    ctx.duration = Date.now() - ctx.startTime;
  })
  .use((ctx, next) => {
    console.log(`Request: ${ctx.method} ${ctx.path}`);
    next();
  })
  .use((ctx, next) => {
    ctx.response = { status: 200, body: 'OK' };
    // Not calling next() stops the chain
  });

const ctx = { method: 'GET', path: '/api/users' };
pipeline.execute(ctx);
// ctx now has startTime, duration, and response properties
```

```javascript
// The classic closure-in-loop problem and solutions
// PROBLEM: var is function-scoped, all closures share the same `i`
function brokenTimers() {
  for (var i = 0; i < 5; i++) {
    setTimeout(() => console.log(i), i * 100);
  }
  // Prints: 5, 5, 5, 5, 5 (all reference the same `i` which is 5 after loop)
}

// SOLUTION 1: let creates a new binding per iteration
function fixedWithLet() {
  for (let i = 0; i < 5; i++) {
    setTimeout(() => console.log(i), i * 100);
  }
  // Prints: 0, 1, 2, 3, 4
}

// SOLUTION 2: IIFE creates a new scope per iteration (pre-ES6 pattern)
function fixedWithIIFE() {
  for (var i = 0; i < 5; i++) {
    (function(captured) {
      setTimeout(() => console.log(captured), captured * 100);
    })(i);
  }
  // Prints: 0, 1, 2, 3, 4
}


// Closure memory implications and cleanup patterns
function createEventManager(element) {
  const handlers = new Map();
  let isDestroyed = false;

  function on(event, handler) {
    if (isDestroyed) throw new Error('EventManager is destroyed');

    const wrappedHandler = (e) => {
      // Closure over handler and any captured state
      handler(e);
    };

    element.addEventListener(event, wrappedHandler);
    if (!handlers.has(event)) handlers.set(event, []);
    handlers.get(event).push({ original: handler, wrapped: wrappedHandler });

    // Return cleanup function (closure over event and wrappedHandler)
    return () => {
      element.removeEventListener(event, wrappedHandler);
      const eventHandlers = handlers.get(event);
      if (eventHandlers) {
        const idx = eventHandlers.findIndex(h => h.wrapped === wrappedHandler);
        if (idx > -1) eventHandlers.splice(idx, 1);
      }
    };
  }

  function destroy() {
    // Remove all listeners to prevent memory leaks
    for (const [event, eventHandlers] of handlers) {
      for (const { wrapped } of eventHandlers) {
        element.removeEventListener(event, wrapped);
      }
    }
    handlers.clear();
    isDestroyed = true;
    // After destroy, closures no longer hold references to DOM element
  }

  return { on, destroy };
}

// Usage: cleanup prevents memory leaks
const manager = createEventManager(document.body);
const removeClick = manager.on('click', (e) => console.log('clicked', e.target));
// Later: removeClick() removes just that handler
// Or: manager.destroy() removes all handlers and allows GC
```

## Common Pitfalls

1. **Stale closures in React useEffect and event handlers**: In React, each render creates new closures over the current props and state. If a useEffect callback or event handler captures a value from a previous render and does not re-run when that value changes (missing dependency), it operates on stale data. This is the most common source of bugs in React hooks. Always include all referenced values in dependency arrays, or use useRef for values that should not trigger re-runs.

2. **Memory leaks from closures in long-lived callbacks**: A closure keeps its entire scope chain alive as long as the closure is reachable. Event listeners, setInterval callbacks, and Promise chains that are never cleaned up prevent garbage collection of everything in their scope — including large objects, DOM references, and other closures. Always remove event listeners on cleanup, clear intervals, and cancel pending operations when they are no longer needed.

3. **Accidentally capturing mutable variables**: Closures capture variables by reference. If a closure captures a variable that is later mutated (a counter incremented in a loop, an object property changed), the closure sees the mutated value, not the value at the time the closure was created. This is intentional behavior but often unexpected. Use `let` in loops, create copies of values you want to freeze, or use function parameters to capture values by passing them.

4. **Over-relying on closures for state when classes or modules are clearer**: While closures can implement private state, complex objects with many private fields and methods become harder to read and debug as closure-based factories compared to classes with private fields (`#field`). Closures are ideal for simple encapsulation (counters, caches, factories) but classes provide better tooling support (IDE navigation, inheritance, instanceof checks) for complex objects.

5. **Creating closures in hot paths without realizing the allocation cost**: Every function expression creates a new closure object. In tight loops or frequently-called functions, creating closures (especially in array methods like `.map()` and `.filter()`) allocates memory that must be garbage collected. For performance-critical code, consider reusing function references or moving function definitions outside the hot path.

6. **Confusing lexical scope with dynamic scope**: JavaScript uses lexical (static) scoping — a function's scope is determined by where it is written in the source code, not where it is called. The `this` keyword is the exception: it is dynamically bound based on how the function is invoked (unless it is an arrow function). This dual behavior confuses developers who expect `this` to follow the same rules as other variables.

## Real-World Use Cases

- **React hooks as closures**: Every React hook (useState, useEffect, useCallback, useMemo) relies on closures to maintain state between renders. The state value returned by useState is captured in the closure of the component function for that render. useEffect cleanup functions close over the values from their render cycle, enabling correct cleanup of subscriptions and timers even when values have changed by the time cleanup runs.

- **Express/Fastify middleware chains**: Each middleware function closes over its configuration (rate limits, CORS origins, authentication secrets) while receiving the request context at call time. The `next()` function is a closure that knows which middleware comes next in the chain. This pattern enables composable, configurable middleware without global state.

- **Event-driven architectures with closures for per-connection state**: WebSocket servers maintain per-connection state using closures. When a connection is established, a closure captures the connection-specific data (user ID, session, subscriptions). Message handlers close over this state, enabling stateful processing without global lookup tables or class instances for each connection.

- **Functional programming patterns**: Currying (`const add = a => b => a + b`), partial application, function composition, and pipeline operators all rely on closures to capture intermediate values. Libraries like Ramda and lodash/fp use closures extensively to create reusable, composable function transformations.

- **Module pattern in legacy codebases**: Before ES Modules, the revealing module pattern used IIFEs and closures to create modules with private state and public APIs. Understanding this pattern is essential for maintaining legacy code and for understanding how bundlers transform ES Modules into closure-based module systems for older environments.

## Interview Questions

**Q: What is a closure and how does it relate to lexical scoping?**

A: A closure is the combination of a function and the lexical environment (scope) in which it was defined. When a function is created, it captures a reference to all variables in its enclosing scopes. Even after the outer function returns and its execution context is popped from the call stack, the inner function retains access to those variables because the closure keeps the scope alive. Lexical scoping means the scope is determined by the physical location of the function in the source code — a function defined inside another function has access to the outer function's variables regardless of where or when the inner function is eventually called.

**Q: Explain the difference between capturing by reference and capturing by value in closures.**

A: JavaScript closures always capture variables by reference, not by value. This means the closure does not store a snapshot of the variable's value at creation time — it stores a reference to the variable itself. If the variable is later modified, the closure sees the updated value. This is why the classic loop-with-var bug occurs: all closures in the loop reference the same `i` variable, which holds its final value after the loop. To simulate capture-by-value, you must create a new scope (using `let` in a loop, an IIFE, or a function parameter) that holds a copy of the value at that point in time.

**Q: How can closures cause memory leaks, and how do you prevent them?**

A: Closures prevent garbage collection of all variables in their scope chain as long as the closure itself is reachable. Memory leaks occur when closures are attached to long-lived objects (global event listeners, intervals, cached callbacks) and capture references to large objects (DOM nodes, data arrays, other closures) that are no longer needed. Prevention strategies include: removing event listeners when components unmount, clearing intervals and timeouts, using WeakRef for caches that should not prevent GC, nullifying references to large objects after use within the closure, and using AbortController to cancel pending operations that hold closure references.

**Q: How do closures work differently with `var` versus `let` in loops?**

A: With `var`, there is a single variable binding for the entire function scope. All closures created inside the loop share this one binding, so they all see the final value after the loop completes. With `let`, JavaScript creates a new binding for each iteration of the loop — conceptually, each iteration has its own `i` variable. Closures created in each iteration capture their own independent binding, preserving the value of `i` at the time that specific closure was created. This is why `let` solves the closure-in-loop problem without needing IIFEs or other workarounds.

**Q: What is the module pattern and how does it use closures?**

A: The module pattern uses an IIFE (Immediately Invoked Function Expression) to create a private scope, then returns an object containing only the public API. Variables declared inside the IIFE are private — they exist only in the closure and cannot be accessed from outside. The returned methods are closures that have access to these private variables, providing controlled access to internal state. This pattern was the standard way to create modules in JavaScript before ES Modules, and it is still used by bundlers (Webpack, Rollup) when generating output for environments that do not support native modules.

## Production Tips

- **Use WeakRef and FinalizationRegistry for closure-based caches**: When closures hold references to cached objects that should be garbage-collectible, use `WeakRef` to hold the reference and `FinalizationRegistry` to clean up cache entries when objects are collected. This prevents memory leaks in long-running applications where cached data accumulates over time without bound.

- **Profile closure allocation in performance-critical paths**: In hot loops and frequently-called functions, closure creation (function expressions, arrow functions) allocates memory. Use the Chrome DevTools Memory panel to identify closure-related memory growth. Consider hoisting function definitions outside loops, reusing function references via useCallback in React, or using class methods instead of closures for objects with many methods.

- **Prefer explicit cleanup over relying on garbage collection**: Do not assume closures will be garbage collected promptly. In production, explicitly remove event listeners, cancel subscriptions, clear caches, and null out large references when they are no longer needed. This is especially important in single-page applications where components mount and unmount frequently but the page never reloads.

## Related Topics

- [Core Language and ES6+](./core-language.md) — Block scoping with let/const directly affects closure behavior in loops and conditionals
- [Asynchronous JavaScript](./asynchronous-javascript.md) — Async callbacks, Promise chains, and event handlers all create closures over their surrounding scope
- [Prototypes and Classes](./prototypes-and-classes.md) — Classes with private fields offer an alternative to closure-based data privacy
