# REST API Design

## Quick Reference

- REST (Representational State Transfer) is an architectural style with 6 constraints: client-server, stateless, cacheable, uniform interface, layered system, code-on-demand (optional)
- Use nouns for resources (`/users/123`), not verbs (`/getUser?id=123`); HTTP methods convey the action
- HTTP methods: GET (read), POST (create), PUT (full replace), PATCH (partial update), DELETE (remove)
- Status codes: 2xx success, 3xx redirection, 4xx client error, 5xx server error — use specific codes, not just 200/500
- Content negotiation via `Accept` header; default to `application/json` with `Content-Type: application/json`
- Pagination: use cursor-based for large datasets (stable under writes), offset-based for simple cases
- API versioning: URI path (`/v1/users`) is most common; header-based (`Accept: application/vnd.api.v1+json`) is more RESTful
- Rate limiting headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` (Unix timestamp)

## When to Use

REST APIs are the default choice for public-facing web APIs, mobile app backends, and service-to-service communication where simplicity, cacheability, and broad client compatibility matter. Choose REST when your domain maps naturally to resources and CRUD operations, when you need HTTP caching at CDN and browser levels, when clients are diverse (web, mobile, third-party integrations), or when you want a well-understood contract that new developers can learn quickly. REST is less suitable for real-time bidirectional communication (use WebSockets), complex queries with nested relationships (consider GraphQL), high-performance internal service communication with strict schemas (consider gRPC), or event streaming (use SSE or message queues). In microservice architectures, REST works well for synchronous request-response patterns between services, especially at organizational boundaries where simplicity and discoverability outweigh raw performance.

## Code Examples

### Resource Design with Spring Boot

```java
@RestController
@RequestMapping("/api/v1/users")
@Validated
public class UserController {

    private final UserService userService;

    @GetMapping
    public ResponseEntity<PagedResponse<UserDto>> listUsers(
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size,
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "createdAt") String sortBy,
            @RequestParam(defaultValue = "desc") String sortDir) {

        Pageable pageable = PageRequest.of(page, size,
            Sort.by(Sort.Direction.fromString(sortDir), sortBy));

        Page<UserDto> users = userService.findAll(status, pageable);

        PagedResponse<UserDto> response = PagedResponse.<UserDto>builder()
            .data(users.getContent())
            .page(users.getNumber())
            .size(users.getSize())
            .totalElements(users.getTotalElements())
            .totalPages(users.getTotalPages())
            .hasNext(users.hasNext())
            .build();

        return ResponseEntity.ok()
            .cacheControl(CacheControl.maxAge(30, TimeUnit.SECONDS))
            .body(response);
    }

    @GetMapping("/{userId}")
    public ResponseEntity<UserDto> getUser(
            @PathVariable @UUID String userId,
            HttpServletRequest request) {

        UserDto user = userService.findById(userId);

        // ETag for conditional requests
        String etag = "\"" + user.getVersion() + "\"";
        if (etag.equals(request.getHeader("If-None-Match"))) {
            return ResponseEntity.status(HttpStatus.NOT_MODIFIED).build();
        }

        return ResponseEntity.ok()
            .eTag(etag)
            .cacheControl(CacheControl.maxAge(60, TimeUnit.SECONDS))
            .body(user);
    }

    @PostMapping
    public ResponseEntity<UserDto> createUser(
            @Valid @RequestBody CreateUserRequest request,
            UriComponentsBuilder uriBuilder) {

        UserDto created = userService.create(request);

        URI location = uriBuilder.path("/api/v1/users/{id}")
            .buildAndExpand(created.getId())
            .toUri();

        return ResponseEntity.created(location).body(created);
    }

    @PatchMapping("/{userId}")
    public ResponseEntity<UserDto> updateUser(
            @PathVariable @UUID String userId,
            @Valid @RequestBody UpdateUserRequest request,
            @RequestHeader("If-Match") String ifMatch) {

        // Optimistic concurrency control
        long expectedVersion = Long.parseLong(ifMatch.replace("\"", ""));
        UserDto updated = userService.update(userId, request, expectedVersion);

        return ResponseEntity.ok()
            .eTag("\"" + updated.getVersion() + "\"")
            .body(updated);
    }

    @DeleteMapping("/{userId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteUser(@PathVariable @UUID String userId) {
        userService.delete(userId);
    }
}
```

### Standardized Error Response

```java
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<ProblemDetail> handleNotFound(ResourceNotFoundException ex) {
        ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.NOT_FOUND);
        problem.setTitle("Resource Not Found");
        problem.setDetail(ex.getMessage());
        problem.setType(URI.create("https://api.example.com/errors/not-found"));
        problem.setProperty("resourceType", ex.getResourceType());
        problem.setProperty("resourceId", ex.getResourceId());
        problem.setProperty("timestamp", Instant.now());
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(problem);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ProblemDetail> handleValidation(MethodArgumentNotValidException ex) {
        ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.BAD_REQUEST);
        problem.setTitle("Validation Failed");
        problem.setDetail("One or more fields failed validation");
        problem.setType(URI.create("https://api.example.com/errors/validation"));

        List<Map<String, String>> violations = ex.getBindingResult()
            .getFieldErrors().stream()
            .map(error -> Map.of(
                "field", error.getField(),
                "message", error.getDefaultMessage(),
                "rejectedValue", String.valueOf(error.getRejectedValue())
            ))
            .toList();

        problem.setProperty("violations", violations);
        return ResponseEntity.badRequest().body(problem);
    }

    @ExceptionHandler(OptimisticLockException.class)
    public ResponseEntity<ProblemDetail> handleConflict(OptimisticLockException ex) {
        ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.CONFLICT);
        problem.setTitle("Conflict");
        problem.setDetail("Resource was modified by another request. Fetch the latest version and retry.");
        problem.setType(URI.create("https://api.example.com/errors/conflict"));
        return ResponseEntity.status(HttpStatus.CONFLICT).body(problem);
    }

    @ExceptionHandler(RateLimitExceededException.class)
    public ResponseEntity<ProblemDetail> handleRateLimit(RateLimitExceededException ex) {
        ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.TOO_MANY_REQUESTS);
        problem.setTitle("Rate Limit Exceeded");
        problem.setDetail("You have exceeded the rate limit. Try again after the reset time.");
        problem.setProperty("retryAfter", ex.getRetryAfterSeconds());

        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
            .header("Retry-After", String.valueOf(ex.getRetryAfterSeconds()))
            .header("X-RateLimit-Limit", String.valueOf(ex.getLimit()))
            .header("X-RateLimit-Remaining", "0")
            .header("X-RateLimit-Reset", String.valueOf(ex.getResetTimestamp()))
            .body(problem);
    }
}
```

### HATEOAS Implementation

```java
@RestController
@RequestMapping("/api/v1/orders")
public class OrderController {

    @GetMapping("/{orderId}")
    public EntityModel<OrderDto> getOrder(@PathVariable String orderId) {
        OrderDto order = orderService.findById(orderId);

        EntityModel<OrderDto> model = EntityModel.of(order);

        // Self link
        model.add(linkTo(methodOn(OrderController.class).getOrder(orderId)).withSelfRel());

        // Related resource links
        model.add(linkTo(methodOn(UserController.class)
            .getUser(order.getCustomerId(), null)).withRel("customer"));

        // State-dependent action links (HATEOAS drives available transitions)
        switch (order.getStatus()) {
            case PENDING:
                model.add(linkTo(methodOn(OrderController.class)
                    .confirmOrder(orderId)).withRel("confirm"));
                model.add(linkTo(methodOn(OrderController.class)
                    .cancelOrder(orderId)).withRel("cancel"));
                break;
            case CONFIRMED:
                model.add(linkTo(methodOn(OrderController.class)
                    .shipOrder(orderId, null)).withRel("ship"));
                model.add(linkTo(methodOn(OrderController.class)
                    .cancelOrder(orderId)).withRel("cancel"));
                break;
            case SHIPPED:
                model.add(linkTo(methodOn(OrderController.class)
                    .deliverOrder(orderId)).withRel("deliver"));
                break;
        }

        return model;
    }

    @GetMapping
    public CollectionModel<EntityModel<OrderDto>> listOrders(
            @RequestParam(defaultValue = "") String cursor,
            @RequestParam(defaultValue = "20") int limit) {

        CursorPage<OrderDto> page = orderService.findAll(cursor, limit);

        List<EntityModel<OrderDto>> orderModels = page.getItems().stream()
            .map(order -> EntityModel.of(order,
                linkTo(methodOn(OrderController.class)
                    .getOrder(order.getId())).withSelfRel()))
            .toList();

        CollectionModel<EntityModel<OrderDto>> collection =
            CollectionModel.of(orderModels);

        collection.add(linkTo(methodOn(OrderController.class)
            .listOrders("", limit)).withSelfRel());

        if (page.hasNext()) {
            collection.add(linkTo(methodOn(OrderController.class)
                .listOrders(page.getNextCursor(), limit)).withRel("next"));
        }

        return collection;
    }
}
```

## Common Pitfalls

- **Using verbs in URLs**: `/api/getUsers` or `/api/createOrder` violates REST conventions. The HTTP method already conveys the action — use `/api/users` with GET/POST instead. This enables proper HTTP caching and makes the API predictable
- **Returning 200 for everything**: Sending `200 OK` with an error body (`{"success": false, "error": "not found"}`) breaks HTTP semantics. Clients, proxies, and monitoring tools rely on status codes. Use 404, 422, 409, etc. appropriately
- **Inconsistent naming conventions**: Mixing `camelCase`, `snake_case`, and `kebab-case` across endpoints and response fields confuses consumers. Pick one convention (JSON standard is camelCase) and enforce it globally
- **Not implementing pagination from the start**: Returning unbounded collections works in development but causes timeouts and OOM errors in production when tables grow. Always paginate collection endpoints, even if the initial dataset is small
- **Ignoring idempotency for POST**: POST is not idempotent by default, meaning retries can create duplicate resources. Implement idempotency keys (`Idempotency-Key` header) for operations that create resources or trigger side effects, allowing safe client retries
- **Exposing internal IDs and database structure**: Using auto-increment integer IDs reveals business information (competitor can estimate your order volume). Use UUIDs or opaque identifiers. Never expose internal field names that leak implementation details
- **Versioning too aggressively**: Creating a new API version for every change leads to maintenance burden. Use additive changes (new optional fields) for backward-compatible evolution. Reserve version bumps for breaking changes that cannot be made backward-compatible

## Real-World Use Cases

**Payment Processing API**: Stripe's REST API exemplifies excellent design — resources map to domain concepts (charges, customers, subscriptions), idempotency keys prevent duplicate charges on network retries, expandable fields reduce round trips (`?expand[]=customer`), and versioning via date-based API versions (`Stripe-Version: 2023-10-16`) allows gradual migration. Each response includes a `request_id` for support debugging and webhook events reference the originating API call.

**E-Commerce Platform API**: A marketplace exposes REST APIs for sellers (product management, inventory, orders) and buyers (search, cart, checkout). Cursor-based pagination handles catalogs with millions of products. ETags on product resources enable conditional updates preventing lost writes when multiple sellers manage the same inventory. Rate limiting tiers (100 req/min for free, 1000 for premium) protect the platform while enabling high-volume integrations.

**Healthcare Integration API**: A hospital system exposes FHIR-compliant REST APIs for patient records, appointments, and lab results. Strict versioning ensures backward compatibility for connected medical devices. HATEOAS links guide clients through workflows (patient → appointments → results) without hardcoding URLs. Audit logging captures every API call with the authenticated user, timestamp, and accessed resources for HIPAA compliance.

## Interview Questions

**Q: How do you handle API versioning and what are the trade-offs of different approaches?**

A: Three main approaches: URI versioning (`/v1/users`), header versioning (`Accept: application/vnd.api.v1+json`), and query parameter (`/users?version=1`). URI versioning is most common because it is explicit, easy to route, cacheable by CDNs, and simple to document. The trade-off is that it violates REST's principle that a URI should identify a resource (the resource is the user, not "v1 of the user"). Header versioning is more RESTful but harder to test (can't just paste a URL in a browser), harder to cache, and requires client awareness. My recommendation: use URI versioning for major breaking changes (resource restructuring, removed fields) and evolve within a version using additive changes (new optional fields, new endpoints). Deprecate old versions with a sunset header and 12-month migration window. Never maintain more than 2 major versions simultaneously.

**Q: Explain cursor-based pagination and why it's preferred over offset-based for large datasets.**

A: Offset-based pagination (`?page=5&size=20`) translates to `OFFSET 80 LIMIT 20` in SQL, which requires the database to scan and discard 80 rows before returning 20. At page 10,000, the database scans 200,000 rows — performance degrades linearly with page depth. Additionally, if records are inserted or deleted between page requests, items can be skipped or duplicated. Cursor-based pagination uses an opaque token (typically an encoded primary key or timestamp) that marks the position: `?cursor=eyJpZCI6MTIzfQ&limit=20` translates to `WHERE id > 123 LIMIT 20`, which uses an index seek regardless of position in the dataset. Trade-offs: cursor-based doesn't support "jump to page N" (no random access), making it unsuitable for UIs with page number navigation. It also requires a stable sort order. Use cursor-based for infinite scroll, feeds, and large datasets; offset-based for admin dashboards with page numbers and small, stable datasets.

**Q: How would you design idempotency for a payment API?**

A: Require clients to send an `Idempotency-Key` header (UUID) with every POST request that creates resources or triggers side effects. Server-side implementation: before processing, check if the idempotency key exists in a store (Redis with TTL or DynamoDB). If found, return the stored response without re-executing the operation. If not found, process the request, store the response keyed by the idempotency key with a 24-hour TTL, then return the response. Critical details: the store must be checked and written atomically (use Redis `SET NX` or DynamoDB conditional writes) to prevent race conditions with concurrent retries. Store the full response (status code, headers, body) so retries get identical responses. Handle in-flight requests by storing a "processing" sentinel — if a retry arrives while the first request is still executing, return 409 or block briefly. Expire keys after 24 hours to bound storage. This pattern is essential for payment APIs where network timeouts can cause clients to retry, potentially creating duplicate charges.

## Production Tips

- **Implement request correlation IDs**: Generate a unique `X-Request-ID` for each incoming request (or accept one from the client) and propagate it through all downstream service calls and log entries. This enables tracing a single user request across dozens of microservices during incident investigation. Return the ID in the response so clients can reference it in support tickets
- **Use RFC 7807 Problem Details for errors**: Standardize error responses with `type` (URI identifying the error), `title` (human-readable summary), `status` (HTTP status code), `detail` (specific explanation), and `instance` (URI of the specific occurrence). This gives clients a machine-readable error taxonomy while remaining human-debuggable
- **Cache aggressively with proper invalidation**: Set `Cache-Control` headers on GET responses — `max-age=3600` for stable resources, `no-cache` (revalidate every time) for frequently changing data, `private` for user-specific responses. Use ETags for conditional requests that save bandwidth when resources haven't changed. CDN caching at the edge can reduce origin load by 80-95% for read-heavy APIs

## Related Topics

- [gRPC](./grpc.md) — High-performance alternative to REST for internal service communication
- [GraphQL](./graphql.md) — Query language alternative that solves REST's over-fetching and under-fetching problems
- [Spring REST](../spring-framework/spring-rest.md) — Spring-specific REST implementation patterns and best practices
- [Security](../../security/security/security.md) — Authentication, authorization, and API security patterns
