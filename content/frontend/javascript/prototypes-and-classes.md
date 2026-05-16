# Prototypes and Classes

## Quick Reference

- Every JavaScript object has an internal `[[Prototype]]` link (accessible via `Object.getPrototypeOf()`) pointing to another object or null
- Property lookup walks the prototype chain: own properties first, then prototype, then prototype's prototype, until null
- ES6 `class` is syntactic sugar over prototypal inheritance — it creates constructor functions with prototype-based method sharing
- `new` keyword: creates empty object, sets its `[[Prototype]]` to constructor's `.prototype`, calls constructor with `this` bound to new object
- Private fields (`#field`) provide true encapsulation — inaccessible outside the class, not inherited, not visible via reflection
- `Object.create(proto)` creates an object with a specified prototype without calling a constructor function
- `instanceof` checks if an object's prototype chain includes a constructor's `.prototype` property
- Static methods belong to the class itself (not instances) and are used for factory methods, utilities, and namespace organization

## When to Use

Use classes when modeling entities with shared behavior and internal state that benefit from inheritance hierarchies, when you need true private fields that are enforced by the language runtime, when working with frameworks that expect class-based components (Angular, NestJS, TypeORM), or when building libraries where `instanceof` checks are part of the public API. Use prototypal patterns (Object.create, factory functions) when you need flexible object composition without rigid hierarchies, when you want to avoid the `new` keyword ceremony, or when creating objects dynamically from configuration. Understanding prototypes is essential regardless of whether you use classes, because classes are built on prototypes — debugging inheritance issues, understanding method resolution, and working with built-in objects (Array, Error, Map) all require prototype chain knowledge.

## Code Examples

```javascript
// Prototypal inheritance: the foundation under ES6 classes
function EventEmitter() {
  this._listeners = new Map();
  this._maxListeners = 10;
}

EventEmitter.prototype.on = function(event, handler) {
  if (!this._listeners.has(event)) {
    this._listeners.set(event, []);
  }
  const handlers = this._listeners.get(event);
  if (handlers.length >= this._maxListeners) {
    console.warn(`MaxListenersExceeded: ${event} has ${handlers.length} listeners`);
  }
  handlers.push(handler);
  return this; // Enable chaining
};

EventEmitter.prototype.emit = function(event, ...args) {
  const handlers = this._listeners.get(event);
  if (!handlers) return false;
  handlers.forEach(handler => handler.apply(this, args));
  return true;
};

EventEmitter.prototype.off = function(event, handler) {
  const handlers = this._listeners.get(event);
  if (handlers) {
    const index = handlers.indexOf(handler);
    if (index > -1) handlers.splice(index, 1);
  }
  return this;
};

// Inheritance with prototype chain setup
function TypedEmitter(eventSchema) {
  EventEmitter.call(this); // Call parent constructor
  this._schema = eventSchema;
}

// Set up prototype chain: TypedEmitter.prototype → EventEmitter.prototype
TypedEmitter.prototype = Object.create(EventEmitter.prototype);
TypedEmitter.prototype.constructor = TypedEmitter;

// Override emit to validate against schema
TypedEmitter.prototype.emit = function(event, ...args) {
  if (this._schema && this._schema[event]) {
    const validator = this._schema[event];
    if (!validator(...args)) {
      throw new Error(`Invalid payload for event: ${event}`);
    }
  }
  return EventEmitter.prototype.emit.call(this, event, ...args);
};

// Prototype chain inspection
const emitter = new TypedEmitter({ click: (x, y) => typeof x === 'number' });
Object.getPrototypeOf(emitter) === TypedEmitter.prototype;                    // true
Object.getPrototypeOf(TypedEmitter.prototype) === EventEmitter.prototype;     // true
emitter instanceof EventEmitter; // true
emitter instanceof TypedEmitter; // true
```

```javascript
// ES6 classes with private fields, static methods, and inheritance
class HttpClient {
  #baseUrl;
  #headers;
  #interceptors;
  #timeout;

  constructor(config = {}) {
    this.#baseUrl = config.baseUrl ?? '';
    this.#headers = new Map(Object.entries(config.headers ?? {}));
    this.#interceptors = { request: [], response: [] };
    this.#timeout = config.timeout ?? 30000;
  }

  // Static factory method
  static create(config) {
    return new HttpClient(config);
  }

  // Static utility
  static isAbortError(error) {
    return error instanceof DOMException && error.name === 'AbortError';
  }

  // Public method using private fields
  async request(method, path, options = {}) {
    const url = `${this.#baseUrl}${path}`;
    const headers = this.#mergeHeaders(options.headers);

    let config = { method, url, headers, body: options.body };

    // Run request interceptors
    for (const interceptor of this.#interceptors.request) {
      config = await interceptor(config);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeout ?? this.#timeout);

    try {
      const response = await fetch(config.url, {
        method: config.method,
        headers: Object.fromEntries(config.headers),
        body: config.body ? JSON.stringify(config.body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      let result = { status: response.status, headers: response.headers, data: null };
      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        result.data = await response.json();
      }

      // Run response interceptors
      for (const interceptor of this.#interceptors.response) {
        result = await interceptor(result);
      }

      if (!response.ok) {
        throw new HttpError(response.status, result.data?.message ?? response.statusText, result);
      }

      return result;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // Convenience methods
  get(path, options) { return this.request('GET', path, options); }
  post(path, body, options) { return this.request('POST', path, { ...options, body }); }
  put(path, body, options) { return this.request('PUT', path, { ...options, body }); }
  delete(path, options) { return this.request('DELETE', path, options); }

  // Interceptor registration
  addRequestInterceptor(fn) {
    this.#interceptors.request.push(fn);
    return this;
  }

  addResponseInterceptor(fn) {
    this.#interceptors.response.push(fn);
    return this;
  }

  // Private helper
  #mergeHeaders(additional = {}) {
    const merged = new Map(this.#headers);
    Object.entries(additional).forEach(([key, value]) => merged.set(key, value));
    if (!merged.has('Content-Type')) merged.set('Content-Type', 'application/json');
    return merged;
  }
}

// Custom error class extending built-in Error
class HttpError extends Error {
  constructor(status, message, response) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.response = response;
  }

  get isClientError() { return this.status >= 400 && this.status < 500; }
  get isServerError() { return this.status >= 500; }
}

// Usage
const api = HttpClient.create({
  baseUrl: 'https://api.example.com',
  headers: { 'Authorization': 'Bearer token123' },
  timeout: 10000,
});

api.addResponseInterceptor(async (response) => {
  if (response.status === 401) {
    // Refresh token logic
  }
  return response;
});
```

```javascript
// Object.create for prototype-based composition without classes
const Serializable = {
  toJSON() {
    const result = {};
    for (const key of Object.keys(this)) {
      const value = this[key];
      if (typeof value !== 'function') {
        result[key] = value;
      }
    }
    return result;
  },

  fromJSON(json) {
    return Object.assign(Object.create(Object.getPrototypeOf(this)), json);
  },
};

const Validatable = {
  validate() {
    const errors = [];
    if (this._validationRules) {
      for (const [field, rules] of Object.entries(this._validationRules)) {
        for (const rule of rules) {
          const error = rule(this[field], field);
          if (error) errors.push(error);
        }
      }
    }
    return errors.length === 0 ? { valid: true } : { valid: false, errors };
  },
};

const Observable = {
  _observers: null,

  observe(callback) {
    if (!this._observers) this._observers = new Set();
    this._observers.add(callback);
    return () => this._observers.delete(callback);
  },

  notify(change) {
    this._observers?.forEach(cb => cb(change));
  },
};

// Compose behaviors using Object.create and Object.assign
function createModel(data, validationRules) {
  const proto = Object.assign(
    Object.create(null),
    Serializable,
    Validatable,
    Observable
  );

  const instance = Object.create(proto);
  Object.assign(instance, data);
  instance._validationRules = validationRules;

  // Return a proxy that notifies observers on changes
  return new Proxy(instance, {
    set(target, prop, value) {
      const oldValue = target[prop];
      target[prop] = value;
      if (prop !== '_observers' && prop !== '_validationRules') {
        target.notify({ prop, oldValue, newValue: value });
      }
      return true;
    },
  });
}

// Usage: compose behaviors without class hierarchy
const user = createModel(
  { name: 'Alice', email: 'alice@example.com', age: 30 },
  {
    name: [(v) => !v ? 'Name required' : null],
    email: [(v) => !v?.includes('@') ? 'Invalid email' : null],
    age: [(v) => v < 0 || v > 150 ? 'Invalid age' : null],
  }
);

user.observe((change) => console.log(`${change.prop}: ${change.oldValue} → ${change.newValue}`));
user.name = 'Bob'; // Logs: "name: Alice → Bob"
user.validate();   // { valid: true }
user.toJSON();     // { name: 'Bob', email: 'alice@example.com', age: 30 }
```

## Common Pitfalls

1. **Forgetting to call `super()` in derived class constructors**: ES6 classes require `super()` to be called before accessing `this` in a derived class constructor. Omitting it throws a ReferenceError. The super call initializes the parent class's properties and sets up the prototype chain correctly. If you do not need custom constructor logic, omit the constructor entirely and the parent's constructor is called automatically.

2. **Confusing prototype properties with instance properties**: Methods defined in the class body (or on `.prototype`) are shared across all instances — there is one copy on the prototype. Properties assigned in the constructor (`this.x = value`) are per-instance — each instance has its own copy. Arrow function class fields (`method = () => {}`) create per-instance function copies (useful for stable `this` binding but wasteful if many instances exist).

3. **Using `instanceof` across realms or module boundaries**: `instanceof` checks the prototype chain against a specific constructor's `.prototype` object. If the same class is loaded from different modules (duplicate packages in node_modules) or across iframes, `instanceof` returns false even for logically identical types. Use duck typing (checking for specific methods/properties) or Symbol.hasInstance for cross-realm type checking.

4. **Modifying built-in prototypes (monkey patching)**: Adding methods to `Array.prototype`, `String.prototype`, or `Object.prototype` affects all code in the application, including third-party libraries. This causes conflicts when multiple libraries patch the same method differently, and breaks `for...in` loops on objects. Use utility functions, subclasses, or Symbol-keyed methods instead.

5. **Not understanding that private fields are per-class, not per-instance**: Private fields (`#field`) are scoped to the class that defines them. A subclass cannot access its parent's private fields, even with `this.#parentField`. This is intentional encapsulation but surprises developers expecting protected-like access. Use regular (non-private) properties with naming conventions for fields that subclasses need to access.

6. **Returning objects from constructors accidentally changing the instance type**: If a constructor returns an object (not a primitive), `new Constructor()` returns that object instead of the newly created instance. This breaks `instanceof` checks and prototype chain expectations. Only return objects from constructors intentionally (for singleton patterns or proxy wrapping), never accidentally.

## Real-World Use Cases

- **Framework component models**: Angular uses classes extensively for components, services, and dependency injection. NestJS uses classes with decorators for controllers, providers, and middleware. These frameworks leverage TypeScript classes with metadata reflection to build dependency graphs, apply decorators for routing and validation, and use inheritance for shared behavior across components.

- **Error hierarchies in production applications**: Custom error classes extending `Error` provide structured error handling with specific error types (ValidationError, NotFoundError, AuthenticationError) that carry domain-specific data (field names, status codes, retry information). Catch blocks can use `instanceof` to handle different error types differently, and error monitoring tools (Sentry) use the error class name for grouping.

- **ORM entity definitions**: TypeORM, Sequelize, and Prisma use classes to define database entities with decorators for column types, relationships, and validation. The class hierarchy maps to table inheritance strategies (single table, joined table), and instance methods provide domain logic on entity objects.

- **State machine implementations**: XState and custom state machines use classes to encapsulate state, transitions, and side effects. The class holds the current state and transition table, methods trigger transitions and execute actions, and inheritance enables specialized machines that extend base behavior.

- **Plugin and middleware architectures**: Webpack plugins, Babel plugins, and Express middleware often use classes with lifecycle methods (apply, transform, handle) that the framework calls at appropriate times. The class encapsulates plugin configuration and state, while the prototype chain enables shared utility methods across plugin instances.

## Interview Questions

**Q: Explain the prototype chain and how property lookup works in JavaScript.**

A: Every object has an internal `[[Prototype]]` link to another object (or null). When accessing a property on an object, the engine first checks the object's own properties. If not found, it follows the `[[Prototype]]` link to the prototype object and checks there. This continues up the chain until the property is found or null is reached (returning undefined). For example, an array instance's chain is: `instance → Array.prototype → Object.prototype → null`. This is why arrays have access to both array methods (from Array.prototype) and object methods like toString (from Object.prototype).

**Q: How do ES6 classes relate to prototypal inheritance? Are they fundamentally different?**

A: ES6 classes are syntactic sugar over the existing prototype-based system. A `class Foo { method() {} }` declaration creates a constructor function `Foo` with `method` defined on `Foo.prototype`. `extends` sets up the prototype chain between child and parent prototypes and ensures super() is called. The `new` keyword works identically. The differences are syntactic convenience, enforced `new` (classes throw without it), non-enumerable methods, and true private fields (#). Under the hood, the prototype chain, property lookup, and instanceof behavior are identical to pre-ES6 constructor functions.

**Q: What is the difference between `Object.create()` and the `new` keyword?**

A: `Object.create(proto)` creates a new object with its `[[Prototype]]` set to `proto` without calling any constructor function. It is pure prototype chain setup. `new Constructor()` does four things: creates an empty object, sets its `[[Prototype]]` to `Constructor.prototype`, calls `Constructor` with `this` bound to the new object (executing initialization logic), and returns the object (unless the constructor explicitly returns a different object). Use `Object.create` when you want prototype delegation without constructor side effects, and `new` when you need initialization logic to run.

**Q: How do private fields (#) differ from closures for data privacy?**

A: Private fields are enforced by the JavaScript engine at the language level — accessing `obj.#field` from outside the class throws a SyntaxError, and they are invisible to reflection (Object.keys, JSON.stringify, Proxy traps). Closures provide privacy through scope — variables are inaccessible because they are not properties of any object, but they require factory functions and cannot use inheritance. Private fields work with classes, support inheritance (though subclasses cannot access parent privates), and have better performance characteristics. Closures are more flexible (work without classes) but create per-instance function copies for methods that access private state.

**Q: When would you use composition over inheritance in JavaScript?**

A: Use composition when behaviors are orthogonal and can be mixed independently (serialization + validation + observation), when the "is-a" relationship does not hold (a Button is not a Logger, but it might use logging), when you need to combine behaviors from multiple sources (JavaScript has no multiple inheritance), or when the inheritance hierarchy would become deep and fragile. Composition via mixins, Object.assign, or delegation (holding references to collaborator objects) provides flexibility to add and remove behaviors without restructuring class hierarchies. Prefer inheritance only for genuine "is-a" relationships with shared state and behavior that naturally forms a hierarchy.

## Production Tips

- **Use private fields (#) for encapsulation in library code**: When publishing classes that others will consume, private fields prevent consumers from depending on internal implementation details. This gives you freedom to refactor internals without breaking changes. Public properties become your API contract; private fields are your implementation freedom.

- **Prefer composition and dependency injection over deep inheritance**: Classes with more than 2-3 levels of inheritance become difficult to understand and modify. Each level adds implicit behavior that subclasses must account for. Instead, inject dependencies through constructor parameters and compose behavior through delegation. This makes classes testable (mock dependencies), flexible (swap implementations), and understandable (explicit dependencies).

- **Implement proper `toJSON()` for classes used in serialization**: When class instances are passed to `JSON.stringify()`, only enumerable own properties are included by default. Private fields, prototype methods, and computed values are lost. Implement a `toJSON()` method that returns the serializable representation, and a static `fromJSON()` factory method for deserialization. This ensures round-trip fidelity for classes stored in localStorage, sent over APIs, or logged to monitoring systems.

## Related Topics

- [Core Language and ES6+](./core-language.md) — Classes, private fields, and static methods are ES6+ features built on the prototype system
- [Closures and Scope](./closures-and-scope.md) — Closures provide an alternative to classes for data privacy and encapsulation
- [TypeScript](../typescript/index.md) — TypeScript adds interfaces, abstract classes, and access modifiers on top of JavaScript's class system
