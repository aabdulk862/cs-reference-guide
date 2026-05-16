# Messaging Patterns and Architecture

## Quick Reference

- Event-driven architecture (EDA) uses events as the primary communication mechanism between services
- Command vs. Event: commands request an action (imperative); events notify that something happened (past tense)
- Pub/Sub pattern: producers publish events without knowing consumers; consumers subscribe to event types independently
- Point-to-point: each message is consumed by exactly one consumer (work queue / competing consumers pattern)
- Request-reply: synchronous-style communication over async messaging using correlation IDs and reply queues
- Event sourcing: store state changes as immutable events; derive current state by replaying the event log
- CQRS (Command Query Responsibility Segregation): separate write model (commands) from read model (queries)
- Saga pattern: coordinate distributed transactions through a sequence of local transactions with compensating actions

## When to Use

Messaging patterns are essential when building distributed systems that need to decouple services in time (asynchronous processing), space (services do not need to know each other's locations), and implementation (services can use different technologies). Apply event-driven architecture when you need loose coupling between services that evolve independently, when you need to scale producers and consumers independently, or when you need temporal decoupling where producers can continue operating even when consumers are temporarily unavailable. Use CQRS when read and write workloads have vastly different scaling requirements or when the read model needs a different structure than the write model. Use event sourcing when you need a complete audit trail, temporal queries, or the ability to rebuild state from scratch. Use the saga pattern when a business process spans multiple services and traditional ACID transactions are not feasible. The choice between Kafka and RabbitMQ depends on whether you need log-based persistence with replay (Kafka) or sophisticated routing with message deletion after consumption (RabbitMQ).

## Code Examples

### Event-Driven Architecture with Domain Events

```java
// Domain event definition
public sealed interface OrderEvent {
    UUID orderId();
    Instant occurredAt();

    record OrderCreated(UUID orderId, UUID customerId, List<OrderItem> items,
                        BigDecimal totalAmount, Instant occurredAt) implements OrderEvent {}

    record OrderPaymentReceived(UUID orderId, UUID paymentId,
                                BigDecimal amount, Instant occurredAt) implements OrderEvent {}

    record OrderShipped(UUID orderId, String trackingNumber,
                        String carrier, Instant occurredAt) implements OrderEvent {}

    record OrderCancelled(UUID orderId, String reason,
                          UUID cancelledBy, Instant occurredAt) implements OrderEvent {}
}

// Event publisher abstraction
public interface EventPublisher {
    <T> void publish(String topic, String key, T event);
    <T> void publish(String topic, String key, T event, Map<String, String> headers);
}

// Kafka implementation
@Component
@RequiredArgsConstructor
public class KafkaEventPublisher implements EventPublisher {

    private final KafkaTemplate<String, Object> kafkaTemplate;
    private final ObjectMapper objectMapper;

    @Override
    public <T> void publish(String topic, String key, T event, Map<String, String> headers) {
        ProducerRecord<String, Object> record = new ProducerRecord<>(topic, key, event);
        headers.forEach((k, v) -> record.headers().add(k, v.getBytes(StandardCharsets.UTF_8)));
        record.headers().add("event-type", event.getClass().getSimpleName().getBytes());
        record.headers().add("published-at", Instant.now().toString().getBytes());

        kafkaTemplate.send(record).whenComplete((result, ex) -> {
            if (ex != null) {
                log.error("Failed to publish event: topic={}, key={}, type={}",
                    topic, key, event.getClass().getSimpleName(), ex);
            }
        });
    }
}

// Event consumer with routing by event type
@Component
@RequiredArgsConstructor
public class OrderEventRouter {

    private final InventoryService inventoryService;
    private final NotificationService notificationService;
    private final AnalyticsService analyticsService;

    @KafkaListener(topics = "order-events", groupId = "order-event-router")
    public void routeEvent(ConsumerRecord<String, OrderEvent> record) {
        OrderEvent event = record.value();
        String eventType = new String(record.headers().lastHeader("event-type").value());

        switch (event) {
            case OrderEvent.OrderCreated created -> {
                inventoryService.reserveStock(created.items());
                notificationService.sendOrderConfirmation(created.customerId(), created.orderId());
                analyticsService.trackOrderCreated(created);
            }
            case OrderEvent.OrderCancelled cancelled -> {
                inventoryService.releaseStock(cancelled.orderId());
                notificationService.sendCancellationNotice(cancelled.orderId());
            }
            default -> log.debug("Unhandled event type: {}", eventType);
        }
    }
}
```

### CQRS Implementation

```java
// Command side: handles writes with full validation and business rules
@Service
@RequiredArgsConstructor
public class OrderCommandService {

    private final OrderRepository orderRepository;
    private final EventPublisher eventPublisher;

    @Transactional
    public UUID createOrder(CreateOrderCommand command) {
        // Validate business rules
        if (command.items().isEmpty()) {
            throw new InvalidOrderException("Order must have at least one item");
        }

        // Create aggregate and apply domain logic
        Order order = Order.create(command.customerId(), command.items());
        order.calculateTotals();
        order.validateInventoryAvailability();

        // Persist to write store (normalized, ACID)
        orderRepository.save(order);

        // Publish event for read model projection
        eventPublisher.publish("order-events", order.getId().toString(),
            new OrderEvent.OrderCreated(order.getId(), command.customerId(),
                command.items(), order.getTotalAmount(), Instant.now()));

        return order.getId();
    }
}

// Query side: optimized read model with denormalized data
@Service
@RequiredArgsConstructor
public class OrderQueryService {

    private final OrderReadRepository readRepository; // Elasticsearch or denormalized DB

    public Page<OrderSummaryView> searchOrders(OrderSearchCriteria criteria) {
        return readRepository.search(criteria);
    }

    public OrderDetailView getOrderDetail(UUID orderId) {
        return readRepository.findById(orderId)
            .orElseThrow(() -> new OrderNotFoundException(orderId));
    }
}

// Projection: builds read model from events
@Component
@RequiredArgsConstructor
public class OrderProjection {

    private final OrderReadRepository readRepository;

    @KafkaListener(topics = "order-events", groupId = "order-read-projection")
    public void project(OrderEvent event) {
        switch (event) {
            case OrderEvent.OrderCreated created -> {
                OrderSummaryView view = OrderSummaryView.builder()
                    .orderId(created.orderId())
                    .customerId(created.customerId())
                    .totalAmount(created.totalAmount())
                    .status("CREATED")
                    .itemCount(created.items().size())
                    .createdAt(created.occurredAt())
                    .build();
                readRepository.save(view);
            }
            case OrderEvent.OrderShipped shipped -> {
                readRepository.updateStatus(shipped.orderId(), "SHIPPED");
                readRepository.setTrackingNumber(shipped.orderId(), shipped.trackingNumber());
            }
            case OrderEvent.OrderCancelled cancelled -> {
                readRepository.updateStatus(cancelled.orderId(), "CANCELLED");
            }
            default -> {}
        }
    }
}
```

### Saga Pattern with Orchestration

```java
// Saga definition with steps and compensations
public class OrderSaga {

    private final List<SagaStep> steps = new ArrayList<>();
    private final List<SagaStep> completedSteps = new ArrayList<>();
    private SagaStatus status = SagaStatus.STARTED;

    public void addStep(String name, Runnable action, Runnable compensation) {
        steps.add(new SagaStep(name, action, compensation));
    }

    public SagaResult execute() {
        for (SagaStep step : steps) {
            try {
                step.action().run();
                completedSteps.add(step);
            } catch (Exception e) {
                status = SagaStatus.COMPENSATING;
                compensate();
                status = SagaStatus.FAILED;
                return SagaResult.failure(step.name(), e);
            }
        }
        status = SagaStatus.COMPLETED;
        return SagaResult.success();
    }

    private void compensate() {
        // Execute compensations in reverse order
        ListIterator<SagaStep> iterator = completedSteps.listIterator(completedSteps.size());
        while (iterator.hasPrevious()) {
            SagaStep step = iterator.previous();
            try {
                step.compensation().run();
            } catch (Exception e) {
                log.error("Compensation failed for step: {}", step.name(), e);
                // Alert for manual intervention
                alertService.critical("Saga compensation failure", step.name(), e);
            }
        }
    }
}

// Choreography-based saga with event handlers
@Component
public class PaymentSagaParticipant {

    @KafkaListener(topics = "saga-commands", groupId = "payment-saga")
    public void handleCommand(SagaCommand command) {
        if (command instanceof ProcessPaymentCommand cmd) {
            try {
                PaymentResult result = paymentGateway.charge(cmd.amount(), cmd.paymentMethod());
                eventPublisher.publish("saga-events", cmd.sagaId(),
                    new PaymentProcessedEvent(cmd.sagaId(), result.transactionId()));
            } catch (PaymentDeclinedException e) {
                eventPublisher.publish("saga-events", cmd.sagaId(),
                    new PaymentFailedEvent(cmd.sagaId(), e.getReason()));
            }
        } else if (command instanceof RefundPaymentCommand cmd) {
            paymentGateway.refund(cmd.transactionId());
            eventPublisher.publish("saga-events", cmd.sagaId(),
                new PaymentRefundedEvent(cmd.sagaId(), cmd.transactionId()));
        }
    }
}
```

### Choosing Between Kafka and RabbitMQ

```java
// Decision framework implementation
public class MessagingPlatformSelector {

    public MessagingPlatform recommend(WorkloadCharacteristics workload) {
        // Kafka strengths
        if (workload.requiresEventReplay()) return KAFKA;
        if (workload.throughputPerSecond() > 100_000) return KAFKA;
        if (workload.requiresEventSourcing()) return KAFKA;
        if (workload.hasMultipleIndependentConsumers()) return KAFKA;
        if (workload.requiresStreamProcessing()) return KAFKA;

        // RabbitMQ strengths
        if (workload.requiresComplexRouting()) return RABBITMQ;
        if (workload.requiresPriorityQueues()) return RABBITMQ;
        if (workload.requiresRequestReply()) return RABBITMQ;
        if (workload.requiresPerMessageTTL()) return RABBITMQ;
        if (workload.requiresMessageDeletionAfterConsumption()) return RABBITMQ;
        if (workload.throughputPerSecond() < 10_000) return RABBITMQ;

        // Default: Kafka for event-driven, RabbitMQ for task-driven
        return workload.isEventDriven() ? KAFKA : RABBITMQ;
    }
}

/*
 * Summary comparison:
 *
 * | Aspect              | Kafka                        | RabbitMQ                    |
 * |---------------------|------------------------------|-----------------------------|
 * | Model               | Distributed log              | Message broker              |
 * | Persistence         | Retained after consumption   | Deleted after ack           |
 * | Ordering            | Per-partition                | Per-queue (FIFO)            |
 * | Replay              | Yes (seek to any offset)     | No (consumed = gone)        |
 * | Routing             | Topic-based only             | Exchange types + bindings   |
 * | Throughput          | Millions/sec                 | Tens of thousands/sec       |
 * | Consumer model      | Pull (consumer polls)        | Push (broker delivers)      |
 * | Scaling             | Add partitions + consumers   | Add queues + consumers      |
 * | Use case            | Event streaming, CDC, logs   | Task queues, routing, RPC   |
 */
```

## Common Pitfalls

- **Treating events as commands**: Events describe what happened (past tense, immutable); commands request an action (imperative, can be rejected). Publishing commands as events creates tight coupling because the publisher assumes a specific consumer will act. Events should be self-contained facts that any number of consumers can interpret independently.

- **Event schema evolution without versioning**: Changing event schemas without backward compatibility breaks existing consumers. Use schema registries (Confluent Schema Registry, AWS Glue), include a version field in events, and follow compatible evolution rules (add optional fields, never remove or rename required fields). Consumers must tolerate unknown fields gracefully.

- **Saga without idempotent participants**: If a saga step is retried (due to network timeout or duplicate delivery), non-idempotent operations execute twice (double-charging a payment, double-reserving inventory). Every saga participant must be idempotent, using idempotency keys or conditional writes to ensure repeated execution produces the same result.

- **CQRS read model inconsistency during failures**: If the event projection fails after the command succeeds, the read model becomes stale. Implement retry logic with dead-letter handling for failed projections, and provide a mechanism to rebuild the read model from the event log. Users should understand that the read model may lag behind the write model by seconds.

- **Over-engineering with messaging**: Not every service interaction needs asynchronous messaging. Synchronous HTTP calls are simpler and appropriate when the caller needs an immediate response, when the operation is fast, and when the coupling is acceptable. Introducing messaging adds complexity (eventual consistency, ordering challenges, operational overhead) that must be justified by concrete benefits.

- **Ignoring message ordering in multi-partition topics**: When events for the same entity are spread across multiple partitions (wrong partitioning key), consumers may process them out of order. Always partition by the entity ID (customer ID, order ID) to ensure all events for one entity are processed sequentially by a single consumer.

## Real-World Use Cases

- **E-commerce order fulfillment with saga**: A marketplace coordinates order processing across payment, inventory, shipping, and notification services using an orchestrated saga. The saga coordinator publishes commands to each service's queue and listens for success/failure events. If payment succeeds but shipping fails, the coordinator publishes compensation commands to refund the payment and release inventory, maintaining consistency without distributed transactions.

- **Real-time recommendation engine with CQRS**: A streaming platform uses CQRS where the write model captures user interactions (views, likes, skips) as events in Kafka. Multiple read-model projections consume these events: one builds user preference vectors for recommendations, another builds trending content rankings, and a third builds social graphs for collaborative filtering. Each projection is optimized for its specific query pattern.

- **Financial audit trail with event sourcing**: A banking application stores all account operations as immutable events (deposits, withdrawals, transfers, fee assessments). The current balance is a projection derived from replaying events. Auditors can query the event store to reconstruct account state at any point in time. Regulatory reports are generated by replaying events through compliance-checking projections without affecting the production read model.

- **IoT fleet management with event-driven architecture**: A logistics company processes millions of GPS events per minute from delivery vehicles. Kafka ingests raw telemetry, Kafka Streams computes real-time metrics (speed, route deviation, idle time), and RabbitMQ distributes driver notifications and dispatch commands with priority routing. The separation allows the high-throughput ingestion path to operate independently from the lower-throughput command path.

## Interview Questions

**Q: When would you choose Kafka over RabbitMQ, and vice versa?**

A: Choose Kafka when you need event replay (consumers re-reading historical events), when multiple independent consumer groups need the same data, when throughput exceeds 100K messages/second, or when you need stream processing capabilities. Choose RabbitMQ when you need complex routing logic (topic patterns, header-based routing), priority queues, request-reply patterns, per-message TTL, or when messages should be deleted after consumption. Many production systems use both: Kafka for the event backbone and RabbitMQ for task distribution and routing.

**Q: Explain the difference between event sourcing and event-driven architecture.**

A: Event-driven architecture (EDA) is a communication pattern where services interact through events — it describes how services communicate. Event sourcing is a persistence pattern where state is stored as a sequence of immutable events rather than mutable current state — it describes how state is stored. You can have EDA without event sourcing (services communicate via events but store current state in a database) and event sourcing without EDA (a monolith stores state as events internally). They complement each other but are independent concepts.

**Q: How do you handle eventual consistency in a CQRS system?**

A: Accept that the read model may lag behind the write model by milliseconds to seconds. Strategies include: returning the write result directly to the user after a command (optimistic UI), polling the read model until the projection catches up (with timeout), using WebSocket notifications when the projection completes, or including a version/timestamp in responses so clients can detect stale data. For critical operations, read from the write model directly (bypassing CQRS for that specific query).

**Q: What is the outbox pattern and why is it needed?**

A: The outbox pattern solves the dual-write problem: when a service needs to update its database AND publish an event, doing both independently risks inconsistency (database updated but event lost, or event published but database write failed). The outbox pattern writes the event to an outbox table in the same database transaction as the state change. A separate process (CDC connector or poller) reads the outbox table and publishes events to the message broker. This guarantees that if the state change is committed, the event will eventually be published.

## Production Tips

- **Implement dead-letter handling from day one**: Every consumer should have a dead-letter strategy for messages that cannot be processed after retries. Without DLQ handling, poison messages block partition consumption (Kafka) or accumulate in queues (RabbitMQ). Monitor DLQ depth and set up alerts — messages in the DLQ represent data that needs manual intervention or bug fixes.

- **Schema registry for event contracts**: Use a schema registry (Confluent Schema Registry, AWS Glue Schema Registry) to enforce event schema compatibility. Configure producers to register schemas and consumers to validate against registered schemas. This catches breaking changes at deployment time rather than at runtime when consumers start failing.

- **Correlation IDs for distributed tracing**: Include a correlation ID in every message header, propagated from the original request through all downstream events and commands. This enables tracing a business operation across multiple services and message hops. Combine with distributed tracing (OpenTelemetry) for end-to-end visibility.

- **Consumer lag monitoring and alerting**: For Kafka, monitor consumer group lag per partition and alert when lag exceeds your SLA (e.g., more than 1000 messages or 30 seconds behind). For RabbitMQ, monitor queue depth and consumer utilization. Lag indicates either insufficient consumer capacity or processing bottlenecks that need investigation before they affect user experience.

## Related Topics

- [Apache Kafka](./apache-kafka.md) — Deep dive into Kafka's architecture, configuration, and operational patterns
- [RabbitMQ](./rabbitmq.md) — Deep dive into RabbitMQ's exchange model, acknowledgments, and clustering
- [Transactions and Consistency](../databases/transactions-and-consistency.md) — Distributed transaction patterns including sagas and outbox
