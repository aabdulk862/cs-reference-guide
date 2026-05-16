# Spring Data and Persistence

## Quick Reference

- Spring Data JPA provides repository abstractions that eliminate boilerplate CRUD code
- `JpaRepository<T, ID>` extends `CrudRepository` with pagination, sorting, and batch operations
- Query derivation: method names like `findByStatusAndCreatedAtAfter` auto-generate JPQL queries
- `@Query` annotation for custom JPQL or native SQL when derived queries become complex
- `@Transactional` on service methods manages transaction boundaries via AOP proxies
- Projections: interface-based and class-based projections for partial entity loading
- Auditing: `@CreatedDate`, `@LastModifiedDate`, `@CreatedBy` auto-populate audit fields
- Specifications API enables dynamic query composition for complex search criteria

## When to Use

Spring Data JPA is the standard persistence layer for Spring Boot applications connecting to relational databases. Use it when building CRUD-heavy applications where repository abstractions eliminate repetitive data access code, when you need pagination and sorting with minimal effort, when your domain model maps cleanly to relational tables, and when you want declarative transaction management without manual connection handling. Spring Data's query derivation is ideal for simple queries, while the `@Query` annotation and Specifications API handle complex dynamic queries. For read-heavy applications, projections and entity graphs optimize data loading by fetching only required columns. Understanding transaction propagation, isolation levels, and the N+1 query problem is essential for production performance. Spring Data also supports non-relational stores (MongoDB, Redis, Elasticsearch) with a consistent programming model, enabling polyglot persistence without learning entirely different APIs for each datastore.

## Code Examples

### Repository Definitions and Query Methods

```java
@Entity
@Table(name = "orders", indexes = {
    @Index(name = "idx_orders_customer_status", columnList = "customer_id, status"),
    @Index(name = "idx_orders_created_at", columnList = "created_at DESC")
})
public class Order {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "customer_id", nullable = false)
    private UUID customerId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private OrderStatus status;

    @OneToMany(cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @JoinColumn(name = "order_id")
    private List<OrderItem> items = new ArrayList<>();

    @Column(name = "total_amount", precision = 10, scale = 2)
    private BigDecimal totalAmount;

    @CreatedDate
    @Column(name = "created_at", updatable = false)
    private Instant createdAt;

    @LastModifiedDate
    @Column(name = "updated_at")
    private Instant updatedAt;

    @Version
    private Long version;  // Optimistic locking
}

public interface OrderRepository extends JpaRepository<Order, UUID> {

    // Derived query from method name
    Page<Order> findByCustomerIdAndStatus(UUID customerId, OrderStatus status, Pageable pageable);

    // Custom JPQL query
    @Query("SELECT o FROM Order o JOIN FETCH o.items WHERE o.id = :id")
    Optional<Order> findByIdWithItems(@Param("id") UUID id);

    // Native query for complex operations
    @Query(value = """
        SELECT o.* FROM orders o
        WHERE o.status = :status
        AND o.created_at > :since
        AND o.total_amount > :minAmount
        ORDER BY o.created_at DESC
        """, nativeQuery = true)
    List<Order> findRecentHighValueOrders(
        @Param("status") String status,
        @Param("since") Instant since,
        @Param("minAmount") BigDecimal minAmount);

    // Modifying query
    @Modifying
    @Query("UPDATE Order o SET o.status = :status WHERE o.id = :id AND o.version = :version")
    int updateStatus(@Param("id") UUID id, @Param("status") OrderStatus status,
                     @Param("version") Long version);

    // Projection query
    @Query("SELECT o.id as id, o.status as status, o.totalAmount as totalAmount FROM Order o WHERE o.customerId = :customerId")
    List<OrderSummary> findSummariesByCustomerId(@Param("customerId") UUID customerId);

    // Exists check (more efficient than count)
    boolean existsByCustomerIdAndStatus(UUID customerId, OrderStatus status);
}

// Interface-based projection
public interface OrderSummary {
    UUID getId();
    OrderStatus getStatus();
    BigDecimal getTotalAmount();
}
```

### Transaction Management

```java
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)  // Default read-only for all methods
public class OrderService {

    private final OrderRepository orderRepository;
    private final PaymentService paymentService;
    private final InventoryService inventoryService;
    private final ApplicationEventPublisher eventPublisher;

    @Transactional  // Override: read-write transaction
    public OrderResponse createOrder(CreateOrderRequest request) {
        // Validate inventory availability
        inventoryService.reserve(request.getItems());

        Order order = Order.builder()
            .customerId(request.getCustomerId())
            .items(mapItems(request.getItems()))
            .status(OrderStatus.PENDING)
            .totalAmount(calculateTotal(request.getItems()))
            .build();

        order = orderRepository.save(order);

        // Publish event after transaction commits
        eventPublisher.publishEvent(new OrderCreatedEvent(order.getId()));

        return OrderResponse.from(order);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void processPayment(UUID orderId) {
        Order order = orderRepository.findByIdWithItems(orderId)
            .orElseThrow(() -> new OrderNotFoundException(orderId));

        try {
            paymentService.charge(order.getTotalAmount(), order.getCustomerId());
            order.setStatus(OrderStatus.PAID);
        } catch (PaymentDeclinedException e) {
            order.setStatus(OrderStatus.PAYMENT_FAILED);
            inventoryService.release(order.getItems());
        }
        orderRepository.save(order);
    }

    @Transactional(isolation = Isolation.SERIALIZABLE)
    public void transferOrder(UUID orderId, UUID newCustomerId) {
        // Serializable isolation prevents concurrent modifications
        Order order = orderRepository.findById(orderId)
            .orElseThrow(() -> new OrderNotFoundException(orderId));
        order.setCustomerId(newCustomerId);
        orderRepository.save(order);
    }

    public Page<OrderResponse> findAll(Pageable pageable) {
        return orderRepository.findAll(pageable).map(OrderResponse::from);
    }
}
```

### Specifications for Dynamic Queries

```java
public class OrderSpecifications {

    public static Specification<Order> hasStatus(OrderStatus status) {
        return (root, query, cb) -> status == null ? null : cb.equal(root.get("status"), status);
    }

    public static Specification<Order> createdAfter(Instant date) {
        return (root, query, cb) -> date == null ? null : cb.greaterThan(root.get("createdAt"), date);
    }

    public static Specification<Order> totalAmountBetween(BigDecimal min, BigDecimal max) {
        return (root, query, cb) -> {
            if (min == null && max == null) return null;
            if (min != null && max != null) return cb.between(root.get("totalAmount"), min, max);
            if (min != null) return cb.greaterThanOrEqualTo(root.get("totalAmount"), min);
            return cb.lessThanOrEqualTo(root.get("totalAmount"), max);
        };
    }

    public static Specification<Order> belongsToCustomer(UUID customerId) {
        return (root, query, cb) -> customerId == null ? null :
            cb.equal(root.get("customerId"), customerId);
    }
}

// Usage in service layer
@Service
public class OrderSearchService {

    private final OrderRepository orderRepository;

    public Page<Order> search(OrderSearchCriteria criteria, Pageable pageable) {
        Specification<Order> spec = Specification
            .where(OrderSpecifications.hasStatus(criteria.getStatus()))
            .and(OrderSpecifications.createdAfter(criteria.getFromDate()))
            .and(OrderSpecifications.totalAmountBetween(criteria.getMinAmount(), criteria.getMaxAmount()))
            .and(OrderSpecifications.belongsToCustomer(criteria.getCustomerId()));

        return orderRepository.findAll(spec, pageable);
    }
}
```

## Common Pitfalls

1. **N+1 query problem with lazy loading**: When iterating over a collection of entities and accessing a lazy-loaded relationship on each one, JPA executes a separate query for each entity. For 100 orders with lazy-loaded items, this produces 101 queries (1 for orders + 100 for items). Fix with `JOIN FETCH` in JPQL, `@EntityGraph` annotations, or `@BatchSize` on the relationship. Always check generated SQL with `spring.jpa.show-sql=true` or p6spy during development.

2. **Open Session in View anti-pattern**: Spring Boot enables `spring.jpa.open-in-view=true` by default, keeping the Hibernate session open during view rendering. This allows lazy loading in controllers and templates but hides N+1 problems, holds database connections longer than necessary, and can cause `LazyInitializationException` in async processing. Disable it in production (`spring.jpa.open-in-view=false`) and explicitly fetch all needed data in the service layer.

3. **Missing @Transactional on write operations**: Without `@Transactional`, each repository call executes in its own transaction. If a service method calls `save()` followed by another operation that fails, the save is already committed and cannot be rolled back. Always wrap multi-step write operations in a single `@Transactional` method. Note that `@Transactional(readOnly = true)` enables query optimizations and prevents accidental writes.

4. **Optimistic locking without retry logic**: Using `@Version` for optimistic locking throws `OptimisticLockException` when concurrent modifications conflict. Without retry logic, the user sees an error. Implement retry with exponential backoff using Spring Retry (`@Retryable`) or manual retry loops for operations where conflicts are expected under normal load.

5. **Returning JPA entities from controllers**: JPA entities with bidirectional relationships cause infinite recursion during JSON serialization. Lazy-loaded proxies throw `LazyInitializationException` outside transaction scope. Entity changes in the persistence context are automatically flushed, causing unintended database writes. Always map entities to DTOs at the service boundary.

## Real-World Use Cases

- **Multi-tenant data isolation**: SaaS applications use Spring Data's `@Filter` annotations or custom repository implementations to automatically append tenant ID predicates to all queries. Combined with Hibernate's `@TenantId` (Hibernate 6+) and a `TenantIdentifierResolver`, this ensures complete data isolation between tenants without requiring separate databases or manual WHERE clause additions in every query.

- **Audit trail implementation**: Financial and healthcare applications use Spring Data's auditing support (`@CreatedDate`, `@LastModifiedDate`, `@CreatedBy`) combined with Hibernate Envers for full entity version history. Every change to a regulated entity is automatically recorded with who made the change, when, and what the previous values were, satisfying compliance requirements for SOX, HIPAA, and GDPR.

- **Event sourcing with outbox pattern**: Instead of publishing events directly (which risks inconsistency if the event broker is unavailable), services write events to an outbox table within the same transaction as the business data change. A separate process polls the outbox table and publishes events to Kafka. Spring Data repositories manage both the domain entity and the outbox entry atomically.

- **Read replica routing**: High-traffic applications route read queries to database replicas and writes to the primary. Spring's `AbstractRoutingDataSource` combined with `@Transactional(readOnly = true)` annotations enables automatic routing. The read-only flag signals the routing datasource to direct the query to a replica, distributing read load across multiple database instances.

## Interview Questions

**Q: Explain transaction propagation levels in Spring.**

A: Propagation defines how transactions relate when methods call other transactional methods. `REQUIRED` (default) joins an existing transaction or creates a new one. `REQUIRES_NEW` always creates a new transaction, suspending any existing one (useful for audit logging that must persist regardless of outer transaction outcome). `NESTED` creates a savepoint within the existing transaction (rollback to savepoint without rolling back the outer transaction). `SUPPORTS` participates in a transaction if one exists but does not create one. `NOT_SUPPORTED` suspends any existing transaction. `MANDATORY` requires an existing transaction or throws an exception. `NEVER` throws if a transaction exists.

**Q: How do you handle the N+1 query problem in Spring Data JPA?**

A: Multiple strategies exist depending on the use case. `JOIN FETCH` in JPQL eagerly loads relationships in a single query but cannot be combined with pagination. `@EntityGraph` declaratively specifies which associations to fetch eagerly for specific repository methods. `@BatchSize(size = 50)` on the relationship tells Hibernate to load lazy collections in batches of 50 rather than one at a time. For complex scenarios, use a DTO projection query that selects only needed columns, avoiding entity loading entirely.

**Q: What is the difference between `save()` and `saveAndFlush()` in Spring Data JPA?**

A: `save()` marks the entity as managed in the persistence context but does not immediately execute SQL. The actual INSERT or UPDATE is deferred until the transaction commits or the persistence context is flushed (which happens automatically before queries to ensure consistency). `saveAndFlush()` immediately executes the SQL statement and synchronizes the persistence context with the database. Use `saveAndFlush()` when you need the database-generated ID immediately, when you need to catch constraint violations before the transaction ends, or when subsequent native queries need to see the persisted data.

**Q: How does optimistic locking work with `@Version`?**

A: The `@Version` field (typically `Long` or `Integer`) is automatically incremented on each update. When Hibernate generates an UPDATE statement, it includes `WHERE version = :currentVersion` in the condition. If another transaction modified the entity (incrementing the version), the WHERE clause matches zero rows, and Hibernate throws `OptimisticLockException`. This prevents lost updates without database-level locks, allowing high concurrency for read-heavy workloads where conflicts are rare.

## Production Tips

- **Connection pool monitoring**: Configure HikariCP metrics export to Micrometer and alert on `hikaricp_connections_pending` exceeding zero for more than 30 seconds. This indicates pool exhaustion where threads are waiting for database connections. Set `spring.datasource.hikari.leak-detection-threshold=60000` to log warnings when connections are held longer than 60 seconds, helping identify code paths that fail to release connections.

- **Query performance logging**: Enable slow query logging with `spring.jpa.properties.hibernate.session.events.log.LOG_QUERIES_SLOWER_THAN_MS=100` to identify queries exceeding 100ms. In development, use `spring.jpa.show-sql=true` with `spring.jpa.properties.hibernate.format_sql=true` to inspect generated SQL. In production, use p6spy or datasource-proxy for query logging with execution time without the overhead of Hibernate's logging.

- **Batch insert optimization**: For bulk inserts, configure `spring.jpa.properties.hibernate.jdbc.batch_size=50` and `spring.jpa.properties.hibernate.order_inserts=true`. Use `saveAll()` instead of individual `save()` calls. For very large batches (thousands of entities), flush and clear the persistence context periodically to prevent memory exhaustion from the first-level cache growing unbounded.

## Related Topics

- [Core Container and Dependency Injection](./core-container.md) — Transaction management relies on Spring's AOP proxy infrastructure
- [Spring MVC and REST APIs](./spring-mvc.md) — Controllers consume repository data through service layer abstractions
- [SQL Performance Tuning](../databases/sql-performance-tuning.md) — Understanding query optimization for the SQL generated by JPA
