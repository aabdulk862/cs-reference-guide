# Clean Architecture

## Quick Reference

- **Dependency Rule**: Source code dependencies must point inward — outer layers depend on inner layers, never the reverse
- **Layers (inside out)**: Entities → Use Cases → Interface Adapters → Frameworks & Drivers
- **Hexagonal Architecture (Ports & Adapters)**: Application core defines ports (interfaces); adapters implement them for external systems
- **Use Cases**: Application-specific business rules that orchestrate entity behavior — one use case per user intention
- **Domain entities are framework-agnostic**: No annotations, no ORM decorators, no HTTP concerns in the domain layer
- **The Dependency Inversion Principle is the mechanism** that enforces the dependency rule at compile time
- **Bounded Contexts from DDD** define where one clean architecture boundary ends and another begins
- **Testability is a natural outcome**: Inner layers are testable without any infrastructure, frameworks, or external services

## When to Use

Clean architecture is most valuable in systems where business logic is complex, long-lived, and must survive multiple technology migrations. It shines in enterprise applications where the domain model is the primary asset and infrastructure is expected to change over the system's lifetime.

Apply clean architecture when the business domain is complex enough to warrant isolation from infrastructure concerns, when you anticipate changing databases, frameworks, or external services over the system's lifetime, when multiple delivery mechanisms exist (REST API, GraphQL, CLI, message consumers) for the same business logic, when regulatory requirements demand auditable and testable business rules, and when team size requires clear boundaries to enable parallel development.

Avoid clean architecture for simple CRUD applications where the business logic is trivial, for short-lived prototypes or MVPs where speed to market outweighs maintainability, for performance-critical systems where abstraction layers introduce unacceptable latency, and for small teams working on small codebases where the overhead of multiple layers exceeds the benefit.

The key insight is that clean architecture is an investment. The upfront cost of defining boundaries, creating ports, and implementing adapters pays dividends when requirements change, teams grow, or infrastructure evolves. For systems expected to live less than two years with stable requirements, the investment may not be justified.

## Code Examples

### Hexagonal Architecture — Ports and Adapters

The hexagonal architecture (also called ports and adapters) places the application core at the center, defining **ports** (interfaces) that describe how the application interacts with the outside world. **Adapters** implement these ports for specific technologies.

```java
// === DOMAIN LAYER (innermost) ===
// Pure business entity — no framework dependencies
public class Account {
    private final AccountId id;
    private Money balance;
    private final List<Transaction> transactions;

    public Account(AccountId id, Money initialBalance) {
        this.id = id;
        this.balance = initialBalance;
        this.transactions = new ArrayList<>();
    }

    public void withdraw(Money amount) {
        if (amount.isGreaterThan(balance)) {
            throw new InsufficientFundsException(id, amount, balance);
        }
        balance = balance.subtract(amount);
        transactions.add(Transaction.withdrawal(amount, LocalDateTime.now()));
    }

    public void deposit(Money amount) {
        if (amount.isNegativeOrZero()) {
            throw new InvalidAmountException(amount);
        }
        balance = balance.add(amount);
        transactions.add(Transaction.deposit(amount, LocalDateTime.now()));
    }

    public Money getBalance() { return balance; }
    public AccountId getId() { return id; }
}

// === PORTS (interfaces defined by the application core) ===

// Driven port — the application needs this to persist data
public interface AccountRepository {
    Optional<Account> findById(AccountId id);
    void save(Account account);
}

// Driven port — the application needs this to send notifications
public interface TransferNotifier {
    void notifyTransferCompleted(AccountId from, AccountId to, Money amount);
    void notifyTransferFailed(AccountId from, AccountId to, String reason);
}

// Driving port — external actors use this to trigger application behavior
public interface TransferUseCase {
    TransferResult execute(TransferCommand command);
}
```

```java
// === USE CASE LAYER ===
// Orchestrates domain entities to fulfill a specific user intention
public class TransferMoneyUseCase implements TransferUseCase {
    private final AccountRepository accountRepository;
    private final TransferNotifier notifier;
    private final TransactionLogger transactionLogger;

    public TransferMoneyUseCase(
            AccountRepository accountRepository,
            TransferNotifier notifier,
            TransactionLogger transactionLogger) {
        this.accountRepository = accountRepository;
        this.notifier = notifier;
        this.transactionLogger = transactionLogger;
    }

    @Override
    public TransferResult execute(TransferCommand command) {
        Account source = accountRepository.findById(command.sourceAccountId())
            .orElseThrow(() -> new AccountNotFoundException(command.sourceAccountId()));
        Account target = accountRepository.findById(command.targetAccountId())
            .orElseThrow(() -> new AccountNotFoundException(command.targetAccountId()));

        try {
            source.withdraw(command.amount());
            target.deposit(command.amount());

            accountRepository.save(source);
            accountRepository.save(target);

            transactionLogger.log(command.sourceAccountId(), command.targetAccountId(), command.amount());
            notifier.notifyTransferCompleted(command.sourceAccountId(), command.targetAccountId(), command.amount());

            return TransferResult.success(source.getBalance());
        } catch (InsufficientFundsException e) {
            notifier.notifyTransferFailed(command.sourceAccountId(), command.targetAccountId(), e.getMessage());
            return TransferResult.failure(e.getMessage());
        }
    }
}

// Command object — immutable input to the use case
public record TransferCommand(
    AccountId sourceAccountId,
    AccountId targetAccountId,
    Money amount
) {
    public TransferCommand {
        Objects.requireNonNull(sourceAccountId, "Source account ID required");
        Objects.requireNonNull(targetAccountId, "Target account ID required");
        Objects.requireNonNull(amount, "Amount required");
        if (sourceAccountId.equals(targetAccountId)) {
            throw new IllegalArgumentException("Cannot transfer to same account");
        }
    }
}
```

### Adapter Implementations

Adapters sit in the outermost layer and implement the ports defined by the application core. They translate between the application's language and the external system's language.

```java
// === ADAPTER LAYER (outermost) ===

// Driven adapter — implements the repository port using JPA
@Repository
public class JpaAccountRepository implements AccountRepository {
    private final JpaAccountEntityRepository jpaRepository;
    private final AccountMapper mapper;

    public JpaAccountRepository(JpaAccountEntityRepository jpaRepository, AccountMapper mapper) {
        this.jpaRepository = jpaRepository;
        this.mapper = mapper;
    }

    @Override
    public Optional<Account> findById(AccountId id) {
        return jpaRepository.findById(id.value())
            .map(mapper::toDomain);
    }

    @Override
    @Transactional
    public void save(Account account) {
        AccountEntity entity = mapper.toEntity(account);
        jpaRepository.save(entity);
    }
}

// Driven adapter — implements notification port using email
public class EmailTransferNotifier implements TransferNotifier {
    private final EmailClient emailClient;
    private final UserRepository userRepository;

    public EmailTransferNotifier(EmailClient emailClient, UserRepository userRepository) {
        this.emailClient = emailClient;
        this.userRepository = userRepository;
    }

    @Override
    public void notifyTransferCompleted(AccountId from, AccountId to, Money amount) {
        User sender = userRepository.findByAccountId(from);
        emailClient.send(
            sender.getEmail(),
            "Transfer Completed",
            String.format("Your transfer of %s has been completed.", amount)
        );
    }

    @Override
    public void notifyTransferFailed(AccountId from, AccountId to, String reason) {
        User sender = userRepository.findByAccountId(from);
        emailClient.send(sender.getEmail(), "Transfer Failed", reason);
    }
}

// Driving adapter — REST controller that invokes the use case
@RestController
@RequestMapping("/api/transfers")
public class TransferController {
    private final TransferUseCase transferUseCase;

    public TransferController(TransferUseCase transferUseCase) {
        this.transferUseCase = transferUseCase;
    }

    @PostMapping
    public ResponseEntity<TransferResponse> transfer(@RequestBody @Valid TransferRequest request) {
        TransferCommand command = new TransferCommand(
            new AccountId(request.sourceAccountId()),
            new AccountId(request.targetAccountId()),
            Money.of(request.amount(), request.currency())
        );

        TransferResult result = transferUseCase.execute(command);

        if (result.isSuccess()) {
            return ResponseEntity.ok(new TransferResponse(result.remainingBalance().toString()));
        }
        return ResponseEntity.badRequest()
            .body(new TransferResponse(result.errorMessage()));
    }
}
```

### Clean Architecture in TypeScript with Dependency Rule

```typescript
// === DOMAIN LAYER ===
// Pure domain entity — no external dependencies
export class Order {
  private readonly items: OrderItem[] = [];
  private status: OrderStatus = OrderStatus.DRAFT;

  constructor(
    public readonly id: string,
    public readonly customerId: string,
    private readonly pricingPolicy: PricingPolicy
  ) {}

  addItem(product: Product, quantity: number): void {
    if (this.status !== OrderStatus.DRAFT) {
      throw new OrderNotModifiableError(this.id, this.status);
    }
    if (quantity <= 0) {
      throw new InvalidQuantityError(quantity);
    }
    const price = this.pricingPolicy.calculatePrice(product, quantity);
    this.items.push(new OrderItem(product.id, quantity, price));
  }

  submit(): void {
    if (this.items.length === 0) {
      throw new EmptyOrderError(this.id);
    }
    this.status = OrderStatus.SUBMITTED;
  }

  getTotal(): Money {
    return this.items.reduce(
      (sum, item) => sum.add(item.totalPrice),
      Money.zero('USD')
    );
  }
}

// === PORT (interface defined by application core) ===
export interface OrderRepository {
  findById(id: string): Promise<Order | null>;
  save(order: Order): Promise<void>;
  findByCustomer(customerId: string): Promise<Order[]>;
}

export interface InventoryService {
  reserve(productId: string, quantity: number): Promise<ReservationResult>;
  release(reservationId: string): Promise<void>;
}

// === USE CASE ===
export class SubmitOrderUseCase {
  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly inventoryService: InventoryService,
    private readonly eventPublisher: DomainEventPublisher
  ) {}

  async execute(command: SubmitOrderCommand): Promise<SubmitOrderResult> {
    const order = await this.orderRepository.findById(command.orderId);
    if (!order) {
      return SubmitOrderResult.notFound(command.orderId);
    }

    // Reserve inventory for all items
    const reservations: string[] = [];
    try {
      for (const item of order.getItems()) {
        const result = await this.inventoryService.reserve(item.productId, item.quantity);
        if (!result.success) {
          // Rollback previous reservations
          await Promise.all(reservations.map(r => this.inventoryService.release(r)));
          return SubmitOrderResult.insufficientInventory(item.productId);
        }
        reservations.push(result.reservationId);
      }

      order.submit();
      await this.orderRepository.save(order);
      await this.eventPublisher.publish(new OrderSubmittedEvent(order.id, order.getTotal()));

      return SubmitOrderResult.success(order.id);
    } catch (error) {
      await Promise.all(reservations.map(r => this.inventoryService.release(r)));
      throw error;
    }
  }
}
```

### Project Structure Following Clean Architecture

```
src/
├── domain/                    # Innermost layer — entities and value objects
│   ├── entities/
│   │   ├── Account.ts
│   │   ├── Transaction.ts
│   │   └── User.ts
│   ├── value-objects/
│   │   ├── Money.ts
│   │   ├── AccountId.ts
│   │   └── Email.ts
│   ├── events/
│   │   ├── DomainEvent.ts
│   │   └── TransferCompleted.ts
│   └── exceptions/
│       ├── InsufficientFunds.ts
│       └── AccountNotFound.ts
├── application/               # Use cases and port definitions
│   ├── ports/
│   │   ├── driven/           # Ports the app needs (repositories, services)
│   │   │   ├── AccountRepository.ts
│   │   │   └── NotificationService.ts
│   │   └── driving/          # Ports that drive the app (use case interfaces)
│   │       └── TransferUseCase.ts
│   ├── use-cases/
│   │   ├── TransferMoney.ts
│   │   └── GetAccountBalance.ts
│   └── dto/
│       ├── TransferCommand.ts
│       └── TransferResult.ts
├── infrastructure/            # Outermost layer — adapters
│   ├── persistence/
│   │   ├── PostgresAccountRepository.ts
│   │   └── entities/
│   │       └── AccountEntity.ts
│   ├── messaging/
│   │   └── RabbitMQNotifier.ts
│   └── config/
│       └── DependencyInjection.ts
└── interfaces/                # Driving adapters
    ├── rest/
    │   ├── TransferController.ts
    │   └── dto/
    │       └── TransferRequest.ts
    ├── graphql/
    │   └── TransferResolver.ts
    └── cli/
        └── TransferCommand.ts
```

## Common Pitfalls

- **Leaking framework annotations into the domain layer**: Placing `@Entity`, `@Column`, or `@JsonProperty` annotations on domain objects couples them to specific frameworks. Domain entities should be plain objects. Use separate persistence entities with mappers to translate between layers.

- **Anemic domain model**: Placing all business logic in use cases while domain entities are just data holders (getters/setters only) defeats the purpose of clean architecture. Rich domain entities should encapsulate behavior and enforce their own invariants.

- **Skipping the use case layer for "simple" operations**: Directly calling repositories from controllers because "it's just a CRUD operation" erodes the architecture over time. Even simple operations benefit from a thin use case layer that provides a consistent entry point and enables cross-cutting concerns like logging and authorization.

- **Circular dependencies between layers**: When an inner layer needs to trigger something in an outer layer (e.g., domain entity needs to send an email), use the Observer pattern or domain events rather than injecting outer-layer services into the domain.

- **Over-mapping between layers**: Creating separate DTOs for every layer boundary (controller DTO → use case DTO → domain entity → persistence entity) can lead to excessive boilerplate. Be pragmatic — share immutable value objects across boundaries when they are stable and unlikely to diverge.

- **Treating clean architecture as a folder structure**: Simply organizing code into `domain/`, `application/`, and `infrastructure/` folders does not enforce the dependency rule. Use module systems, build tool configurations (like Gradle modules or TypeScript project references), or architectural fitness functions (ArchUnit) to enforce boundaries at compile time.

## Real-World Use Cases

**Banking and financial systems**: Banks like ING and Rabobank use hexagonal architecture to isolate core banking logic (account management, transaction processing, compliance rules) from delivery channels (mobile apps, web portals, ATM interfaces) and infrastructure (mainframes, cloud databases, message queues). This allows them to modernize infrastructure without rewriting business rules.

**E-commerce platforms**: Shopify's core commerce engine separates order processing, inventory management, and pricing logic from specific payment gateways, shipping providers, and storefront themes. Merchants can swap payment providers without affecting order logic.

**Healthcare systems**: Electronic Health Record (EHR) systems use clean architecture to isolate clinical decision support rules from specific database vendors and UI frameworks. Regulatory changes to clinical rules can be implemented and tested independently of infrastructure changes.

**Multi-channel retail**: A retailer serving customers through web, mobile app, in-store kiosks, and voice assistants implements business logic once in the application core. Each channel is a driving adapter that translates channel-specific interactions into use case commands.

**Legacy system modernization**: The strangler fig pattern combined with clean architecture allows teams to extract bounded contexts from monoliths. New features are built with clean architecture while legacy code is gradually replaced, with anti-corruption layers translating between old and new systems.

## Interview Questions

**Q: Explain the dependency rule in clean architecture and how it is enforced.**

A: The dependency rule states that source code dependencies must point inward — outer layers can reference inner layers, but inner layers must have zero knowledge of outer layers. Entities know nothing about use cases, use cases know nothing about controllers or databases. Enforcement happens through the Dependency Inversion Principle: inner layers define interfaces (ports) that outer layers implement (adapters). At compile time, the inner layer depends only on its own interface definition. At runtime, dependency injection provides the concrete adapter. Tools like ArchUnit (Java), Dependency Cruiser (TypeScript), or separate build modules enforce this at CI time by failing builds when forbidden dependencies are detected.

**Q: What is the difference between hexagonal architecture and clean architecture?**

A: Hexagonal architecture (Alistair Cockburn, 2005) focuses on the symmetry between driving adapters (things that use the application) and driven adapters (things the application uses), connected through ports. Clean architecture (Robert C. Martin, 2012) adds explicit concentric layers (entities, use cases, interface adapters, frameworks) with a strict dependency rule. In practice, they are complementary — hexagonal architecture provides the ports-and-adapters mechanism, while clean architecture provides the layering discipline. Most production systems combine both: hexagonal ports at boundaries with clean architecture's layered organization internally.

**Q: How do you handle cross-cutting concerns like logging, authentication, and transactions in clean architecture?**

A: Cross-cutting concerns should not pollute the domain or use case layers. Strategies include: (1) Decorator pattern — wrap use case implementations with decorators that add logging, metrics, or transaction management without modifying the use case itself. (2) Aspect-oriented programming — use framework-level AOP (Spring AOP, TypeScript decorators) at the adapter layer. (3) Middleware/pipeline — implement a use case pipeline where cross-cutting concerns are pipeline stages that execute before/after the core use case. (4) Domain events — for concerns triggered by domain behavior (audit logging), publish domain events that are handled by infrastructure listeners. The key principle is that the use case code remains focused on business logic while infrastructure concerns are handled at the boundary.

**Q: When would you choose clean architecture over a simpler layered architecture?**

A: Choose clean architecture when: the domain is complex enough that isolating it from infrastructure provides testing and maintenance benefits; multiple delivery mechanisms exist or are planned; the system will live long enough to undergo infrastructure migrations; team size requires clear boundaries for parallel work; or regulatory requirements demand auditable, independently testable business rules. Choose simpler layered architecture when: the application is primarily CRUD with minimal business logic; the team is small and communication overhead is low; time-to-market is the primary constraint; or the technology stack is unlikely to change. The decision should be based on the complexity of the business domain, not the size of the codebase.

## Production Tips

- **Enforce the dependency rule with architectural fitness functions**: Use ArchUnit (Java), Dependency Cruiser (TypeScript), or custom build scripts to verify that domain packages never import from infrastructure packages. Run these checks in CI — they catch violations before they reach production and prevent gradual erosion of boundaries.

- **Use separate build modules for strict enforcement**: In Gradle or Maven, create separate modules for `domain`, `application`, and `infrastructure`. The `domain` module has zero external dependencies. The `application` module depends only on `domain`. The `infrastructure` module depends on both plus framework libraries. This makes illegal dependencies a compile error, not just a convention.

- **Start with a modular monolith, extract later**: Do not begin with microservices and clean architecture simultaneously. Build a modular monolith with clean architecture boundaries between modules. When a module needs independent scaling or deployment, extract it into a service — the clean boundaries make extraction straightforward because dependencies already point inward.

## Related Topics

- [SOLID Principles](./solid-principles.md) — The Dependency Inversion Principle is the mechanism that enforces clean architecture's dependency rule
- [Refactoring Patterns](./refactoring-patterns.md) — The strangler fig pattern enables incremental migration to clean architecture from legacy systems
- [Technical Debt](./technical-debt.md) — Clean architecture boundaries prevent debt from spreading across system layers
