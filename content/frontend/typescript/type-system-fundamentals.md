# Type System Fundamentals

## Quick Reference

- TypeScript uses structural typing (duck typing): two types are compatible if they have the same shape, regardless of name or declaration location
- Core primitives: `string`, `number`, `boolean`, `null`, `undefined`, `symbol`, `bigint`, `void`, `never`, `unknown`, `any`
- `unknown` is the type-safe top type (accepts any value but requires narrowing before use); `any` disables all type checking
- `never` is the bottom type representing values that never occur (exhaustive checks, functions that always throw)
- Type narrowing refines broad types to specific ones through control flow analysis, typeof checks, instanceof, and discriminated unions
- Union types (`A | B`) represent values that can be one of several types; intersection types (`A & B`) combine multiple types
- Literal types (`"hello"`, `42`, `true`) represent exact values rather than broad categories
- `as const` creates deeply readonly literal types from object and array expressions

## When to Use

Understanding type system fundamentals is essential for every TypeScript developer because these concepts underpin all other TypeScript features. Structural typing determines how the compiler checks compatibility between types, which affects function parameter passing, interface implementation, and generic constraints. Type narrowing is used constantly in everyday code when handling nullable values, processing API responses with unknown shapes, and implementing exhaustive pattern matching on discriminated unions. Union and intersection types model real-world data that can take multiple forms (API responses that are either success or error, configuration objects that combine base settings with overrides). Literal types and const assertions enable type-safe enumerations, configuration objects, and action creators without runtime overhead. The type hierarchy (unknown at the top, never at the bottom) provides the mental model for understanding how types relate to each other and why certain assignments are allowed or rejected by the compiler.

## Code Examples

```typescript
// Structural typing: compatibility determined by shape, not name
interface Serializable {
  serialize(): string;
}

class UserDTO {
  constructor(public name: string, public email: string) {}
  serialize(): string {
    return JSON.stringify({ name: this.name, email: this.email });
  }
}

class ConfigEntry {
  constructor(public key: string, public value: unknown) {}
  serialize(): string {
    return `${this.key}=${String(this.value)}`;
  }
}

// Both work because they satisfy the Serializable shape
function persist(item: Serializable): void {
  const data = item.serialize();
  localStorage.setItem('data', data);
}

persist(new UserDTO('Alice', 'alice@example.com')); // OK
persist(new ConfigEntry('theme', 'dark'));           // OK
persist({ serialize: () => '{}' });                  // OK - object literal with matching shape

// Excess property checking only applies to object literals
// persist({ serialize: () => '{}', extra: true }); // Error: excess property 'extra'
const obj = { serialize: () => '{}', extra: true };
persist(obj); // OK - no excess property check on variables


// Discriminated unions with exhaustive pattern matching
type Result<T, E = Error> =
  | { status: 'success'; data: T; timestamp: number }
  | { status: 'error'; error: E; retryable: boolean }
  | { status: 'loading' }
  | { status: 'idle' };

function handleResult<T>(result: Result<T>): string {
  switch (result.status) {
    case 'success':
      // TypeScript narrows to { status: 'success'; data: T; timestamp: number }
      return `Data received at ${new Date(result.timestamp).toISOString()}`;
    case 'error':
      // TypeScript narrows to { status: 'error'; error: Error; retryable: boolean }
      return result.retryable
        ? `Retryable error: ${result.error.message}`
        : `Fatal error: ${result.error.message}`;
    case 'loading':
      return 'Loading...';
    case 'idle':
      return 'Ready';
    default:
      // Exhaustiveness check: if a new status is added, this becomes a compile error
      const _exhaustive: never = result;
      return _exhaustive;
  }
}


// Type narrowing with custom type guards
interface ApiSuccess<T> {
  ok: true;
  data: T;
  headers: Record<string, string>;
}

interface ApiError {
  ok: false;
  status: number;
  message: string;
}

type ApiResponse<T> = ApiSuccess<T> | ApiError;

// Type predicate function
function isSuccess<T>(response: ApiResponse<T>): response is ApiSuccess<T> {
  return response.ok === true;
}

// Assertion function (throws if condition fails)
function assertDefined<T>(value: T | null | undefined, name: string): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(`Expected ${name} to be defined, got ${value}`);
  }
}

async function fetchUser(id: string): Promise<ApiResponse<{ name: string; email: string }>> {
  const response = await fetch(`/api/users/${id}`);
  if (!response.ok) {
    return { ok: false, status: response.status, message: response.statusText };
  }
  const data = await response.json();
  return { ok: true, data, headers: Object.fromEntries(response.headers) };
}

async function displayUser(id: string): Promise<void> {
  const result = await fetchUser(id);

  if (isSuccess(result)) {
    // TypeScript knows result is ApiSuccess here
    console.log(result.data.name, result.data.email);
    console.log('ETag:', result.headers['etag']);
  } else {
    // TypeScript knows result is ApiError here
    console.error(`Error ${result.status}: ${result.message}`);
  }
}
```

```typescript
// The unknown type: safe handling of external data
function parseJSON(input: string): unknown {
  return JSON.parse(input);
}

// Type guard for runtime validation of unknown data
interface UserProfile {
  id: string;
  name: string;
  age: number;
  preferences: {
    theme: 'light' | 'dark';
    notifications: boolean;
  };
}

function isUserProfile(value: unknown): value is UserProfile {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;

  if (typeof obj.id !== 'string') return false;
  if (typeof obj.name !== 'string') return false;
  if (typeof obj.age !== 'number') return false;
  if (typeof obj.preferences !== 'object' || obj.preferences === null) return false;

  const prefs = obj.preferences as Record<string, unknown>;
  if (prefs.theme !== 'light' && prefs.theme !== 'dark') return false;
  if (typeof prefs.notifications !== 'boolean') return false;

  return true;
}

// Usage: safely processing external data
function loadUserFromStorage(): UserProfile | null {
  const raw = localStorage.getItem('user');
  if (!raw) return null;

  const parsed = parseJSON(raw);
  if (isUserProfile(parsed)) {
    return parsed; // TypeScript knows this is UserProfile
  }

  console.warn('Invalid user data in storage, clearing');
  localStorage.removeItem('user');
  return null;
}


// Literal types and const assertions
const DIRECTIONS = ['north', 'south', 'east', 'west'] as const;
type Direction = typeof DIRECTIONS[number]; // 'north' | 'south' | 'east' | 'west'

const HTTP_METHODS = {
  GET: 'GET',
  POST: 'POST',
  PUT: 'PUT',
  DELETE: 'DELETE',
} as const;
type HttpMethod = typeof HTTP_METHODS[keyof typeof HTTP_METHODS];
// 'GET' | 'POST' | 'PUT' | 'DELETE'

// Without as const, this would be typed as { method: string; url: string }
const request = {
  method: 'GET',
  url: '/api/users',
} as const;
// Type: { readonly method: "GET"; readonly url: "/api/users" }

// Intersection types for composing object shapes
interface Timestamped {
  createdAt: Date;
  updatedAt: Date;
}

interface SoftDeletable {
  deletedAt: Date | null;
  isDeleted: boolean;
}

interface Auditable {
  createdBy: string;
  updatedBy: string;
}

// Compose multiple concerns into a single type
type AuditedEntity = Timestamped & SoftDeletable & Auditable;

interface Order {
  id: string;
  items: Array<{ productId: string; quantity: number }>;
  total: number;
}

// Full order entity with all audit fields
type AuditedOrder = Order & AuditedEntity;
```

## Common Pitfalls

1. **Using `any` to silence type errors instead of fixing them**: When TypeScript reports a type error, casting to `any` makes the error disappear but removes all type safety for that value and everything derived from it. The `any` type is contagious — once introduced, it silently disables checking for all downstream operations. Use `unknown` with type guards for external data, fix the underlying type mismatch for internal code, or use more specific type assertions (`as SpecificType`) when you genuinely know more than the compiler.

2. **Confusing structural compatibility with identity**: Because TypeScript uses structural typing, two independently defined types with the same shape are fully interchangeable. This means a `UserId` typed as `string` is assignable to a `PostId` also typed as `string`, which can cause logic bugs when IDs are accidentally swapped. When distinct identity matters, use branded types (`type UserId = string & { __brand: 'UserId' }`) to create nominally distinct types that are structurally incompatible.

3. **Incomplete type narrowing in conditional branches**: TypeScript narrows types based on control flow, but only for checks it can analyze statically. Storing a type guard result in a variable and using it later may not narrow correctly if the variable could have changed. Similarly, narrowing inside a callback does not persist outside it because the callback might execute asynchronously. Always narrow immediately before use, or use assertion functions for complex narrowing logic.

4. **Misunderstanding excess property checking**: TypeScript only checks for excess properties on object literals assigned directly to a typed location. If you assign the literal to a variable first, excess properties are allowed because the variable might be used elsewhere where those properties are valid. This inconsistency confuses developers who expect strict shape checking everywhere. Use `satisfies` operator (TypeScript 4.9+) for strict checking without widening.

5. **Forgetting that type assertions are unchecked**: The `as` keyword tells the compiler to trust your judgment without verification. If you write `value as string` but value is actually a number at runtime, TypeScript cannot catch this — you get a runtime error. Type assertions should be rare and accompanied by comments explaining why the assertion is safe. Prefer type guards that perform runtime checks and narrow types safely.

6. **Not leveraging discriminated unions for state modeling**: Representing component state as a flat object with optional fields (`{ data?: T; error?: Error; loading?: boolean }`) allows impossible states (data and error both present, loading true with data present). Discriminated unions (`{ status: 'success'; data: T } | { status: 'error'; error: Error } | { status: 'loading' }`) make impossible states unrepresentable and enable exhaustive pattern matching.

## Real-World Use Cases

- **API response validation at application boundaries**: Every application receives data from external sources (REST APIs, WebSocket messages, localStorage, URL parameters) that cannot be trusted at compile time. Type guards and validation libraries like Zod parse unknown data into typed values at the boundary, ensuring that all internal code operates on validated, correctly-typed data. This pattern catches schema mismatches between frontend and backend immediately rather than causing cryptic runtime errors deep in the application.

- **State machine modeling for complex UI flows**: Multi-step wizards, authentication flows, and payment processing involve states with different available data and allowed transitions. Discriminated unions model each state as a distinct type with only the fields relevant to that state, making it impossible to access data that does not exist in the current state. The compiler enforces that all states are handled in rendering logic and that transitions only occur between valid state pairs.

- **Domain-driven design with branded types**: Financial applications use branded types to distinguish between different currency amounts (`type USD = number & { __brand: 'USD' }`, `type EUR = number & { __brand: 'EUR' }`) preventing accidental arithmetic between incompatible currencies. Similarly, database IDs, timestamps, and measurement units can be branded to prevent mixing values that are structurally identical but semantically different.

- **Plugin and middleware type safety**: Express middleware, Redux middleware, and plugin systems use type narrowing and intersection types to progressively add properties to request objects or state as data flows through the pipeline. Each middleware declares what it adds to the context, and downstream handlers can safely access those additions because the type system tracks the accumulated shape.

- **Configuration validation and environment typing**: Applications with complex configuration (feature flags, environment variables, service endpoints) use TypeScript to ensure all required configuration is present and correctly typed at startup. The `satisfies` operator validates configuration objects against a schema while preserving literal types for autocomplete, catching missing or mistyped configuration keys at compile time rather than runtime.

## Interview Questions

**Q: Explain structural typing and how it differs from nominal typing. What are the implications for TypeScript code?**

A: Structural typing determines type compatibility by comparing the shape (properties and their types) of two types rather than their declared names or inheritance relationships. If type A has all the properties required by type B, A is assignable to B regardless of whether A explicitly implements or extends B. This differs from nominal typing (Java, C#) where a class must explicitly declare that it implements an interface. The implication is that TypeScript types are open and composable — you can pass any object with the right shape without ceremony — but it also means two semantically different types with the same structure are interchangeable, which can cause logic bugs when distinct identity matters.

**Q: What is the difference between `unknown` and `any`, and when should you use each?**

A: Both are top types that accept any value assignment, but they differ in what you can do with the value afterward. `any` disables all type checking: you can access any property, call it as a function, or assign it to any other type without error. `unknown` requires you to narrow the type before using it — you must perform a typeof check, instanceof check, or use a type guard before accessing properties or calling methods. Use `unknown` for values from external sources (API responses, user input, deserialized data) where you need to validate the shape before proceeding. Use `any` only as a temporary escape hatch during migration from JavaScript, and eliminate it as soon as possible.

**Q: How does TypeScript's control flow narrowing work, and what are its limitations?**

A: Control flow narrowing tracks the type of a variable through conditional branches, assignments, and type guard calls. After an `if (typeof x === 'string')` check, TypeScript knows x is a string within that branch. After a null check, nullable types are narrowed to non-null. Discriminated union checks narrow to the specific variant. Limitations include: narrowing does not persist across function boundaries (a callback might execute later when the variable has changed), narrowing on object properties can be invalidated by aliasing, and custom narrowing logic requires explicit type predicate functions (`value is Type`) because the compiler cannot infer arbitrary narrowing from function implementations.

**Q: Explain the `never` type and its practical uses.**

A: `never` is the bottom type — it represents values that can never occur. A function returning `never` either always throws an error or contains an infinite loop. In exhaustive switch statements, the default case assigns the discriminant to `never`, which produces a compile error if a new union member is added without a corresponding case. `never` also appears as the result of impossible intersections (`string & number` is `never`) and as the inferred type of empty arrays before any elements are added. Practically, `never` is used for exhaustiveness checking, for marking function parameters that should never be called, and for conditional type filtering (`Exclude<T, U>` resolves to `never` for excluded members).

**Q: What is the `satisfies` operator and how does it differ from type annotations and assertions?**

A: The `satisfies` operator (TypeScript 4.9+) validates that an expression matches a type without widening the inferred type. A type annotation (`const x: Type = value`) widens the value to the annotated type, losing literal information. A type assertion (`value as Type`) tells the compiler to trust you without checking excess properties. `satisfies` checks the value against the type (including excess property checks) while preserving the narrowest inferred type. This is ideal for configuration objects where you want compile-time validation that all required fields are present while retaining literal types for autocomplete and type-safe property access.

## Production Tips

- **Enable strict mode from day one on new projects**: The `"strict": true` compiler option enables all strict checks simultaneously (strictNullChecks, noImplicitAny, strictFunctionTypes, etc.). Adding strict mode to an existing codebase produces hundreds of errors that are expensive to fix incrementally. Starting strict means every line of code is type-safe from the beginning, preventing the accumulation of type debt that becomes increasingly expensive to address as the codebase grows.

- **Use the `satisfies` operator for configuration and constant objects**: Rather than annotating constants with a type (which widens literals) or leaving them untyped (which misses validation), use `satisfies` to get both validation and narrow inference. This is particularly valuable for route definitions, theme tokens, feature flag defaults, and any constant object that should conform to a schema while preserving exact literal types for downstream consumers.

- **Prefer discriminated unions over optional fields for state modeling**: Instead of `{ data?: T; error?: Error; loading: boolean }` which allows impossible combinations, model state as `{ status: 'idle' } | { status: 'loading' } | { status: 'success'; data: T } | { status: 'error'; error: Error }`. This makes impossible states unrepresentable, enables exhaustive pattern matching, and provides better autocomplete because TypeScript knows exactly which fields are available in each state.

## Related Topics

- [Generics and Constraints](./generics-and-constraints.md) — Generics build on the type system fundamentals to create reusable, type-safe abstractions
- [Advanced Types](./advanced-types.md) — Conditional and mapped types use narrowing and structural typing concepts for type-level programming
- [JavaScript](../javascript/index.md) — TypeScript compiles to JavaScript; understanding JavaScript semantics is essential for effective TypeScript usage
