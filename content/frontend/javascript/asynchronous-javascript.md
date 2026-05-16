# Asynchronous JavaScript

## Quick Reference

- The event loop processes the call stack to completion, then drains all microtasks, then executes one macrotask, repeating continuously
- Microtasks (Promise callbacks, queueMicrotask) have higher priority than macrotasks (setTimeout, setInterval, I/O)
- Promises represent eventual completion or failure; once settled (fulfilled/rejected), their state and value are immutable
- `async`/`await` is syntactic sugar over Promises — an async function always returns a Promise, await pauses until settlement
- Promise combinators: `all` (all succeed), `allSettled` (all complete), `race` (first settles), `any` (first succeeds)
- AbortController provides a standard cancellation mechanism for fetch, event listeners, and custom async operations
- Generators (`function*`) produce iterators that yield values lazily; async generators combine generators with Promises
- `process.nextTick` (Node.js) has higher priority than Promise microtasks; `requestAnimationFrame` (browser) fires before paint

## When to Use

Asynchronous patterns are necessary for any operation that involves waiting: network requests, file I/O, timers, user interactions, database queries, and inter-process communication. Use Promises and async/await for sequential async operations where each step depends on the previous result. Use Promise.all for independent operations that can run concurrently. Use Promise.allSettled when you need all results regardless of individual failures (dashboard widgets, batch operations). Use Promise.race for timeout patterns and competitive fetching. Use generators and async generators for streaming data processing, lazy evaluation of large datasets, and implementing custom iteration protocols over async data sources. Use AbortController whenever an async operation might need cancellation (component unmount, user navigation, search debouncing). Understanding the event loop is critical for predicting execution order, avoiding UI freezes, and designing performant Node.js servers.

## Code Examples

```javascript
// Event loop execution order and microtask priority
console.log('1: Synchronous');

setTimeout(() => console.log('2: Macrotask (setTimeout)'), 0);

Promise.resolve()
  .then(() => {
    console.log('3: Microtask (Promise.then)');
    // Microtask scheduled from within a microtask runs before any macrotask
    queueMicrotask(() => console.log('4: Nested microtask'));
  })
  .then(() => console.log('5: Chained microtask'));

queueMicrotask(() => console.log('6: queueMicrotask'));

requestAnimationFrame(() => console.log('7: rAF (before paint)'));

console.log('8: Synchronous end');

// Output order: 1, 8, 3, 6, 4, 5, 7, 2
// Sync first, then all microtasks (including nested), then rAF, then macrotasks


// Practical async patterns: retry with exponential backoff and circuit breaker
class CircuitBreaker {
  #state = 'closed'; // closed, open, half-open
  #failureCount = 0;
  #lastFailureTime = 0;
  #options;

  constructor(options = {}) {
    this.#options = {
      failureThreshold: options.failureThreshold ?? 5,
      resetTimeout: options.resetTimeout ?? 30000,
      halfOpenRequests: options.halfOpenRequests ?? 1,
    };
  }

  async execute(fn) {
    if (this.#state === 'open') {
      if (Date.now() - this.#lastFailureTime > this.#options.resetTimeout) {
        this.#state = 'half-open';
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await fn();
      this.#onSuccess();
      return result;
    } catch (error) {
      this.#onFailure();
      throw error;
    }
  }

  #onSuccess() {
    this.#failureCount = 0;
    this.#state = 'closed';
  }

  #onFailure() {
    this.#failureCount++;
    this.#lastFailureTime = Date.now();
    if (this.#failureCount >= this.#options.failureThreshold) {
      this.#state = 'open';
    }
  }

  get state() { return this.#state; }
}

async function fetchWithRetry(url, options = {}) {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 30000,
    signal,
    onRetry,
  } = options;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, { signal });
      if (!response.ok && response.status >= 500) {
        throw new Error(`Server error: ${response.status}`);
      }
      return response;
    } catch (error) {
      if (error.name === 'AbortError') throw error; // Don't retry cancellations
      if (attempt === maxRetries) throw error;

      const delay = Math.min(baseDelay * 2 ** attempt, maxDelay);
      const jitter = delay * (0.5 + Math.random() * 0.5);

      onRetry?.({ attempt: attempt + 1, delay: jitter, error });

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(resolve, jitter);
        signal?.addEventListener('abort', () => {
          clearTimeout(timeout);
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    }
  }
}
```

```javascript
// Promise combinators for concurrent operations
async function loadDashboard(userId) {
  // Promise.all: fail fast if any request fails
  const [user, notifications, preferences] = await Promise.all([
    fetchUser(userId),
    fetchNotifications(userId),
    fetchPreferences(userId),
  ]);

  return { user, notifications, preferences };
}

// Promise.allSettled: get all results regardless of failures
async function loadDashboardResilient(userId) {
  const results = await Promise.allSettled([
    fetchUser(userId),
    fetchNotifications(userId),
    fetchRecentActivity(userId),
    fetchRecommendations(userId),
  ]);

  return {
    user: results[0].status === 'fulfilled' ? results[0].value : null,
    notifications: results[1].status === 'fulfilled' ? results[1].value : [],
    activity: results[2].status === 'fulfilled' ? results[2].value : [],
    recommendations: results[3].status === 'fulfilled' ? results[3].value : [],
    errors: results
      .filter(r => r.status === 'rejected')
      .map(r => r.reason.message),
  };
}

// Promise.race for timeout pattern
function withTimeout(promise, ms, message = 'Operation timed out') {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(message)), ms)
  );
  return Promise.race([promise, timeout]);
}

// Promise.any: first successful result (ignores rejections until all fail)
async function fetchFromMultipleCDNs(resource) {
  try {
    return await Promise.any([
      fetch(`https://cdn1.example.com/${resource}`),
      fetch(`https://cdn2.example.com/${resource}`),
      fetch(`https://cdn3.example.com/${resource}`),
    ]);
  } catch (error) {
    // AggregateError: all CDNs failed
    throw new Error(`All CDNs failed: ${error.errors.map(e => e.message).join(', ')}`);
  }
}


// AbortController for cancellable operations
function createSearchController() {
  let currentController = null;

  return {
    async search(query) {
      // Cancel previous search
      currentController?.abort();
      currentController = new AbortController();

      const { signal } = currentController;

      // Debounce: wait before actually searching
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(resolve, 300);
        signal.addEventListener('abort', () => {
          clearTimeout(timeout);
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });

      const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal });
      return response.json();
    },

    cancel() {
      currentController?.abort();
    },
  };
}

const searchCtrl = createSearchController();
// Each call cancels the previous one — only the latest search completes
searchCtrl.search('react');     // Cancelled by next call
searchCtrl.search('react ho'); // Cancelled by next call
searchCtrl.search('react hooks'); // This one completes
```

```javascript
// Async generators for streaming data processing
async function* paginatedFetch(baseUrl, pageSize = 20) {
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const response = await fetch(`${baseUrl}?page=${page}&limit=${pageSize}`);
    const data = await response.json();

    for (const item of data.items) {
      yield item;
    }

    hasMore = data.items.length === pageSize;
    page++;
  }
}

// Consume paginated data lazily
async function findFirstMatch(url, predicate) {
  for await (const item of paginatedFetch(url)) {
    if (predicate(item)) return item;
    // Stops fetching pages once a match is found
  }
  return null;
}

const expensiveUser = await findFirstMatch(
  '/api/users',
  user => user.plan === 'enterprise'
);


// Async generator for Server-Sent Events
async function* streamSSE(url, signal) {
  const response = await fetch(url, {
    headers: { 'Accept': 'text/event-stream' },
    signal,
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') return;
          yield JSON.parse(data);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// Usage: process streaming AI responses
const controller = new AbortController();
for await (const chunk of streamSSE('/api/chat', controller.signal)) {
  appendToUI(chunk.content);
}


// Concurrency control: limit parallel operations
async function mapWithConcurrency(items, fn, concurrency = 5) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await fn(items[index], index);
    }
  }

  // Start `concurrency` workers that pull from the shared queue
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, worker);
  await Promise.all(workers);

  return results;
}

// Process 100 items with max 5 concurrent requests
const urls = Array.from({ length: 100 }, (_, i) => `/api/items/${i}`);
const responses = await mapWithConcurrency(
  urls,
  async (url) => {
    const res = await fetch(url);
    return res.json();
  },
  5 // Max 5 concurrent fetches
);
```

## Common Pitfalls

1. **Unhandled Promise rejections crashing Node.js processes**: A rejected Promise without a `.catch()` handler or surrounding `try`/`catch` in an async function causes an unhandled rejection. Since Node.js 15, this crashes the process by default. Always handle errors at the end of Promise chains, use `try`/`catch` in async functions, and add a global `process.on('unhandledRejection')` handler as a safety net that logs and alerts rather than silently swallowing errors.

2. **Sequential awaits when operations are independent**: Writing `const a = await fetchA(); const b = await fetchB();` executes sequentially even when A and B are independent. This doubles the total wait time. Use `const [a, b] = await Promise.all([fetchA(), fetchB()])` for independent operations. Sequential await is only correct when B depends on A's result.

3. **Forgetting that `await` in a loop is sequential**: `for (const item of items) { await process(item); }` processes items one at a time. If items are independent, use `await Promise.all(items.map(item => process(item)))` for parallel execution, or `mapWithConcurrency` for controlled parallelism. Sequential processing is only correct when order matters or when you need to limit concurrent operations.

4. **Race conditions from stale async results**: When a component fetches data based on rapidly-changing input (search queries, route params), earlier requests may resolve after later ones, displaying stale data. Use AbortController to cancel previous requests, or check a version counter before applying results. This is the most common async bug in React applications.

5. **Microtask starvation blocking macrotasks**: A microtask that schedules another microtask creates a loop that prevents macrotasks (setTimeout, I/O, rendering) from executing. `Promise.resolve().then(function recursive() { Promise.resolve().then(recursive); })` blocks the event loop indefinitely. Ensure recursive async patterns have termination conditions and consider using setTimeout to yield to the macrotask queue periodically.

6. **Not cancelling async operations on cleanup**: Fetch requests, timers, and subscriptions started by a component or function must be cancelled when they are no longer needed (component unmount, route change, user cancellation). Without cancellation, completed requests update unmounted components (React warnings), stale data overwrites fresh data, and memory leaks accumulate from retained closures and callbacks.

## Real-World Use Cases

- **React data fetching with TanStack Query**: TanStack Query manages the entire async lifecycle (loading, success, error, refetching) using Promises internally. It implements stale-while-revalidate patterns, automatic retry with backoff, request deduplication (multiple components requesting the same data share one fetch), and cache invalidation — all built on the Promise and AbortController primitives.

- **Node.js API servers handling concurrent requests**: Express and Fastify process thousands of concurrent requests on a single thread by leveraging the event loop's non-blocking I/O. Each request handler is an async function that awaits database queries, external API calls, and file operations without blocking other requests. Understanding the event loop is essential for avoiding patterns that block the thread (synchronous file reads, CPU-intensive computation).

- **Real-time features with WebSocket and SSE**: Chat applications, live dashboards, and collaborative editors use async generators to consume streaming data from WebSocket connections or Server-Sent Events. Each message is yielded as it arrives, enabling natural for-await-of consumption patterns with built-in backpressure handling.

- **Build tools and file processing pipelines**: Vite, Webpack, and other build tools process hundreds of files concurrently using controlled parallelism. They use Promise.all with concurrency limits to avoid overwhelming the file system, async generators for streaming large file transformations, and AbortController for cancelling builds when source files change during compilation.

- **Serverless function optimization**: AWS Lambda and Cloudflare Workers have strict execution time limits. Understanding the event loop helps optimize cold starts (top-level await for initialization), connection reuse across invocations (closures holding database pools), and parallel external calls (Promise.all for multiple API requests within the time budget).

## Interview Questions

**Q: Explain the event loop execution order: synchronous code, microtasks, and macrotasks.**

A: The event loop follows this priority: (1) Execute all synchronous code on the call stack to completion. (2) Drain the entire microtask queue (Promise callbacks, queueMicrotask). If a microtask schedules another microtask, it is processed in the same cycle. (3) Execute one macrotask from the queue (setTimeout, setInterval, I/O callbacks). (4) Repeat from step 2. In browsers, rendering (layout, paint) occurs between macrotasks when needed. This means microtasks always execute before the next macrotask, which is why Promise.then callbacks run before setTimeout(fn, 0) callbacks.

**Q: What is the difference between Promise.all, Promise.allSettled, Promise.race, and Promise.any?**

A: `Promise.all` resolves when all promises fulfill, or rejects immediately when any promise rejects (fail-fast). `Promise.allSettled` waits for all promises to settle (fulfill or reject) and returns an array of result objects with status and value/reason. `Promise.race` settles with the first promise to settle (whether fulfilled or rejected). `Promise.any` resolves with the first promise to fulfill, ignoring rejections unless all promises reject (then it rejects with AggregateError). Use `all` when you need all results and any failure is fatal, `allSettled` for independent operations where partial results are acceptable, `race` for timeouts, and `any` for redundant sources where you want the fastest success.

**Q: How does async/await relate to Promises under the hood?**

A: An async function always returns a Promise. When the function is called, it executes synchronously until the first `await` expression, then returns a pending Promise to the caller. The `await` keyword is equivalent to calling `.then()` on the awaited value — the code after `await` becomes the callback that runs when the Promise resolves. If the awaited Promise rejects, it throws in the async function (catchable with try/catch). Multiple awaits in sequence create a chain of `.then()` calls. The key insight is that code after `await` always runs as a microtask, even if the awaited value is already resolved.

**Q: How would you implement a timeout wrapper for any Promise?**

A: Create a race between the original Promise and a timeout Promise: `Promise.race([originalPromise, new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms))])`. For proper cleanup, use AbortController: pass the signal to the original operation so it can be cancelled when the timeout fires, and clear the timeout if the operation completes first. This prevents the timed-out operation from continuing to consume resources after the timeout rejects.

**Q: What are async generators and when would you use them over regular async functions?**

A: Async generators (`async function*`) combine generators (lazy, pausable iteration) with Promises (async operations). They yield values asynchronously, consumed with `for await...of`. Use them when you need to produce a sequence of values over time: paginated API responses (fetch pages on demand), streaming data (WebSocket messages, file chunks), and event streams (SSE, database change feeds). Unlike regular async functions that return a single value, async generators produce multiple values lazily — the consumer controls the pace, and the generator only fetches the next page or chunk when the consumer is ready for it.

## Production Tips

- **Always use AbortController for cancellable fetch operations**: Every fetch call in production should accept an AbortSignal. In React, create an AbortController in useEffect and abort in the cleanup function. In Node.js, abort on request cancellation or timeout. This prevents wasted bandwidth, stale state updates, and memory leaks from completed requests that are no longer relevant.

- **Implement structured concurrency with Promise.all and error boundaries**: Group related async operations with Promise.all so that if one fails, all are considered failed together (or use allSettled for independent operations). Wrap async boundaries with try/catch that logs errors with context (which operation failed, what inputs caused it, what the retry strategy is). Never let Promises float without error handling.

- **Use `queueMicrotask` instead of `Promise.resolve().then()` for scheduling microtasks**: When you need to defer work to the microtask queue without creating a Promise chain, `queueMicrotask(fn)` is more explicit and slightly more efficient. It communicates intent clearly (scheduling work after current synchronous code) without the overhead of Promise allocation.

## Related Topics

- [Core Language and ES6+](./core-language.md) — Promises, async/await, and generators are ES6+ features built on core language primitives
- [Closures and Scope](./closures-and-scope.md) — Async callbacks create closures that can capture stale state if not managed carefully
- [Modules and Tooling](./modules-and-tooling.md) — Top-level await in ES Modules enables async initialization at module load time
