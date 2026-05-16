# SOLID Principles

## Quick Reference

- **SRP (Single Responsibility Principle)**: A class should have only one reason to change — one actor, one responsibility
- **OCP (Open/Closed Principle)**: Software entities should be open for extension but closed for modification
- **LSP (Liskov Substitution Principle)**: Subtypes must be substitutable for their base types without altering program correctness
- **ISP (Interface Segregation Principle)**: Clients should not be forced to depend on interfaces they do not use
- **DIP (Dependency Inversion Principle)**: High-level modules should not depend on low-level modules; both should depend on abstractions
- SOLID principles were introduced by Robert C. Martin (Uncle Bob) and are foundational to object-oriented design
- These principles reduce coupling, increase cohesion, and make systems easier to test, extend, and maintain
- Violations of SOLID often manifest as shotgun surgery, rigid hierarchies, and test fragility

## When to Use

SOLID principles apply whenever you are designing object-oriented systems that need to evolve over time. They are particularly critical in large codebases with multiple contributors where changes in one area should not cascade unpredictably through the system.

Apply SOLID when building domain models that will grow in complexity, when designing service layers that multiple clients consume, when creating plugin architectures or extension points, when writing code that must be unit-testable in isolation, and when working on systems where requirements change frequently. These principles are most valuable in enterprise applications, microservice boundaries, and library/framework design.

SOLID is less critical for throwaway scripts, prototypes with known short lifespans, or performance-critical inner loops where abstraction overhead matters. However, even in these cases, awareness of the principles helps you make conscious trade-offs rather than accumulating accidental complexity.

In microservice architectures, SOLID principles apply at both the class level and the service level. A microservice that handles user authentication, email sending, and report generation violates SRP at the architectural level just as a god class violates it at the code level.

## Code Examples

### Single Responsibility Principle

The SRP states that a class should have only one reason to change. This means each class should encapsulate a single concern or responsibility. When a class handles multiple concerns, changes to one concern risk breaking the other.

**Violation — a class handling both business logic and persistence:**

```java
// BAD: This class has two reasons to change:
// 1. Business rules for order validation change
// 2. Database schema or persistence mechanism changes
public class OrderService {
    private final DataSource dataSource;

    public OrderService(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    public Order createOrder(OrderRequest request) {
        // Business logic
        if (request.getItems().isEmpty()) {
            throw new IllegalArgumentException("Order must have at least one item");
        }
        BigDecimal total = request.getItems().stream()
            .map(item -> item.getPrice().multiply(BigDecimal.valueOf(item.getQuantity())))
            .reduce(BigDecimal.ZERO, BigDecimal::add);

        if (total.compareTo(BigDecimal.valueOf(10000)) > 0) {
            throw new OrderLimitExceededException("Order exceeds maximum limit");
        }

        Order order = new Order(UUID.randomUUID(), request.getItems(), total, OrderStatus.PENDING);

        // Persistence logic mixed in
        try (Connection conn = dataSource.getConnection()) {
            PreparedStatement stmt = conn.prepareStatement(
                "INSERT INTO orders (id, total, status) VALUES (?, ?, ?)"
            );
            stmt.setString(1, order.getId().toString());
            stmt.setBigDecimal(2, order.getTotal());
            stmt.setString(3, order.getStatus().name());
            stmt.executeUpdate();
        } catch (SQLException e) {
            throw new RuntimeException("Failed to persist order", e);
        }

        return order;
    }
}
```

**Corrected — responsibilities separated:**

```java
// GOOD: Business logic isolated in domain service
public class OrderService {
    private final OrderRepository orderRepository;
    private final OrderValidator validator;

    public OrderService(OrderRepository orderRepository, OrderValidator validator) {
        this.orderRepository = orderRepository;
        this.validator = validator;
    }

    public Order createOrder(OrderRequest request) {
        validator.validate(request);
        BigDecimal total = calculateTotal(request.getItems());
        Order order = new Order(UUID.randomUUID(), request.getItems(), total, OrderStatus.PENDING);
        orderRepository.save(order);
        return order;
    }

    private BigDecimal calculateTotal(List<OrderItem> items) {
        return items.stream()
            .map(item -> item.getPrice().multiply(BigDecimal.valueOf(item.getQuantity())))
            .reduce(BigDecimal.ZERO, BigDecimal::add);
    }
}

// Persistence concern isolated
public class JdbcOrderRepository implements OrderRepository {
    private final DataSource dataSource;

    public JdbcOrderRepository(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    public void save(Order order) {
        try (Connection conn = dataSource.getConnection()) {
            PreparedStatement stmt = conn.prepareStatement(
                "INSERT INTO orders (id, total, status) VALUES (?, ?, ?)"
            );
            stmt.setString(1, order.getId().toString());
            stmt.setBigDecimal(2, order.getTotal());
            stmt.setString(3, order.getStatus().name());
            stmt.executeUpdate();
        } catch (SQLException e) {
            throw new PersistenceException("Failed to persist order", e);
        }
    }
}
```

### Open/Closed Principle

The OCP states that you should be able to extend behavior without modifying existing code. This is typically achieved through polymorphism, strategy patterns, or plugin architectures.

**Violation — adding new payment types requires modifying existing code:**

```typescript
// BAD: Every new payment method requires modifying this function
function processPayment(payment: Payment): PaymentResult {
  switch (payment.type) {
    case 'credit_card':
      return chargeCreditCard(payment.cardNumber, payment.amount);
    case 'paypal':
      return chargePayPal(payment.email, payment.amount);
    case 'bank_transfer':
      return initiateBankTransfer(payment.accountNumber, payment.amount);
    // Adding 'crypto' requires modifying this function
    default:
      throw new Error(`Unsupported payment type: ${payment.type}`);
  }
}
```

**Corrected — new payment types extend without modification:**

```typescript
// GOOD: Open for extension via new implementations, closed for modification
interface PaymentProcessor {
  supports(payment: Payment): boolean;
  process(payment: Payment): PaymentResult;
}

class CreditCardProcessor implements PaymentProcessor {
  supports(payment: Payment): boolean {
    return payment.type === 'credit_card';
  }

  process(payment: Payment): PaymentResult {
    return this.chargeCreditCard(payment.cardNumber!, payment.amount);
  }

  private chargeCreditCard(cardNumber: string, amount: number): PaymentResult {
    // Credit card specific logic
    return { success: true, transactionId: generateId() };
  }
}

class PayPalProcessor implements PaymentProcessor {
  supports(payment: Payment): boolean {
    return payment.type === 'paypal';
  }

  process(payment: Payment): PaymentResult {
    return this.chargePayPal(payment.email!, payment.amount);
  }

  private chargePayPal(email: string, amount: number): PaymentResult {
    // PayPal specific logic
    return { success: true, transactionId: generateId() };
  }
}

// Adding crypto requires ZERO changes to existing code
class CryptoProcessor implements PaymentProcessor {
  supports(payment: Payment): boolean {
    return payment.type === 'crypto';
  }

  process(payment: Payment): PaymentResult {
    return this.processBlockchainPayment(payment.walletAddress!, payment.amount);
  }

  private processBlockchainPayment(wallet: string, amount: number): PaymentResult {
    return { success: true, transactionId: generateId() };
  }
}

// Registry is closed for modification but open for extension via registration
class PaymentService {
  private processors: PaymentProcessor[] = [];

  register(processor: PaymentProcessor): void {
    this.processors.push(processor);
  }

  processPayment(payment: Payment): PaymentResult {
    const processor = this.processors.find(p => p.supports(payment));
    if (!processor) {
      throw new Error(`No processor registered for payment type: ${payment.type}`);
    }
    return processor.process(payment);
  }
}
```

### Liskov Substitution Principle

LSP requires that objects of a superclass should be replaceable with objects of a subclass without breaking the application. This goes beyond simple type compatibility — it requires behavioral compatibility including preconditions, postconditions, and invariants.

```java
// BAD: Square violates LSP when substituted for Rectangle
// because setWidth/setHeight have unexpected coupled behavior
public class Rectangle {
    protected int width;
    protected int height;

    public void setWidth(int width) { this.width = width; }
    public void setHeight(int height) { this.height = height; }
    public int getArea() { return width * height; }
}

public class Square extends Rectangle {
    @Override
    public void setWidth(int width) {
        this.width = width;
        this.height = width;  // Violates expected behavior of setWidth
    }

    @Override
    public void setHeight(int height) {
        this.width = height;  // Violates expected behavior of setHeight
        this.height = height;
    }
}

// Client code breaks with Square:
void resize(Rectangle rect) {
    rect.setWidth(5);
    rect.setHeight(10);
    assert rect.getArea() == 50;  // FAILS with Square (returns 100)
}
```

```java
// GOOD: Use composition and separate interfaces
public interface Shape {
    int getArea();
}

public class Rectangle implements Shape {
    private final int width;
    private final int height;

    public Rectangle(int width, int height) {
        this.width = width;
        this.height = height;
    }

    @Override
    public int getArea() { return width * height; }
}

public class Square implements Shape {
    private final int side;

    public Square(int side) {
        this.side = side;
    }

    @Override
    public int getArea() { return side * side; }
}
```

### Interface Segregation Principle

ISP states that no client should be forced to depend on methods it does not use. Fat interfaces create unnecessary coupling and make implementations harder to maintain.

```typescript
// BAD: Fat interface forces implementations to handle irrelevant methods
interface Worker {
  work(): void;
  eat(): void;
  sleep(): void;
  attendMeeting(): void;
  writeReport(): void;
}

// A robot worker is forced to implement eat() and sleep()
class RobotWorker implements Worker {
  work(): void { /* productive work */ }
  eat(): void { throw new Error('Robots do not eat'); }  // Forced stub
  sleep(): void { throw new Error('Robots do not sleep'); }  // Forced stub
  attendMeeting(): void { /* join video call */ }
  writeReport(): void { /* generate report */ }
}
```

```typescript
// GOOD: Segregated interfaces — clients depend only on what they need
interface Workable {
  work(): void;
}

interface Feedable {
  eat(): void;
}

interface Restable {
  sleep(): void;
}

interface Communicable {
  attendMeeting(): void;
  writeReport(): void;
}

class HumanWorker implements Workable, Feedable, Restable, Communicable {
  work(): void { /* productive work */ }
  eat(): void { /* lunch break */ }
  sleep(): void { /* rest period */ }
  attendMeeting(): void { /* join standup */ }
  writeReport(): void { /* write status update */ }
}

class RobotWorker implements Workable, Communicable {
  work(): void { /* productive work */ }
  attendMeeting(): void { /* join monitoring dashboard */ }
  writeReport(): void { /* generate automated report */ }
}

// Functions depend only on the interface they need
function assignTask(worker: Workable): void {
  worker.work();
}

function scheduleLunch(worker: Feedable): void {
  worker.eat();
}
```

### Dependency Inversion Principle

DIP states that high-level policy should not depend on low-level detail. Both should depend on abstractions. This enables swapping implementations, testing in isolation, and evolving systems without cascading changes.

```java
// BAD: High-level NotificationService depends directly on low-level EmailSender
public class NotificationService {
    private final SmtpEmailSender emailSender;  // Concrete dependency

    public NotificationService() {
        this.emailSender = new SmtpEmailSender("smtp.company.com", 587);  // Hardcoded
    }

    public void notifyUser(User user, String message) {
        emailSender.send(user.getEmail(), "Notification", message);
    }
}
```

```java
// GOOD: Both high-level and low-level depend on abstraction
public interface NotificationChannel {
    void send(User user, String message);
    boolean supports(NotificationType type);
}

public class EmailNotificationChannel implements NotificationChannel {
    private final EmailClient emailClient;

    public EmailNotificationChannel(EmailClient emailClient) {
        this.emailClient = emailClient;
    }

    @Override
    public void send(User user, String message) {
        emailClient.send(user.getEmail(), "Notification", message);
    }

    @Override
    public boolean supports(NotificationType type) {
        return type == NotificationType.EMAIL;
    }
}

public class SlackNotificationChannel implements NotificationChannel {
    private final SlackClient slackClient;

    public SlackNotificationChannel(SlackClient slackClient) {
        this.slackClient = slackClient;
    }

    @Override
    public void send(User user, String message) {
        slackClient.postMessage(user.getSlackId(), message);
    }

    @Override
    public boolean supports(NotificationType type) {
        return type == NotificationType.SLACK;
    }
}

// High-level service depends on abstraction, not concrete implementations
public class NotificationService {
    private final List<NotificationChannel> channels;

    public NotificationService(List<NotificationChannel> channels) {
        this.channels = channels;
    }

    public void notifyUser(User user, String message, NotificationType preferredType) {
        NotificationChannel channel = channels.stream()
            .filter(c -> c.supports(preferredType))
            .findFirst()
            .orElseThrow(() -> new UnsupportedNotificationException(preferredType));
        channel.send(user, message);
    }
}
```

## Common Pitfalls

- **Over-engineering with premature abstraction**: Applying SOLID dogmatically to simple CRUD operations creates unnecessary indirection. A straightforward service with 3 methods does not need 5 interfaces and a factory. Apply SOLID when complexity warrants it, not as a default for every class.

- **Confusing SRP with "one method per class"**: SRP is about one reason to change (one actor), not one function. A `UserRepository` with `save()`, `findById()`, `findByEmail()`, and `delete()` has a single responsibility — user persistence. Splitting each method into its own class is a misapplication.

- **Violating LSP through exception-based contracts**: Throwing `UnsupportedOperationException` in interface implementations (like `Collections.unmodifiableList().add()`) technically violates LSP. Design interfaces that accurately represent the capabilities of all implementations.

- **Creating "header interfaces" (one interface per class)**: Extracting an interface for every class without considering whether multiple implementations will exist adds noise without value. Interfaces should represent meaningful abstractions with potential for multiple implementations or testing seams.

- **Ignoring DIP at architectural boundaries**: Teams often apply DIP within a service but violate it between services by directly coupling to specific database schemas, message formats, or API contracts. DIP applies at every boundary — class, module, and service.

- **Rigid inheritance hierarchies instead of composition**: Deep inheritance trees often violate both LSP and OCP. Prefer composition with small, focused interfaces over deep class hierarchies. The "favor composition over inheritance" principle directly supports SOLID.

## Real-World Use Cases

**Plugin architectures in IDEs and editors**: VS Code's extension system exemplifies OCP — the editor is closed for modification but open for extension through a well-defined extension API. Each extension implements specific interfaces (LanguageProvider, DebugAdapter) without modifying core editor code.

**Payment processing systems**: Stripe's payment method handling demonstrates ISP and OCP. Each payment method (cards, bank transfers, wallets) implements only the interfaces relevant to its capabilities. Adding a new payment method requires no changes to existing processors.

**Spring Framework's dependency injection**: Spring's IoC container is a direct implementation of DIP. Controllers depend on service interfaces, services depend on repository interfaces, and the container wires concrete implementations at runtime. This enables testing with mocks and swapping implementations without code changes.

**Microservice event-driven architectures**: Event-driven systems apply DIP at the service level. Services publish events to abstractions (event bus) rather than calling other services directly. This decouples services and allows independent deployment and scaling.

**Database migration strategies**: When migrating from one database to another, DIP enables running both implementations simultaneously behind a repository interface. Traffic can be gradually shifted using feature flags without modifying business logic.

## Interview Questions

**Q: Explain the Single Responsibility Principle and give an example of a violation you have fixed in production.**

A: SRP states that a class should have only one reason to change, meaning it serves one actor or stakeholder. In production, I encountered a `ReportService` that generated reports, formatted them as PDF, and emailed them to users. When the email provider changed, we had to modify the same class that contained business logic for report generation. The fix was separating into `ReportGenerator` (business rules), `PdfFormatter` (presentation), and `ReportDistributor` (delivery). Each could change independently — new report types, new formats, or new delivery channels required changes to only one class.

**Q: How does the Liskov Substitution Principle relate to design by contract?**

A: LSP formalizes behavioral subtyping through contracts. A subtype must honor the base type's preconditions (it can weaken them but not strengthen them), postconditions (it can strengthen them but not weaken them), and invariants (it must preserve them). For example, if a base class method accepts any positive integer, a subtype cannot restrict it to only even numbers (strengthening preconditions). If the base guarantees a non-null return, the subtype cannot return null (weakening postconditions). Violations manifest as runtime surprises when polymorphism is used — code that works with the base type breaks with the subtype.

**Q: When would you intentionally violate SOLID principles, and how do you justify it?**

A: SOLID principles are guidelines, not laws. I would violate them when the cost of abstraction exceeds the benefit. Examples include performance-critical inner loops where virtual dispatch overhead matters (violating DIP/OCP for direct calls), simple scripts or lambdas with a known short lifespan (SRP overhead not justified), and early-stage prototypes where requirements are highly uncertain (premature abstraction is worse than no abstraction). The key is making the violation conscious and documented, with a plan to refactor if the code survives past its expected lifespan.

**Q: How do you apply SOLID principles in a microservices architecture?**

A: SOLID scales from class-level to service-level design. SRP maps to bounded contexts — each service owns one business capability. OCP maps to event-driven communication — services extend system behavior by subscribing to events without modifying publishers. LSP maps to API versioning — new API versions must be backward-compatible with clients expecting the old contract. ISP maps to API granularity — services expose focused APIs rather than monolithic endpoints. DIP maps to messaging abstractions — services communicate through message brokers rather than direct HTTP calls, decoupling deployment and scaling decisions.

## Production Tips

- **Use dependency injection frameworks to enforce DIP systematically**: Frameworks like Spring, Guice, or tsyringe make DIP the path of least resistance. Configure them to fail fast on missing bindings during startup rather than at runtime. Use constructor injection exclusively — it makes dependencies explicit and enables immutability.

- **Measure SOLID compliance with static analysis**: Tools like SonarQube, NDepend, and ArchUnit can detect SRP violations (class complexity metrics), DIP violations (dependency direction checks), and ISP violations (unused interface methods). Integrate these into CI pipelines with quality gates that prevent regression.

- **Apply the "newspaper metaphor" for SRP**: A class should read like a newspaper article — the name tells you the topic, the public methods tell you the headlines, and the private methods provide the details. If you cannot describe a class's responsibility in one sentence without using "and" or "or," it likely violates SRP.

## Related Topics

- [Clean Architecture](./clean-architecture.md) — SOLID principles are the foundation of clean architecture's dependency rule and boundary design
- [Refactoring Patterns](./refactoring-patterns.md) — Refactoring techniques like Extract Class and Replace Conditional with Polymorphism directly address SOLID violations
- [Technical Debt](./technical-debt.md) — SOLID violations are a primary source of design debt that compounds over time
