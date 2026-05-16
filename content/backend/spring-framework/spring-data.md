# Spring Data and Persistence

## Quick Reference

- Spring Data JPA provides repository abstractions that eliminate boilerplate CRUD code
- `JpaRepository<T, ID>` extends `CrudRepository` with pagination, sorting, and batch operations
- Query derivation: method names like `findByStatusAndCreatedAtAfter` auto-generate JPQL queries
- `@Query` annotation for custom JPQL or native SQL when derived queries become complex
- `@Transactional` on service methods manages transaction boundaries via AOP proxies
- Projections: interface-based and class-based projections for partial entity loading
- Auditing: `@CreatedDate`, `@LastModifiedDate`, `@CreatedBy`, `@LastModifiedBy` auto-populate audit fields
- Specifications API enables dynamic query composition for complex search criteria
- `@Version` field enables optimistic locking — concurrent updates throw `OptimisticLockException`
- Custom repository implementations via `Impl` suffix convention extend Spring Data with EntityManager access
- Pagination: `Pageable` parameter with `Page<T>` or `Slice<T>` return types for efficient large dataset access
- Transaction propagation: `REQUIRED` (default), `REQUIRES_NEW`, `NESTED`, `SUPPORTS`, `NOT_SUPPORTED`, `MANDATORY`, `NEVER`
- Testcontainers with `@ServiceConnection` (Boot 3.1+) enables integration tests against real databases
- Spring Data 2023+ supports `ListCrudRepository` and `ListPagingAndSortingRepository` returning `List` instead of `Iterable`

## When to Use

Spring Data JPA is the standard persistence layer for Spring Boot applications connecting to relational databases. Use it when building CRUD-heavy applications where repository abstractions eliminate repetitive data access code, when you need pagination and sorting with minimal effort, when your domain model maps cleanly to relational tables, and when you want declarative transaction management without manual connection handling. Spring Data's query derivation is ideal for simple queries, while the `@Query` annotation and Specifications API handle complex dynamic queries. For read-heavy applications, projections and entity graphs optimize data loading by fetching only required columns. Understanding transaction propagation, isolation levels, and the N+1 query problem is essential for production performance.

Spring Data also supports non-relational stores (MongoDB, Redis, Elasticsearch, Cassandra) with a consistent programming model, enabling polyglot persistence without learning entirely different APIs for each datastore. The repository abstraction pattern means switching from JPA to MongoDB requires changing the repository interface's parent type and entity annotations, with minimal service layer changes.

## Code Examples

### Repository Definitions with Query Derivation

```java
@Entity
@Table(name = "orders", indexes = {
    @Index(name = "idx_orders_customer_status", columnList = "customer_id, status"),
    @Index(name = "idx_orders_created_at", columnList = "created_at DESC")
})
@EntityListeners(AuditingEntityListener.class)
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
    @BatchSize(size = 50)  // Load items in batches of 50 to avoid N+1
    private List<OrderItem> items = new ArrayList<>();

    @Column(name = "total_amount", precision = 10, scale = 2)
    private BigDecimal totalAmount;

    @CreatedDate
    @Column(name = "created_at", updatable = false)
    private Instant createdAt;

    @LastModifiedDate
    @Column(name = "updated_at")
    private Instant updatedAt;

    @CreatedBy
    @Column(name = "created_by", updatable = false)
    private String createdBy;

    @Version
    private Long version;  // Optimistic locking
}

public interface OrderRepository extends JpaRepository<Order, UUID>,
        JpaSpecificationExecutor<Order>, OrderRepositoryCustom {

    // Query derivation — Spring generates JPQL from method name
    Page<Order> findByCustomerIdAndStatus(UUID customerId, OrderStatus status, Pageable pageable);

    List<Order> findByStatusInAndCreatedAtAfter(List<OrderStatus> statuses, Instant since);

    // Exists check (more efficient than count — stops at first match)
    boolean existsByCustomerIdAndStatus(UUID customerId, OrderStatus status);

    // Count query
    long countByStatusAndCreatedAtBetween(OrderStatus status, Instant start, Instant end);

    // Delete derived query
    void deleteByStatusAndCreatedAtBefore(OrderStatus status, Instant before);

    // Top/First queries
    List<Order> findTop10ByStatusOrderByCreatedAtDesc(OrderStatus status);

    // Custom JPQL with JOIN FETCH to avoid N+1
    @Query("SELECT o FROM Order o JOIN FETCH o.items WHERE o.id = :id")
    Optional<Order> findByIdWithItems(@Param("id") UUID id);

    // JPQL with pagination (cannot use JOIN FETCH with pagination directly)
    @Query("SELECT o FROM Order o WHERE o.status = :status")
    @EntityGraph(attributePaths = {"items"})
    Page<Order> findByStatusWithItems(@Param("status") OrderStatus status, Pageable pageable);

    // Native query for complex operations
    @Query(value = """
        SELECT o.* FROM orders o
        WHERE o.status = :status
        AND o.created_at > :since
        AND o.total_amount > :minAmount
        ORDER BY o.created_at DESC
        LIMIT :limit
        """, nativeQuery = true)
    List<Order> findRecentHighValueOrders(
        @Param("status") String status,
        @Param("since") Instant since,
        @Param("minAmount") BigDecimal minAmount,
        @Param("limit") int limit);

    // Modifying query with clear cache
    @Modifying(clearAutomatically = true)
    @Query("UPDATE Order o SET o.status = :status WHERE o.id = :id AND o.version = :version")
    int updateStatus(@Param("id") UUID id, @Param("status") OrderStatus status,
                     @Param("version") Long version);

    // Projection query — returns only specified columns
    @Query("SELECT o.id as id, o.status as status, o.totalAmount as totalAmount " +
           "FROM Order o WHERE o.customerId = :customerId")
    List<OrderSummary> findSummariesByCustomerId(@Param("customerId") UUID customerId);
}

// Interface-based projection — Spring generates proxy at runtime
public interface OrderSummary {
    UUID getId();
    OrderStatus getStatus();
    BigDecimal getTotalAmount();

    // Computed value via SpEL
    @Value("#{target.totalAmount.compareTo(new java.math.BigDecimal('100')) > 0}")
    boolean isHighValue();
}

// Class-based projection (DTO) — instantiated directly from query
public record OrderSummaryDTO(UUID id, OrderStatus status, BigDecimal totalAmount) {}
```

### Transaction Management and Propagation

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

        // Publish event AFTER transaction commits successfully
        eventPublisher.publishEvent(new OrderCreatedEvent(order.getId()));

        return OrderResponse.from(order);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void processPayment(UUID orderId) {
        // REQUIRES_NEW: runs in its own transaction regardless of caller's transaction
        // If this fails, the outer transaction is not affected
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
        // SERIALIZABLE: prevents phantom reads and concurrent modifications
        // Use sparingly — causes lock contention under high concurrency
        Order order = orderRepository.findById(orderId)
            .orElseThrow(() -> new OrderNotFoundException(orderId));
        order.setCustomerId(newCustomerId);
        orderRepository.save(order);
    }

    @Transactional
    @Retryable(value = OptimisticLockException.class, maxAttempts = 3,
               backoff = @Backoff(delay = 100, multiplier = 2))
    public void updateOrderWithRetry(UUID orderId, UpdateOrderRequest request) {
        // Retry on optimistic lock conflicts
        Order order = orderRepository.findById(orderId)
            .orElseThrow(() -> new OrderNotFoundException(orderId));
        order.applyUpdate(request);
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
        return (root, query, cb) -> status == null ? null :
            cb.equal(root.get("status"), status);
    }

    public static Specification<Order> createdAfter(Instant date) {
        return (root, query, cb) -> date == null ? null :
            cb.greaterThan(root.get("createdAt"), date);
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

    // Join-based specification for filtering by related entity
    public static Specification<Order> hasItemWithSku(String sku) {
        return (root, query, cb) -> {
            if (sku == null) return null;
            Join<Order, OrderItem> items = root.join("items", JoinType.INNER);
            return cb.equal(items.get("sku"), sku);
        };
    }

    // Full-text search across multiple fields
    public static Specification<Order> searchText(String searchTerm) {
        return (root, query, cb) -> {
            if (searchTerm == null || searchTerm.isBlank()) return null;
            String pattern = "%" + searchTerm.toLowerCase() + "%";
            return cb.or(
                cb.like(cb.lower(root.get("customerName")), pattern),
                cb.like(cb.lower(root.get("notes")), pattern)
            );
        };
    }
}

// Usage in service layer
@Service
@RequiredArgsConstructor
public class OrderSearchService {

    private final OrderRepository orderRepository;

    public Page<OrderResponse> search(OrderSearchCriteria criteria, Pageable pageable) {
        Specification<Order> spec = Specification
            .where(OrderSpecifications.hasStatus(criteria.getStatus()))
            .and(OrderSpecifications.createdAfter(criteria.getFromDate()))
            .and(OrderSpecifications.totalAmountBetween(
                criteria.getMinAmount(), criteria.getMaxAmount()))
            .and(OrderSpecifications.belongsToCustomer(criteria.getCustomerId()))
            .and(OrderSpecifications.searchText(criteria.getSearchTerm()));

        return orderRepository.findAll(spec, pageable).map(OrderResponse::from);
    }
}
```

### Custom Repository Implementation

```java
public interface OrderRepositoryCustom {
    List<Order> findWithComplexCriteria(OrderSearchCriteria criteria);
    void bulkUpdateStatus(List<UUID> orderIds, OrderStatus newStatus);
    List<OrderStatistics> getMonthlyStatistics(int year);
}

// Spring Data auto-discovers by naming convention: {RepositoryName}Impl
@Repository
@RequiredArgsConstructor
public class OrderRepositoryCustomImpl implements OrderRepositoryCustom {

    private final EntityManager entityManager;

    @Override
    public List<Order> findWithComplexCriteria(OrderSearchCriteria criteria) {
        CriteriaBuilder cb = entityManager.getCriteriaBuilder();
        CriteriaQuery<Order> query = cb.createQuery(Order.class);
        Root<Order> root = query.from(Order.class);

        List<Predicate> predicates = new ArrayList<>();
        if (criteria.getStatus() != null) {
            predicates.add(cb.equal(root.get("status"), criteria.getStatus()));
        }
        if (criteria.getMinAmount() != null) {
            predicates.add(cb.greaterThanOrEqualTo(
                root.get("totalAmount"), criteria.getMinAmount()));
        }

        query.where(predicates.toArray(new Predicate[0]));
        query.orderBy(cb.desc(root.get("createdAt")));

        return entityManager.createQuery(query)
            .setMaxResults(criteria.getLimit())
            .getResultList();
    }

    @Override
    @Modifying
    public void bulkUpdateStatus(List<UUID> orderIds, OrderStatus newStatus) {
        entityManager.createQuery(
            "UPDATE Order o SET o.status = :status, o.updatedAt = :now WHERE o.id IN :ids")
            .setParameter("status", newStatus)
            .setParameter("now", Instant.now())
            .setParameter("ids", orderIds)
            .executeUpdate();
    }

    @Override
    public List<OrderStatistics> getMonthlyStatistics(int year) {
        return entityManager.createQuery("""
            SELECT new com.example.dto.OrderStatistics(
                FUNCTION('MONTH', o.createdAt),
                COUNT(o),
                SUM(o.totalAmount),
                AVG(o.totalAmount))
            FROM Order o
            WHERE FUNCTION('YEAR', o.createdAt) = :year
            GROUP BY FUNCTION('MONTH', o.createdAt)
            ORDER BY FUNCTION('MONTH', o.createdAt)
            """, OrderStatistics.class)
            .setParameter("year", year)
            .getResultList();
    }
}

// Extend both JpaRepository and custom interface
public interface OrderRepository extends JpaRepository<Order, UUID>,
        JpaSpecificationExecutor<Order>, OrderRepositoryCustom {
    // derived query methods...
}
```

### Auditing Configuration

```java
@Configuration
@EnableJpaAuditing(auditorAwareRef = "auditorProvider")
public class AuditConfig {

    @Bean
    public AuditorAware<String> auditorProvider() {
        return () -> Optional.ofNullable(SecurityContextHolder.getContext().getAuthentication())
            .filter(Authentication::isAuthenticated)
            .map(Authentication::getName);
    }
}

// Entity with full auditing support
@Entity
@EntityListeners(AuditingEntityListener.class)
public class Document {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    private String title;
    private String content;

    @CreatedDate
    @Column(name = "created_at", updatable = false)
    private Instant createdAt;

    @LastModifiedDate
    @Column(name = "updated_at")
    private Instant updatedAt;

    @CreatedBy
    @Column(name = "created_by", updatable = false)
    private String createdBy;

    @LastModifiedBy
    @Column(name = "updated_by")
    private String updatedBy;
}
```

### Integration Testing with Testcontainers

```java
@DataJpaTest
@Testcontainers
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
class OrderRepositoryTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine")
            .withDatabaseName("testdb");

    @Autowired
    private OrderRepository orderRepository;

    @Autowired
    private TestEntityManager entityManager;

    @Test
    void shouldFindRecentHighValueOrders() {
        Order highValue = createOrder(OrderStatus.CONFIRMED, new BigDecimal("500.00"),
                Instant.now().minus(1, ChronoUnit.HOURS));
        Order lowValue = createOrder(OrderStatus.CONFIRMED, new BigDecimal("10.00"),
                Instant.now().minus(1, ChronoUnit.HOURS));
        entityManager.persistAndFlush(highValue);
        entityManager.persistAndFlush(lowValue);

        List<Order> results = orderRepository.findRecentHighValueOrders(
                "CONFIRMED", Instant.now().minus(2, ChronoUnit.HOURS),
                new BigDecimal("100.00"), 10);

        assertThat(results).hasSize(1);
        assertThat(results.get(0).getTotalAmount()).isEqualByComparingTo("500.00");
    }

    @Test
    void shouldSupportOptimisticLocking() {
        Order order = createOrder(OrderStatus.PENDING, new BigDecimal("100.00"), Instant.now());
        order = entityManager.persistAndFlush(order);

        // Simulate concurrent modification
        entityManager.getEntityManager().createQuery(
            "UPDATE Order o SET o.version = o.version + 1 WHERE o.id = :id")
            .setParameter("id", order.getId())
            .executeUpdate();
        entityManager.clear();

        Order staleOrder = orderRepository.findById(order.getId()).orElseThrow();
        staleOrder.setStatus(OrderStatus.CONFIRMED);

        assertThatThrownBy(() -> orderRepository.saveAndFlush(staleOrder))
            .isInstanceOf(OptimisticLockingFailureException.class);
    }
}
```

## Common Pitfalls

1. **N+1 query problem with lazy loading**: When iterating over a collection of entities and accessing a lazy-loaded relationship on each one, JPA executes a separate query for each entity. For 100 orders with lazy-loaded items, this produces 101 queries. Fix with `JOIN FETCH` in JPQL, `@EntityGraph` annotations, or `@BatchSize` on the relationship. Always check generated SQL with `spring.jpa.show-sql=true` or p6spy during development.

2. **Open Session in View anti-pattern**: Spring Boot enables `spring.jpa.open-in-view=true` by default, keeping the Hibernate session open during view rendering. This allows lazy loading in controllers but hides N+1 problems, holds database connections longer than necessary, and can cause `LazyInitializationException` in async processing. Disable it in production (`spring.jpa.open-in-view=false`) and explicitly fetch all needed data in the service layer.

3. **Missing @Transactional on write operations**: Without `@Transactional`, each repository call executes in its own transaction. If a service method calls `save()` followed by another operation that fails, the save is already committed and cannot be rolled back. Always wrap multi-step write operations in a single `@Transactional` method.

4. **Optimistic locking without retry logic**: Using `@Version` for optimistic locking throws `OptimisticLockException` when concurrent modifications conflict. Without retry logic, the user sees an error. Implement retry with Spring Retry (`@Retryable`) for operations where conflicts are expected under normal load.

5. **Returning JPA entities from controllers**: JPA entities with bidirectional relationships cause infinite recursion during JSON serialization. Lazy-loaded proxies throw `LazyInitializationException` outside transaction scope. Entity changes in the persistence context are automatically flushed, causing unintended database writes. Always map entities to DTOs at the service boundary.

6. **Ignoring database connection limits with virtual threads**: Virtual threads allow millions of concurrent requests, but each database operation still requires a physical connection from HikariCP's pool. Size `spring.datasource.hikari.maximum-pool-size` based on your database's max connections, and monitor `hikaricp_connections_pending` to detect saturation.

7. **Using `hibernate.ddl-auto=update` in production**: This setting attempts to modify the schema to match entities but cannot handle column renames, data migrations, or index changes safely. It can also drop columns unexpectedly. Use Flyway or Liquibase for versioned, repeatable schema migrations in production.

8. **Forgetting `clearAutomatically` on `@Modifying` queries**: Bulk update/delete queries bypass the persistence context. Without `@Modifying(clearAutomatically = true)`, subsequent reads from the same transaction return stale cached entities that don't reflect the bulk update.

## Real-World Use Cases

- **Multi-tenant data isolation**: SaaS applications use Hibernate's `@TenantId` (Hibernate 6+) with a `TenantIdentifierResolver` to automatically append tenant predicates to all queries. This ensures complete data isolation between tenants without requiring separate databases or manual WHERE clause additions.

- **Audit trail implementation**: Financial and healthcare applications use Spring Data's auditing support combined with Hibernate Envers for full entity version history. Every change to a regulated entity is automatically recorded with who made the change, when, and what the previous values were, satisfying SOX, HIPAA, and GDPR compliance.

- **Event sourcing with outbox pattern**: Services write events to an outbox table within the same transaction as the business data change. A separate process (Debezium CDC) polls the outbox table and publishes events to Kafka. Spring Data repositories manage both the domain entity and the outbox entry atomically.

- **Read replica routing**: High-traffic applications route read queries to database replicas using Spring's `AbstractRoutingDataSource` combined with `@Transactional(readOnly = true)`. The read-only flag signals the routing datasource to direct the query to a replica, distributing read load across multiple instances.

- **Soft deletes with automatic filtering**: Entities use `@SQLRestriction("deleted = false")` (Hibernate 6.3+) to automatically exclude soft-deleted records from all queries. Custom repository methods override this for admin views that need to see deleted records.

## Interview Questions

**Q: Explain transaction propagation levels in Spring.**

A: Propagation defines how transactions relate when methods call other transactional methods. `REQUIRED` (default) joins an existing transaction or creates a new one. `REQUIRES_NEW` always creates a new transaction, suspending any existing one (useful for audit logging that must persist regardless of outer transaction outcome). `NESTED` creates a savepoint within the existing transaction. `SUPPORTS` participates if one exists but doesn't create one. `NOT_SUPPORTED` suspends any existing transaction. `MANDATORY` requires an existing transaction or throws. `NEVER` throws if a transaction exists.

**Q: How do you handle the N+1 query problem in Spring Data JPA?**

A: Multiple strategies exist. `JOIN FETCH` in JPQL eagerly loads relationships in a single query but cannot be combined with pagination. `@EntityGraph` declaratively specifies which associations to fetch eagerly for specific repository methods. `@BatchSize(size = 50)` on the relationship tells Hibernate to load lazy collections in batches rather than one at a time. For complex scenarios, use a DTO projection query that selects only needed columns, avoiding entity loading entirely. The choice depends on whether you need the full entity graph or just specific fields.

**Q: What is the difference between `save()` and `saveAndFlush()` in Spring Data JPA?**

A: `save()` marks the entity as managed in the persistence context but does not immediately execute SQL. The actual INSERT or UPDATE is deferred until the transaction commits or the persistence context is flushed. `saveAndFlush()` immediately executes the SQL statement and synchronizes the persistence context with the database. Use `saveAndFlush()` when you need the database-generated ID immediately, when you need to catch constraint violations before the transaction ends, or when subsequent native queries need to see the persisted data.

**Q: How does optimistic locking work with `@Version`?**

A: The `@Version` field is automatically incremented on each update. When Hibernate generates an UPDATE statement, it includes `WHERE version = :currentVersion`. If another transaction modified the entity (incrementing the version), the WHERE clause matches zero rows, and Hibernate throws `OptimisticLockException`. This prevents lost updates without database-level locks, allowing high concurrency for read-heavy workloads where conflicts are rare. Always implement retry logic for operations where conflicts are expected.

**Q: What are the differences between interface-based and class-based projections?**

A: Interface-based projections define getter methods matching entity property names — Spring Data generates a proxy at runtime that returns only the projected columns. They support nested projections and SpEL expressions but cannot contain custom logic. Class-based projections (DTOs with constructors) are instantiated directly from query results, support custom logic in methods, and work with native queries. Interface projections generate optimized SQL selecting only declared columns. For GraalVM native images, class-based projections are preferred because they avoid runtime proxy generation.

**Q: How do you implement soft deletes with Spring Data JPA?**

A: Add a `deleted` boolean or `deletedAt` timestamp column. Apply Hibernate's `@SQLRestriction("deleted = false")` (Hibernate 6.3+) on the entity to automatically filter soft-deleted records from all queries. Override the repository's `delete` method to set the flag instead of executing SQL DELETE. For queries that need to include deleted records, use native queries or a separate repository without the filter. Combine with `@PreRemove` lifecycle callback to set the deletion timestamp.

**Q: Explain the difference between `Page<T>` and `Slice<T>` in Spring Data.**

A: `Page<T>` executes an additional COUNT query to determine total elements and total pages, enabling full pagination metadata. `Slice<T>` only knows if there is a next page (by requesting one extra element), avoiding the expensive COUNT query. Use `Page<T>` when you need to display total page count (traditional pagination UI). Use `Slice<T>` for infinite scroll or "load more" patterns where total count is unnecessary. For tables with millions of rows, the COUNT query can take seconds — `Slice<T>` provides significantly better performance.

**Q: How does Spring Data's query derivation work?**

A: Spring Data parses repository method names into JPQL queries at application startup. It splits the method name into subject (`find`, `count`, `exists`, `delete`), predicate keywords (`By`, `And`, `Or`), property references (entity field names), and comparison operators (`After`, `Before`, `Between`, `Like`, `In`, `IsNull`, `OrderBy`). For example, `findByStatusAndCreatedAtAfterOrderByTotalAmountDesc` generates `SELECT o FROM Order o WHERE o.status = ?1 AND o.createdAt > ?2 ORDER BY o.totalAmount DESC`. If the method name doesn't match entity properties, the application fails to start with a clear error message.

## Production Tips

- **Connection pool monitoring**: Configure HikariCP metrics export to Micrometer and alert on `hikaricp_connections_pending` exceeding zero for more than 30 seconds. Set `spring.datasource.hikari.leak-detection-threshold=60000` to log warnings when connections are held longer than 60 seconds, helping identify code paths that fail to release connections.

- **Query performance logging**: Enable slow query logging with `spring.jpa.properties.hibernate.session.events.log.LOG_QUERIES_SLOWER_THAN_MS=100`. In production, use datasource-proxy for query logging with execution time without Hibernate's logging overhead. Alert on queries exceeding 500ms.

- **Batch insert optimization**: Configure `spring.jpa.properties.hibernate.jdbc.batch_size=50` and `spring.jpa.properties.hibernate.order_inserts=true`. Use `saveAll()` instead of individual `save()` calls. For very large batches, flush and clear the persistence context periodically to prevent memory exhaustion from the first-level cache.

- **Flyway for schema management**: Never use `hibernate.ddl-auto=update` in production. Use Flyway with versioned migration scripts in `src/main/resources/db/migration/`. Run migrations as a separate init container in Kubernetes to decouple schema changes from application deployment. Test migrations against production-like data volumes in staging.

- **Read replica routing**: Implement `AbstractRoutingDataSource` that routes `@Transactional(readOnly = true)` queries to read replicas. Configure separate HikariCP pools for primary and replica connections. Monitor replication lag to avoid serving stale data. This reduces primary database CPU by 60-80% in read-heavy applications.

- **Index monitoring and query plan analysis**: Periodically review slow query logs and execution plans. Use `EXPLAIN ANALYZE` on queries generated by Spring Data to verify index usage. Add composite indexes for common query patterns identified through Specifications. Monitor index bloat and schedule periodic `REINDEX` operations for heavily-updated tables.

## Related Topics

- [Core Container and Dependency Injection](./core-container.md) — Transaction management relies on Spring's AOP proxy infrastructure
- [Spring MVC and REST APIs](./spring-mvc.md) — Controllers consume repository data through service layer abstractions
- [SQL Performance Tuning](../../databases/sql-foundations/sql-performance-tuning.md) — Understanding query optimization for the SQL generated by JPA
- [Spring Boot](./spring-boot.md) — Auto-configuration of DataSource, EntityManager, and transaction management
