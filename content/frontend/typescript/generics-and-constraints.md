# Generics and Constraints

## Quick Reference

- Generics capture actual types at call sites using type parameters (`<T>`), preserving type information that `any` would discard
- Generic constraints (`<T extends U>`) restrict type parameters to types assignable to U, enabling safe property access on generic values
- TypeScript infers generic type arguments from function arguments in most cases; explicit type arguments are needed when inference fails
- Default type parameters (`<T = DefaultType>`) provide fallback types when no argument is specified or inferred
- The `keyof` operator produces a union of an object type's keys; `T[K]` accesses the type of property K on type T
- Generic classes and interfaces create reusable containers (collections, stores, builders) that maintain type safety across operations
- Variance annotations (`in`, `out`) explicitly declare whether a generic type is covariant, contravariant, or invariant
- Multiple type parameters can reference each other in constraints: `<T, K extends keyof T>` ensures K is a valid key of T

## When to Use

Generics are appropriate whenever you write a function, class, or interface that operates on data of varying types while needing to preserve the relationship between input and output types. Use generics for collection utilities (map, filter, reduce over typed arrays), data access layers (repositories that return typed entities), API clients (request functions that return typed responses based on the endpoint), state management (stores that maintain type-safe state slices), and builder patterns (query builders, form builders that accumulate type information). Generics become essential when you find yourself duplicating function signatures that differ only in the types they operate on, or when using `any` to achieve flexibility at the cost of type safety. The key indicator is: if the return type or behavior depends on the input type in a way that should be tracked by the compiler, generics are the solution.

## Code Examples

```typescript
// Generic function with multiple type parameters and constraints
function groupBy<T, K extends keyof T>(
  items: T[],
  key: K
): Map<T[K], T[]> {
  const groups = new Map<T[K], T[]>();

  for (const item of items) {
    const groupKey = item[key];
    const existing = groups.get(groupKey) ?? [];
    existing.push(item);
    groups.set(groupKey, existing);
  }

  return groups;
}

interface Employee {
  id: string;
  name: string;
  department: 'engineering' | 'design' | 'product';
  level: number;
}

const employees: Employee[] = [
  { id: '1', name: 'Alice', department: 'engineering', level: 5 },
  { id: '2', name: 'Bob', department: 'design', level: 3 },
  { id: '3', name: 'Carol', department: 'engineering', level: 4 },
];

// TypeScript infers K = 'department', return type = Map<'engineering' | 'design' | 'product', Employee[]>
const byDepartment = groupBy(employees, 'department');
// groupBy(employees, 'invalid'); // Error: 'invalid' not assignable to keyof Employee


// Generic class: type-safe Result monad for error handling
class Result<T, E extends Error = Error> {
  private constructor(
    private readonly value: T | null,
    private readonly error: E | null
  ) {}

  static ok<T>(value: T): Result<T, never> {
    return new Result(value, null) as Result<T, never>;
  }

  static err<E extends Error>(error: E): Result<never, E> {
    return new Result(null, error) as Result<never, E>;
  }

  isOk(): this is Result<T, never> {
    return this.error === null;
  }

  isErr(): this is Result<never, E> {
    return this.error !== null;
  }

  // map transforms the success value while preserving the error type
  map<U>(fn: (value: T) => U): Result<U, E> {
    if (this.isOk()) {
      return Result.ok(fn(this.value!));
    }
    return this as unknown as Result<U, E>;
  }

  // flatMap chains operations that might fail
  flatMap<U, E2 extends Error>(fn: (value: T) => Result<U, E2>): Result<U, E | E2> {
    if (this.isOk()) {
      return fn(this.value!);
    }
    return this as unknown as Result<U, E | E2>;
  }

  // unwrap returns the value or throws the error
  unwrap(): T {
    if (this.isOk()) return this.value!;
    throw this.error;
  }

  // getOrElse provides a fallback value
  getOrElse(fallback: T): T {
    return this.isOk() ? this.value! : fallback;
  }
}

// Usage with type inference
class ValidationError extends Error {
  constructor(public field: string, message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

function parseAge(input: string): Result<number, ValidationError> {
  const age = parseInt(input, 10);
  if (isNaN(age)) return Result.err(new ValidationError('age', 'Must be a number'));
  if (age < 0 || age > 150) return Result.err(new ValidationError('age', 'Must be 0-150'));
  return Result.ok(age);
}

function parseEmail(input: string): Result<string, ValidationError> {
  if (!input.includes('@')) return Result.err(new ValidationError('email', 'Invalid email'));
  return Result.ok(input.toLowerCase().trim());
}

// Chaining preserves error types
const ageResult = parseAge('25').map(age => age * 365); // Result<number, ValidationError>
```

```typescript
// Generic interface for type-safe repository pattern
interface Repository<T extends { id: string }> {
  findById(id: string): Promise<T | null>;
  findAll(filter?: Partial<T>): Promise<T[]>;
  create(data: Omit<T, 'id'>): Promise<T>;
  update(id: string, data: Partial<Omit<T, 'id'>>): Promise<T>;
  delete(id: string): Promise<boolean>;
}

interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  createdAt: Date;
}

interface Post {
  id: string;
  title: string;
  content: string;
  authorId: string;
  publishedAt: Date | null;
}

// Implementation maintains full type safety
class InMemoryRepository<T extends { id: string }> implements Repository<T> {
  private items = new Map<string, T>();

  async findById(id: string): Promise<T | null> {
    return this.items.get(id) ?? null;
  }

  async findAll(filter?: Partial<T>): Promise<T[]> {
    const all = Array.from(this.items.values());
    if (!filter) return all;

    return all.filter(item =>
      Object.entries(filter).every(([key, value]) =>
        item[key as keyof T] === value
      )
    );
  }

  async create(data: Omit<T, 'id'>): Promise<T> {
    const id = crypto.randomUUID();
    const item = { ...data, id } as T;
    this.items.set(id, item);
    return item;
  }

  async update(id: string, data: Partial<Omit<T, 'id'>>): Promise<T> {
    const existing = this.items.get(id);
    if (!existing) throw new Error(`Item ${id} not found`);
    const updated = { ...existing, ...data };
    this.items.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return this.items.delete(id);
  }
}

// Type-safe usage: compiler knows exact return types
const userRepo = new InMemoryRepository<User>();
const postRepo = new InMemoryRepository<Post>();

async function example() {
  // TypeScript knows this returns User
  const user = await userRepo.create({
    name: 'Alice',
    email: 'alice@example.com',
    role: 'admin',
    createdAt: new Date(),
  });

  // TypeScript knows this returns Post[]
  const posts = await postRepo.findAll({ authorId: user.id });

  // Error: 'invalid' not assignable to 'admin' | 'user'
  // await userRepo.create({ name: 'Bob', email: 'bob@example.com', role: 'invalid', createdAt: new Date() });
}


// Generic constraints with conditional return types
interface CacheOptions {
  ttl?: number;
  staleWhileRevalidate?: boolean;
}

type CacheResult<T, Options extends CacheOptions> =
  Options extends { staleWhileRevalidate: true }
    ? { data: T; isStale: boolean; revalidating: boolean }
    : { data: T };

function createCache<T>() {
  const store = new Map<string, { value: T; expiresAt: number }>();

  return {
    get<O extends CacheOptions>(
      key: string,
      fetcher: () => Promise<T>,
      options?: O
    ): Promise<CacheResult<T, O>> {
      // Implementation would check cache, fetch if needed
      // Return type adapts based on options
      return fetcher().then(data => {
        if (options?.staleWhileRevalidate) {
          return { data, isStale: false, revalidating: false } as CacheResult<T, O>;
        }
        return { data } as CacheResult<T, O>;
      });
    },

    set(key: string, value: T, ttl: number = 60000): void {
      store.set(key, { value, expiresAt: Date.now() + ttl });
    },

    invalidate(key: string): void {
      store.delete(key);
    },
  };
}
```

```typescript
// Builder pattern with generics: accumulating type information
interface QueryBuilder<T, Selected extends keyof T = keyof T> {
  select<K extends keyof T>(...fields: K[]): QueryBuilder<T, K>;
  where(condition: Partial<T>): QueryBuilder<T, Selected>;
  orderBy(field: Selected, direction?: 'asc' | 'desc'): QueryBuilder<T, Selected>;
  limit(count: number): QueryBuilder<T, Selected>;
  execute(): Promise<Pick<T, Selected>[]>;
}

// Type-safe event emitter with generic event map
type EventMap = Record<string, unknown>;
type EventHandler<T> = (payload: T) => void;

class TypedEmitter<Events extends EventMap> {
  private handlers = new Map<keyof Events, Set<Function>>();

  on<K extends keyof Events>(event: K, handler: EventHandler<Events[K]>): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);

    // Return unsubscribe function
    return () => {
      this.handlers.get(event)?.delete(handler);
    };
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const eventHandlers = this.handlers.get(event);
    if (eventHandlers) {
      eventHandlers.forEach(handler => handler(payload));
    }
  }

  once<K extends keyof Events>(event: K, handler: EventHandler<Events[K]>): void {
    const unsubscribe = this.on(event, (payload) => {
      unsubscribe();
      handler(payload);
    });
  }
}

// Usage with full type safety
interface AppEvents {
  'user:login': { userId: string; timestamp: number; method: 'password' | 'oauth' };
  'user:logout': { userId: string; reason: 'manual' | 'timeout' | 'forced' };
  'page:view': { path: string; referrer: string | null; duration: number };
  'error': { message: string; stack?: string; context: Record<string, unknown> };
}

const bus = new TypedEmitter<AppEvents>();

// TypeScript enforces correct payload types
bus.on('user:login', (payload) => {
  console.log(payload.userId);    // string
  console.log(payload.method);    // 'password' | 'oauth'
  // console.log(payload.invalid); // Error: property does not exist
});

bus.emit('user:login', {
  userId: '123',
  timestamp: Date.now(),
  method: 'oauth',
});

// Error: missing required fields
// bus.emit('user:login', { userId: '123' });
```

## Common Pitfalls

1. **Over-constraining generic parameters**: Adding unnecessary constraints limits the reusability of generic functions. If a function only needs to access `.length`, constrain to `{ length: number }` rather than `extends Array<unknown>` which excludes strings and other length-bearing types. Start with minimal constraints and add more only when the implementation requires specific properties.

2. **Failing to leverage type inference**: Explicitly specifying type arguments when TypeScript can infer them adds noise without benefit. Write `groupBy(items, 'name')` rather than `groupBy<Item, 'name'>(items, 'name')`. Explicit arguments are only needed when inference produces a type that is too broad (inferring `string` when you need a literal type) or when there is no value to infer from (generic factory functions).

3. **Using generics when a union type suffices**: Not every function that handles multiple types needs generics. If a function accepts `string | number` and returns `void`, a simple union parameter is clearer than `<T extends string | number>`. Generics are warranted when the return type or other parameters depend on the specific type argument, creating a relationship that the compiler should track.

4. **Forgetting that generic defaults do not constrain**: A default type parameter (`<T = string>`) provides a fallback when T is not specified, but it does not restrict T to string. Callers can still pass any type. If you want to restrict T, use a constraint (`<T extends string = string>`). Defaults and constraints serve different purposes and are often needed together.

5. **Creating overly complex generic signatures**: Generic types with 4+ type parameters, nested conditional types, and recursive constraints become unreadable and produce incomprehensible error messages. If a generic signature requires extensive documentation to understand, consider simplifying by splitting into multiple functions, using overloads for common cases, or accepting some type widening in exchange for clarity.

6. **Not understanding variance in generic types**: A `Repository<Animal>` is not assignable to `Repository<Dog>` even though Dog extends Animal, because the repository's `create` method would accept any Animal but the Dog repository should only accept Dogs. This contravariance in input positions catches real bugs but confuses developers expecting simple subtype relationships. Use variance annotations (`in`, `out`) in TypeScript 4.7+ to make variance explicit.

## Real-World Use Cases

- **Type-safe HTTP client libraries**: Libraries like tRPC and Zodios use generics to create API clients where the request body type, response type, and URL parameters are all inferred from a schema definition. Calling `client.users.get({ id: '123' })` returns a typed `User` object without any manual type annotations, because the generic infrastructure propagates types from the API definition through the client methods.

- **ORM query builders**: Prisma and Drizzle ORM use generics extensively to create query builders where column names, join conditions, and where clauses are all type-checked against the database schema. The generic type parameter represents the table being queried, and constraints ensure that only valid column names can be used in select, where, and orderBy clauses.

- **React component libraries with polymorphic components**: UI libraries implement polymorphic components (buttons that render as `<a>`, `<button>`, or custom components) using generics. The `as` prop is a generic parameter that determines which HTML attributes are valid: `<Button as="a" href="/path">` accepts anchor attributes while `<Button as="button" type="submit">` accepts button attributes, all enforced at compile time.

- **State management with typed selectors**: Zustand and Redux Toolkit use generics to create stores where selectors return correctly typed slices. `useStore(state => state.user.name)` returns `string` because the generic store type flows through the selector function, enabling autocomplete for state paths and type-safe derived values.

- **Dependency injection containers**: TypeScript DI frameworks (tsyringe, InversifyJS) use generics to maintain type safety between registration and resolution. When you register `container.register<Logger>(ConsoleLogger)`, resolving `container.resolve<Logger>()` returns the correct type without casting, because the generic parameter links the token to the implementation type.

## Interview Questions

**Q: Explain generic constraints and give an example of when you would use `extends keyof T`.**

A: Generic constraints restrict the types that can be used as type arguments using the `extends` keyword. `<K extends keyof T>` constrains K to be one of T's property keys, enabling safe property access with `T[K]`. A practical example is a `pick` function: `function pick<T, K extends keyof T>(obj: T, keys: K[]): Pick<T, K>`. The constraint ensures you can only pick keys that actually exist on the object, and the return type correctly reflects only the picked properties. Without the constraint, K could be any string, and accessing `obj[key]` would be unsafe.

**Q: How does TypeScript infer generic type arguments, and when does inference fail?**

A: TypeScript infers generic arguments by examining the types of values passed to function parameters. If a function is `<T>(arr: T[]): T`, passing `[1, 2, 3]` infers T as `number`. Inference fails when: there is no value to infer from (generic factory functions with no parameters), when the desired type is narrower than what inference produces (wanting a literal type but inference widens to `string`), when multiple parameters provide conflicting evidence for the same type parameter, or when the generic appears only in the return type with no corresponding parameter. In these cases, explicit type arguments are required.

**Q: What is the difference between `<T extends object>` and `<T extends Record<string, unknown>>`?**

A: `<T extends object>` constrains T to any non-primitive type, including arrays, functions, class instances, and plain objects. `<T extends Record<string, unknown>>` constrains T to objects with string keys and unknown values, which excludes arrays (whose primary keys are numeric indices) and functions. Use `extends object` when you need any reference type; use `extends Record<string, unknown>` when you specifically need a dictionary-like object with string property access. The distinction matters for functions that iterate over keys or access properties by string index.

**Q: Explain covariance and contravariance in TypeScript generics with a practical example.**

A: Covariance means a generic type preserves the subtype relationship: if Dog extends Animal, then `ReadonlyArray<Dog>` is assignable to `ReadonlyArray<Animal>` (output/read positions are covariant). Contravariance reverses it: `(animal: Animal) => void` is assignable to `(dog: Dog) => void` because a function that handles any Animal can safely handle Dogs (input/write positions are contravariant). Practically, a `Repository<Dog>` with a `save(dog: Dog)` method cannot be assigned to `Repository<Animal>` because the save method would need to accept any Animal, not just Dogs. TypeScript 4.7+ lets you annotate this explicitly with `interface Repository<in out T>`.

**Q: How would you implement a type-safe builder pattern using generics?**

A: Use a generic type parameter that accumulates information as methods are called. Each builder method returns a new type with additional type information. For example, a form builder starts as `FormBuilder<{}>` and each `.field('name', stringValidator)` call returns `FormBuilder<Previous & { name: string }>`. The final `.build()` method returns the accumulated type. This ensures that accessing `form.values.name` is only valid after the name field has been added, and the compiler tracks which fields exist at each point in the builder chain.

## Production Tips

- **Use generic constraints to document API contracts**: Rather than accepting `any` or `unknown` and performing runtime checks, use constraints to express what your function needs from its type parameter. `<T extends { id: string; createdAt: Date }>` communicates to callers exactly what shape their type must have, provides autocomplete for those properties inside the function, and produces clear error messages when the constraint is not satisfied.

- **Prefer inference over explicit type arguments in public APIs**: Design function signatures so that TypeScript can infer generic arguments from the values passed. This reduces boilerplate for callers and makes the API feel natural. If inference consistently fails for a particular use case, add an overload with explicit types for that case rather than requiring all callers to specify type arguments.

- **Use branded types with generics for domain safety**: Combine generics with branded types to create type-safe identifiers: `type Id<Entity> = string & { __entity: Entity }`. A `UserId` (`Id<User>`) and `PostId` (`Id<Post>`) are both strings at runtime but incompatible at compile time, preventing accidental ID swaps in function calls like `findPost(userId)` which would compile with plain strings but fail at runtime.

## Related Topics

- [Type System Fundamentals](./type-system-fundamentals.md) — Structural typing and type narrowing are the foundation that generics build upon
- [Advanced Types](./advanced-types.md) — Conditional types and mapped types use generics extensively for type-level computation
- [Patterns and Best Practices](./patterns-and-best-practices.md) — Production patterns like the repository pattern and builder pattern rely heavily on generics
