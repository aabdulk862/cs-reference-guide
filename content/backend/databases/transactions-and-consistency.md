# Transactions and Consistency

## Quick Reference

- ACID properties: Atomicity (all-or-nothing), Consistency (valid state transitions), Isolation (concurrent transactions don't interfere), Durability (committed data survives failures)
- Isolation levels from weakest to strongest: Read Uncommitted, Read Committed, Repeatable Read, Serializable
- PostgreSQL default is Read Committed; MySQL InnoDB default is Repeatable Read
- MVCC (Multi-Version Concurrency Control) provides non-blocking reads by maintaining multiple versions of each row
- Distributed transactions use 2PC (Two-Phase Commit) or saga patterns for cross-service consistency
- Optimistic concurrency control uses version numbers to detect conflicts at commit time
- Pessimistic concurrency control uses locks (SELECT FOR UPDATE) to prevent conflicts
- CAP theorem: distributed systems can provide at most two of Consistency, Availability, and Partition tolerance

## When to Use

Understanding transactions and consistency is critical whenever you are building systems that modify shared data, especially under concurrent access. Apply strict ACID transactions for financial operations, inventory management, and any domain where partial updates would leave the system in an invalid state. Use optimistic concurrency control for low-contention workloads where conflicts are rare (content editing, configuration updates). Use pessimistic locking for high-contention scenarios where conflicts are frequent and retry costs are high (seat reservations, auction bidding). Distributed consistency patterns (sagas, eventual consistency) are necessary in microservice architectures where data spans multiple services and databases, making traditional ACID transactions impossible. The choice between strong and eventual consistency should be driven by business requirements — not all data needs the same consistency guarantees, and over-constraining consistency limits scalability and availability.

## Code Examples

### Transaction Isolation Levels

```sql
-- Demonstrate Read Committed vs Repeatable Read behavior
-- Session 1: Read Committed (PostgreSQL default)
BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED;
SELECT balance FROM accounts WHERE account_id = 'A001';  -- Returns 1000

-- Meanwhile, Session 2 commits: UPDATE accounts SET balance = 500 WHERE account_id = 'A001';

SELECT balance FROM accounts WHERE account_id = 'A001';  -- Returns 500 (sees committed change)
COMMIT;

-- Session 1: Repeatable Read
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ;
SELECT balance FROM accounts WHERE account_id = 'A001';  -- Returns 1000

-- Meanwhile, Session 2 commits: UPDATE accounts SET balance = 500 WHERE account_id = 'A001';

SELECT balance FROM accounts WHERE account_id = 'A001';  -- Still returns 1000 (snapshot isolation)
-- If we try to UPDATE the same row, we get a serialization failure:
UPDATE accounts SET balance = balance - 100 WHERE account_id = 'A001';
-- ERROR: could not serialize access due to concurrent update
ROLLBACK;

-- Serializable isolation: prevents phantom reads and write skew
BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
SELECT SUM(balance) FROM accounts WHERE owner_id = 'user-1';  -- Returns 2000
-- Business rule: total balance across all accounts must stay >= 1000
UPDATE accounts SET balance = balance - 800 WHERE account_id = 'A001';
COMMIT;  -- May fail with serialization error if concurrent transaction also modified these accounts
```

### Optimistic Concurrency Control

```java
// JPA entity with version field for optimistic locking
@Entity
@Table(name = "products")
public class Product {
    @Id
    private UUID id;

    private String name;
    private BigDecimal price;
    private int stockQuantity;

    @Version  // JPA manages this automatically
    private long version;

    public void decrementStock(int quantity) {
        if (this.stockQuantity < quantity) {
            throw new InsufficientStockException(this.id, quantity, this.stockQuantity);
        }
        this.stockQuantity -= quantity;
    }
}

// Service layer with retry on optimistic lock failure
@Service
@RequiredArgsConstructor
public class InventoryService {

    private final ProductRepository productRepository;

    @Retryable(
        retryFor = OptimisticLockingFailureException.class,
        maxAttempts = 3,
        backoff = @Backoff(delay = 100, multiplier = 2)
    )
    @Transactional
    public void reserveStock(UUID productId, int quantity) {
        Product product = productRepository.findById(productId)
            .orElseThrow(() -> new ProductNotFoundException(productId));

        product.decrementStock(quantity);
        productRepository.save(product);
        // If another transaction modified this product since we read it,
        // JPA throws OptimisticLockingFailureException and @Retryable retries
    }
}

// Manual optimistic locking with SQL
// UPDATE products SET stock_quantity = stock_quantity - :qty, version = version + 1
// WHERE product_id = :id AND version = :expectedVersion;
// If affected rows = 0, another transaction modified the row → retry
```

### Pessimistic Locking

```sql
-- SELECT FOR UPDATE acquires a row-level exclusive lock
-- Other transactions attempting to lock the same rows will block until this transaction completes
BEGIN;
SELECT * FROM seats
WHERE flight_id = 'FL-123' AND seat_number = '14A' AND status = 'available'
FOR UPDATE;

-- If the row exists and is available, we have an exclusive lock
UPDATE seats SET status = 'reserved', reserved_by = 'user-456', reserved_at = NOW()
WHERE flight_id = 'FL-123' AND seat_number = '14A';
COMMIT;

-- SKIP LOCKED: non-blocking alternative for work queue patterns
-- Each worker picks up unprocessed tasks without blocking on locked rows
BEGIN;
SELECT task_id, payload FROM task_queue
WHERE status = 'pending'
ORDER BY priority DESC, created_at ASC
LIMIT 10
FOR UPDATE SKIP LOCKED;

UPDATE task_queue SET status = 'processing', worker_id = 'worker-3', started_at = NOW()
WHERE task_id IN (...selected task IDs...);
COMMIT;

-- NOWAIT: fail immediately if lock cannot be acquired
BEGIN;
SELECT * FROM accounts WHERE account_id = 'A001' FOR UPDATE NOWAIT;
-- If another transaction holds the lock: ERROR: could not obtain lock on row
-- Application can immediately return "resource busy" to the user
```

### Distributed Saga Pattern

```java
// Saga orchestrator for order processing across multiple services
@Service
@RequiredArgsConstructor
public class OrderSagaOrchestrator {

    private final PaymentService paymentService;
    private final InventoryService inventoryService;
    private final ShippingService shippingService;
    private final OrderRepository orderRepository;

    @Transactional
    public OrderResult processOrder(Order order) {
        SagaContext context = new SagaContext(order.getId());

        try {
            // Step 1: Reserve inventory
            InventoryReservation reservation = inventoryService.reserve(order.getItems());
            context.addCompensation(() -> inventoryService.release(reservation.getId()));

            // Step 2: Process payment
            PaymentResult payment = paymentService.charge(order.getPaymentDetails());
            context.addCompensation(() -> paymentService.refund(payment.getId()));

            // Step 3: Schedule shipping
            ShipmentResult shipment = shippingService.schedule(order.getShippingDetails());
            context.addCompensation(() -> shippingService.cancel(shipment.getId()));

            // All steps succeeded
            order.setStatus(OrderStatus.CONFIRMED);
            orderRepository.save(order);
            return OrderResult.success(order);

        } catch (Exception e) {
            // Execute compensating transactions in reverse order
            context.compensate();
            order.setStatus(OrderStatus.FAILED);
            order.setFailureReason(e.getMessage());
            orderRepository.save(order);
            return OrderResult.failure(order, e);
        }
    }
}

// Choreography-based saga with events
@Component
@RequiredArgsConstructor
public class PaymentEventHandler {

    private final OrderRepository orderRepository;
    private final EventPublisher eventPublisher;

    @EventListener
    @Transactional
    public void handlePaymentCompleted(PaymentCompletedEvent event) {
        Order order = orderRepository.findById(event.getOrderId())
            .orElseThrow();
        order.markPaymentReceived(event.getPaymentId());
        orderRepository.save(order);
        eventPublisher.publish(new OrderReadyForShipmentEvent(order.getId()));
    }

    @EventListener
    @Transactional
    public void handlePaymentFailed(PaymentFailedEvent event) {
        Order order = orderRepository.findById(event.getOrderId())
            .orElseThrow();
        order.markPaymentFailed(event.getReason());
        orderRepository.save(order);
        // Publish compensation event
        eventPublisher.publish(new ReleaseInventoryEvent(order.getId()));
    }
}
```

### Eventual Consistency with Outbox Pattern

```sql
-- Outbox table ensures atomicity between local state change and event publishing
CREATE TABLE outbox_events (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_type VARCHAR(100) NOT NULL,
    aggregate_id UUID NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    published_at TIMESTAMP WITH TIME ZONE,  -- NULL until published
    retry_count INTEGER DEFAULT 0
);

CREATE INDEX idx_outbox_unpublished ON outbox_events (created_at)
    WHERE published_at IS NULL;
```

```java
// Transactional outbox: write event in same transaction as state change
@Service
@RequiredArgsConstructor
public class OrderService {

    private final OrderRepository orderRepository;
    private final OutboxRepository outboxRepository;

    @Transactional  // Both writes in same transaction = atomic
    public Order createOrder(CreateOrderRequest request) {
        Order order = Order.from(request);
        order = orderRepository.save(order);

        // Write event to outbox table (same transaction)
        OutboxEvent event = OutboxEvent.builder()
            .aggregateType("Order")
            .aggregateId(order.getId())
            .eventType("OrderCreated")
            .payload(objectMapper.writeValueAsString(new OrderCreatedPayload(order)))
            .build();
        outboxRepository.save(event);

        return order;
    }
}

// Separate publisher polls outbox and publishes to message broker
@Scheduled(fixedDelay = 1000)
@Transactional
public void publishOutboxEvents() {
    List<OutboxEvent> events = outboxRepository.findUnpublished(100);
    for (OutboxEvent event : events) {
        try {
            kafkaTemplate.send(event.getEventType(), event.getAggregateId().toString(),
                event.getPayload());
            event.markPublished();
        } catch (Exception e) {
            event.incrementRetryCount();
            if (event.getRetryCount() > MAX_RETRIES) {
                event.markFailed();
                alertService.notify("Outbox event failed: " + event.getEventId());
            }
        }
    }
    outboxRepository.saveAll(events);
}
```

## Common Pitfalls

- **Long-running transactions holding locks**: Transactions that perform external API calls, send emails, or do heavy computation while holding database locks block other transactions and can cause connection pool exhaustion. Keep transactions short — perform external operations outside the transaction boundary, or use the outbox pattern to decouple side effects from the database transaction.

- **Deadlocks from inconsistent lock ordering**: When two transactions lock resources in different orders (T1 locks A then B, T2 locks B then A), deadlocks occur. Always acquire locks in a consistent, deterministic order (e.g., by primary key ascending). The database will detect and abort one transaction, but frequent deadlocks indicate a design problem.

- **Lost updates with Read Committed isolation**: Two transactions read the same row, compute new values based on the read, and write back. The second write overwrites the first without seeing it. Use `SELECT FOR UPDATE` (pessimistic) or version columns (optimistic) to prevent lost updates. Repeatable Read isolation also prevents this in PostgreSQL.

- **Saga compensation failures**: If a compensating transaction fails (e.g., refund API is down), the system is left in an inconsistent state. Implement compensation with retries, idempotency keys, and a dead-letter mechanism for manual resolution. Never assume compensation will succeed on the first attempt.

- **Mixing isolation levels within a workflow**: Using different isolation levels for different queries within the same logical operation can lead to subtle inconsistencies. If one query sees committed data and another sees a snapshot, the application may make decisions based on contradictory views of the data. Use a consistent isolation level for all queries within a business operation.

- **Ignoring serialization failures**: Repeatable Read and Serializable isolation levels can throw serialization errors when concurrent transactions conflict. Applications must catch these errors and retry the entire transaction from the beginning (not just the failed statement). Without retry logic, these isolation levels provide no benefit over Read Committed.

## Real-World Use Cases

- **Banking fund transfers**: A transfer between accounts requires debiting one account and crediting another atomically. Using a single database transaction with Serializable isolation ensures that concurrent transfers cannot overdraw an account. The transaction either completes both operations or neither, maintaining the invariant that total funds across all accounts remain constant.

- **E-commerce inventory reservation**: During flash sales, thousands of concurrent requests attempt to reserve limited inventory. Pessimistic locking with `SELECT FOR UPDATE` on the inventory row ensures only one transaction can decrement stock at a time, preventing overselling. The short lock duration (milliseconds) keeps throughput acceptable while maintaining correctness.

- **Distributed order processing**: An order spanning payment, inventory, and shipping services uses the saga pattern with choreography. Each service publishes domain events after completing its local transaction. If payment fails after inventory is reserved, a compensating event triggers inventory release. The outbox pattern ensures events are published reliably even if the message broker is temporarily unavailable.

- **Collaborative document editing**: Multiple users editing the same document use optimistic concurrency with operational transformation or CRDTs. Each edit carries a version vector, and conflicts are detected and resolved automatically. The system provides eventual consistency with conflict-free convergence, prioritizing availability and partition tolerance over strict consistency.

## Interview Questions

**Q: Explain the difference between optimistic and pessimistic concurrency control.**

A: Pessimistic control acquires locks before modifying data, preventing conflicts by blocking concurrent access. It is appropriate when conflicts are frequent and retry costs are high (seat reservations, financial transactions). Optimistic control allows concurrent access without locks, detecting conflicts at commit time via version numbers. If a conflict is detected, the transaction is retried. It is appropriate when conflicts are rare and the cost of occasional retries is lower than the cost of holding locks (content updates, configuration changes).

**Q: What is the difference between Read Committed and Repeatable Read isolation?**

A: Read Committed sees only data committed before each individual statement executes — different statements within the same transaction may see different snapshots if other transactions commit between them. Repeatable Read sees a consistent snapshot taken at the start of the transaction — all statements see the same data regardless of concurrent commits. Repeatable Read prevents non-repeatable reads and phantom reads but may throw serialization errors when concurrent transactions modify the same data.

**Q: How would you implement distributed transactions across microservices?**

A: Avoid traditional 2PC (Two-Phase Commit) in microservices due to its blocking nature, tight coupling, and single point of failure at the coordinator. Instead, use the saga pattern: either orchestration (a central coordinator sends commands and handles responses) or choreography (services emit events and react to others' events). Each service performs its local transaction and publishes an event. If a step fails, compensating transactions undo previous steps. Use the outbox pattern to ensure atomic local-state-change-plus-event-publishing, and implement idempotent consumers to handle duplicate event delivery.

**Q: What is the CAP theorem and how does it apply to database selection?**

A: The CAP theorem states that a distributed system can provide at most two of three guarantees: Consistency (all nodes see the same data), Availability (every request receives a response), and Partition tolerance (the system continues operating despite network partitions). Since network partitions are inevitable in distributed systems, the real choice is between CP (consistent but may be unavailable during partitions — traditional RDBMS, ZooKeeper) and AP (available but may return stale data during partitions — Cassandra, DynamoDB). Most modern systems offer tunable consistency, allowing different operations to choose their consistency level.

## Production Tips

- **Set statement timeouts to prevent runaway queries**: Configure `statement_timeout` (PostgreSQL) or `max_execution_time` (MySQL) to kill queries that exceed expected duration. A missing WHERE clause on a DELETE or an unexpected full table scan can lock resources for minutes. Set aggressive timeouts (5-30 seconds for OLTP) and investigate any query that hits the limit.

- **Monitor lock contention and deadlocks**: Track `pg_stat_activity` for queries in `waiting` state, and `pg_locks` for lock conflicts. Set up alerts for deadlock frequency (available in PostgreSQL logs) and long-held locks. High lock contention often indicates a schema design issue (too-coarse locking granularity) or a missing index causing lock escalation.

- **Implement idempotency for retry safety**: Any operation that may be retried (due to network timeouts, serialization failures, or saga compensation) must be idempotent. Use idempotency keys stored in a dedicated table, and check for existing results before processing. This is especially critical for payment operations where duplicate charges are unacceptable.

- **Use advisory locks for application-level coordination**: When you need to serialize access to a logical resource that does not correspond to a single database row (e.g., "only one instance should process exports for tenant X"), use PostgreSQL advisory locks (`pg_advisory_lock`). They are lightweight, do not conflict with row locks, and are automatically released at transaction end or session end.

## Related Topics

- [Database Design Patterns](./database-design-patterns.md) — Schema design decisions that affect transaction behavior and concurrency
- [SQL Performance Tuning](./sql-performance-tuning.md) — Lock contention and transaction duration impact on query performance
- [MongoDB and Document Databases](./mongodb.md) — MongoDB multi-document transactions and eventual consistency patterns
