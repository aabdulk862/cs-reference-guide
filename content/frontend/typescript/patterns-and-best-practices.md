# Patterns and Best Practices

## Quick Reference

- Branded types create nominally distinct types from structural primitives: `type UserId = string & { __brand: 'UserId' }`
- The builder pattern accumulates type information through method chaining, with each call returning a more specific type
- Discriminated unions model state machines where each state has exactly the fields relevant to it, making impossible states unrepresentable
- Utility types (`Partial`, `Required`, `Pick`, `Omit`, `Record`) derive related types from a single source of truth
- `satisfies` validates expressions against types without widening, preserving literal types while ensuring schema compliance
- Exhaustive pattern matching with `never` in default cases catches unhandled union members at compile time
- Opaque types hide internal structure behind a branded interface, enforcing construction through validated factory functions
- Type-safe error handling uses discriminated union Result types instead of thrown exceptions for expected failure cases

## When to Use

TypeScript patterns and best practices apply across all production TypeScript codebases. Branded types are essential in domains where structurally identical values have different semantics (user IDs vs order IDs, USD vs EUR amounts, validated vs unvalidated strings). The builder pattern suits configuration objects, query construction, and any API where options accumulate incrementally. Discriminated unions should be the default approach for modeling state in React components, Redux reducers, and any system with distinct modes of operation. Utility types eliminate repetitive type definitions when you need create/update/response variants of the same entity. These patterns collectively produce code that is self-documenting, resistant to logic errors, and provides excellent IDE support through precise type inference and autocomplete.

## Code Examples

```typescript
// Branded types for domain safety
declare const __brand: unique symbol;
type Brand<T, B extends string> = T & { [__brand]: B };

type UserId = Brand<string, 'UserId'>;
type OrderId = Brand<string, 'OrderId'>;
type Email = Brand<string, 'Email'>;
type PositiveInt = Brand<number, 'PositiveInt'>;

// Factory functions that validate and brand
function createUserId(value: string): UserId {
  if (!value.match(/^usr_[a-z0-9]{12}$/)) {
    throw new Error(`Invalid user ID format: ${value}`);
  }
  return value as UserId;
}

function createEmail(value: string): Email {
  if (!value.includes('@') || !value.includes('.')) {
    throw new Error(`Invalid email: ${value}`);
  }
  return value.toLowerCase().trim() as Email;
}

function createPositiveInt(value: number): PositiveInt {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Expected positive integer, got: ${value}`);
  }
  return value as PositiveInt;
}

// Type system prevents mixing branded types
function findUser(id: UserId): Promise<User | null> {
  return db.users.findById(id);
}

function findOrder(id: OrderId): Promise<Order | null> {
  return db.orders.findById(id);
}

const userId = createUserId('usr_abc123def456');
const orderId = 'ord_xyz789' as OrderId;

findUser(userId);   // OK
// findUser(orderId); // Error: OrderId not assignable to UserId
// findOrder(userId); // Error: UserId not assignable to OrderId


// Discriminated unions for state machine modeling
type AsyncState<T, E = Error> =
  | { status: 'idle' }
  | { status: 'loading'; startedAt: number }
  | { status: 'success'; data: T; fetchedAt: number }
  | { status: 'error'; error: E; failedAt: number; retryCount: number }
  | { status: 'refreshing'; data: T; startedAt: number };

// State transitions are type-safe
function transition<T>(
  state: AsyncState<T>,
  action:
    | { type: 'FETCH_START' }
    | { type: 'FETCH_SUCCESS'; data: T }
    | { type: 'FETCH_ERROR'; error: Error }
    | { type: 'REFRESH' }
    | { type: 'RESET' }
): AsyncState<T> {
  switch (action.type) {
    case 'FETCH_START':
      return { status: 'loading', startedAt: Date.now() };

    case 'FETCH_SUCCESS':
      return { status: 'success', data: action.data, fetchedAt: Date.now() };

    case 'FETCH_ERROR':
      const retryCount = state.status === 'error' ? state.retryCount + 1 : 0;
      return { status: 'error', error: action.error, failedAt: Date.now(), retryCount };

    case 'REFRESH':
      if (state.status !== 'success') return state;
      return { status: 'refreshing', data: state.data, startedAt: Date.now() };

    case 'RESET':
      return { status: 'idle' };

    default:
      const _exhaustive: never = action;
      return _exhaustive;
  }
}

// Rendering based on state: TypeScript narrows in each branch
function renderState<T>(state: AsyncState<T>, render: (data: T) => string): string {
  switch (state.status) {
    case 'idle':
      return 'Ready to load';
    case 'loading':
      return `Loading since ${new Date(state.startedAt).toLocaleTimeString()}`;
    case 'success':
      return render(state.data); // data is available
    case 'error':
      return `Error: ${state.error.message} (retry #${state.retryCount})`;
    case 'refreshing':
      return `${render(state.data)} (refreshing...)`; // stale data available
  }
}
```

```typescript
// Type-safe builder pattern with progressive type accumulation
interface HttpRequestConfig {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers: Record<string, string>;
  body?: unknown;
  timeout?: number;
  retries?: number;
}

type RequiredFields = 'url' | 'method';
type OptionalFields = Exclude<keyof HttpRequestConfig, RequiredFields>;

class RequestBuilder<Built extends string = never> {
  private config: Partial<HttpRequestConfig> = { headers: {} };

  url(url: string): RequestBuilder<Built | 'url'> {
    this.config.url = url;
    return this as unknown as RequestBuilder<Built | 'url'>;
  }

  method(method: HttpRequestConfig['method']): RequestBuilder<Built | 'method'> {
    this.config.method = method;
    return this as unknown as RequestBuilder<Built | 'method'>;
  }

  header(key: string, value: string): this {
    this.config.headers = { ...this.config.headers, [key]: value };
    return this;
  }

  body(body: unknown): this {
    this.config.body = body;
    return this;
  }

  timeout(ms: number): this {
    this.config.timeout = ms;
    return this;
  }

  retries(count: number): this {
    this.config.retries = count;
    return this;
  }

  // build() is only available when all required fields are set
  build(this: RequestBuilder<RequiredFields>): HttpRequestConfig {
    return this.config as HttpRequestConfig;
  }
}

// Usage: TypeScript enforces that url and method are set before build
const request = new RequestBuilder()
  .url('/api/users')
  .method('POST')
  .header('Content-Type', 'application/json')
  .body({ name: 'Alice' })
  .timeout(5000)
  .build(); // OK: url and method are set

// const invalid = new RequestBuilder()
//   .url('/api/users')
//   .build(); // Error: method not set, build() not available


// Result type for type-safe error handling without exceptions
type Result<T, E extends Error = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

// Namespace for Result constructors and utilities
const Result = {
  ok<T>(value: T): Result<T, never> {
    return { ok: true, value };
  },

  err<E extends Error>(error: E): Result<never, E> {
    return { ok: false, error };
  },

  map<T, U, E extends Error>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
    return result.ok ? Result.ok(fn(result.value)) : result;
  },

  flatMap<T, U, E extends Error, E2 extends Error>(
    result: Result<T, E>,
    fn: (value: T) => Result<U, E2>
  ): Result<U, E | E2> {
    return result.ok ? fn(result.value) : result;
  },

  unwrap<T, E extends Error>(result: Result<T, E>): T {
    if (result.ok) return result.value;
    throw result.error;
  },

  fromPromise<T>(promise: Promise<T>): Promise<Result<T, Error>> {
    return promise
      .then(value => Result.ok(value) as Result<T, Error>)
      .catch(error => Result.err(error instanceof Error ? error : new Error(String(error))));
  },
};

// Usage: composing fallible operations
class ValidationError extends Error {
  constructor(public field: string, message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

class NetworkError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

function validateEmail(input: string): Result<Email, ValidationError> {
  if (!input.includes('@')) {
    return Result.err(new ValidationError('email', 'Must contain @'));
  }
  return Result.ok(input.toLowerCase().trim() as Email);
}

async function registerUser(
  email: string,
  password: string
): Promise<Result<User, ValidationError | NetworkError>> {
  const emailResult = validateEmail(email);
  if (!emailResult.ok) return emailResult;

  const response = await fetch('/api/register', {
    method: 'POST',
    body: JSON.stringify({ email: emailResult.value, password }),
  });

  if (!response.ok) {
    return Result.err(new NetworkError(response.status, response.statusText));
  }

  const user = await response.json();
  return Result.ok(user);
}
```

```typescript
// Utility type patterns for DRY type definitions
interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

interface User extends BaseEntity {
  name: string;
  email: string;
  role: 'admin' | 'user' | 'moderator';
  preferences: UserPreferences;
}

interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  language: string;
  notifications: {
    email: boolean;
    push: boolean;
    sms: boolean;
  };
}

// Derive all related types from the base User interface
type CreateUserInput = Omit<User, keyof BaseEntity>;
type UpdateUserInput = Partial<Omit<User, keyof BaseEntity | 'email'>> & { id: string };
type UserResponse = Omit<User, 'version'>;
type PublicProfile = Pick<User, 'id' | 'name' | 'role'>;
type UserSummary = Pick<User, 'id' | 'name' | 'email' | 'role'>;

// Deep partial for patch operations on nested objects
type DeepPartial<T> = T extends object
  ? { [K in keyof T]?: DeepPartial<T[K]> }
  : T;

type PatchUserPreferences = DeepPartial<UserPreferences>;
// { theme?: ...; language?: ...; notifications?: { email?: ...; push?: ...; sms?: ... } }


// satisfies operator for validated constants with preserved literals
interface RouteConfig {
  path: string;
  component: string;
  auth: boolean;
  roles?: Array<'admin' | 'user' | 'moderator'>;
}

// satisfies validates shape while preserving literal types
const routes = {
  home: { path: '/', component: 'Dashboard', auth: false },
  profile: { path: '/profile', component: 'Profile', auth: true },
  admin: { path: '/admin', component: 'AdminPanel', auth: true, roles: ['admin'] },
  settings: { path: '/settings', component: 'Settings', auth: true, roles: ['admin', 'moderator'] },
} satisfies Record<string, RouteConfig>;

// TypeScript knows the exact literal types:
type HomeRoute = typeof routes.home;
// { path: "/"; component: "Dashboard"; auth: false }
// NOT { path: string; component: string; auth: boolean }

// Autocomplete works for route keys:
function navigate(route: keyof typeof routes): void {
  window.location.href = routes[route].path;
}
navigate('home');    // OK
// navigate('invalid'); // Error: not a valid route key


// Exhaustive pattern matching with compile-time safety
type PaymentMethod =
  | { type: 'credit_card'; last4: string; brand: string; expiryMonth: number; expiryYear: number }
  | { type: 'bank_transfer'; bankName: string; accountLast4: string }
  | { type: 'paypal'; email: string }
  | { type: 'crypto'; walletAddress: string; network: 'ethereum' | 'bitcoin' };

function processPayment(method: PaymentMethod): string {
  switch (method.type) {
    case 'credit_card':
      return `Charging ${method.brand} ending in ${method.last4}`;
    case 'bank_transfer':
      return `Transferring from ${method.bankName} account ***${method.accountLast4}`;
    case 'paypal':
      return `Processing PayPal payment for ${method.email}`;
    case 'crypto':
      return `Sending to ${method.network} wallet ${method.walletAddress.slice(0, 8)}...`;
    default:
      // If a new payment type is added to the union without a case here,
      // this line produces a compile error
      const _exhaustive: never = method;
      return _exhaustive;
  }
}
```

## Common Pitfalls

1. **Overusing branded types for every primitive**: Branding every string and number in the codebase creates excessive ceremony (factory functions, type assertions) without proportional safety benefit. Brand types only when mixing values would cause real bugs: IDs that reference different entities, monetary amounts in different currencies, validated vs unvalidated inputs. Simple strings like display names or descriptions rarely need branding.

2. **Making impossible states representable with optional fields**: Using `{ data?: T; error?: Error; loading?: boolean }` allows states like `{ data: user, error: someError, loading: true }` which should never occur. Discriminated unions (`{ status: 'success'; data: T } | { status: 'error'; error: Error }`) make each state explicit and mutually exclusive, enabling exhaustive handling and preventing logic bugs from impossible combinations.

3. **Deriving too many types from a single source**: While DRY type definitions are good, creating 10+ derived types from one interface (CreateInput, UpdateInput, PatchInput, Response, Summary, PublicView, AdminView, etc.) can make the type relationships hard to follow. If derived types diverge significantly from the source, consider defining them independently with explicit documentation of their relationship.

4. **Using `as` assertions instead of type guards in Result patterns**: When working with Result types or discriminated unions, using `result.value as T` bypasses the type narrowing that makes these patterns safe. Always check the discriminant (`if (result.ok)`) to narrow the type, letting TypeScript verify that you are accessing the correct fields for the current state.

5. **Ignoring the `satisfies` operator for configuration objects**: Annotating constants with a type (`const config: Config = { ... }`) widens literal values to their base types, losing autocomplete for specific values. Using `satisfies` preserves the exact literal types while still validating the shape, giving you both compile-time safety and precise type inference for downstream consumers.

6. **Not providing escape hatches in strict type systems**: Overly strict types that require extensive ceremony for simple operations frustrate developers and lead to widespread `as any` usage. Design type APIs with reasonable defaults, provide helper functions for common operations, and allow gradual strictness (accept broader types at boundaries, narrow internally) rather than requiring maximum precision everywhere.

## Real-World Use Cases

- **Financial systems with currency safety**: Trading platforms and payment processors use branded types to prevent arithmetic between different currencies (`USD + EUR` is a compile error), ensure amounts pass through validation before processing, and distinguish between gross/net/tax amounts that are all numbers but semantically different. The type system catches currency conversion bugs that would otherwise cause financial discrepancies.

- **React state management with discriminated unions**: Complex UI components (multi-step forms, data fetching, authentication flows) model their state as discriminated unions where each state variant contains exactly the data available in that state. This eliminates null checks, prevents accessing data before it is loaded, and enables exhaustive rendering logic where the compiler verifies every state is handled.

- **API contract enforcement with utility types**: Backend teams define a single entity interface and derive all API-related types (create input, update input, response, list response) using utility types. When the base entity changes, all derived types update automatically, and TypeScript catches any API handler that does not conform to the new shape. This pattern is used extensively in tRPC and NestJS applications.

- **Configuration management with satisfies**: Large applications with complex configuration (feature flags, environment-specific settings, theme tokens) use `satisfies` to validate configuration objects against schemas while preserving literal types for autocomplete. Developers get immediate feedback when configuration is invalid, and consuming code gets precise types for each configuration value.

- **Event-driven architectures with typed event maps**: Microservice communication, WebSocket protocols, and pub/sub systems define typed event maps where each event name maps to a specific payload type. The TypeScript compiler ensures that event publishers send correctly-shaped payloads and event subscribers handle the correct types, catching protocol mismatches at compile time rather than runtime.

## Interview Questions

**Q: What are branded types and when would you use them over plain type aliases?**

A: Branded types add a phantom property (a property that exists only at the type level) to a primitive type, creating a nominally distinct type that is structurally incompatible with the unbranded version. `type UserId = string & { __brand: 'UserId' }` makes UserId incompatible with plain strings or other branded strings. Use them when structurally identical values have different semantics and mixing them would cause bugs: database IDs for different entities, monetary amounts in different currencies, validated vs unvalidated inputs. Plain type aliases (`type UserId = string`) provide documentation but no safety because they are structurally identical to their base type.

**Q: How do you model state machines in TypeScript to prevent impossible states?**

A: Use discriminated unions where each state is a separate object type with a literal `status` (or `type`) discriminant field and only the fields relevant to that state. Instead of `{ data?: T; error?: Error; loading: boolean }` which allows impossible combinations, define `{ status: 'loading' } | { status: 'success'; data: T } | { status: 'error'; error: Error }`. Each state variant is self-contained, TypeScript narrows to the correct variant in switch/if blocks, and exhaustive checking ensures all states are handled. Transition functions accept the current state and an action, returning the new state with compile-time verification that only valid transitions occur.

**Q: Explain the `satisfies` operator and how it differs from type annotations.**

A: A type annotation (`const x: Type = value`) checks that the value conforms to the type but widens the variable's type to the annotation, losing literal information. `satisfies` (`const x = value satisfies Type`) validates the value against the type (including excess property checks) while preserving the narrowest inferred type of the value. This means `const routes = { home: '/home' } satisfies Record<string, string>` gives `routes.home` the type `"/home"` (literal) rather than `string` (widened). Use `satisfies` for configuration objects, route maps, and constants where you want both validation and precise types.

**Q: How would you implement type-safe error handling without exceptions in TypeScript?**

A: Use a Result discriminated union type: `type Result<T, E> = { ok: true; value: T } | { ok: false; error: E }`. Functions that can fail return Result instead of throwing. Callers must check `result.ok` before accessing the value, which TypeScript enforces through narrowing. Compose fallible operations with `map` (transform success values) and `flatMap` (chain operations that might fail). This approach makes error handling explicit in function signatures, prevents unhandled errors, and enables typed error discrimination (different error types for different failure modes). It is particularly valuable for validation pipelines, API calls, and any operation where failure is expected rather than exceptional.

**Q: What is the difference between `Pick`, `Omit`, and manual interface definition for creating type variants?**

A: `Pick<T, K>` creates a type with only the specified keys from T, useful for creating focused views (public profile from full user). `Omit<T, K>` creates a type with all keys except the specified ones, useful for creation inputs (omit auto-generated fields like id and timestamps). Both maintain a live connection to the source type: if a property's type changes in T, the derived type updates automatically. Manual interface definition is independent and does not track changes to the source. Use Pick/Omit when the derived type should always mirror the source; use manual definition when the types may diverge independently or when the relationship is coincidental rather than intentional.

## Production Tips

- **Establish a type utilities module early in the project**: Create a `src/types/utils.ts` file with project-specific branded types, Result types, and commonly-used type transformations. Having these available from the start encourages consistent patterns across the team and prevents ad-hoc solutions that diverge in style and capability.

- **Use discriminated unions as the default for component state**: Every React component with more than two boolean state variables should consider a discriminated union instead. The upfront cost of defining the union pays dividends in preventing impossible state bugs, simplifying rendering logic (each case handles exactly one state), and making state transitions explicit and auditable.

- **Validate at boundaries, trust internally**: Apply runtime validation (Zod, io-ts, or custom type guards) at system boundaries where external data enters (API responses, user input, localStorage, URL params). Once data passes validation and receives a branded or narrowed type, internal code can trust the types without additional runtime checks. This concentrates validation logic at entry points rather than scattering defensive checks throughout the codebase.

## Related Topics

- [Type System Fundamentals](./type-system-fundamentals.md) — Structural typing and discriminated unions are the foundation for these patterns
- [Generics and Constraints](./generics-and-constraints.md) — Generic Result types and builder patterns rely on generic type parameters
- [Advanced Types](./advanced-types.md) — Utility types, conditional types, and mapped types enable the DRY type derivation patterns
