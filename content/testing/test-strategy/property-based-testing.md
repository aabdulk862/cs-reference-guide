# Property-Based Testing

## Quick Reference

- **Core idea**: Instead of writing specific examples, define properties that must hold for all valid inputs — the framework generates hundreds of random inputs automatically
- **Generators**: Composable functions that produce random values of a specific type (integers, strings, arrays, custom objects)
- **Shrinking**: When a test fails, the framework automatically reduces the failing input to the smallest example that still triggers the failure
- **Invariants**: Universal truths about your code — "sorting never changes array length", "encode then decode returns original"
- **Frameworks**: fast-check (TypeScript/JS), Hypothesis (Python), QuickCheck (Haskell), jqwik (Java), PropEr (Erlang)
- **Iteration count**: Minimum 100 iterations per property; 1000+ for critical paths
- **Stateful testing**: Model-based testing that generates sequences of operations and verifies state consistency
- **Seed reproducibility**: Failed tests record a seed value that reproduces the exact same random sequence for debugging

## When to Use

Property-based testing excels where example-based tests fall short — when the input space is large, edge cases are non-obvious, and correctness can be expressed as universal invariants rather than specific input-output pairs.

Use property-based testing for serialization and deserialization roundtrips where `decode(encode(x)) === x` must hold for all valid inputs, for mathematical and financial calculations where algebraic properties (commutativity, associativity, distributivity) must be preserved, for parsers and compilers where well-formed input must always produce valid output, for data structure operations where invariants (sorted order, balanced height, size consistency) must hold after any sequence of operations, for idempotent operations where applying the operation twice produces the same result as applying it once, and for state machines where any valid sequence of transitions must leave the system in a consistent state.

Property-based testing is particularly valuable when you discover a bug — write a property that would have caught it, and the generator will explore similar edge cases you haven't thought of. It's also invaluable for testing codec implementations, compression algorithms, and any function with a mathematical specification.

Avoid property-based testing for UI behavior, integration tests with external services, or scenarios where the "property" is just restating the implementation logic. If your property is `f(x) === myImplementation(x)`, you're testing nothing.

## Code Examples

### Roundtrip Properties with fast-check

The roundtrip property is the most common and powerful pattern: if you can encode and decode, then decoding an encoded value must return the original. This single property replaces dozens of example-based tests.

```typescript
import fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import { serialize, deserialize } from './json-codec';
import { compress, decompress } from './compression';
import { encrypt, decrypt } from './crypto';

describe('Serialization Properties', () => {
  it('should roundtrip any valid user object', () => {
    const userArbitrary = fc.record({
      id: fc.uuid(),
      name: fc.string({ minLength: 1, maxLength: 100 }),
      email: fc.emailAddress(),
      age: fc.integer({ min: 0, max: 150 }),
      roles: fc.array(fc.constantFrom('admin', 'user', 'moderator'), { minLength: 1, maxLength: 5 }),
      metadata: fc.dictionary(
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.oneof(fc.string(), fc.integer(), fc.boolean())
      ),
      createdAt: fc.date({ min: new Date('2000-01-01'), max: new Date('2030-12-31') }),
    });

    fc.assert(
      fc.property(userArbitrary, (user) => {
        const serialized = serialize(user);
        const deserialized = deserialize(serialized);

        expect(deserialized).toEqual(user);
      }),
      { numRuns: 500 }
    );
  });

  it('should roundtrip compression for any byte sequence', () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 0, maxLength: 10000 }),
        (data) => {
          const compressed = compress(data);
          const decompressed = decompress(compressed);

          expect(decompressed).toEqual(data);
          // Bonus property: compressed size should not exceed original + overhead
          expect(compressed.length).toBeLessThanOrEqual(data.length + 64);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('should roundtrip encryption for any plaintext', () => {
    const key = 'test-encryption-key-32-bytes!!!';

    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 5000 }), (plaintext) => {
        const encrypted = encrypt(plaintext, key);
        const decrypted = decrypt(encrypted, key);

        expect(decrypted).toBe(plaintext);
        // Encrypted output should differ from plaintext (unless empty)
        if (plaintext.length > 0) {
          expect(encrypted).not.toBe(plaintext);
        }
      }),
      { numRuns: 300 }
    );
  });
});
```

### Custom Generators and Shrinking

Building domain-specific generators lets you test with realistic data that satisfies your business constraints. Good generators produce values that exercise edge cases naturally.

```typescript
import fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import { PriceCalculator } from './price-calculator';
import { Money, Currency } from './money';

// Custom generator for monetary amounts
const moneyArbitrary = (currency: Currency = 'USD'): fc.Arbitrary<Money> =>
  fc.record({
    amount: fc.integer({ min: 0, max: 999999999 }), // Cents to avoid floating point
    currency: fc.constant(currency),
  });

// Custom generator for a shopping cart
const cartItemArbitrary = fc.record({
  productId: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  unitPrice: moneyArbitrary(),
  quantity: fc.integer({ min: 1, max: 100 }),
  taxRate: fc.double({ min: 0, max: 0.25, noNaN: true }),
});

const cartArbitrary = fc.record({
  items: fc.array(cartItemArbitrary, { minLength: 1, maxLength: 20 }),
  discountPercent: fc.double({ min: 0, max: 0.5, noNaN: true }),
  shippingCents: fc.integer({ min: 0, max: 5000 }),
});

describe('PriceCalculator Properties', () => {
  const calculator = new PriceCalculator();

  it('total should never be negative', () => {
    fc.assert(
      fc.property(cartArbitrary, (cart) => {
        const total = calculator.calculateTotal(cart);
        expect(total.amount).toBeGreaterThanOrEqual(0);
      })
    );
  });

  it('total should equal sum of line items minus discount plus shipping plus tax', () => {
    fc.assert(
      fc.property(cartArbitrary, (cart) => {
        const total = calculator.calculateTotal(cart);
        const subtotal = cart.items.reduce(
          (sum, item) => sum + item.unitPrice.amount * item.quantity,
          0
        );
        const discount = Math.floor(subtotal * cart.discountPercent);
        const afterDiscount = subtotal - discount;
        const tax = cart.items.reduce(
          (sum, item) =>
            sum + Math.floor(item.unitPrice.amount * item.quantity * item.taxRate),
          0
        );
        const expected = afterDiscount + tax + cart.shippingCents;

        expect(total.amount).toBe(expected);
      })
    );
  });

  it('adding an item should never decrease the total', () => {
    fc.assert(
      fc.property(cartArbitrary, cartItemArbitrary, (cart, newItem) => {
        const totalBefore = calculator.calculateTotal(cart);
        const cartWithItem = { ...cart, items: [...cart.items, newItem] };
        const totalAfter = calculator.calculateTotal(cartWithItem);

        expect(totalAfter.amount).toBeGreaterThanOrEqual(totalBefore.amount);
      })
    );
  });

  it('zero discount should equal no discount applied', () => {
    fc.assert(
      fc.property(cartArbitrary, (cart) => {
        const withDiscount = calculator.calculateTotal({ ...cart, discountPercent: 0 });
        const withoutDiscount = calculator.calculateTotal({ ...cart, discountPercent: 0 });

        expect(withDiscount.amount).toBe(withoutDiscount.amount);
      })
    );
  });
});
```

### Stateful Testing with Model-Based Approach

Stateful property-based testing generates random sequences of operations and verifies that the system under test behaves identically to a simplified model. This catches bugs that only manifest after specific operation sequences.

```typescript
import fc from 'fast-check';
import { describe, it } from 'vitest';
import { BoundedQueue } from './bounded-queue';

// Model: a simple array-based queue for comparison
class QueueModel {
  private items: number[] = [];
  constructor(private capacity: number) {}

  enqueue(item: number): boolean {
    if (this.items.length >= this.capacity) return false;
    this.items.push(item);
    return true;
  }

  dequeue(): number | undefined {
    return this.items.shift();
  }

  peek(): number | undefined {
    return this.items[0];
  }

  get size(): number {
    return this.items.length;
  }

  get isEmpty(): boolean {
    return this.items.length === 0;
  }

  get isFull(): boolean {
    return this.items.length >= this.capacity;
  }
}

// Define commands that operate on both model and real implementation
class EnqueueCommand implements fc.Command<QueueModel, BoundedQueue<number>> {
  constructor(readonly value: number) {}

  check(model: Readonly<QueueModel>): boolean {
    return true; // Always applicable
  }

  run(model: QueueModel, real: BoundedQueue<number>): void {
    const modelResult = model.enqueue(this.value);
    const realResult = real.enqueue(this.value);

    // Both should agree on whether enqueue succeeded
    expect(realResult).toBe(modelResult);
    // Size should match
    expect(real.size).toBe(model.size);
  }

  toString(): string {
    return `enqueue(${this.value})`;
  }
}

class DequeueCommand implements fc.Command<QueueModel, BoundedQueue<number>> {
  check(model: Readonly<QueueModel>): boolean {
    return true; // Test behavior on both empty and non-empty
  }

  run(model: QueueModel, real: BoundedQueue<number>): void {
    const modelResult = model.dequeue();
    const realResult = real.dequeue();

    expect(realResult).toBe(modelResult);
    expect(real.size).toBe(model.size);
  }

  toString(): string {
    return 'dequeue()';
  }
}

class PeekCommand implements fc.Command<QueueModel, BoundedQueue<number>> {
  check(): boolean {
    return true;
  }

  run(model: QueueModel, real: BoundedQueue<number>): void {
    expect(real.peek()).toBe(model.peek());
    // Peek should not modify size
    expect(real.size).toBe(model.size);
  }

  toString(): string {
    return 'peek()';
  }
}

class SizeCommand implements fc.Command<QueueModel, BoundedQueue<number>> {
  check(): boolean {
    return true;
  }

  run(model: QueueModel, real: BoundedQueue<number>): void {
    expect(real.size).toBe(model.size);
    expect(real.isEmpty).toBe(model.isEmpty);
    expect(real.isFull).toBe(model.isFull);
  }

  toString(): string {
    return 'checkSize()';
  }
}

describe('BoundedQueue Stateful Properties', () => {
  it('should behave identically to the array-based model under any operation sequence', () => {
    const capacity = 5;

    const allCommands = [
      fc.integer({ min: -100, max: 100 }).map((v) => new EnqueueCommand(v)),
      fc.constant(new DequeueCommand()),
      fc.constant(new PeekCommand()),
      fc.constant(new SizeCommand()),
    ];

    fc.assert(
      fc.property(fc.commands(allCommands, { maxCommands: 100 }), (cmds) => {
        const model = new QueueModel(capacity);
        const real = new BoundedQueue<number>(capacity);

        fc.modelRun(() => ({ model, real }), cmds);
      }),
      { numRuns: 1000 }
    );
  });
});
```

### Invariant Properties for Data Structures

```typescript
import fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import { SortedSet } from './sorted-set';

describe('SortedSet Invariants', () => {
  it('should always maintain sorted order after any sequence of insertions', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -10000, max: 10000 }), { maxLength: 200 }),
        (values) => {
          const set = new SortedSet<number>();
          for (const v of values) {
            set.insert(v);
          }

          const elements = set.toArray();
          for (let i = 1; i < elements.length; i++) {
            expect(elements[i]).toBeGreaterThan(elements[i - 1]);
          }
        }
      )
    );
  });

  it('should never contain duplicates', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 50 }), { maxLength: 100 }),
        (values) => {
          const set = new SortedSet<number>();
          for (const v of values) {
            set.insert(v);
          }

          const elements = set.toArray();
          const uniqueElements = new Set(elements);
          expect(elements.length).toBe(uniqueElements.size);
        }
      )
    );
  });

  it('size should equal number of unique values inserted', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 100 }), { maxLength: 200 }),
        (values) => {
          const set = new SortedSet<number>();
          for (const v of values) {
            set.insert(v);
          }

          const expectedSize = new Set(values).size;
          expect(set.size).toBe(expectedSize);
        }
      )
    );
  });

  it('contains should return true for all inserted values', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer(), { minLength: 1, maxLength: 100 }),
        (values) => {
          const set = new SortedSet<number>();
          for (const v of values) {
            set.insert(v);
          }

          for (const v of values) {
            expect(set.contains(v)).toBe(true);
          }
        }
      )
    );
  });

  it('delete should remove element and maintain sorted order', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 50 }), { minLength: 2, maxLength: 50 }),
        fc.nat(),
        (values, indexSeed) => {
          const set = new SortedSet<number>();
          for (const v of values) {
            set.insert(v);
          }

          // Delete a random element that exists
          const elements = set.toArray();
          const toDelete = elements[indexSeed % elements.length];
          set.delete(toDelete);

          expect(set.contains(toDelete)).toBe(false);
          // Still sorted
          const remaining = set.toArray();
          for (let i = 1; i < remaining.length; i++) {
            expect(remaining[i]).toBeGreaterThan(remaining[i - 1]);
          }
        }
      )
    );
  });
});
```

## Common Pitfalls

### 1. Writing Properties That Restate the Implementation

The most common mistake is writing a property that mirrors the production code logic. If your property is `expect(sort(arr)).toEqual(arr.slice().sort())`, you're testing JavaScript's sort against your sort — not verifying correctness. Instead, test observable properties: output is sorted, output has same length, output contains same elements.

### 2. Generators That Don't Cover Edge Cases

Default generators may not produce the edge cases that trigger bugs. An integer generator might never produce `0`, `Number.MAX_SAFE_INTEGER`, or negative numbers unless configured. Always configure generator bounds explicitly and consider using `fc.oneof` to mix edge cases with random values.

### 3. Ignoring Shrinking Quality

When a property fails with a complex input, shrinking reduces it to the minimal failing case. But custom generators with `fc.filter` or `fc.map` can produce poor shrinking because the shrinker doesn't understand your domain constraints. Prefer `fc.record` and built-in combinators over `fc.filter` when possible — they shrink more effectively.

### 4. Too Few Iterations

Running 10 iterations gives false confidence. Property-based tests derive their power from volume. Use at least 100 iterations for basic properties, 500+ for complex state machines, and 1000+ for security-sensitive code. The cost is milliseconds of execution time; the benefit is discovering edge cases that would take years of manual testing.

### 5. Non-Deterministic Properties

Properties that depend on timing, random seeds outside the framework, or external state produce flaky results. Every property must be a pure function of its generated inputs. If you need randomness, let the framework provide it through generators — don't use `Math.random()` inside properties.

### 6. Overly Constrained Generators

Using `fc.filter` to reject 99% of generated values wastes computation and may cause the framework to give up. If you need values satisfying complex constraints, build generators that produce valid values by construction rather than filtering invalid ones. For example, generate a sorted array by generating an array and sorting it, rather than generating random arrays and filtering unsorted ones.

## Real-World Use Cases

### JSON Parser Validation

A JSON parser library uses property-based testing to verify that any valid JSON value can be parsed and re-serialized to produce equivalent output. The generator produces nested objects, arrays, strings with Unicode escapes, numbers at precision boundaries, and deeply nested structures. This approach discovered a bug where the parser failed on strings containing `\u0000` (null character) — an edge case no developer thought to test manually.

### Distributed Consensus Protocol

A Raft implementation uses stateful property-based testing to verify safety properties: no two leaders in the same term, committed entries are never lost, and the log matching property holds. The generator produces sequences of network partitions, message delays, and node crashes. Testing found a subtle bug where a specific partition-heal-partition sequence caused a committed entry to be overwritten — a scenario that would take months to reproduce in production.

### Financial Calculation Engine

A trading platform uses property-based testing to verify that position calculations satisfy algebraic properties: buying then selling the same quantity returns to the original position, fees are always non-negative, and margin requirements are monotonically increasing with position size. Generators produce realistic trade sequences with varying lot sizes, prices, and fee structures. This caught a rounding error that accumulated over thousands of trades, causing a $0.01 discrepancy per trade that would have cost millions annually.

### Compiler Optimization Pass

A compiler team tests optimization passes by generating random valid ASTs, applying the optimization, and verifying that the optimized program produces the same output as the original for all inputs. This "equivalence modulo optimization" property caught a bug where constant folding incorrectly handled integer overflow in a specific combination of nested arithmetic expressions.

## Interview Questions

**Q: What is the difference between property-based testing and example-based testing?**

A: Example-based testing verifies specific input-output pairs chosen by the developer: "given input X, expect output Y." Property-based testing verifies universal invariants across randomly generated inputs: "for all valid inputs, property P holds." Example-based tests are precise but limited to cases the developer anticipates. Property-based tests explore the input space broadly and discover edge cases the developer didn't consider. They complement each other — use examples for specific business rules and regression tests, use properties for universal invariants and boundary exploration. The key insight is that properties describe what the code should do without specifying how, making them resilient to refactoring.

**Q: How does shrinking work and why is it important?**

A: When a property fails, the initial counterexample is often large and complex (a 500-element array, a deeply nested object). Shrinking systematically reduces the failing input while preserving the failure. For integers, it tries values closer to zero. For arrays, it removes elements and shrinks remaining ones. For records, it shrinks each field independently. The result is the minimal failing example — often revealing the exact boundary condition that triggers the bug. Without shrinking, you'd spend hours manually reducing a 500-element failing array to discover that the bug only requires 3 specific elements. Good shrinking is what makes property-based testing practical for debugging, not just detection.

**Q: How do you choose what properties to test?**

A: Start with these categories. **Roundtrip properties**: encode/decode, serialize/deserialize, compress/decompress — the inverse operation recovers the original. **Invariant properties**: sorting preserves length, insertion into a BST maintains sorted order, any valid state transition leaves the system in a valid state. **Algebraic properties**: commutativity (`a + b === b + a`), associativity, idempotency (`f(f(x)) === f(x)`). **Comparison with oracle**: test your optimized implementation against a known-correct but slow reference implementation. **Hard to prove, easy to verify**: it's hard to compute the shortest path, but easy to verify that a claimed shortest path is actually a valid path with the claimed cost. The key is identifying properties that are independent of implementation details.

**Q: What is stateful property-based testing?**

A: Stateful testing generates random sequences of operations (commands) and verifies that the system under test behaves consistently with a simplified model after each operation. You define a model (often a simple data structure like a Map or Array), define commands that operate on both the model and the real system, and let the framework generate thousands of random command sequences. After each command, you assert that the real system's observable state matches the model. This catches bugs that only manifest after specific operation sequences — like a cache that returns stale data only after an insert-delete-insert sequence with specific keys. It's particularly powerful for testing concurrent data structures, databases, and stateful protocols.

## Production Tips

### Seed Management for Reproducibility

Every property-based test framework records the random seed that produced a failure. Store this seed in your test configuration or CI logs so you can reproduce failures deterministically. In fast-check, use the `seed` option to replay a specific run. In CI, log the seed on every run — when a test fails intermittently, you can reproduce it locally with the exact seed from the failing build.

```typescript
// Reproduce a specific failure
fc.assert(
  fc.property(fc.integer(), (n) => {
    // ... property
  }),
  { seed: 1234567890, path: '4:2:1' } // Exact reproduction
);
```

### Combine with Coverage-Guided Fuzzing

For security-critical code, combine property-based testing with coverage-guided fuzzing. Property-based testing explores the input space randomly; fuzzing uses code coverage feedback to guide exploration toward uncovered branches. Tools like `jsfuzz` or `AFL` can be configured to use your property assertions as the oracle. This hybrid approach finds deeper bugs than either technique alone.

### Performance Properties

Beyond correctness, test performance properties: "sorting n elements takes less than n*log(n)*constant operations", "lookup in the hash map takes less than 10 probes for load factor < 0.75". These properties catch performance regressions that correctness tests miss. Use `fc.statistics` to monitor the distribution of generated inputs and ensure you're testing realistic workloads.

## Related Topics

- [Unit Testing](../unit-testing/unit-testing.md) — Property-based tests complement example-based unit tests by exploring edge cases automatically
- [Test Architecture](./test-architecture.md) — Where property-based tests fit in the test pyramid and CI pipeline
- [Mocking Strategies](../unit-testing/mocking-strategies.md) — How to structure dependencies for property-based testability
