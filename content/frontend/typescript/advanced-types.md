# Advanced Types

## Quick Reference

- Conditional types (`T extends U ? X : Y`) select types based on assignability, enabling type-level branching logic
- The `infer` keyword extracts types from complex structures within conditional type clauses (array elements, function returns, Promise values)
- Distributive conditional types automatically distribute over union members when applied to naked type parameters
- Mapped types (`{ [K in keyof T]: NewType }`) transform every property of a type systematically
- Key remapping with `as` filters, renames, or transforms property keys during mapping
- Template literal types (`${Prefix}${string}`) enable string manipulation at the type level
- Recursive conditional types enable deep transformations (DeepReadonly, DeepPartial, JSON type parsing)
- The `satisfies` operator validates expressions against types without widening the inferred type

## When to Use

Advanced types become necessary when building library APIs that adapt their behavior based on input types, when creating type-safe wrappers around dynamic systems (ORMs, API clients, event systems), and when eliminating repetitive type definitions through systematic transformations. Conditional types are essential for utility types that extract or transform types based on their structure (unwrapping Promises, extracting function parameters, filtering union members). Mapped types eliminate boilerplate when you need multiple related types derived from a single source (Partial, Required, Readonly variants of the same interface). Template literal types enable compile-time string manipulation for generating method names, route patterns, or CSS class types. These features are primarily used by library authors and infrastructure code; application code should use them sparingly and prefer simpler types when possible, as complex type-level programming produces difficult-to-debug error messages.

## Code Examples

```typescript
// Conditional types with infer for type extraction
type UnwrapPromise<T> = T extends Promise<infer U> ? UnwrapPromise<U> : T;
type A = UnwrapPromise<Promise<Promise<string>>>; // string

// Extract function parameter and return types
type FirstParam<F> = F extends (first: infer P, ...rest: unknown[]) => unknown ? P : never;
type ReturnOf<F> = F extends (...args: unknown[]) => infer R ? R : never;

type B = FirstParam<(name: string, age: number) => void>; // string
type C = ReturnOf<() => Promise<number[]>>; // Promise<number[]>

// Extract component props from React component type
type PropsOf<C> = C extends React.ComponentType<infer P> ? P : never;

// Distributive conditional types
type ToArray<T> = T extends unknown ? T[] : never;
type D = ToArray<string | number>; // string[] | number[]

// Non-distributive (wrap in tuple to prevent distribution)
type ToArrayNonDist<T> = [T] extends [unknown] ? T[] : never;
type E = ToArrayNonDist<string | number>; // (string | number)[]

// Practical: filter union members by condition
type ExtractStrings<T> = T extends string ? T : never;
type F = ExtractStrings<string | number | boolean | 'hello'>; // string | 'hello'

// Extract only object types from a union
type ExtractObjects<T> = T extends object ? (T extends Function ? never : T) : never;
type Mixed = string | { a: 1 } | (() => void) | { b: 2 } | number;
type G = ExtractObjects<Mixed>; // { a: 1 } | { b: 2 }


// Conditional types for type-safe API routing
interface ApiRoutes {
  'GET /users': { response: User[]; params: never };
  'GET /users/:id': { response: User; params: { id: string } };
  'POST /users': { response: User; params: never; body: CreateUserDTO };
  'PUT /users/:id': { response: User; params: { id: string }; body: UpdateUserDTO };
  'DELETE /users/:id': { response: void; params: { id: string } };
}

type RouteMethod<R extends string> = R extends `${infer M} ${string}` ? M : never;
type RoutePath<R extends string> = R extends `${string} ${infer P}` ? P : never;

type HasBody<R extends keyof ApiRoutes> =
  ApiRoutes[R] extends { body: infer B } ? B : never;

type RouteResponse<R extends keyof ApiRoutes> = ApiRoutes[R]['response'];
type RouteParams<R extends keyof ApiRoutes> = ApiRoutes[R]['params'];

// Type-safe fetch wrapper
async function apiCall<R extends keyof ApiRoutes>(
  route: R,
  ...args: HasBody<R> extends never
    ? RouteParams<R> extends never
      ? []
      : [params: RouteParams<R>]
    : RouteParams<R> extends never
      ? [body: HasBody<R>]
      : [params: RouteParams<R>, body: HasBody<R>]
): Promise<RouteResponse<R>> {
  // Implementation would parse route, substitute params, send request
  throw new Error('Not implemented');
}

// Usage: TypeScript enforces correct arguments for each route
// apiCall('GET /users');                              // OK: no params, no body
// apiCall('GET /users/:id', { id: '123' });          // OK: params required
// apiCall('POST /users', { name: 'Alice', email: 'a@b.com' }); // OK: body required
// apiCall('PUT /users/:id', { id: '1' }, { name: 'Bob' });     // OK: params + body
```

```typescript
// Mapped types with key remapping and template literals
type Getters<T> = {
  [K in keyof T as `get${Capitalize<string & K>}`]: () => T[K];
};

type Setters<T> = {
  [K in keyof T as `set${Capitalize<string & K>}`]: (value: T[K]) => void;
};

type EventHandlers<T> = {
  [K in keyof T as `on${Capitalize<string & K>}Change`]: (
    oldValue: T[K],
    newValue: T[K]
  ) => void;
};

interface UserState {
  name: string;
  age: number;
  active: boolean;
}

type UserGetters = Getters<UserState>;
// { getName: () => string; getAge: () => number; getActive: () => boolean }

type UserSetters = Setters<UserState>;
// { setName: (value: string) => void; setAge: (value: number) => void; ... }

type UserEvents = EventHandlers<UserState>;
// { onNameChange: (old: string, new: string) => void; ... }


// Filter properties by value type using key remapping
type PickByType<T, ValueType> = {
  [K in keyof T as T[K] extends ValueType ? K : never]: T[K];
};

type OmitByType<T, ValueType> = {
  [K in keyof T as T[K] extends ValueType ? never : K]: T[K];
};

interface Config {
  host: string;
  port: number;
  debug: boolean;
  timeout: number;
  name: string;
}

type StringConfig = PickByType<Config, string>;  // { host: string; name: string }
type NumericConfig = PickByType<Config, number>; // { port: number; timeout: number }
type NonBoolConfig = OmitByType<Config, boolean>; // { host: string; port: number; timeout: number; name: string }


// Deep recursive mapped types
type DeepReadonly<T> = T extends Function
  ? T
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;

type DeepPartial<T> = T extends Function
  ? T
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

type DeepRequired<T> = T extends Function
  ? T
  : T extends object
    ? { [K in keyof T]-?: DeepRequired<T[K]> }
    : T;

// Practical: make specific paths of a nested object mutable
type Mutable<T> = { -readonly [K in keyof T]: T[K] };

interface AppState {
  readonly user: {
    readonly name: string;
    readonly preferences: {
      readonly theme: 'light' | 'dark';
      readonly fontSize: number;
    };
  };
  readonly settings: {
    readonly notifications: boolean;
  };
}

// Only make preferences mutable for the settings page
type EditablePreferences = Mutable<AppState['user']['preferences']>;
// { theme: 'light' | 'dark'; fontSize: number } — no longer readonly
```

```typescript
// Template literal types for string manipulation
type EventName<T extends string> = `${T}Changed` | `${T}Error` | `${T}Loading`;

type CrudEvents<Entity extends string> =
  | `${Entity}:created`
  | `${Entity}:updated`
  | `${Entity}:deleted`
  | `${Entity}:fetched`;

type UserCrudEvents = CrudEvents<'user'>;
// 'user:created' | 'user:updated' | 'user:deleted' | 'user:fetched'

// Parse route parameters from path strings
type ExtractParams<Path extends string> =
  Path extends `${string}:${infer Param}/${infer Rest}`
    ? { [K in Param | keyof ExtractParams<Rest>]: string }
    : Path extends `${string}:${infer Param}`
      ? { [K in Param]: string }
      : {};

type Params1 = ExtractParams<'/users/:id'>;
// { id: string }

type Params2 = ExtractParams<'/users/:userId/posts/:postId'>;
// { userId: string; postId: string }

// Type-safe CSS class builder
type Modifier<Base extends string, Mod extends string> = `${Base}--${Mod}`;
type Element<Block extends string, Elem extends string> = `${Block}__${Elem}`;

type ButtonClasses =
  | 'btn'
  | Element<'btn', 'icon' | 'label' | 'spinner'>
  | Modifier<'btn', 'primary' | 'secondary' | 'danger' | 'disabled'>;

function classNames(...classes: ButtonClasses[]): string {
  return classes.join(' ');
}

// Type-safe: only valid BEM classes allowed
classNames('btn', 'btn--primary', 'btn__icon');
// classNames('btn', 'btn--invalid'); // Error


// Recursive type for JSON-compatible values
type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONValue[]
  | { [key: string]: JSONValue };

// Type-safe path access for nested objects
type PathKeys<T, Prefix extends string = ''> = T extends object
  ? {
      [K in keyof T & string]: T[K] extends object
        ? `${Prefix}${K}` | PathKeys<T[K], `${Prefix}${K}.`>
        : `${Prefix}${K}`;
    }[keyof T & string]
  : never;

type PathValue<T, P extends string> =
  P extends `${infer Key}.${infer Rest}`
    ? Key extends keyof T
      ? PathValue<T[Key], Rest>
      : never
    : P extends keyof T
      ? T[P]
      : never;

interface NestedConfig {
  database: {
    host: string;
    port: number;
    credentials: {
      username: string;
      password: string;
    };
  };
  cache: {
    ttl: number;
    maxSize: number;
  };
}

type ConfigPaths = PathKeys<NestedConfig>;
// 'database' | 'database.host' | 'database.port' | 'database.credentials' | ...

function getConfig<P extends PathKeys<NestedConfig>>(
  path: P
): PathValue<NestedConfig, P> {
  // Implementation would traverse the config object
  throw new Error('Not implemented');
}

const host = getConfig('database.host');        // type: string
const port = getConfig('database.port');        // type: number
const creds = getConfig('database.credentials'); // type: { username: string; password: string }
```

## Common Pitfalls

1. **Creating unreadable error messages with deeply nested conditional types**: When conditional types are nested 3+ levels deep, TypeScript error messages become incomprehensible to consumers of your API. The error might reference internal type aliases that the user has never seen. Prefer simpler type structures with clear names, use intermediate type aliases to break complex types into understandable steps, and provide overloads for common cases that produce clear errors.

2. **Forgetting distributive behavior of conditional types**: When a conditional type receives a union as its type parameter, it distributes over each member individually. `ToArray<string | number>` produces `string[] | number[]`, not `(string | number)[]`. This is usually desired but can produce unexpected results. Wrap the type parameter in a tuple (`[T] extends [U]`) to prevent distribution when you want to check the union as a whole.

3. **Infinite recursion in recursive types**: Recursive conditional types and mapped types can cause the compiler to enter infinite loops or hit recursion depth limits. TypeScript has a built-in recursion limit (typically around 50 levels), but hitting it produces cryptic "Type instantiation is excessively deep" errors. Add base cases to recursive types and test with complex nested structures to ensure they terminate.

4. **Over-engineering types that could be simpler**: Not every type relationship needs conditional types or mapped types. If you find yourself writing complex type-level code to handle 2-3 specific cases, consider using function overloads or a simple union type instead. Type-level programming should be reserved for genuinely generic patterns that apply across many types, not for encoding specific business logic.

5. **Template literal types with unbounded string inputs**: Template literal types work well with finite unions (`'get' | 'set'`) but produce `string` when combined with broad types like `string` itself. `${string}Changed` is just `string` because any string satisfies the pattern. Ensure template literal types are used with constrained inputs (literal unions, keyof results) to produce useful narrow types.

6. **Mapped types losing method signatures**: When mapping over a type that has both properties and methods, the mapped type may lose the distinction between a method (`method(): void`) and a function property (`method: () => void`). This can affect `this` binding and overload resolution. Be aware of this when creating mapped type utilities that transform object types with methods.

## Real-World Use Cases

- **Type-safe ORM schema definitions**: Prisma generates TypeScript types from database schemas using mapped types and conditional types. The generated client provides autocomplete for table names, column names, and relationship traversals, with return types that exactly match the selected fields. A query selecting only `name` and `email` returns `{ name: string; email: string }` rather than the full model type.

- **API client code generation**: OpenAPI and GraphQL code generators produce TypeScript types using conditional types to map HTTP methods to request/response shapes. Template literal types generate method names from endpoint paths (`/users/:id` becomes `getUsersById`), and mapped types create the full client interface from the API specification.

- **CSS-in-JS type safety**: Libraries like vanilla-extract and Stitches use template literal types and mapped types to provide type-safe CSS authoring. Theme tokens are typed so that `color: '$blue500'` is valid but `color: '$blue999'` produces a compile error. Responsive variants are generated from breakpoint definitions using mapped types.

- **State machine type safety**: XState uses conditional types and mapped types to generate type-safe state machines where transitions are only allowed between valid states, actions receive correctly-typed context, and guards have access to the event that triggered the transition. The machine definition is a single source of truth from which all runtime types are derived.

- **Form library type inference**: React Hook Form and Formik use mapped types to derive validation schemas, error types, and field registration types from the form data interface. Registering a field with `register('user.email')` uses template literal types to validate the path and infer the field's value type from the nested form structure.

## Interview Questions

**Q: Explain how `infer` works in conditional types and provide a practical example.**

A: The `infer` keyword introduces a type variable within the extends clause of a conditional type that TypeScript fills in by matching the structure. For example, `type ElementOf<T> = T extends (infer E)[] ? E : never` extracts the element type from an array: `ElementOf<string[]>` resolves to `string` because TypeScript matches `string[]` against `(infer E)[]` and infers E as `string`. A practical use is `type Awaited<T> = T extends Promise<infer U> ? Awaited<U> : T` which recursively unwraps nested Promises to get the final resolved value type.

**Q: What is the difference between distributive and non-distributive conditional types?**

A: A conditional type is distributive when it is applied to a naked (unwrapped) type parameter. Given `type Wrap<T> = T extends unknown ? T[] : never`, applying it to a union `Wrap<string | number>` distributes: it evaluates `string extends unknown ? string[] : never` and `number extends unknown ? number[] : never` separately, producing `string[] | number[]`. To prevent distribution, wrap the type parameter in a tuple: `type Wrap<T> = [T] extends [unknown] ? T[] : never` evaluates the union as a whole, producing `(string | number)[]`. Distribution is usually desired for filtering and transforming union members but must be prevented when you want to treat the union as a single type.

**Q: How do mapped types work, and how does key remapping with `as` extend their capabilities?**

A: Mapped types iterate over the keys of a type using `{ [K in keyof T]: ... }` to produce a new type with transformed properties. Each property can have its value type changed, and modifiers (`readonly`, `?`) can be added or removed with `+`/`-`. Key remapping with `as` (TypeScript 4.1+) allows filtering keys (`as T[K] extends Function ? never : K` removes methods), renaming keys (`as \`get\${Capitalize<K>}\`` generates getter names), or transforming keys based on their value types. This enables generating entire API surfaces (getters, setters, event handlers) from a single data interface.

**Q: What are template literal types and how do they enable type-safe string manipulation?**

A: Template literal types use the same backtick syntax as JavaScript template literals but operate at the type level: `` type Greeting = `Hello ${string}` `` creates a type matching any string starting with "Hello ". Combined with union types, they generate all combinations: `` type Method = `${'get' | 'set'}${Capitalize<'name' | 'age'>}` `` produces `'getName' | 'getAge' | 'setName' | 'setAge'`. Built-in intrinsic types (`Uppercase`, `Lowercase`, `Capitalize`, `Uncapitalize`) transform string literals. Practical uses include parsing route parameters from path strings, generating BEM class names, and creating type-safe event name registries.

**Q: How would you implement a type-safe deep path accessor (like lodash's `get`) using advanced types?**

A: Use recursive conditional types with template literal types to parse dot-separated paths and traverse the type structure. The path type uses `PathKeys<T>` which recursively generates all valid dot-separated paths through the object. The value type uses `PathValue<T, P>` which splits the path at the first dot, indexes into T with the first segment, and recursively processes the rest. For `get(obj, 'user.address.city')`, the path is validated against the object structure and the return type is inferred as the type at that path. This requires careful handling of arrays, optional properties, and recursion depth limits.

## Production Tips

- **Use intermediate type aliases to improve error messages and readability**: Instead of inlining complex conditional types, break them into named steps. `type IsArray<T> = T extends unknown[] ? true : false` is clearer than embedding the condition inline. Named types appear in error messages, making it easier for consumers to understand what went wrong when a type constraint is not satisfied.

- **Test complex types with type-level assertions**: Use `type Assert<T extends true> = T` and conditional types to write compile-time tests for your type utilities. For example, `type _test = Assert<IsEqual<Getters<{name: string}>, {getName: () => string}>>` fails to compile if your Getters type produces the wrong result. This catches regressions when modifying complex type definitions.

- **Prefer `satisfies` over type annotations for validated constants**: When defining configuration objects, route maps, or theme tokens, use `const config = { ... } satisfies ConfigSchema` instead of `const config: ConfigSchema = { ... }`. The `satisfies` approach validates the shape while preserving literal types, giving you both compile-time validation and precise autocomplete for the actual values.

## Related Topics

- [Type System Fundamentals](./type-system-fundamentals.md) — Structural typing and narrowing are prerequisites for understanding conditional type behavior
- [Generics and Constraints](./generics-and-constraints.md) — Generic type parameters are the inputs to conditional and mapped type transformations
- [Patterns and Best Practices](./patterns-and-best-practices.md) — Advanced types enable production patterns like branded types, builder patterns, and type-safe APIs
