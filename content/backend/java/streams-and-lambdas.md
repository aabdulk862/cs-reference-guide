# Streams and Lambdas

## Quick Reference

- Lambda expressions provide concise syntax for implementing functional interfaces: `(params) -> expression`
- Functional interfaces have exactly one abstract method, annotated with `@FunctionalInterface`
- Key functional interfaces: `Function<T,R>`, `Predicate<T>`, `Consumer<T>`, `Supplier<T>`, `BiFunction<T,U,R>`
- Stream API processes collections declaratively with lazy evaluation and short-circuit optimization
- Terminal operations: `collect()`, `forEach()`, `reduce()`, `count()`, `findFirst()`, `anyMatch()`
- Intermediate operations: `filter()`, `map()`, `flatMap()`, `sorted()`, `distinct()`, `limit()`
- `Optional<T>` eliminates null returns with `map()`, `flatMap()`, `orElse()`, `orElseThrow()`
- Method references: `Class::staticMethod`, `instance::method`, `Class::instanceMethod`, `Class::new`

## When to Use

Streams and lambdas are the preferred approach for data transformation pipelines in modern Java. Use the Stream API when processing collections with filter-map-reduce patterns, when you need lazy evaluation to avoid processing unnecessary elements, or when parallel processing of large datasets can improve throughput. Lambdas replace verbose anonymous inner classes for event handlers, callbacks, comparators, and any single-method interface implementation. Optional should be used as a return type for methods that may not produce a result, replacing null returns that force callers to perform null checks. These features are essential for writing concise, readable code in Spring WebFlux reactive pipelines, CompletableFuture chains, and any functional-style data processing. Senior engineers should understand when streams improve readability versus when traditional loops are clearer, and when parallel streams actually provide performance benefits versus introducing overhead.

## Code Examples

### Stream Pipeline Operations

```java
// Complex data transformation pipeline
public record OrderSummary(String customerId, BigDecimal totalSpent, long orderCount) {}

public List<OrderSummary> getTopCustomers(List<Order> orders, int limit) {
    return orders.stream()
        .filter(order -> order.getStatus() == OrderStatus.COMPLETED)
        .filter(order -> order.getCreatedAt().isAfter(LocalDateTime.now().minusMonths(6)))
        .collect(Collectors.groupingBy(
            Order::getCustomerId,
            Collectors.collectingAndThen(
                Collectors.toList(),
                orderList -> new OrderSummary(
                    orderList.get(0).getCustomerId(),
                    orderList.stream()
                        .map(Order::getAmount)
                        .reduce(BigDecimal.ZERO, BigDecimal::add),
                    orderList.size()
                )
            )
        ))
        .values().stream()
        .sorted(Comparator.comparing(OrderSummary::totalSpent).reversed())
        .limit(limit)
        .toList(); // Java 16+ immutable list
}

// FlatMap for nested structures
public List<LineItem> getAllLineItems(List<Order> orders) {
    return orders.stream()
        .flatMap(order -> order.getItems().stream())
        .filter(item -> item.getQuantity() > 0)
        .sorted(Comparator.comparing(LineItem::getProductName))
        .toList();
}

// Collectors.toMap with merge function for handling duplicates
Map<String, BigDecimal> revenueByProduct = orders.stream()
    .flatMap(order -> order.getItems().stream())
    .collect(Collectors.toMap(
        LineItem::getProductId,
        item -> item.getPrice().multiply(BigDecimal.valueOf(item.getQuantity())),
        BigDecimal::add  // Merge function for duplicate keys
    ));
```

### Optional Patterns and Anti-Patterns

```java
// Proper Optional usage as return type
public Optional<Customer> findCustomerByEmail(String email) {
    return customerRepository.findAll().stream()
        .filter(c -> c.getEmail().equalsIgnoreCase(email))
        .findFirst();
}

// Chaining Optional operations
public String getCustomerCity(UUID customerId) {
    return findCustomerById(customerId)
        .map(Customer::getAddress)
        .map(Address::getCity)
        .orElse("Unknown");
}

// Optional with flatMap for nested Optionals
public Optional<String> getManagerEmail(UUID employeeId) {
    return findEmployeeById(employeeId)
        .flatMap(Employee::getManager)  // Returns Optional<Employee>
        .map(Employee::getEmail);
}

// orElseThrow for required values
public Customer getCustomerOrFail(UUID customerId) {
    return findCustomerById(customerId)
        .orElseThrow(() -> new CustomerNotFoundException(customerId));
}

// Optional.stream() for integration with Stream API (Java 9+)
public List<String> getActiveCustomerEmails(List<UUID> customerIds) {
    return customerIds.stream()
        .map(this::findCustomerById)
        .flatMap(Optional::stream)  // Filters empty Optionals
        .filter(Customer::isActive)
        .map(Customer::getEmail)
        .toList();
}
```

### Custom Collectors and Reduce Operations

```java
// Custom collector for building a report
public static Collector<Transaction, ?, TransactionReport> toReport() {
    return Collector.of(
        TransactionReport::new,                    // Supplier
        TransactionReport::addTransaction,         // Accumulator
        TransactionReport::merge,                  // Combiner (for parallel)
        Collector.Characteristics.IDENTITY_FINISH
    );
}

TransactionReport report = transactions.stream()
    .filter(t -> t.getDate().isAfter(startDate))
    .collect(toReport());

// Reduce for aggregation with identity
BigDecimal totalRevenue = orders.stream()
    .map(Order::getAmount)
    .reduce(BigDecimal.ZERO, BigDecimal::add);

// Partitioning and grouping
Map<Boolean, List<Order>> partitioned = orders.stream()
    .collect(Collectors.partitioningBy(o -> o.getAmount().compareTo(threshold) > 0));
List<Order> highValue = partitioned.get(true);
List<Order> lowValue = partitioned.get(false);

// Multi-level grouping
Map<String, Map<OrderStatus, Long>> countByRegionAndStatus = orders.stream()
    .collect(Collectors.groupingBy(
        Order::getRegion,
        Collectors.groupingBy(Order::getStatus, Collectors.counting())
    ));

// Teeing collector (Java 12+) for computing two results in one pass
record Stats(long count, BigDecimal total) {}
Stats stats = orders.stream()
    .collect(Collectors.teeing(
        Collectors.counting(),
        Collectors.reducing(BigDecimal.ZERO, Order::getAmount, BigDecimal::add),
        Stats::new
    ));
```

## Common Pitfalls

- **Stream reuse**: Streams can only be consumed once. Attempting to reuse a stream after a terminal operation throws IllegalStateException. If you need to process the same data multiple times, either create a new stream from the source each time, or collect intermediate results into a collection first. This is a fundamental design choice that enables lazy evaluation and resource management.

- **Side effects in stream operations**: Using `forEach()` or `peek()` to modify external state breaks the functional contract of streams and produces unpredictable results with parallel streams. Stream operations should be stateless and side-effect-free. Use `collect()` or `reduce()` to produce results, and perform side effects only in terminal operations on sequential streams when absolutely necessary.

- **Parallel stream overhead**: `parallelStream()` is not a free performance boost. It uses the common ForkJoinPool, adds thread coordination overhead, and can actually be slower for small collections, I/O-bound operations, or operations with shared mutable state. Parallel streams benefit CPU-bound operations on large datasets (typically 10,000+ elements) with independent processing per element. Always benchmark before using parallel streams in production.

- **Optional as method parameter or field**: Optional was designed as a return type to signal "may not have a value." Using it as a method parameter forces callers to wrap values in Optional, adding verbosity without benefit. Using it as a field wastes memory (Optional is an object with its own overhead) and complicates serialization. For parameters, use method overloading or nullable parameters with `@Nullable` annotation.

- **Infinite streams without limit**: `Stream.generate()` and `Stream.iterate()` produce infinite streams. Without a `limit()` or short-circuit terminal operation (`findFirst()`, `anyMatch()`), these will run forever or until OutOfMemoryError. Always pair infinite stream sources with a bounding operation.

## Real-World Use Cases

- **ETL data transformation pipelines**: Data processing services use Stream API to transform raw database records into API response DTOs through chains of map, filter, and collect operations. A typical pipeline reads entities from a repository, filters by business rules, maps to response objects with computed fields, groups by category, and collects into the final response structure — all expressed as a single readable pipeline.

- **Reactive programming foundations**: Spring WebFlux's Mono and Flux types mirror the Stream API's functional composition model. Engineers comfortable with streams transition naturally to reactive programming, using the same map/flatMap/filter patterns for asynchronous, non-blocking data flows. Understanding lazy evaluation in streams directly translates to understanding backpressure in reactive streams.

- **Configuration validation and transformation**: Application startup routines use streams to validate configuration properties, transform string values into typed objects, collect validation errors, and build configuration maps. The declarative style makes it easy to add new validation rules without restructuring the code, and the collect-errors pattern (using Collectors.toList on validation failures) provides comprehensive error reporting.

- **Report generation with custom collectors**: Financial systems generate complex reports by streaming transaction data through custom collectors that accumulate running totals, compute percentiles, track min/max values, and build hierarchical summaries in a single pass through the data. Custom collectors encapsulate complex aggregation logic while maintaining the clean pipeline syntax.

- **Batch API response assembly**: Microservices handling batch requests use streams to process each item independently, collect successes and failures separately using partitioning, and assemble a batch response with per-item status. FlatMap handles cases where one input produces multiple outputs, and Optional.stream() cleanly handles items that may not produce results.

## Interview Questions

**Q: What is the difference between `map()` and `flatMap()` in streams?**

A: `map()` transforms each element to exactly one output element using a one-to-one function (`Function<T, R>`). `flatMap()` transforms each element to zero or more elements by mapping to a stream and flattening the results (`Function<T, Stream<R>>`). Use `map()` when each input produces exactly one output. Use `flatMap()` when each input may produce multiple outputs (like getting all items from multiple orders) or when you need to unwrap nested structures (like `Optional<Optional<T>>` or `List<List<T>>`). In Optional, `flatMap()` prevents nested Optionals when the mapping function itself returns an Optional.

**Q: Explain lazy evaluation in Java streams. Why does it matter?**

A: Stream intermediate operations (filter, map, sorted) are lazy — they don't execute until a terminal operation (collect, forEach, count) is invoked. The stream pipeline builds a description of transformations, then executes them in a single pass when the terminal operation triggers evaluation. This matters for performance: `stream.filter(expensive).findFirst()` stops processing after finding the first match rather than filtering the entire collection. Lazy evaluation also enables working with infinite streams and avoids creating intermediate collections between pipeline stages.

**Q: When should you use `reduce()` vs `collect()` in streams?**

A: Use `reduce()` for combining elements into a single value through an associative binary operation (sum, max, string concatenation). Use `collect()` for mutable reduction — building a result container (List, Map, StringBuilder) by accumulating elements into it. The key difference is that `reduce()` creates new intermediate values at each step (immutable reduction), while `collect()` mutates a single container (mutable reduction). For building collections, `collect()` is more efficient because it avoids creating intermediate objects. `reduce()` is appropriate for mathematical aggregations where the result type matches the element type.

**Q: What are the risks of using parallel streams in production?**

A: Parallel streams use the common ForkJoinPool (shared across the entire JVM), so a slow parallel stream operation can starve other parallel tasks. They add thread coordination overhead that outweighs benefits for small collections. They produce incorrect results if operations have side effects or depend on encounter order. They can cause deadlocks if stream operations block (I/O, synchronized blocks). They interact poorly with thread-local state and security contexts. In production, use parallel streams only for CPU-bound operations on large datasets after benchmarking, and consider using a custom ForkJoinPool to isolate the parallelism.

## Production Tips

- **Prefer toList() over collect(Collectors.toList())**: Java 16+ provides `stream.toList()` which returns an unmodifiable list and is more concise. Use `collect(Collectors.toCollection(ArrayList::new))` only when you need a mutable result list. The shorter form also communicates intent more clearly — you want the result, not a mutable collection to further modify.

- **Use Collectors.toUnmodifiableMap() for safety**: When collecting to a map that should not be modified after creation, use `Collectors.toUnmodifiableMap()` (Java 10+) instead of `Collectors.toMap()`. This prevents accidental mutation of collected results and makes the code's intent explicit. Always provide a merge function to handle duplicate keys gracefully rather than letting the stream throw IllegalStateException.

- **Profile before parallelizing**: Use JMH (Java Microbenchmark Harness) to measure actual throughput improvement from parallel streams. In many real-world scenarios, the overhead of splitting work, coordinating threads, and merging results exceeds the benefit of parallel execution. Sequential streams with algorithmic improvements (better data structures, reduced allocations) often outperform naive parallelization.

## Related Topics

- [Core Language Fundamentals](./core-language.md) — Interfaces and type system that enable functional programming
- [Concurrency and Multithreading](./concurrency.md) — CompletableFuture chains use similar functional composition patterns
