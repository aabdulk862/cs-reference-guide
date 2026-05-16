# Event-Driven Architecture

## Quick Reference

- Event-driven architecture (EDA) decouples producers from consumers: services communicate by publishing and subscribing to events rather than making direct synchronous calls
- Event sourcing stores all state changes as an immutable sequence of events; current state is derived by replaying events from the beginning or from a snapshot
- CQRS (Command Query Responsibility Segregation) separates write models (optimized for validation and consistency) from read models (optimized for query patterns and performance)
- Saga pattern coordinates distributed transactions across multiple services using a sequence of local transactions with compensating actions for rollback
- Choreography: services react to events independently without a central coordinator; orchestration: a central saga orchestrator directs the workflow by sending commands to services
- Exactly-once delivery is impossible in distributed systems; achieve effectively-once processing through idempotent consumers combined with at-least-once delivery
- Event schemas should be versioned and evolved using backward-compatible changes (new optional fields) to avoid breaking consumers during independent deployments
- Dead letter queues (DLQ) capture events that fail processing after retry exhaustion, enabling manual inspection and replay without blocking the main event stream

## When to Use

Event-driven architecture is appropriate when you need loose coupling between services that evolve independently on different deployment schedules, when you need to react to state changes across multiple systems without creating synchronous dependency chains, when you need temporal decoupling where producers and consumers do not need to be available simultaneously, and when you need to scale producers and consumers independently based on their respective throughput requirements. EDA excels in scenarios involving complex business workflows that span multiple bounded contexts (order processing, payment, shipping, notification), real-time data pipelines that transform and route events to multiple downstream consumers, audit and compliance requirements where a complete history of all state changes must be preserved, and systems where eventual consistency is acceptable and the business benefits of decoupling outweigh the complexity of distributed coordination. Avoid EDA for simple CRUD applications where synchronous request-response is sufficient, for workflows requiring strong consistency across multiple services (use distributed transactions or saga with careful design), and when the team lacks experience with asynchronous debugging and eventual consistency reasoning. In system design interviews, EDA questions test your understanding of distributed coordination, failure handling, and the tradeoffs between consistency and availability.

## Code Examples

### Event Sourcing with Aggregate Root

```java
/**
 * Event-sourced Order aggregate. All state changes are captured as events.
 * Current state is derived by replaying events in sequence.
 * This enables complete audit trail, temporal queries, and event replay.
 */
public class OrderAggregate {
    private UUID orderId;
    private OrderStatus status;
    private UUID customerId;
    private List<OrderItem> items = new ArrayList<>();
    private Money totalAmount;
    private int version = 0;

    // Uncommitted events from the current operation
    private final List<DomainEvent> uncommittedEvents = new ArrayList<>();

    // Private constructor: aggregates are loaded from events, not created directly
    private OrderAggregate() {}

    /**
     * Command handler: validates business rules and emits events.
     * Commands represent intent; events represent facts that happened.
     */
    public static OrderAggregate create(CreateOrderCommand command) {
        // Validate business rules
        if (command.getItems().isEmpty()) {
            throw new BusinessRuleViolation("Order must contain at least one item");
        }
        if (command.getItems().stream().anyMatch(i -> i.getQuantity() <= 0)) {
            throw new BusinessRuleViolation("Item quantity must be positive");
        }

        OrderAggregate order = new OrderAggregate();
        Money total = calculateTotal(command.getItems());

        // Emit event (not direct state mutation)
        order.apply(new OrderCreatedEvent(
            UUID.randomUUID(),
            command.getCustomerId(),
            command.getItems().stream()
                .map(i -> new OrderItemData(i.getProductId(), i.getQuantity(), i.getUnitPrice()))
                .toList(),
            total,
            Instant.now()
        ));

        return order;
    }

    public void confirm(ConfirmOrderCommand command) {
        if (status != OrderStatus.PENDING) {
            throw new BusinessRuleViolation(
                "Cannot confirm order in status: " + status);
        }
        apply(new OrderConfirmedEvent(orderId, command.getConfirmedBy(), Instant.now()));
    }

    public void cancel(CancelOrderCommand command) {
        if (status == OrderStatus.SHIPPED || status == OrderStatus.DELIVERED) {
            throw new BusinessRuleViolation(
                "Cannot cancel order that has been shipped or delivered");
        }
        apply(new OrderCancelledEvent(orderId, command.getReason(), Instant.now()));
    }

    public void addItem(AddItemCommand command) {
        if (status != OrderStatus.PENDING) {
            throw new BusinessRuleViolation("Cannot modify confirmed order");
        }
        Money newTotal = totalAmount.add(
            command.getUnitPrice().multiply(command.getQuantity()));
        apply(new ItemAddedEvent(orderId, command.getProductId(),
            command.getQuantity(), command.getUnitPrice(), newTotal, Instant.now()));
    }

    /**
     * Event application: updates internal state based on event type.
     * This method is called both when handling new commands (uncommitted events)
     * and when replaying historical events (loading from store).
     */
    private void apply(DomainEvent event) {
        mutateState(event);
        uncommittedEvents.add(event);
        version++;
    }

    private void mutateState(DomainEvent event) {
        switch (event) {
            case OrderCreatedEvent e -> {
                this.orderId = e.getOrderId();
                this.customerId = e.getCustomerId();
                this.items = e.getItems().stream()
                    .map(i -> new OrderItem(i.productId(), i.quantity(), i.unitPrice()))
                    .collect(Collectors.toList());
                this.totalAmount = e.getTotalAmount();
                this.status = OrderStatus.PENDING;
            }
            case OrderConfirmedEvent e -> {
                this.status = OrderStatus.CONFIRMED;
            }
            case OrderCancelledEvent e -> {
                this.status = OrderStatus.CANCELLED;
            }
            case ItemAddedEvent e -> {
                this.items.add(new OrderItem(
                    e.getProductId(), e.getQuantity(), e.getUnitPrice()));
                this.totalAmount = e.getNewTotal();
            }
            default -> throw new IllegalArgumentException(
                "Unknown event type: " + event.getClass().getName());
        }
    }

    /**
     * Reconstitute aggregate from stored events.
     * Used by the repository to load an aggregate from the event store.
     */
    public static OrderAggregate fromEvents(List<DomainEvent> events) {
        OrderAggregate order = new OrderAggregate();
        for (DomainEvent event : events) {
            order.mutateState(event);
            order.version++;
        }
        return order;
    }

    public List<DomainEvent> getUncommittedEvents() {
        return Collections.unmodifiableList(uncommittedEvents);
    }

    public void markEventsAsCommitted() {
        uncommittedEvents.clear();
    }
}

/**
 * Event store repository: persists and loads event streams.
 * Uses optimistic concurrency via expected version to prevent conflicts.
 */
@Repository
public class EventStoreRepository {
    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;
    private final ApplicationEventPublisher eventPublisher;

    public void save(OrderAggregate aggregate, int expectedVersion) {
        List<DomainEvent> events = aggregate.getUncommittedEvents();
        if (events.isEmpty()) return;

        // Optimistic concurrency: verify no other writer has appended events
        int currentVersion = getCurrentVersion(aggregate.getOrderId());
        if (currentVersion != expectedVersion) {
            throw new ConcurrencyException(
                "Expected version " + expectedVersion + " but found " + currentVersion);
        }

        // Append events atomically
        for (int i = 0; i < events.size(); i++) {
            DomainEvent event = events.get(i);
            jdbc.update("""
                INSERT INTO event_store (aggregate_id, aggregate_type, event_type,
                    event_data, version, timestamp)
                VALUES (?, ?, ?, ?::jsonb, ?, ?)
                """,
                aggregate.getOrderId(),
                "Order",
                event.getClass().getSimpleName(),
                serialize(event),
                expectedVersion + i + 1,
                event.getTimestamp()
            );
        }

        // Publish events for downstream consumers
        events.forEach(eventPublisher::publishEvent);
        aggregate.markEventsAsCommitted();
    }

    public OrderAggregate load(UUID orderId) {
        List<DomainEvent> events = jdbc.query("""
            SELECT event_type, event_data, version, timestamp
            FROM event_store
            WHERE aggregate_id = ? AND aggregate_type = 'Order'
            ORDER BY version ASC
            """,
            (rs, rowNum) -> deserialize(
                rs.getString("event_type"),
                rs.getString("event_data")
            ),
            orderId
        );

        if (events.isEmpty()) {
            throw new AggregateNotFoundException("Order", orderId);
        }

        return OrderAggregate.fromEvents(events);
    }
}
```

### Saga Pattern with Orchestration

```typescript
import { EventEmitter } from 'events';

/**
 * Saga orchestrator for order fulfillment workflow.
 * Coordinates multiple services through a defined sequence of steps.
 * Each step has a corresponding compensation action for rollback.
 */
interface SagaStep<TContext> {
  name: string;
  execute: (context: TContext) => Promise<void>;
  compensate: (context: TContext) => Promise<void>;
}

interface SagaResult<TContext> {
  success: boolean;
  context: TContext;
  completedSteps: string[];
  failedStep?: string;
  error?: Error;
}

class SagaOrchestrator<TContext> {
  private steps: SagaStep<TContext>[] = [];
  private logger: Logger;

  constructor(private sagaName: string, logger: Logger) {
    this.logger = logger;
  }

  addStep(step: SagaStep<TContext>): this {
    this.steps.push(step);
    return this;
  }

  /**
   * Execute the saga: run steps in sequence.
   * On failure, compensate all completed steps in reverse order.
   */
  async execute(context: TContext): Promise<SagaResult<TContext>> {
    const completedSteps: SagaStep<TContext>[] = [];
    const sagaId = generateId();

    this.logger.info(`Saga ${this.sagaName} [${sagaId}] started`);

    for (const step of this.steps) {
      try {
        this.logger.info(`Saga [${sagaId}] executing step: ${step.name}`);
        await step.execute(context);
        completedSteps.push(step);
        this.logger.info(`Saga [${sagaId}] step completed: ${step.name}`);
      } catch (error) {
        this.logger.error(
          `Saga [${sagaId}] step failed: ${step.name}`,
          error
        );

        // Compensate in reverse order
        await this.compensate(sagaId, completedSteps, context);

        return {
          success: false,
          context,
          completedSteps: completedSteps.map(s => s.name),
          failedStep: step.name,
          error: error as Error,
        };
      }
    }

    this.logger.info(`Saga ${this.sagaName} [${sagaId}] completed successfully`);
    return {
      success: true,
      context,
      completedSteps: completedSteps.map(s => s.name),
    };
  }

  private async compensate(
    sagaId: string,
    completedSteps: SagaStep<TContext>[],
    context: TContext
  ): Promise<void> {
    this.logger.info(
      `Saga [${sagaId}] compensating ${completedSteps.length} steps`
    );

    // Compensate in reverse order
    for (let i = completedSteps.length - 1; i >= 0; i--) {
      const step = completedSteps[i];
      try {
        this.logger.info(`Saga [${sagaId}] compensating: ${step.name}`);
        await step.compensate(context);
        this.logger.info(`Saga [${sagaId}] compensated: ${step.name}`);
      } catch (compensationError) {
        // Compensation failure is critical: log and alert, but continue
        this.logger.error(
          `Saga [${sagaId}] COMPENSATION FAILED for step: ${step.name}`,
          compensationError
        );
        // Store failed compensation for manual resolution
        await this.storeFailedCompensation(sagaId, step.name, compensationError);
      }
    }
  }

  private async storeFailedCompensation(
    sagaId: string,
    stepName: string,
    error: unknown
  ): Promise<void> {
    // Persist for manual intervention
    await db.insert('failed_compensations', {
      sagaId,
      sagaName: this.sagaName,
      stepName,
      error: JSON.stringify(error),
      createdAt: new Date(),
      resolved: false,
    });
  }
}

// Order fulfillment saga definition
interface OrderFulfillmentContext {
  orderId: string;
  customerId: string;
  items: Array<{ productId: string; quantity: number; price: number }>;
  totalAmount: number;
  paymentId?: string;
  reservationId?: string;
  shipmentId?: string;
}

function createOrderFulfillmentSaga(services: {
  inventory: InventoryService;
  payment: PaymentService;
  shipping: ShippingService;
  notification: NotificationService;
}): SagaOrchestrator<OrderFulfillmentContext> {
  return new SagaOrchestrator<OrderFulfillmentContext>('OrderFulfillment', logger)
    .addStep({
      name: 'ReserveInventory',
      execute: async (ctx) => {
        const reservation = await services.inventory.reserve(
          ctx.items.map(i => ({ productId: i.productId, quantity: i.quantity }))
        );
        ctx.reservationId = reservation.id;
      },
      compensate: async (ctx) => {
        if (ctx.reservationId) {
          await services.inventory.releaseReservation(ctx.reservationId);
        }
      },
    })
    .addStep({
      name: 'ProcessPayment',
      execute: async (ctx) => {
        const payment = await services.payment.charge({
          customerId: ctx.customerId,
          amount: ctx.totalAmount,
          orderId: ctx.orderId,
          idempotencyKey: `order-payment-${ctx.orderId}`,
        });
        ctx.paymentId = payment.id;
      },
      compensate: async (ctx) => {
        if (ctx.paymentId) {
          await services.payment.refund(ctx.paymentId, ctx.totalAmount);
        }
      },
    })
    .addStep({
      name: 'CreateShipment',
      execute: async (ctx) => {
        const shipment = await services.shipping.createShipment({
          orderId: ctx.orderId,
          items: ctx.items,
          customerId: ctx.customerId,
        });
        ctx.shipmentId = shipment.id;
      },
      compensate: async (ctx) => {
        if (ctx.shipmentId) {
          await services.shipping.cancelShipment(ctx.shipmentId);
        }
      },
    })
    .addStep({
      name: 'SendConfirmation',
      execute: async (ctx) => {
        await services.notification.sendOrderConfirmation({
          customerId: ctx.customerId,
          orderId: ctx.orderId,
          shipmentId: ctx.shipmentId!,
        });
      },
      compensate: async (ctx) => {
        // Notification compensation: send cancellation notice
        await services.notification.sendOrderCancellation({
          customerId: ctx.customerId,
          orderId: ctx.orderId,
          reason: 'Order processing failed',
        });
      },
    });
}

// Usage
async function handleCreateOrder(command: CreateOrderCommand): Promise<OrderResult> {
  const saga = createOrderFulfillmentSaga(services);
  const context: OrderFulfillmentContext = {
    orderId: generateId(),
    customerId: command.customerId,
    items: command.items,
    totalAmount: command.items.reduce((sum, i) => sum + i.price * i.quantity, 0),
  };

  const result = await saga.execute(context);

  if (result.success) {
    return { status: 'confirmed', orderId: context.orderId };
  } else {
    return {
      status: 'failed',
      orderId: context.orderId,
      reason: result.error?.message || 'Unknown failure',
      failedAt: result.failedStep,
    };
  }
}
```


### Idempotent Event Consumer with Deduplication

```java
/**
 * Idempotent event consumer that ensures exactly-once processing semantics.
 * Uses an idempotency table to track processed event IDs and prevent
 * duplicate processing on redelivery.
 */
@Service
public class IdempotentEventConsumer {
    private final JdbcTemplate jdbc;
    private final TransactionTemplate transactionTemplate;
    private final Map<String, EventHandler<?>> handlers = new HashMap<>();

    /**
     * Process an event with exactly-once semantics.
     * The event processing and idempotency record are committed atomically
     * in the same database transaction.
     */
    public <T extends DomainEvent> void processEvent(EventEnvelope<T> envelope) {
        String eventId = envelope.getEventId();
        String eventType = envelope.getEventType();

        // Check if already processed (fast path, no transaction needed)
        if (isAlreadyProcessed(eventId)) {
            log.debug("Skipping duplicate event: {} ({})", eventId, eventType);
            metrics.counter("events.duplicates", "type", eventType).increment();
            return;
        }

        // Process within transaction: handler + idempotency record are atomic
        transactionTemplate.executeWithoutResult(status -> {
            // Double-check within transaction (handles race condition)
            if (isAlreadyProcessed(eventId)) {
                return;
            }

            // Find and execute the appropriate handler
            EventHandler<T> handler = (EventHandler<T>) handlers.get(eventType);
            if (handler == null) {
                log.warn("No handler registered for event type: {}", eventType);
                return;
            }

            try {
                handler.handle(envelope.getPayload(), envelope.getMetadata());

                // Record successful processing
                markAsProcessed(eventId, eventType);
                metrics.counter("events.processed", "type", eventType).increment();
            } catch (RetryableException e) {
                // Retryable: throw to trigger message redelivery
                throw e;
            } catch (Exception e) {
                // Non-retryable: mark as failed, send to DLQ
                markAsFailed(eventId, eventType, e);
                metrics.counter("events.failed", "type", eventType).increment();
                log.error("Non-retryable failure processing event {}", eventId, e);
            }
        });
    }

    private boolean isAlreadyProcessed(String eventId) {
        Integer count = jdbc.queryForObject(
            "SELECT COUNT(*) FROM processed_events WHERE event_id = ?",
            Integer.class, eventId
        );
        return count != null && count > 0;
    }

    private void markAsProcessed(String eventId, String eventType) {
        jdbc.update("""
            INSERT INTO processed_events (event_id, event_type, processed_at)
            VALUES (?, ?, NOW())
            ON CONFLICT (event_id) DO NOTHING
            """, eventId, eventType);
    }

    private void markAsFailed(String eventId, String eventType, Exception error) {
        jdbc.update("""
            INSERT INTO dead_letter_queue (event_id, event_type, error_message,
                stack_trace, failed_at)
            VALUES (?, ?, ?, ?, NOW())
            """, eventId, eventType, error.getMessage(),
            ExceptionUtils.getStackTrace(error));
    }

    public <T extends DomainEvent> void registerHandler(
            String eventType, EventHandler<T> handler) {
        handlers.put(eventType, handler);
    }
}

/**
 * Outbox pattern: ensures events are published reliably by storing them
 * in the same database transaction as the business operation.
 * A separate process polls the outbox and publishes to the message broker.
 */
@Service
public class TransactionalOutbox {
    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    /**
     * Store event in outbox table within the current transaction.
     * Called from within the same transaction as the business operation.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public void storeEvent(DomainEvent event, String aggregateId, String aggregateType) {
        jdbc.update("""
            INSERT INTO outbox (event_id, aggregate_id, aggregate_type,
                event_type, payload, created_at, published)
            VALUES (?, ?, ?, ?, ?::jsonb, NOW(), false)
            """,
            event.getEventId(),
            aggregateId,
            aggregateType,
            event.getClass().getSimpleName(),
            serialize(event)
        );
    }

    /**
     * Outbox publisher: polls for unpublished events and sends to broker.
     * Runs as a scheduled task with leader election to prevent duplicates.
     */
    @Scheduled(fixedDelay = 100) // Poll every 100ms
    @LeaderOnly // Only one instance publishes
    public void publishPendingEvents() {
        List<OutboxEntry> pending = jdbc.query("""
            SELECT * FROM outbox
            WHERE published = false
            ORDER BY created_at ASC
            LIMIT 100
            FOR UPDATE SKIP LOCKED
            """, outboxRowMapper);

        for (OutboxEntry entry : pending) {
            try {
                messageBroker.publish(
                    entry.getAggregateType() + "." + entry.getEventType(),
                    entry.getPayload(),
                    Map.of(
                        "eventId", entry.getEventId(),
                        "aggregateId", entry.getAggregateId(),
                        "timestamp", entry.getCreatedAt().toString()
                    )
                );

                jdbc.update(
                    "UPDATE outbox SET published = true, published_at = NOW() WHERE event_id = ?",
                    entry.getEventId()
                );
            } catch (Exception e) {
                log.error("Failed to publish outbox event: {}", entry.getEventId(), e);
                // Will be retried on next poll
                break; // Preserve ordering
            }
        }
    }
}
```

## Common Pitfalls

- Treating events as commands: events represent facts that have already happened ("OrderCreated"), while commands represent requests that may be rejected ("CreateOrder"). Naming events as commands (e.g., "CreateOrder" instead of "OrderCreated") confuses the temporal semantics and leads to designs where consumers try to validate or reject events that have already been committed. Events are immutable facts; commands are requests with uncertain outcomes.

- Not handling event ordering and out-of-order delivery: message brokers may deliver events out of order, especially during retries or partition rebalancing. If your consumer assumes events arrive in order (e.g., "OrderCreated" before "OrderShipped"), out-of-order delivery causes state corruption. Design consumers to handle out-of-order events: use version numbers to detect gaps, buffer events until prerequisites arrive, or design state machines that reject invalid transitions gracefully.

- Ignoring the dual-write problem: writing to a database and publishing an event are two separate operations that cannot be made atomic without special patterns. If the database write succeeds but the event publish fails (or vice versa), the system becomes inconsistent. Use the transactional outbox pattern (store events in the same database transaction, publish asynchronously) or event sourcing (the event store IS the database) to eliminate dual-write inconsistency.

- Building overly large event payloads that couple producer and consumer schemas: including the entire entity state in every event creates tight coupling between producer and consumer data models. When the producer adds a field, all consumers must update their deserialization. Prefer thin events (event type + entity ID + changed fields) that consumers can enrich by querying the source if they need additional data. This reduces coupling at the cost of additional queries.

- Not implementing dead letter queues and poison message handling: a single malformed event that causes a consumer to crash will be redelivered infinitely, blocking all subsequent events in that partition. Implement retry limits (3-5 attempts with exponential backoff), dead letter queues for events that exceed retry limits, and alerting on DLQ growth. Provide tooling to inspect, fix, and replay DLQ events.

- Underestimating the complexity of saga compensation: compensation actions are not simple "undo" operations. A payment refund is not the inverse of a charge (it creates a new transaction, may take days to process, and has different failure modes). Design compensation actions as first-class operations with their own error handling, retries, and monitoring. Accept that some compensations may require manual intervention and build tooling for operators to resolve stuck sagas.

- Creating event storms through cascading reactions: service A publishes an event, service B reacts by publishing another event, service C reacts to that, creating an unbounded chain of events. Without careful design, this leads to infinite loops or exponential event amplification. Use correlation IDs to trace event chains, implement circuit breakers on event consumers, and design explicit boundaries for event propagation.

## Real-World Use Cases

**Uber's Event-Driven Architecture (Cadence/Temporal)**: Uber processes millions of ride events per second using an event-driven architecture built on Apache Kafka. Their workflow engine (originally Cadence, now open-sourced as Temporal) orchestrates complex multi-step processes like ride matching, pricing, payment, and driver payouts. Each ride generates dozens of events (ride requested, driver matched, trip started, trip completed, payment processed) that flow through independent services. Temporal provides durable execution guarantees: workflows survive process crashes and infrastructure failures by persisting their state at each step. This enables Uber to handle the complexity of coordinating multiple services (matching, routing, pricing, payments, notifications) while maintaining reliability at massive scale.

**Netflix Event Sourcing for Content Lifecycle**: Netflix uses event sourcing to track the complete lifecycle of content from acquisition through encoding, quality assurance, and global distribution. Every state change (content ingested, encoding started, quality check passed, available in region X) is stored as an immutable event. This enables temporal queries ("what was the state of this title's availability at 3pm yesterday?"), complete audit trails for content licensing compliance, and the ability to rebuild any derived view by replaying events. Their system processes millions of content state events daily across hundreds of microservices.

**Shopify's Event-Driven Order Processing**: Shopify processes millions of orders daily using an event-driven architecture where order events flow through multiple independent services. When a customer places an order, an "OrderCreated" event triggers parallel processing: inventory reservation, payment capture, fraud detection, tax calculation, and merchant notification. Each service processes events independently and publishes its own events upon completion. The saga pattern coordinates the overall workflow: if fraud detection flags an order after payment is captured, a compensation event triggers a refund. Shopify uses Kafka with exactly-once semantics (idempotent producers + transactional consumers) to ensure no orders are lost or duplicated.

**Event-Driven Architecture at LinkedIn (Apache Kafka Origin)**: LinkedIn created Apache Kafka specifically to solve their event-driven architecture needs. Their system processes trillions of events per day across hundreds of topics. Events include user activity (profile views, connection requests, content interactions), system metrics, and data change events from databases (via Debezium CDC). LinkedIn uses CQRS extensively: write-optimized services handle user actions, while read-optimized services maintain denormalized views for the feed, search index, and recommendation engine. Each read model is rebuilt from the event stream, enabling independent optimization and scaling of read and write paths.

## Interview Questions

**Q: Explain the difference between choreography and orchestration in saga patterns. When would you choose each?**

A: In choreography, each service listens for events and decides independently what to do next. Service A publishes "OrderCreated", Service B hears it and reserves inventory, publishes "InventoryReserved", Service C hears that and processes payment. There is no central coordinator. In orchestration, a saga orchestrator explicitly tells each service what to do: "Service B, reserve inventory for order X", waits for the response, then "Service C, charge payment for order X". Choose choreography when: services are truly independent, the workflow is simple (3-4 steps), and you want maximum decoupling. Choose orchestration when: the workflow is complex (5+ steps with conditional logic), you need visibility into the overall process state, compensation logic is complex, or you need to add/modify steps frequently. Choreography's weakness is that the workflow logic is distributed across services, making it hard to understand and debug. Orchestration's weakness is that the orchestrator becomes a single point of failure and a coupling point. In practice, most production systems use orchestration for complex business workflows and choreography for simple event propagation.

**Q: How do you achieve exactly-once processing in an event-driven system?**

A: True exactly-once delivery is impossible in distributed systems (proven by the Two Generals Problem). Instead, achieve effectively-once processing through idempotent consumers combined with at-least-once delivery. The pattern: (1) assign a unique ID to every event at the producer, (2) the consumer checks an idempotency table before processing (has this event ID been processed?), (3) process the event and record the event ID in the same database transaction (atomic), (4) acknowledge the message to the broker only after the transaction commits. If the consumer crashes after processing but before acknowledging, the broker redelivers the event, but the idempotency check prevents duplicate processing. For the producer side, use the transactional outbox pattern: store events in a database table within the business transaction, then publish them asynchronously. This ensures events are published if and only if the business operation committed. Kafka also provides idempotent producers (deduplication at the broker level) and transactional writes (atomic writes across multiple partitions).

**Q: Design an event sourcing system for a banking application. How do you handle snapshots and projections?**

A: The event store captures all account state changes as immutable events: AccountOpened, MoneyDeposited, MoneyWithdrawn, TransferInitiated, TransferCompleted. Current balance is derived by replaying all events for an account. For performance, take periodic snapshots: after every 100 events, store the current state (balance, status, last transaction) as a snapshot. To load an account, read the latest snapshot and replay only events after it. Projections are read-optimized views built from the event stream: a "transaction history" projection stores events in a format optimized for the statement page, a "balance" projection maintains current balances for quick lookups, and an "analytics" projection aggregates data for reporting. Each projection is an independent consumer that can be rebuilt from scratch by replaying all events. For consistency, the write side (event store) is the source of truth. Projections are eventually consistent but can be made strongly consistent for critical reads by reading directly from the event store. Handle schema evolution by versioning events and using upcasters that transform old event formats to new ones during replay.

**Q: How would you handle a scenario where a saga compensation fails?**

A: Compensation failure is one of the hardest problems in distributed systems. First, implement retries with exponential backoff for transient failures (network timeouts, temporary unavailability). If retries are exhausted, escalate: (1) store the failed compensation in a "stuck sagas" table with full context (saga ID, step, error, original event), (2) alert operations team via PagerDuty/Slack, (3) provide a dashboard showing stuck sagas with one-click retry and manual resolution options. For the system to remain consistent during the stuck period, design compensations to be safe to retry (idempotent) and safe to delay (the system should be in a valid, if suboptimal, state). For example, if a refund compensation fails, the customer still has their money charged but the order is cancelled. The system is inconsistent but not dangerous. The operations team can manually trigger the refund. Design your saga state machine to track compensation status separately from forward progress, and implement a "compensation timeout" after which the saga is flagged for manual intervention.

## Production Tips

- Implement comprehensive event tracing with correlation IDs that flow through the entire event chain. When a user action triggers a cascade of events across multiple services, every event in the chain should carry the original correlation ID. This enables end-to-end debugging: given a user complaint, trace the complete event flow from initial trigger through all downstream effects. Combine with distributed tracing (OpenTelemetry) to visualize the event flow as a trace with spans for each processing step.

- Monitor consumer lag (the difference between the latest published event and the latest consumed event) as a primary health metric. Consumer lag indicates how far behind a consumer is from real-time. Alert when lag exceeds your SLA threshold (e.g., if your system promises 30-second eventual consistency, alert when lag exceeds 30 seconds). Sudden lag increases indicate consumer failures, slow processing, or traffic spikes that exceed consumer capacity. Auto-scale consumers based on lag metrics to maintain processing throughput.

- Design event schemas for evolution from day one. Use a schema registry (Confluent Schema Registry, AWS Glue) to enforce backward compatibility rules: new fields must be optional with defaults, existing fields cannot be removed or have their types changed, and enum values can only be added (not removed). Version your schemas and test compatibility before deployment. This prevents the scenario where a producer deploys a schema change that breaks all consumers simultaneously.

- Implement event replay capabilities for disaster recovery and debugging. Store all events in a durable, ordered log (Kafka with long retention, or a dedicated event store database). When a consumer's state becomes corrupted or a bug is discovered, rebuild the consumer's state by replaying events from a known-good point. This requires consumers to be deterministic: given the same sequence of events, they must produce the same state. Test replay regularly as part of disaster recovery drills.

## Related Topics

- [Distributed Systems](./distributed-systems.md) — Event-driven architecture is built on distributed systems primitives including message delivery guarantees, ordering, and partition tolerance
- [Consistency Models](./consistency-models.md) — EDA systems are inherently eventually consistent; understanding consistency models helps reason about the staleness guarantees of event-driven projections
- [Database Sharding](./database-sharding.md) — Event sourcing and CQRS enable independent scaling of read and write models, complementing sharding strategies for high-throughput systems
- [API Design](./api-design.md) — Webhooks and async APIs extend synchronous API design with event-driven notification patterns for real-time integrations
