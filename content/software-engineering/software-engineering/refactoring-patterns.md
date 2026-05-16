# Refactoring Patterns

## Quick Reference

- **Extract Method**: Pull a coherent block of code into a named method to improve readability and enable reuse
- **Replace Conditional with Polymorphism**: Eliminate complex switch/if-else chains by distributing behavior across subtype implementations
- **Introduce Parameter Object**: Group related parameters into a single object to reduce method signature complexity and enable validation
- **Strangler Fig Pattern**: Incrementally replace legacy system components by routing traffic through a facade that delegates to old or new implementations
- **Feature Flags for Refactoring**: Deploy refactored code behind toggles to enable gradual rollout, A/B comparison, and instant rollback
- **Refactoring preserves external behavior** — tests must pass before and after every transformation
- **Small, verified steps** are safer than large rewrites — each step should be independently committable and deployable
- **Martin Fowler's refactoring catalog** defines 60+ named transformations with mechanical steps

## When to Use

Refactoring is appropriate whenever you need to change the internal structure of code without altering its external behavior. The primary triggers are adding a new feature that is difficult with the current structure, fixing a bug that reveals a design flaw, improving code that was flagged during code review, reducing complexity that has accumulated over multiple iterations, and preparing code for extraction into a shared library or service.

Apply Extract Method when a method exceeds 20 lines or contains comments explaining "what this block does" — the comment is a sign the block deserves its own named method. Apply Replace Conditional with Polymorphism when you find the same switch statement duplicated across multiple methods or when adding a new case requires modifying multiple files. Apply Introduce Parameter Object when methods have more than 3-4 parameters or when the same group of parameters appears in multiple method signatures.

Use the Strangler Fig pattern for large-scale system migrations where a big-bang rewrite is too risky. Use feature flags when refactoring changes behavior in subtle ways that need production validation, or when the refactoring spans multiple deployments and you need to control exposure.

Avoid refactoring code that is stable, well-tested, and unlikely to change. Avoid refactoring without adequate test coverage — you need tests to verify behavior preservation. Avoid refactoring under time pressure for an unrelated deadline — schedule it as deliberate technical debt reduction.

## Code Examples

### Extract Method

Extract Method is the most fundamental refactoring. It improves readability by giving a name to a block of code, reduces duplication by enabling reuse, and simplifies testing by creating smaller, focused units.

**Before — a long method with embedded logic:**

```java
public class InvoiceGenerator {
    public Invoice generateInvoice(Order order, Customer customer) {
        // Calculate line items
        List<LineItem> lineItems = new ArrayList<>();
        for (OrderItem item : order.getItems()) {
            BigDecimal unitPrice = item.getProduct().getPrice();
            BigDecimal quantity = BigDecimal.valueOf(item.getQuantity());
            BigDecimal lineTotal = unitPrice.multiply(quantity);

            if (customer.getTier() == CustomerTier.PREMIUM) {
                lineTotal = lineTotal.multiply(BigDecimal.valueOf(0.9)); // 10% discount
            } else if (customer.getTier() == CustomerTier.ENTERPRISE) {
                lineTotal = lineTotal.multiply(BigDecimal.valueOf(0.8)); // 20% discount
            }

            lineItems.add(new LineItem(item.getProduct().getName(), item.getQuantity(), unitPrice, lineTotal));
        }

        // Calculate totals
        BigDecimal subtotal = lineItems.stream()
            .map(LineItem::getTotal)
            .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal taxRate = getTaxRate(customer.getAddress().getState());
        BigDecimal tax = subtotal.multiply(taxRate);
        BigDecimal total = subtotal.add(tax);

        // Apply shipping
        BigDecimal shipping;
        if (total.compareTo(BigDecimal.valueOf(100)) > 0) {
            shipping = BigDecimal.ZERO; // Free shipping over $100
        } else {
            shipping = BigDecimal.valueOf(9.99);
        }

        // Build invoice
        Invoice invoice = new Invoice();
        invoice.setInvoiceNumber(generateInvoiceNumber());
        invoice.setCustomer(customer);
        invoice.setLineItems(lineItems);
        invoice.setSubtotal(subtotal);
        invoice.setTax(tax);
        invoice.setShipping(shipping);
        invoice.setTotal(total.add(shipping));
        invoice.setDueDate(LocalDate.now().plusDays(30));
        return invoice;
    }
}
```

**After — extracted into focused methods:**

```java
public class InvoiceGenerator {
    private final TaxCalculator taxCalculator;
    private final DiscountPolicy discountPolicy;
    private final ShippingCalculator shippingCalculator;

    public Invoice generateInvoice(Order order, Customer customer) {
        List<LineItem> lineItems = calculateLineItems(order, customer);
        BigDecimal subtotal = calculateSubtotal(lineItems);
        BigDecimal tax = taxCalculator.calculate(subtotal, customer.getAddress());
        BigDecimal shipping = shippingCalculator.calculate(subtotal);
        BigDecimal total = subtotal.add(tax).add(shipping);

        return buildInvoice(customer, lineItems, subtotal, tax, shipping, total);
    }

    private List<LineItem> calculateLineItems(Order order, Customer customer) {
        return order.getItems().stream()
            .map(item -> createLineItem(item, customer))
            .collect(Collectors.toList());
    }

    private LineItem createLineItem(OrderItem item, Customer customer) {
        BigDecimal unitPrice = item.getProduct().getPrice();
        BigDecimal quantity = BigDecimal.valueOf(item.getQuantity());
        BigDecimal lineTotal = discountPolicy.applyDiscount(
            unitPrice.multiply(quantity), customer.getTier()
        );
        return new LineItem(item.getProduct().getName(), item.getQuantity(), unitPrice, lineTotal);
    }

    private BigDecimal calculateSubtotal(List<LineItem> lineItems) {
        return lineItems.stream()
            .map(LineItem::getTotal)
            .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private Invoice buildInvoice(Customer customer, List<LineItem> lineItems,
            BigDecimal subtotal, BigDecimal tax, BigDecimal shipping, BigDecimal total) {
        Invoice invoice = new Invoice();
        invoice.setInvoiceNumber(generateInvoiceNumber());
        invoice.setCustomer(customer);
        invoice.setLineItems(lineItems);
        invoice.setSubtotal(subtotal);
        invoice.setTax(tax);
        invoice.setShipping(shipping);
        invoice.setTotal(total);
        invoice.setDueDate(LocalDate.now().plusDays(30));
        return invoice;
    }
}
```

### Replace Conditional with Polymorphism

This refactoring eliminates complex conditional logic by distributing behavior across a type hierarchy. Each branch becomes a separate class with a focused implementation.

**Before — switch statement that grows with every new notification type:**

```typescript
// BAD: Adding a new notification type requires modifying this function
function sendNotification(notification: Notification): SendResult {
  switch (notification.type) {
    case 'email':
      const emailBody = renderEmailTemplate(notification.template, notification.data);
      return emailClient.send({
        to: notification.recipient.email,
        subject: notification.subject,
        body: emailBody,
        attachments: notification.attachments || [],
      });

    case 'sms':
      const smsBody = truncateToSmsLength(notification.message);
      return smsGateway.send({
        phoneNumber: notification.recipient.phone,
        message: smsBody,
      });

    case 'push':
      return pushService.send({
        deviceToken: notification.recipient.deviceToken,
        title: notification.subject,
        body: notification.message,
        badge: notification.badge || 1,
        sound: notification.sound || 'default',
      });

    case 'slack':
      return slackClient.postMessage({
        channel: notification.recipient.slackChannel,
        text: notification.message,
        blocks: notification.richContent || [],
      });

    default:
      throw new Error(`Unknown notification type: ${notification.type}`);
  }
}
```

**After — polymorphic dispatch through a common interface:**

```typescript
// GOOD: Each notification type is a self-contained class
interface NotificationSender {
  readonly type: string;
  send(notification: Notification): Promise<SendResult>;
  validate(notification: Notification): ValidationResult;
}

class EmailSender implements NotificationSender {
  readonly type = 'email';

  constructor(
    private readonly emailClient: EmailClient,
    private readonly templateEngine: TemplateEngine
  ) {}

  async send(notification: Notification): Promise<SendResult> {
    const body = this.templateEngine.render(notification.template, notification.data);
    return this.emailClient.send({
      to: notification.recipient.email,
      subject: notification.subject,
      body,
      attachments: notification.attachments || [],
    });
  }

  validate(notification: Notification): ValidationResult {
    if (!notification.recipient.email) {
      return ValidationResult.failure('Email address required');
    }
    if (!notification.template) {
      return ValidationResult.failure('Email template required');
    }
    return ValidationResult.success();
  }
}

class SmsSender implements NotificationSender {
  readonly type = 'sms';

  constructor(private readonly smsGateway: SmsGateway) {}

  async send(notification: Notification): Promise<SendResult> {
    const message = this.truncateToSmsLength(notification.message);
    return this.smsGateway.send({
      phoneNumber: notification.recipient.phone,
      message,
    });
  }

  validate(notification: Notification): ValidationResult {
    if (!notification.recipient.phone) {
      return ValidationResult.failure('Phone number required');
    }
    return ValidationResult.success();
  }

  private truncateToSmsLength(message: string): string {
    return message.length > 160 ? message.substring(0, 157) + '...' : message;
  }
}

// Registry pattern — adding new types requires zero changes to existing code
class NotificationDispatcher {
  private readonly senders = new Map<string, NotificationSender>();

  register(sender: NotificationSender): void {
    this.senders.set(sender.type, sender);
  }

  async dispatch(notification: Notification): Promise<SendResult> {
    const sender = this.senders.get(notification.type);
    if (!sender) {
      throw new UnsupportedNotificationError(notification.type);
    }

    const validation = sender.validate(notification);
    if (!validation.isValid) {
      return SendResult.failure(validation.error);
    }

    return sender.send(notification);
  }
}
```

### Introduce Parameter Object

When multiple parameters travel together across method signatures, they represent a concept that deserves its own type. Extracting them into a parameter object improves readability, enables validation, and provides a natural home for related behavior.

```java
// BEFORE: Long parameter list that appears in multiple methods
public class ReportService {
    public Report generateReport(
            LocalDate startDate,
            LocalDate endDate,
            String department,
            ReportFormat format,
            boolean includeSubDepartments,
            int maxResults) {
        validateDateRange(startDate, endDate);
        // ... report generation logic
    }

    public long countRecords(
            LocalDate startDate,
            LocalDate endDate,
            String department,
            boolean includeSubDepartments) {
        validateDateRange(startDate, endDate);
        // ... counting logic
    }

    public List<String> previewHeaders(
            LocalDate startDate,
            LocalDate endDate,
            String department,
            ReportFormat format) {
        // ... header logic
    }
}
```

```java
// AFTER: Parameter object encapsulates related data and validation
public class ReportCriteria {
    private final LocalDate startDate;
    private final LocalDate endDate;
    private final String department;
    private final boolean includeSubDepartments;

    private ReportCriteria(Builder builder) {
        if (builder.startDate.isAfter(builder.endDate)) {
            throw new IllegalArgumentException("Start date must be before end date");
        }
        if (ChronoUnit.DAYS.between(builder.startDate, builder.endDate) > 365) {
            throw new IllegalArgumentException("Date range cannot exceed one year");
        }
        this.startDate = builder.startDate;
        this.endDate = builder.endDate;
        this.department = Objects.requireNonNull(builder.department);
        this.includeSubDepartments = builder.includeSubDepartments;
    }

    public Duration getDuration() {
        return Duration.between(startDate.atStartOfDay(), endDate.atStartOfDay());
    }

    public boolean spansMultipleMonths() {
        return !startDate.getMonth().equals(endDate.getMonth());
    }

    // Builder pattern for flexible construction
    public static class Builder {
        private LocalDate startDate;
        private LocalDate endDate;
        private String department;
        private boolean includeSubDepartments = false;

        public Builder dateRange(LocalDate start, LocalDate end) {
            this.startDate = start;
            this.endDate = end;
            return this;
        }

        public Builder department(String department) {
            this.department = department;
            return this;
        }

        public Builder includeSubDepartments(boolean include) {
            this.includeSubDepartments = include;
            return this;
        }

        public ReportCriteria build() {
            return new ReportCriteria(this);
        }
    }
}

// Clean method signatures
public class ReportService {
    public Report generateReport(ReportCriteria criteria, ReportFormat format, int maxResults) {
        // criteria.getDuration() — behavior lives with the data
        // ... report generation logic
    }

    public long countRecords(ReportCriteria criteria) {
        // ... counting logic
    }
}
```

### Strangler Fig Pattern

The strangler fig pattern enables incremental migration from a legacy system to a new implementation. A routing layer (facade) intercepts requests and delegates to either the old or new system based on configuration.

```typescript
// Strangler fig facade — routes between legacy and new implementations
interface OrderProcessor {
  processOrder(order: OrderRequest): Promise<OrderResult>;
}

class LegacyOrderProcessor implements OrderProcessor {
  constructor(private readonly legacyClient: LegacySystemClient) {}

  async processOrder(order: OrderRequest): Promise<OrderResult> {
    // Translate to legacy format and call old system
    const legacyOrder = this.translateToLegacyFormat(order);
    const legacyResult = await this.legacyClient.submitOrder(legacyOrder);
    return this.translateFromLegacyResult(legacyResult);
  }

  private translateToLegacyFormat(order: OrderRequest): LegacyOrder {
    return {
      orderNum: order.id,
      custId: order.customerId,
      items: order.items.map(i => ({ sku: i.productId, qty: i.quantity })),
      // Legacy system uses cents, new system uses decimal dollars
      totalCents: Math.round(order.total * 100),
    };
  }

  private translateFromLegacyResult(result: LegacyOrderResult): OrderResult {
    return {
      orderId: result.orderNum,
      status: result.statusCode === 'OK' ? 'confirmed' : 'failed',
      confirmationNumber: result.confNum,
    };
  }
}

class NewOrderProcessor implements OrderProcessor {
  constructor(private readonly orderService: OrderService) {}

  async processOrder(order: OrderRequest): Promise<OrderResult> {
    return this.orderService.submit(order);
  }
}

// The strangler fig facade — controls routing between old and new
class StranglerFigOrderProcessor implements OrderProcessor {
  constructor(
    private readonly legacy: LegacyOrderProcessor,
    private readonly modern: NewOrderProcessor,
    private readonly featureFlags: FeatureFlagService,
    private readonly metrics: MetricsCollector
  ) {}

  async processOrder(order: OrderRequest): Promise<OrderResult> {
    const useNewSystem = await this.featureFlags.isEnabled(
      'new-order-processor',
      { customerId: order.customerId, orderTotal: order.total }
    );

    if (useNewSystem) {
      this.metrics.increment('order.processor.new');
      try {
        const result = await this.modern.processOrder(order);
        this.metrics.increment('order.processor.new.success');
        return result;
      } catch (error) {
        this.metrics.increment('order.processor.new.failure');
        // Fallback to legacy on failure during migration
        if (await this.featureFlags.isEnabled('order-processor-fallback')) {
          this.metrics.increment('order.processor.fallback');
          return this.legacy.processOrder(order);
        }
        throw error;
      }
    }

    this.metrics.increment('order.processor.legacy');
    return this.legacy.processOrder(order);
  }
}
```

### Feature Flags for Safe Refactoring

Feature flags enable deploying refactored code to production without exposing it to all users. This allows gradual rollout, comparison testing, and instant rollback.

```java
// Feature flag service abstraction
public interface FeatureFlagService {
    boolean isEnabled(String flagName);
    boolean isEnabled(String flagName, EvaluationContext context);
    <T> T getVariant(String flagName, Class<T> type, T defaultValue);
}

// Using feature flags to safely migrate a pricing calculation
public class PricingService {
    private final FeatureFlagService featureFlags;
    private final LegacyPricingEngine legacyEngine;
    private final NewPricingEngine newEngine;
    private final MetricsCollector metrics;

    public PricingService(FeatureFlagService featureFlags,
                          LegacyPricingEngine legacyEngine,
                          NewPricingEngine newEngine,
                          MetricsCollector metrics) {
        this.featureFlags = featureFlags;
        this.legacyEngine = legacyEngine;
        this.newEngine = newEngine;
        this.metrics = metrics;
    }

    public PricingResult calculatePrice(PricingRequest request) {
        EvaluationContext context = EvaluationContext.builder()
            .userId(request.getCustomerId())
            .attribute("region", request.getRegion())
            .attribute("orderValue", request.getEstimatedTotal().toString())
            .build();

        if (featureFlags.isEnabled("new-pricing-engine", context)) {
            return executeWithComparison(request);
        }
        return legacyEngine.calculate(request);
    }

    // Shadow mode: run both, compare results, serve legacy
    private PricingResult executeWithComparison(PricingRequest request) {
        PricingResult legacyResult = legacyEngine.calculate(request);
        PricingResult newResult = newEngine.calculate(request);

        // Compare results for validation
        if (!legacyResult.getTotal().equals(newResult.getTotal())) {
            metrics.increment("pricing.mismatch");
            metrics.recordValue("pricing.mismatch.delta",
                legacyResult.getTotal().subtract(newResult.getTotal()).abs().doubleValue());
            log.warn("Pricing mismatch for customer {}: legacy={}, new={}",
                request.getCustomerId(), legacyResult.getTotal(), newResult.getTotal());
        } else {
            metrics.increment("pricing.match");
        }

        // Serve new result only when confidence is high
        if (featureFlags.isEnabled("new-pricing-engine-serve", context)) {
            return newResult;
        }
        return legacyResult;
    }
}
```

## Common Pitfalls

- **Refactoring without tests**: The cardinal sin of refactoring is changing code structure without a safety net. If existing tests are insufficient, write characterization tests first — tests that capture current behavior regardless of whether it is "correct." These tests verify that your refactoring preserves behavior.

- **Big-bang refactoring instead of incremental steps**: Attempting to refactor an entire module in one commit creates merge conflicts, makes code review impossible, and risks introducing subtle bugs. Break refactoring into small, independently deployable steps. Each step should leave the system in a working state.

- **Refactoring and adding features simultaneously**: Mixing structural changes with behavioral changes makes it impossible to determine whether a bug was introduced by the refactoring or the new feature. Separate refactoring commits from feature commits — refactor first to make the feature easy to add, then add the feature.

- **Premature abstraction during refactoring**: Seeing a pattern twice does not justify extracting a shared abstraction. Wait for the "Rule of Three" — extract only when you see the same pattern three times with enough similarity to justify the abstraction. Premature abstraction creates coupling that is harder to undo than duplication.

- **Ignoring the strangler fig's anti-corruption layer**: When migrating from legacy to new systems, failing to properly translate between the two system's models leads to data corruption and subtle bugs. The anti-corruption layer must handle all differences in data formats, error codes, and behavioral semantics.

- **Feature flag debt**: Feature flags used for refactoring must be cleaned up after the migration is complete. Stale flags accumulate as dead code paths, increase testing complexity, and create confusion about which code path is actually active. Set expiration dates on flags and track them in your backlog.

## Real-World Use Cases

**Stripe's API versioning**: Stripe uses a variant of the strangler fig pattern for API evolution. Each API version is a thin adapter layer that translates between the client's expected format and the current internal representation. Old versions are maintained as adapters while the core evolves independently.

**GitHub's scientist library**: GitHub created the `scientist` library specifically for safe refactoring in production. It runs both old and new code paths, compares results, and reports mismatches without affecting users. This enabled them to refactor critical permission-checking code with confidence.

**Netflix's feature flag infrastructure**: Netflix uses feature flags extensively for refactoring their recommendation engine. New algorithms are deployed behind flags, tested with small user segments, and gradually rolled out based on engagement metrics. Rollback is instant if metrics degrade.

**Martin Fowler's refactoring to patterns**: The progression from procedural code to design patterns often follows a sequence of named refactorings. Replace Conditional with Polymorphism leads to Strategy pattern. Extract Method + Move Method leads to Decorator pattern. These mechanical transformations make pattern adoption safe and incremental.

**Shopify's modular monolith extraction**: Shopify refactored their Rails monolith into components using Extract Module refactoring at scale. They enforced module boundaries with static analysis, gradually reducing coupling between components until individual modules could be extracted into services when needed.

## Interview Questions

**Q: How do you decide when code needs refactoring versus when it should be rewritten?**

A: Refactoring is appropriate when the code works correctly but is hard to understand, extend, or maintain — the structure is the problem, not the behavior. Rewriting is appropriate when the code is fundamentally broken in ways that cannot be incrementally fixed, when the technology is obsolete and cannot be maintained, or when the domain understanding has changed so dramatically that the existing model is wrong. The key heuristic: if you can write tests that capture the current behavior and incrementally transform the code while keeping tests green, refactor. If you cannot write meaningful tests because the behavior itself is wrong, rewrite. In practice, rewrites are riskier and take longer than expected — prefer refactoring with the strangler fig pattern even for large-scale changes.

**Q: Explain the strangler fig pattern and when you would use it over a direct migration.**

A: The strangler fig pattern incrementally replaces a legacy system by building new functionality alongside it and gradually routing traffic from old to new. A facade layer intercepts requests and delegates to either the legacy or new system based on configuration (feature flags, routing rules, or percentage-based rollout). Use it when: the legacy system is too large or risky to replace in one release; you need to validate the new system with real traffic before full cutover; the migration will span weeks or months; or you need the ability to instantly rollback. Use direct migration when: the system is small enough to replace in one sprint; the old and new systems have incompatible data models that make parallel operation impractical; or the legacy system has no remaining users during the migration window.

**Q: What is the relationship between refactoring and technical debt?**

A: Refactoring is the primary mechanism for paying down technical debt. Technical debt accumulates when code structure diverges from the ideal design — shortcuts taken for speed, designs that no longer fit evolved requirements, or knowledge gaps that led to suboptimal implementations. Refactoring systematically improves structure without changing behavior, bringing the code closer to the ideal design. However, not all technical debt should be refactored — some debt is in stable code that rarely changes and the cost of refactoring exceeds the benefit. Prioritize refactoring debt in code that changes frequently (high churn), code that is blocking new features, and code that causes recurring bugs. Track refactoring work as explicit backlog items with measurable outcomes (reduced bug rate, faster feature delivery, improved test coverage).

**Q: How do you refactor safely in a system without adequate test coverage?**

A: First, write characterization tests — tests that document current behavior by observing what the code actually does, not what it should do. Use techniques like: (1) Golden master testing — capture output for known inputs and assert it does not change. (2) Approval testing — record complex outputs and manually approve them as the baseline. (3) Contract tests at boundaries — test the interface between the code you are refactoring and its callers. (4) Mutation testing to verify test effectiveness — ensure your characterization tests actually detect changes. Once you have sufficient coverage of the code paths you intend to modify, proceed with small refactoring steps, running tests after each step. For legacy code with no tests at all, Michael Feathers' "Working Effectively with Legacy Code" provides techniques like Sprout Method and Wrap Method that allow safe changes without full test coverage.

## Production Tips

- **Use shadow mode before switching traffic**: When refactoring critical paths (pricing, authentication, data processing), run both old and new implementations in parallel. Compare results in production without serving the new results to users. Only switch to serving new results after achieving a sustained period of zero mismatches. GitHub's scientist pattern and Netflix's shadow testing infrastructure demonstrate this approach at scale.

- **Measure refactoring impact with leading indicators**: Track metrics that demonstrate refactoring value: time-to-implement for new features in refactored areas, bug rate in refactored code versus unreformed code, deployment frequency for services with clean architecture versus legacy services, and developer satisfaction surveys. These metrics justify continued investment in refactoring to stakeholders.

- **Set up automated refactoring safety nets**: Configure CI pipelines with mutation testing (PIT for Java, Stryker for TypeScript) to verify that your test suite actually catches behavioral changes. A test suite that passes after refactoring but would also pass with incorrect behavior provides false confidence. Mutation testing reveals gaps in your safety net before they cause production incidents.

## Related Topics

- [SOLID Principles](./solid-principles.md) — Refactoring patterns often target SOLID violations — Extract Class addresses SRP, Replace Conditional with Polymorphism addresses OCP
- [Code Review Practices](./code-review-practices.md) — Code reviews are where refactoring opportunities are identified and refactoring quality is validated
- [Technical Debt](./technical-debt.md) — Refactoring is the primary mechanism for systematically reducing technical debt
- [Clean Architecture](./clean-architecture.md) — The strangler fig pattern enables incremental migration toward clean architecture boundaries
