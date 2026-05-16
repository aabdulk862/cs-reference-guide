# Unit Testing

## Quick Reference

- **Unit test scope**: Tests a single function, method, or class in isolation from external dependencies
- **AAA pattern**: Arrange (setup), Act (execute), Assert (verify) — the universal test structure
- **Test isolation**: Each test must be independent; no shared mutable state between tests
- **Fast feedback**: Unit tests should execute in milliseconds; a suite of 1000 tests should complete in under 10 seconds
- **Deterministic**: Same inputs always produce same outputs; no network, filesystem, or clock dependencies
- **TDD cycle**: Red → Green → Refactor; write the failing test first, then the minimal implementation
- **Coverage target**: 80%+ line coverage is a reasonable baseline; 100% branch coverage on critical paths
- **Naming convention**: `methodName_scenario_expectedBehavior` or descriptive sentence format
- **Test doubles**: Mocks verify interactions; stubs provide canned responses; fakes provide working implementations

## When to Use

Unit tests are the foundation of every test suite. Write unit tests for pure business logic and domain rules where correctness is critical, algorithmic code where edge cases are numerous and subtle, utility functions and data transformations that other code depends on, state machines and workflow logic where transitions must be validated, validation and parsing logic that handles untrusted input, and any code where a bug would be expensive to detect at higher test levels.

Unit tests provide the fastest feedback loop in your development workflow. When a unit test fails, you know exactly which function broke and can often identify the root cause from the test name alone. This precision makes unit tests the most cost-effective testing investment for logic-heavy code.

Avoid unit testing trivial code like getters, setters, and simple delegations that add no logic. Avoid testing implementation details that change frequently — test behavior through public interfaces instead. If a unit test requires extensive mocking of collaborators, consider whether an integration test would provide more confidence with less coupling.

## Code Examples

### Test Structure with AAA Pattern

The Arrange-Act-Assert pattern provides a consistent structure that makes tests readable and maintainable. Each section has a clear purpose, and deviations from this pattern signal design problems.

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { ShoppingCart } from './shopping-cart';
import { Product } from './product';

describe('ShoppingCart', () => {
  let cart: ShoppingCart;

  beforeEach(() => {
    cart = new ShoppingCart();
  });

  describe('addItem', () => {
    it('should increase total when adding a product', () => {
      // Arrange
      const product: Product = {
        id: 'prod-1',
        name: 'TypeScript Handbook',
        price: 29.99,
        quantity: 1,
      };

      // Act
      cart.addItem(product);

      // Assert
      expect(cart.getTotal()).toBe(29.99);
      expect(cart.getItemCount()).toBe(1);
    });

    it('should aggregate quantity when adding same product twice', () => {
      // Arrange
      const product: Product = {
        id: 'prod-1',
        name: 'TypeScript Handbook',
        price: 29.99,
        quantity: 1,
      };

      // Act
      cart.addItem(product);
      cart.addItem(product);

      // Assert
      expect(cart.getItemCount()).toBe(1);
      expect(cart.getItems()[0].quantity).toBe(2);
      expect(cart.getTotal()).toBe(59.98);
    });

    it('should throw when adding product with negative price', () => {
      // Arrange
      const invalidProduct: Product = {
        id: 'prod-bad',
        name: 'Invalid',
        price: -10,
        quantity: 1,
      };

      // Act & Assert
      expect(() => cart.addItem(invalidProduct)).toThrow('Price must be non-negative');
    });
  });

  describe('applyDiscount', () => {
    it('should reduce total by percentage', () => {
      // Arrange
      cart.addItem({ id: '1', name: 'Item', price: 100, quantity: 1 });

      // Act
      cart.applyDiscount(0.2); // 20% off

      // Assert
      expect(cart.getTotal()).toBe(80);
    });

    it('should not allow discount greater than 100%', () => {
      cart.addItem({ id: '1', name: 'Item', price: 100, quantity: 1 });
      expect(() => cart.applyDiscount(1.5)).toThrow('Discount must be between 0 and 1');
    });
  });
});
```

### TDD Cycle: Red-Green-Refactor

Test-Driven Development inverts the traditional workflow. You write the test first, watch it fail, write the minimal code to pass, then refactor. This cycle ensures every line of production code exists to satisfy a documented requirement.

```java
// Step 1: RED — Write the failing test
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.DisplayName;
import static org.assertj.core.api.Assertions.*;

class PasswordValidatorTest {

    @Test
    @DisplayName("should reject passwords shorter than 8 characters")
    void rejectShortPasswords() {
        PasswordValidator validator = new PasswordValidator();
        ValidationResult result = validator.validate("Ab1!xyz");

        assertThat(result.isValid()).isFalse();
        assertThat(result.getErrors()).contains("Password must be at least 8 characters");
    }

    @Test
    @DisplayName("should reject passwords without uppercase letter")
    void rejectWithoutUppercase() {
        PasswordValidator validator = new PasswordValidator();
        ValidationResult result = validator.validate("abcdefg1!");

        assertThat(result.isValid()).isFalse();
        assertThat(result.getErrors()).contains("Password must contain at least one uppercase letter");
    }

    @Test
    @DisplayName("should accept valid password meeting all criteria")
    void acceptValidPassword() {
        PasswordValidator validator = new PasswordValidator();
        ValidationResult result = validator.validate("SecureP@ss1");

        assertThat(result.isValid()).isTrue();
        assertThat(result.getErrors()).isEmpty();
    }

    @Test
    @DisplayName("should collect all validation errors at once")
    void collectAllErrors() {
        PasswordValidator validator = new PasswordValidator();
        ValidationResult result = validator.validate("ab");

        assertThat(result.isValid()).isFalse();
        assertThat(result.getErrors()).hasSize(3); // short, no uppercase, no special char
    }
}

// Step 2: GREEN — Minimal implementation to pass
class PasswordValidator {
    public ValidationResult validate(String password) {
        List<String> errors = new ArrayList<>();

        if (password.length() < 8) {
            errors.add("Password must be at least 8 characters");
        }
        if (!password.chars().anyMatch(Character::isUpperCase)) {
            errors.add("Password must contain at least one uppercase letter");
        }
        if (!password.matches(".*[!@#$%^&*()_+\\-=\\[\\]{};':\"\\\\|,.<>/?].*")) {
            errors.add("Password must contain at least one special character");
        }

        return new ValidationResult(errors.isEmpty(), errors);
    }
}

// Step 3: REFACTOR — Extract rules into composable validators
class PasswordValidator {
    private final List<ValidationRule> rules;

    public PasswordValidator() {
        this.rules = List.of(
            new MinLengthRule(8),
            new UppercaseRule(),
            new SpecialCharRule()
        );
    }

    public ValidationResult validate(String password) {
        List<String> errors = rules.stream()
            .map(rule -> rule.check(password))
            .filter(Optional::isPresent)
            .map(Optional::get)
            .toList();

        return new ValidationResult(errors.isEmpty(), errors);
    }
}
```

### Mocking Dependencies with Test Doubles

When a unit depends on external services, use test doubles to isolate the unit under test. The key is to mock at the boundary — the interface between your code and the external world.

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrderService } from './order-service';
import { PaymentGateway } from './payment-gateway';
import { InventoryService } from './inventory-service';
import { EmailService } from './email-service';

describe('OrderService', () => {
  let orderService: OrderService;
  let mockPayment: PaymentGateway;
  let mockInventory: InventoryService;
  let mockEmail: EmailService;

  beforeEach(() => {
    // Create mock implementations
    mockPayment = {
      charge: vi.fn().mockResolvedValue({ transactionId: 'txn-123', success: true }),
      refund: vi.fn().mockResolvedValue({ success: true }),
    };
    mockInventory = {
      reserve: vi.fn().mockResolvedValue(true),
      release: vi.fn().mockResolvedValue(undefined),
      checkStock: vi.fn().mockResolvedValue(10),
    };
    mockEmail = {
      sendConfirmation: vi.fn().mockResolvedValue(undefined),
      sendFailureNotice: vi.fn().mockResolvedValue(undefined),
    };

    orderService = new OrderService(mockPayment, mockInventory, mockEmail);
  });

  it('should process order successfully when stock is available', async () => {
    const order = { userId: 'user-1', productId: 'prod-1', quantity: 2, amount: 59.98 };

    const result = await orderService.placeOrder(order);

    expect(result.status).toBe('confirmed');
    expect(result.transactionId).toBe('txn-123');
    expect(mockInventory.reserve).toHaveBeenCalledWith('prod-1', 2);
    expect(mockPayment.charge).toHaveBeenCalledWith('user-1', 59.98);
    expect(mockEmail.sendConfirmation).toHaveBeenCalledWith('user-1', expect.objectContaining({
      orderId: expect.any(String),
    }));
  });

  it('should release inventory and skip payment when charge fails', async () => {
    mockPayment.charge = vi.fn().mockResolvedValue({ success: false, error: 'declined' });
    const order = { userId: 'user-1', productId: 'prod-1', quantity: 1, amount: 29.99 };

    const result = await orderService.placeOrder(order);

    expect(result.status).toBe('failed');
    expect(mockInventory.release).toHaveBeenCalledWith('prod-1', 1);
    expect(mockEmail.sendFailureNotice).toHaveBeenCalled();
  });

  it('should not charge payment when inventory reservation fails', async () => {
    mockInventory.reserve = vi.fn().mockResolvedValue(false);
    const order = { userId: 'user-1', productId: 'prod-1', quantity: 100, amount: 2999 };

    const result = await orderService.placeOrder(order);

    expect(result.status).toBe('out_of_stock');
    expect(mockPayment.charge).not.toHaveBeenCalled();
  });
});
```

### Testing Asynchronous Code

Async operations require careful handling to avoid false positives. Always await promises and test both success and failure paths.

```typescript
import { describe, it, expect, vi } from 'vitest';
import { RetryableHttpClient } from './retryable-http-client';

describe('RetryableHttpClient', () => {
  it('should retry on transient failures up to max attempts', async () => {
    const mockFetch = vi.fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockRejectedValueOnce(new Error('ETIMEDOUT'))
      .mockResolvedValueOnce({ status: 200, data: { id: 1 } });

    const client = new RetryableHttpClient({
      maxRetries: 3,
      baseDelay: 10, // Short delay for tests
      fetchFn: mockFetch,
    });

    const result = await client.get('/api/users/1');

    expect(result.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('should throw after exhausting all retry attempts', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const client = new RetryableHttpClient({
      maxRetries: 3,
      baseDelay: 10,
      fetchFn: mockFetch,
    });

    await expect(client.get('/api/users/1')).rejects.toThrow('ECONNREFUSED');
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('should not retry on non-transient errors (4xx)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ status: 404, data: null });

    const client = new RetryableHttpClient({
      maxRetries: 3,
      baseDelay: 10,
      fetchFn: mockFetch,
    });

    const result = await client.get('/api/users/999');

    expect(result.status).toBe(404);
    expect(mockFetch).toHaveBeenCalledTimes(1); // No retry for 4xx
  });
});
```

## Common Pitfalls

### 1. Testing Implementation Details Instead of Behavior

The most damaging anti-pattern is coupling tests to internal implementation. When tests verify private method calls, internal data structures, or execution order that isn't part of the contract, every refactor breaks tests without any actual bug.

**Bad**: Asserting that an internal sorting method was called with specific arguments.
**Good**: Asserting that the output collection is sorted correctly regardless of which algorithm was used.

Tests should answer "does it produce the right result?" not "does it use the algorithm I expect?"

### 2. Shared Mutable State Between Tests

When tests share state — a database connection, a singleton, or a module-level variable — they become order-dependent. Test A passes alone but fails when Test B runs first. This creates intermittent failures that erode trust in the suite.

Always reset state in `beforeEach`. Use factory functions to create fresh instances. Avoid module-level `let` variables that accumulate state across tests.

### 3. Overly Broad Assertions

Asserting on entire objects when only one field matters creates brittle tests that break when unrelated fields change. Use targeted assertions: `expect(result.status).toBe('active')` rather than `expect(result).toEqual({ id: 1, name: 'test', status: 'active', createdAt: '...' })`.

### 4. Missing Edge Cases

Testing only the happy path leaves critical bugs undiscovered. Every unit test suite should cover: null/undefined inputs, empty collections, boundary values (0, -1, MAX_INT), concurrent access patterns, and error propagation paths.

### 5. Slow Unit Tests

Unit tests that take more than 50ms each indicate hidden dependencies — network calls, file I/O, or expensive computations that should be mocked. A slow unit test suite discourages running tests frequently, which defeats the purpose of fast feedback.

### 6. Test Names That Don't Describe Behavior

Names like `test1`, `testMethod`, or `shouldWork` provide no information when they fail. A good test name is a specification: `should_return_empty_list_when_no_products_match_filter`. When this test fails, you know exactly what broke without reading the test body.

## Real-World Use Cases

### Financial Calculation Engine

A payment processing system uses unit tests to verify interest calculations, currency rounding, and fee structures. Each calculation rule has dozens of edge cases around rounding modes (HALF_UP, HALF_EVEN), currency-specific decimal places (JPY has 0, USD has 2), and regulatory thresholds. Unit tests run in under 5 seconds and catch rounding errors that would cost real money in production.

### Configuration Parser

A cloud infrastructure tool parses YAML configuration files into typed objects. Unit tests verify that malformed YAML produces clear error messages, that default values are applied correctly, that environment variable interpolation works across platforms, and that schema validation catches type mismatches. The parser has 400+ unit tests covering every node type and error path.

### State Machine for Order Lifecycle

An e-commerce platform models order states (pending, confirmed, shipped, delivered, cancelled, refunded) as a state machine. Unit tests verify every valid transition, confirm that invalid transitions throw descriptive errors, and ensure that side effects (inventory release, refund initiation) trigger only on specific transitions. The state machine has 100% branch coverage because every transition path represents a business rule.

### Rate Limiter

A rate limiting library uses unit tests with a mock clock to verify token bucket behavior without waiting for real time to pass. Tests verify burst allowance, refill rates, concurrent access patterns, and edge cases around clock skew. The mock clock enables testing minutes of simulated time in milliseconds of wall time.

## Interview Questions

**Q: What is the difference between a mock, a stub, and a spy?**

A: A **stub** provides canned answers to calls made during the test — it replaces a dependency with predetermined responses but doesn't verify how it was called. A **mock** is a stub with expectations — it verifies that specific methods were called with specific arguments in a specific order. A **spy** wraps the real implementation, allowing the real code to execute while recording calls for later verification. In practice, use stubs when you need to control inputs to the unit under test, mocks when the interaction itself is the behavior you're testing (e.g., "did we send the email?"), and spies when you want to verify a call happened without replacing the real behavior.

**Q: How do you decide what to unit test versus integration test?**

A: Unit test pure logic — calculations, transformations, validations, state machines — where the value comes from verifying correctness across many input combinations quickly. Integration test interactions — database queries, API calls, message publishing — where the value comes from verifying that components work together correctly. The decision heuristic: if the test needs external infrastructure to be meaningful, it's an integration test. If the test is meaningful with all dependencies replaced by test doubles, it's a unit test. A common mistake is unit testing code that's mostly glue logic (calling service A then service B) — this provides low confidence because the mocks might not match real behavior.

**Q: What does 100% code coverage actually tell you?**

A: 100% line coverage tells you that every line was executed during testing — it does not tell you that every line was tested correctly. Coverage measures execution, not verification. A test that calls a function without asserting anything achieves coverage without providing confidence. More useful metrics include branch coverage (every if/else path), mutation testing (do tests detect injected bugs?), and assertion density (assertions per test). In practice, 80% line coverage with high-quality assertions provides more confidence than 100% coverage with weak assertions. Coverage is a useful floor metric ("we definitely haven't tested this code") but a poor ceiling metric ("this code is definitely correct").

**Q: How do you test private methods?**

A: You don't test private methods directly — you test them through the public interface that uses them. If a private method is complex enough that you feel it needs its own tests, that's a design signal: extract it into its own class or module with a public interface, then test that. Testing private methods directly couples tests to implementation details, making refactoring painful. The exception is when using reflection-based testing in legacy code that can't be refactored yet — but this should be a temporary measure, not a permanent strategy.

**Q: What is Test-Driven Development and when is it most valuable?**

A: TDD is a development discipline where you write a failing test before writing production code, then write the minimal code to pass the test, then refactor while keeping tests green. It's most valuable when requirements are clear and expressible as examples (validation rules, algorithms, state machines), when working on complex logic where thinking through cases upfront prevents bugs, and when refactoring legacy code where tests serve as a safety net. TDD is less valuable for exploratory prototyping, UI layout work, or integration code where the test setup cost exceeds the design benefit. The key insight is that TDD is a design tool, not just a testing tool — it forces you to think about interfaces and dependencies before implementation.

## Production Tips

### Parallelize Test Execution

Modern test runners (Vitest, Jest with `--shard`, JUnit with `fork-mode=per-class`) can execute tests in parallel across CPU cores. For a suite of 5000 unit tests, parallel execution can reduce wall-clock time from 60 seconds to 10 seconds. The prerequisite is test isolation — no shared mutable state, no port conflicts, no file system collisions. Structure tests to be parallelizable from day one; retrofitting isolation is expensive.

### Use Test Fixtures and Builders

Production test suites accumulate complex object construction. Instead of repeating 20-field object literals in every test, use builder patterns or fixture factories that provide sensible defaults and allow per-test overrides. This reduces test maintenance cost when the domain model changes — update the builder once instead of 200 test files.

```typescript
// Builder pattern for test data
const defaultOrder = OrderBuilder.create()
  .withStatus('pending')
  .withItems([{ productId: 'p1', quantity: 1, price: 29.99 }])
  .build();

// Override only what matters for this test
const cancelledOrder = OrderBuilder.create()
  .withStatus('cancelled')
  .withCancellationReason('customer_request')
  .build();
```

### Mutation Testing for Quality Assessment

Line coverage tells you what code was executed, not what code was verified. Mutation testing (Stryker for JS/TS, PIT for Java) injects small changes (mutants) into your code and checks whether tests detect them. A surviving mutant means your tests don't catch that specific bug. Use mutation testing on critical business logic to identify weak spots in your test suite — aim for 85%+ mutation score on core domain code.

## Related Topics

- [Mocking Strategies](./mocking-strategies.md) — Deep dive into test doubles, dependency injection, and when mocking helps versus hurts
- [Property-Based Testing](../test-strategy/property-based-testing.md) — Complement example-based unit tests with generated inputs that explore edge cases automatically
- [Test Architecture](../test-strategy/test-architecture.md) — How unit tests fit into the broader test pyramid and CI pipeline
- [Integration Testing](../integration-testing/integration-testing.md) — When unit tests aren't enough and you need to verify component interactions
