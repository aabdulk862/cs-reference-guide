# Mocking Strategies

## Quick Reference

- **Mock**: A test double that records interactions and can verify expectations (was this method called with these arguments?)
- **Stub**: A test double that returns predetermined responses without verifying interactions
- **Spy**: Wraps the real implementation, allowing real behavior while recording calls for verification
- **Fake**: A working implementation with shortcuts (in-memory database, local file system instead of S3)
- **Dummy**: A placeholder object passed to satisfy a parameter requirement but never actually used
- **Dependency Injection**: Design pattern that makes code testable by accepting dependencies as parameters rather than creating them internally
- **Over-mocking**: Anti-pattern where excessive mocking makes tests tautological — they verify the mock setup, not real behavior
- **Mock boundary**: Mock at architectural boundaries (ports/adapters), not between internal collaborators

## When to Use

Mocking is a tool for controlling test boundaries — it lets you isolate the unit under test from its dependencies. Use mocking when the real dependency is slow (network calls, database queries, file I/O), non-deterministic (current time, random numbers, external API responses), expensive (paid APIs, rate-limited services), unavailable in test environments (production-only services, hardware devices), or has side effects you don't want in tests (sending emails, charging credit cards, deleting data).

The critical decision is where to draw the mock boundary. Mock at the architectural boundary between your code and the external world — the interface between your domain logic and infrastructure. Don't mock between internal collaborators within the same bounded context. If class A calls class B and both are part of your domain logic, test them together. If class A calls an external payment gateway through an interface, mock that interface.

The rule of thumb: if you own both sides of the interaction and they change together, don't mock between them. If one side is external, unstable, or owned by another team, mock it.

Avoid mocking when the real dependency is fast and deterministic (pure functions, in-memory data structures), when the mock would be more complex than the real implementation, when you're testing the integration itself (use integration tests instead), and when mocking would hide bugs at the boundary (serialization errors, network timeouts, connection pool exhaustion).

## Code Examples

### Test Doubles Taxonomy in Practice

Understanding when to use each type of test double is fundamental to writing effective tests. Each type serves a different purpose and provides different guarantees.

```typescript
import { describe, it, expect, vi } from 'vitest';

// --- INTERFACES (the boundaries we mock at) ---
interface EmailService {
  send(to: string, subject: string, body: string): Promise<boolean>;
  getDeliveryStatus(messageId: string): Promise<'delivered' | 'bounced' | 'pending'>;
}

interface UserRepository {
  findById(id: string): Promise<User | null>;
  save(user: User): Promise<User>;
  findByEmail(email: string): Promise<User | null>;
}

interface Clock {
  now(): Date;
}

// --- STUB: Returns canned responses, no verification ---
class StubEmailService implements EmailService {
  async send(): Promise<boolean> {
    return true; // Always succeeds
  }
  async getDeliveryStatus(): Promise<'delivered' | 'bounced' | 'pending'> {
    return 'delivered'; // Always delivered
  }
}

// --- FAKE: Working implementation with shortcuts ---
class FakeUserRepository implements UserRepository {
  private users: Map<string, User> = new Map();
  private nextId = 1;

  async findById(id: string): Promise<User | null> {
    return this.users.get(id) || null;
  }

  async save(user: User): Promise<User> {
    const saved = { ...user, id: user.id || `user-${this.nextId++}` };
    this.users.set(saved.id, saved);
    return saved;
  }

  async findByEmail(email: string): Promise<User | null> {
    for (const user of this.users.values()) {
      if (user.email === email) return user;
    }
    return null;
  }

  // Test helper: seed data
  seed(users: User[]): void {
    for (const user of users) {
      this.users.set(user.id, user);
    }
  }

  // Test helper: inspect state
  getAll(): User[] {
    return Array.from(this.users.values());
  }
}

// --- MOCK: Records interactions for verification ---
describe('PasswordResetService', () => {
  it('should send reset email and record the attempt', async () => {
    // Mock: we care that send() was called with specific arguments
    const mockEmail: EmailService = {
      send: vi.fn().mockResolvedValue(true),
      getDeliveryStatus: vi.fn().mockResolvedValue('delivered'),
    };
    const fakeRepo = new FakeUserRepository();
    fakeRepo.seed([{ id: 'user-1', email: 'john@example.com', name: 'John' }]);

    const service = new PasswordResetService(fakeRepo, mockEmail);
    await service.requestReset('john@example.com');

    // Verify the interaction (mock behavior)
    expect(mockEmail.send).toHaveBeenCalledWith(
      'john@example.com',
      'Password Reset Request',
      expect.stringContaining('reset your password')
    );
    expect(mockEmail.send).toHaveBeenCalledTimes(1);
  });

  it('should not send email for non-existent user (security)', async () => {
    const mockEmail: EmailService = {
      send: vi.fn().mockResolvedValue(true),
      getDeliveryStatus: vi.fn(),
    };
    const fakeRepo = new FakeUserRepository(); // Empty — no users

    const service = new PasswordResetService(fakeRepo, mockEmail);
    // Should not throw (don't reveal user existence)
    await service.requestReset('nobody@example.com');

    // Verify NO email was sent
    expect(mockEmail.send).not.toHaveBeenCalled();
  });
});

// --- SPY: Real implementation + recording ---
describe('AuditLogger with Spy', () => {
  it('should log to real logger while recording calls', () => {
    const realLogger = new ConsoleAuditLogger();
    const spy = vi.spyOn(realLogger, 'log');

    const service = new UserService(realLogger);
    service.deleteUser('user-123');

    // Real logging happened AND we can verify it
    expect(spy).toHaveBeenCalledWith('USER_DELETED', { userId: 'user-123' });
    spy.mockRestore();
  });
});

// --- CLOCK STUB: Controlling time ---
describe('TokenExpiration with Clock stub', () => {
  it('should expire tokens after 24 hours', () => {
    const fixedClock: Clock = {
      now: () => new Date('2024-06-15T10:00:00Z'),
    };

    const tokenService = new TokenService(fixedClock);
    const token = tokenService.createToken('user-1');

    // Advance clock by 25 hours
    fixedClock.now = () => new Date('2024-06-16T11:00:00Z');

    expect(tokenService.isValid(token)).toBe(false);
  });

  it('should accept tokens within 24 hours', () => {
    const fixedClock: Clock = {
      now: () => new Date('2024-06-15T10:00:00Z'),
    };

    const tokenService = new TokenService(fixedClock);
    const token = tokenService.createToken('user-1');

    // Advance clock by 23 hours
    fixedClock.now = () => new Date('2024-06-16T09:00:00Z');

    expect(tokenService.isValid(token)).toBe(true);
  });
});
```

### Dependency Injection for Testability

Dependency injection is the architectural pattern that makes mocking possible. Without DI, code creates its own dependencies internally, making them impossible to replace in tests.

```java
// BAD: Hard-coded dependency — untestable without real SMTP server
public class NotificationService {
    public void notifyUser(String userId, String message) {
        // Creates its own dependency — can't mock this
        SmtpClient client = new SmtpClient("smtp.company.com", 587);
        User user = new UserDao().findById(userId); // Another hard-coded dep
        client.send(user.getEmail(), "Notification", message);
    }
}

// GOOD: Dependencies injected — fully testable
public class NotificationService {
    private final EmailSender emailSender;
    private final UserRepository userRepository;
    private final NotificationTemplateEngine templateEngine;

    // Constructor injection: dependencies are explicit and replaceable
    public NotificationService(
            EmailSender emailSender,
            UserRepository userRepository,
            NotificationTemplateEngine templateEngine) {
        this.emailSender = emailSender;
        this.userRepository = userRepository;
        this.templateEngine = templateEngine;
    }

    public NotificationResult notifyUser(String userId, String message) {
        User user = userRepository.findById(userId)
            .orElseThrow(() -> new UserNotFoundException(userId));

        String rendered = templateEngine.render("notification", Map.of(
            "userName", user.getName(),
            "message", message
        ));

        boolean sent = emailSender.send(
            user.getEmail(),
            "Notification",
            rendered
        );

        return new NotificationResult(sent, user.getEmail());
    }
}

// Test with injected mocks
@ExtendWith(MockitoExtension.class)
class NotificationServiceTest {

    @Mock private EmailSender emailSender;
    @Mock private UserRepository userRepository;
    @Mock private NotificationTemplateEngine templateEngine;
    @InjectMocks private NotificationService service;

    @Test
    @DisplayName("should send rendered notification to user email")
    void sendNotification() {
        // Arrange
        User user = new User("user-1", "Alice", "alice@example.com");
        when(userRepository.findById("user-1")).thenReturn(Optional.of(user));
        when(templateEngine.render(eq("notification"), anyMap()))
            .thenReturn("<p>Hello Alice, you have a message</p>");
        when(emailSender.send(anyString(), anyString(), anyString())).thenReturn(true);

        // Act
        NotificationResult result = service.notifyUser("user-1", "Your order shipped");

        // Assert
        assertThat(result.isSent()).isTrue();
        assertThat(result.getRecipient()).isEqualTo("alice@example.com");

        verify(emailSender).send(
            eq("alice@example.com"),
            eq("Notification"),
            contains("Hello Alice")
        );
    }

    @Test
    @DisplayName("should throw when user not found")
    void userNotFound() {
        when(userRepository.findById("ghost")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.notifyUser("ghost", "message"))
            .isInstanceOf(UserNotFoundException.class)
            .hasMessageContaining("ghost");

        // Verify no email was sent
        verifyNoInteractions(emailSender);
    }

    @Test
    @DisplayName("should return failure result when email sending fails")
    void emailSendingFails() {
        User user = new User("user-1", "Alice", "alice@example.com");
        when(userRepository.findById("user-1")).thenReturn(Optional.of(user));
        when(templateEngine.render(anyString(), anyMap())).thenReturn("content");
        when(emailSender.send(anyString(), anyString(), anyString())).thenReturn(false);

        NotificationResult result = service.notifyUser("user-1", "message");

        assertThat(result.isSent()).isFalse();
    }
}
```

### Over-Mocking Anti-Pattern and Solution

When tests mock everything, they test the mock configuration rather than real behavior. The test passes regardless of whether the production code is correct.

```typescript
// ❌ OVER-MOCKED: This test verifies nothing useful
describe('OrderProcessor - over-mocked', () => {
  it('should process order', async () => {
    const mockValidator = { validate: vi.fn().mockReturnValue({ valid: true }) };
    const mockPricer = { calculate: vi.fn().mockReturnValue(99.99) };
    const mockRepo = { save: vi.fn().mockResolvedValue({ id: 'order-1' }) };
    const mockNotifier = { notify: vi.fn().mockResolvedValue(undefined) };

    const processor = new OrderProcessor(mockValidator, mockPricer, mockRepo, mockNotifier);
    const result = await processor.process({ items: [{ id: 'p1', qty: 1 }] });

    // These assertions just verify the mocks were called — not that the logic is correct
    expect(mockValidator.validate).toHaveBeenCalled();
    expect(mockPricer.calculate).toHaveBeenCalled();
    expect(mockRepo.save).toHaveBeenCalled();
    expect(result.id).toBe('order-1'); // Just echoing the mock return value
  });
});

// ✅ BETTER: Mock only external boundaries, test real logic
describe('OrderProcessor - properly bounded', () => {
  it('should calculate correct total with tax and apply business rules', async () => {
    // Real validator and pricer (they're pure logic, no external deps)
    const validator = new OrderValidator();
    const pricer = new OrderPricer(taxRatesByState);

    // Mock only the external boundaries
    const fakeRepo = new InMemoryOrderRepository();
    const mockNotifier = { notify: vi.fn().mockResolvedValue(undefined) };

    const processor = new OrderProcessor(validator, pricer, fakeRepo, mockNotifier);

    const result = await processor.process({
      items: [
        { id: 'p1', qty: 2, unitPrice: 25.00 },
        { id: 'p2', qty: 1, unitPrice: 49.99 },
      ],
      state: 'OR', // Oregon: no sales tax
      customerId: 'cust-1',
    });

    // Now we're testing REAL behavior
    expect(result.subtotal).toBe(99.99);
    expect(result.tax).toBe(0); // Oregon has no sales tax
    expect(result.total).toBe(99.99);
    expect(result.status).toBe('confirmed');

    // Verify the order was persisted with correct data
    const saved = await fakeRepo.findById(result.id);
    expect(saved).not.toBeNull();
    expect(saved!.total).toBe(99.99);
  });

  it('should reject order when validation fails', async () => {
    const validator = new OrderValidator(); // Real validation logic
    const pricer = new OrderPricer(taxRatesByState);
    const fakeRepo = new InMemoryOrderRepository();
    const mockNotifier = { notify: vi.fn() };

    const processor = new OrderProcessor(validator, pricer, fakeRepo, mockNotifier);

    // Empty items should fail validation
    await expect(
      processor.process({ items: [], state: 'CA', customerId: 'cust-1' })
    ).rejects.toThrow('Order must contain at least one item');

    // Nothing should be saved
    expect(fakeRepo.getAll()).toHaveLength(0);
    expect(mockNotifier.notify).not.toHaveBeenCalled();
  });
});
```

### Module-Level Mocking for Legacy Code

When working with legacy code that uses module-level imports instead of dependency injection, framework-level mocking provides a way to intercept dependencies.

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the module before importing the code under test
vi.mock('./external-api-client', () => ({
  ExternalApiClient: {
    fetchUserProfile: vi.fn(),
    updateUserPreferences: vi.fn(),
  },
}));

vi.mock('./cache-service', () => ({
  cacheService: {
    get: vi.fn(),
    set: vi.fn(),
    invalidate: vi.fn(),
  },
}));

import { ExternalApiClient } from './external-api-client';
import { cacheService } from './cache-service';
import { UserProfileService } from './user-profile-service';

describe('UserProfileService (legacy module mocking)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return cached profile when available', async () => {
    const cachedProfile = { id: 'user-1', name: 'Alice', tier: 'premium' };
    vi.mocked(cacheService.get).mockResolvedValue(cachedProfile);

    const service = new UserProfileService();
    const profile = await service.getProfile('user-1');

    expect(profile).toEqual(cachedProfile);
    expect(ExternalApiClient.fetchUserProfile).not.toHaveBeenCalled();
  });

  it('should fetch from API and cache when not in cache', async () => {
    const apiProfile = { id: 'user-1', name: 'Alice', tier: 'premium' };
    vi.mocked(cacheService.get).mockResolvedValue(null);
    vi.mocked(ExternalApiClient.fetchUserProfile).mockResolvedValue(apiProfile);

    const service = new UserProfileService();
    const profile = await service.getProfile('user-1');

    expect(profile).toEqual(apiProfile);
    expect(ExternalApiClient.fetchUserProfile).toHaveBeenCalledWith('user-1');
    expect(cacheService.set).toHaveBeenCalledWith(
      'profile:user-1',
      apiProfile,
      expect.objectContaining({ ttl: 3600 })
    );
  });

  it('should invalidate cache on profile update', async () => {
    vi.mocked(ExternalApiClient.updateUserPreferences).mockResolvedValue({ success: true });

    const service = new UserProfileService();
    await service.updatePreferences('user-1', { theme: 'dark' });

    expect(cacheService.invalidate).toHaveBeenCalledWith('profile:user-1');
  });
});
```

## Common Pitfalls

### 1. Mocking What You Don't Own

Mocking third-party libraries directly (mocking `axios.get`, `fs.readFile`, or `pg.query`) couples your tests to the library's API. When the library updates, your mocks break even though your code still works. Instead, wrap third-party libraries in your own adapter interface and mock that interface. Your adapter is stable; the library behind it can change without affecting tests.

### 2. Mock Setup That's More Complex Than Production Code

If your test's mock setup is 50 lines and the production code is 10 lines, the test is testing the wrong thing. Complex mock setups indicate either over-mocking (mock fewer things) or a design problem (the unit has too many dependencies). Refactor the production code to have fewer, more focused dependencies.

### 3. Verifying Interaction Order When Order Doesn't Matter

Tests that assert `mockA` was called before `mockB` are brittle when the order is an implementation detail, not a requirement. Only verify call order when it's semantically meaningful (e.g., "validate before save" or "reserve inventory before charging payment"). For independent operations, verify they were both called without asserting order.

### 4. Not Resetting Mocks Between Tests

Mocks that accumulate state across tests cause order-dependent failures. A mock that records "called 3 times" in Test A will show "called 4 times" in Test B if not reset. Always use `beforeEach(() => vi.clearAllMocks())` or equivalent. This is the mock equivalent of shared mutable state.

### 5. Mocking Concrete Classes Instead of Interfaces

Mocking a concrete class requires the mock to replicate all methods, including ones irrelevant to the test. Mocking an interface requires only the methods the test cares about. Design with interfaces at boundaries: `PaymentGateway` interface rather than `StripeClient` class. This makes tests focused and production code swappable.

### 6. Using Mocks to Test Private Behavior

If you need to mock an internal collaborator to test a private method's behavior, you're testing at the wrong level. Either test through the public interface (which exercises the private method indirectly) or extract the private logic into its own unit with a public interface. Mocking internals creates tests that break on every refactor.

## Real-World Use Cases

### Payment Processing with Multiple Gateways

A payment service supports Stripe, PayPal, and bank transfers. Each gateway has a different API, different error codes, and different retry semantics. The service uses a `PaymentGateway` interface with implementations for each provider. Tests mock the gateway interface to verify business logic (retry on transient failure, fail fast on invalid card, idempotency key handling) without hitting real payment APIs. A separate integration test suite runs against Stripe's test mode to verify the adapter implementation.

### Event-Driven Architecture Testing

A microservice publishes domain events to Kafka. Unit tests use a fake event publisher (in-memory list) to verify that the correct events are published with correct payloads after each operation. The fake captures published events for assertion without requiring a running Kafka cluster. Integration tests verify the real Kafka publisher serializes events correctly and handles broker unavailability.

### External API Rate Limiting

A service integrates with a rate-limited third-party API (100 requests/minute). Tests use a mock that simulates rate limit responses (HTTP 429 with Retry-After header) to verify the client's backoff logic, request queuing, and circuit breaker behavior. Testing this with the real API would be slow, expensive, and non-deterministic. The mock provides precise control over failure scenarios.

### Feature Flag Service

A feature flag system controls which users see new features. Tests use a stub flag service that returns predetermined flag values, enabling tests to verify behavior under different flag combinations without connecting to LaunchDarkly or Split. This lets tests cover all flag permutations (feature on/off, percentage rollout, user targeting) deterministically.

## Interview Questions

**Q: When should you use a mock versus a stub versus a fake?**

A: Use a **stub** when you need to control what a dependency returns but don't care how it's called — you're testing the unit's logic given specific inputs from its dependencies. Use a **mock** when the interaction itself is the behavior you're testing — "did we send the email?", "did we publish the event?", "did we call the payment gateway with the correct amount?" Use a **fake** when you need a working implementation that's simpler than production — an in-memory database, a local file system instead of S3, a synchronous event bus instead of Kafka. Fakes provide the most realistic behavior but require maintenance as the interface evolves. The decision heuristic: if you're testing what your code does with a response, use a stub. If you're testing that your code sends the right request, use a mock. If you need realistic multi-step interactions, use a fake.

**Q: What is the "don't mock what you don't own" principle?**

A: This principle says you should not mock third-party APIs directly (axios, pg, AWS SDK). Instead, create your own adapter interface that wraps the third-party library, and mock your adapter. The reasons: third-party APIs change between versions, breaking your mocks even when your code is fine. Your mocks might not accurately represent the library's actual behavior (edge cases, error formats). And mocking at your adapter boundary forces you to define a clean interface that encapsulates the third-party complexity. In practice: don't mock `axios.get('/users')`. Instead, create `UserApiClient.getUsers()` that uses axios internally, and mock `UserApiClient`. Your adapter is stable; the library behind it can change without affecting tests.

**Q: How do you avoid over-mocking in unit tests?**

A: Three strategies. First, **mock only at architectural boundaries** — between your domain logic and external infrastructure (databases, APIs, message queues, file systems). Don't mock between internal collaborators that change together. Second, **use fakes instead of mocks for complex interactions** — an in-memory repository is more realistic than a mock that returns canned responses. Third, **if a test requires more than 3 mocks, reconsider the design** — the unit under test might have too many responsibilities. Extract collaborators, push logic into pure functions that need no mocking, or test at a higher level where fewer boundaries need mocking. The goal is tests that verify real behavior, not tests that verify you configured mocks correctly.

**Q: How does dependency injection improve testability?**

A: Dependency injection makes dependencies explicit and replaceable. Without DI, a class creates its own dependencies internally (`new SmtpClient(...)`, `DriverManager.getConnection(...)`), making them impossible to replace in tests. With DI, dependencies are passed in through constructors or method parameters, allowing tests to substitute test doubles. DI also improves design by making coupling visible — if a constructor takes 8 parameters, the class clearly has too many responsibilities. In production, a DI container (Spring, Guice, tsyringe) wires real implementations. In tests, you wire test doubles manually or with `@Mock` annotations. The key insight: DI isn't about frameworks — it's about designing code where dependencies flow inward through explicit interfaces rather than being reached for through global state or direct construction.

## Production Tips

### Create Shared Test Double Libraries

For interfaces used across many test files (UserRepository, EventPublisher, Clock), create reusable test doubles in a shared test utilities package. This prevents each test file from reimplementing the same fakes and ensures consistent behavior across the test suite. When the interface changes, update the shared fake once instead of 50 test files.

```typescript
// src/test-utils/fakes.ts — Shared across all test files
export class FakeUserRepository implements UserRepository {
  private store = new Map<string, User>();

  async findById(id: string): Promise<User | null> {
    return this.store.get(id) ?? null;
  }

  async save(user: User): Promise<User> {
    this.store.set(user.id, user);
    return user;
  }

  // Test helpers
  seed(users: User[]): void {
    users.forEach((u) => this.store.set(u.id, u));
  }

  reset(): void {
    this.store.clear();
  }

  getAll(): User[] {
    return Array.from(this.store.values());
  }
}

export class FakeEventBus implements EventBus {
  private published: DomainEvent[] = [];

  async publish(event: DomainEvent): Promise<void> {
    this.published.push(event);
  }

  // Test helpers
  getPublished(): DomainEvent[] {
    return [...this.published];
  }

  getPublishedOfType<T extends DomainEvent>(type: string): T[] {
    return this.published.filter((e) => e.type === type) as T[];
  }

  reset(): void {
    this.published = [];
  }
}

export class FakeClock implements Clock {
  private current: Date;

  constructor(initial: Date = new Date('2024-01-01T00:00:00Z')) {
    this.current = initial;
  }

  now(): Date {
    return new Date(this.current);
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }

  advanceMinutes(minutes: number): void {
    this.advance(minutes * 60 * 1000);
  }

  advanceHours(hours: number): void {
    this.advance(hours * 60 * 60 * 1000);
  }
}
```

### Use Contract Tests to Validate Test Doubles

A dangerous failure mode is when your test double diverges from the real implementation. The mock returns `{ data: [...] }` but the real API returns `{ results: [...] }`. Contract tests verify that your fakes and stubs behave identically to the real implementation for a defined set of scenarios. Run these contract tests against both the fake and the real implementation — if they both pass, your fake is trustworthy.

### Prefer Narrow Interfaces for Mockability

Instead of depending on a broad interface with 20 methods (only 2 of which you use), depend on a narrow interface with just the methods you need. This follows the Interface Segregation Principle and makes mocking trivial — you only need to implement 2 methods in your test double instead of 20. It also makes dependencies explicit: the narrow interface documents exactly what capabilities the unit actually needs.

## Related Topics

- [Unit Testing](./unit-testing.md) — Mocking is primarily used within unit tests to achieve isolation
- [Integration Testing](../integration-testing/integration-testing.md) — When to stop mocking and test with real dependencies
- [Test Architecture](../test-strategy/test-architecture.md) — How mock boundaries align with architectural boundaries in the test pyramid
- [Property-Based Testing](../test-strategy/property-based-testing.md) — Generating diverse inputs for mocked dependency responses
