# API Design

## Quick Reference

- REST (Representational State Transfer) uses HTTP methods semantically: GET for reads, POST for creation, PUT for full replacement, PATCH for partial updates, DELETE for removal
- API versioning strategies: URL path (`/v1/users`), header-based (`Accept: application/vnd.api+json;version=1`), or query parameter (`?version=1`); URL path is most common and discoverable
- Pagination patterns: offset-based (`?page=2&limit=20`), cursor-based (`?cursor=eyJpZCI6MTAwfQ`), and keyset-based (`?after_id=100`); cursor-based is preferred for large datasets as it avoids count queries and handles insertions
- Idempotency keys allow clients to safely retry requests without causing duplicate side effects; essential for payment APIs and any non-idempotent operation
- HATEOAS (Hypermedia as the Engine of Application State) embeds navigation links in responses, enabling clients to discover available actions without hardcoding URLs
- GraphQL provides a single endpoint with client-specified queries, eliminating over-fetching and under-fetching but introducing query complexity concerns and caching challenges
- Error responses should use consistent structure: HTTP status code, machine-readable error code, human-readable message, and optional details array for validation errors
- Rate limiting headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) should be included on every response to enable client-side throttling

## When to Use

API design principles apply whenever you are building interfaces between systems, whether external public APIs consumed by third-party developers, internal APIs between microservices, or backend-for-frontend (BFF) APIs serving specific client applications. REST is appropriate for CRUD-heavy applications with well-defined resources, when you need broad client compatibility (every HTTP client speaks REST), and when cacheability is important (HTTP caching works naturally with GET requests). GraphQL is better suited for applications with complex, nested data requirements where different clients need different subsets of data, mobile applications where bandwidth is constrained and over-fetching is costly, and rapid frontend iteration where backend changes should not block UI development. gRPC is preferred for internal service-to-service communication where performance matters, streaming is required, and both client and server are under your control. In system design interviews, API design questions test your ability to create intuitive, consistent interfaces that handle edge cases gracefully and evolve without breaking existing clients.

## Code Examples

### RESTful API with Proper Error Handling and Pagination

```java
@RestController
@RequestMapping("/api/v1/orders")
public class OrderController {
    private final OrderService orderService;
    private final OrderMapper mapper;

    public OrderController(OrderService orderService, OrderMapper mapper) {
        this.orderService = orderService;
        this.mapper = mapper;
    }

    /**
     * List orders with cursor-based pagination.
     * Cursor encodes the last seen order ID and timestamp for stable pagination
     * even when new orders are inserted.
     */
    @GetMapping
    public ResponseEntity<PagedResponse<OrderSummaryDto>> listOrders(
            @RequestParam(defaultValue = "20") @Max(100) int limit,
            @RequestParam(required = false) String cursor,
            @RequestParam(required = false) OrderStatus status,
            @RequestParam(defaultValue = "created_at:desc") String sort,
            @AuthenticationPrincipal UserPrincipal user) {

        CursorPageRequest pageRequest = CursorPageRequest.builder()
            .cursor(cursor)
            .limit(limit)
            .filter(OrderFilter.builder().status(status).userId(user.getId()).build())
            .sort(Sort.parse(sort))
            .build();

        CursorPage<Order> page = orderService.findOrders(pageRequest);

        PagedResponse<OrderSummaryDto> response = PagedResponse.<OrderSummaryDto>builder()
            .data(page.getItems().stream().map(mapper::toSummaryDto).toList())
            .pagination(PaginationMeta.builder()
                .hasNext(page.hasNext())
                .nextCursor(page.getNextCursor())
                .totalEstimate(page.getTotalEstimate())
                .build())
            .links(PaginationLinks.builder()
                .self(buildPageLink(limit, cursor, status, sort))
                .next(page.hasNext()
                    ? buildPageLink(limit, page.getNextCursor(), status, sort)
                    : null)
                .build())
            .build();

        return ResponseEntity.ok()
            .header("X-Total-Count-Estimate", String.valueOf(page.getTotalEstimate()))
            .body(response);
    }

    /**
     * Create order with idempotency key to prevent duplicate orders on retry.
     * The idempotency key is stored for 24 hours; duplicate requests return
     * the original response without re-executing the operation.
     */
    @PostMapping
    public ResponseEntity<OrderDto> createOrder(
            @Valid @RequestBody CreateOrderRequest request,
            @RequestHeader("Idempotency-Key") String idempotencyKey,
            @AuthenticationPrincipal UserPrincipal user) {

        // Check for existing idempotent response
        Optional<IdempotentResponse> existing = orderService
            .findIdempotentResponse(idempotencyKey);
        if (existing.isPresent()) {
            return ResponseEntity.status(existing.get().getStatusCode())
                .body(existing.get().getBody(OrderDto.class));
        }

        Order order = orderService.createOrder(user.getId(), request, idempotencyKey);
        OrderDto dto = mapper.toDto(order);

        URI location = ServletUriComponentsBuilder.fromCurrentRequest()
            .path("/{id}")
            .buildAndExpand(order.getId())
            .toUri();

        return ResponseEntity.created(location)
            .header("Idempotency-Key", idempotencyKey)
            .body(dto);
    }

    /**
     * Partial update using JSON Patch (RFC 6902) for fine-grained modifications.
     * Supports optimistic concurrency via ETag/If-Match headers.
     */
    @PatchMapping(value = "/{orderId}", consumes = "application/json-patch+json")
    public ResponseEntity<OrderDto> patchOrder(
            @PathVariable UUID orderId,
            @RequestBody JsonPatch patch,
            @RequestHeader("If-Match") String etag,
            @AuthenticationPrincipal UserPrincipal user) {

        Order order = orderService.findById(orderId)
            .orElseThrow(() -> new ResourceNotFoundException("Order", orderId));

        // Verify ownership
        if (!order.getUserId().equals(user.getId())) {
            throw new ForbiddenException("Cannot modify another user's order");
        }

        // Optimistic concurrency check
        if (!order.getVersion().toString().equals(etag.replace("\"", ""))) {
            throw new ConflictException("Order has been modified since last read");
        }

        Order updated = orderService.applyPatch(order, patch);
        OrderDto dto = mapper.toDto(updated);

        return ResponseEntity.ok()
            .eTag("\"" + updated.getVersion() + "\"")
            .body(dto);
    }

    /**
     * Structured error handling with consistent error response format.
     */
    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<ErrorResponse> handleNotFound(ResourceNotFoundException ex) {
        ErrorResponse error = ErrorResponse.builder()
            .status(404)
            .code("RESOURCE_NOT_FOUND")
            .message(ex.getMessage())
            .details(List.of(
                ErrorDetail.builder()
                    .field(ex.getResourceType().toLowerCase() + "_id")
                    .message(ex.getResourceType() + " with ID " + ex.getResourceId() + " not found")
                    .build()
            ))
            .timestamp(Instant.now())
            .requestId(MDC.get("requestId"))
            .build();

        return ResponseEntity.status(404).body(error);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidation(MethodArgumentNotValidException ex) {
        List<ErrorDetail> details = ex.getBindingResult().getFieldErrors().stream()
            .map(fe -> ErrorDetail.builder()
                .field(fe.getField())
                .message(fe.getDefaultMessage())
                .rejectedValue(fe.getRejectedValue())
                .build())
            .toList();

        ErrorResponse error = ErrorResponse.builder()
            .status(422)
            .code("VALIDATION_ERROR")
            .message("Request validation failed")
            .details(details)
            .timestamp(Instant.now())
            .requestId(MDC.get("requestId"))
            .build();

        return ResponseEntity.status(422).body(error);
    }
}
```

### GraphQL Schema with DataLoader Pattern

```typescript
import { ApolloServer } from '@apollo/server';
import DataLoader from 'dataloader';

// Type definitions with clear domain modeling
const typeDefs = `#graphql
  type Query {
    order(id: ID!): Order
    orders(
      first: Int = 20
      after: String
      filter: OrderFilterInput
    ): OrderConnection!
    user(id: ID!): User
  }

  type Mutation {
    createOrder(input: CreateOrderInput!): CreateOrderPayload!
    cancelOrder(id: ID!, reason: String!): CancelOrderPayload!
  }

  """Relay-style connection for cursor-based pagination"""
  type OrderConnection {
    edges: [OrderEdge!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  type OrderEdge {
    node: Order!
    cursor: String!
  }

  type PageInfo {
    hasNextPage: Boolean!
    hasPreviousPage: Boolean!
    startCursor: String
    endCursor: String
  }

  type Order {
    id: ID!
    status: OrderStatus!
    items: [OrderItem!]!
    customer: User!
    shippingAddress: Address!
    totalAmount: Money!
    createdAt: DateTime!
    updatedAt: DateTime!
    timeline: [OrderEvent!]!
  }

  type OrderItem {
    id: ID!
    product: Product!
    quantity: Int!
    unitPrice: Money!
    lineTotal: Money!
  }

  type Money {
    amount: Int!          # Amount in smallest currency unit (cents)
    currency: String!     # ISO 4217 currency code
    formatted: String!    # Human-readable format
  }

  input CreateOrderInput {
    items: [OrderItemInput!]!
    shippingAddressId: ID!
    paymentMethodId: ID!
    idempotencyKey: String!
  }

  type CreateOrderPayload {
    order: Order
    errors: [UserError!]!
  }

  type UserError {
    field: [String!]
    message: String!
    code: ErrorCode!
  }

  enum OrderStatus {
    PENDING
    CONFIRMED
    PROCESSING
    SHIPPED
    DELIVERED
    CANCELLED
  }

  enum ErrorCode {
    INVALID_INPUT
    INSUFFICIENT_STOCK
    PAYMENT_FAILED
    NOT_FOUND
    UNAUTHORIZED
  }
`;

// Resolvers with DataLoader for N+1 prevention
const resolvers = {
  Query: {
    order: async (_: unknown, { id }: { id: string }, context: GraphQLContext) => {
      return context.dataloaders.orders.load(id);
    },

    orders: async (
      _: unknown,
      args: { first: number; after?: string; filter?: OrderFilter },
      context: GraphQLContext
    ) => {
      const { first, after, filter } = args;
      const userId = context.currentUser.id;

      const result = await context.services.orders.findPaginated({
        userId,
        limit: Math.min(first, 100), // Cap at 100 to prevent abuse
        cursor: after ? decodeCursor(after) : undefined,
        filter,
      });

      return {
        edges: result.items.map(order => ({
          node: order,
          cursor: encodeCursor({ id: order.id, createdAt: order.createdAt }),
        })),
        pageInfo: {
          hasNextPage: result.hasNext,
          hasPreviousPage: !!after,
          startCursor: result.items.length > 0
            ? encodeCursor({ id: result.items[0].id, createdAt: result.items[0].createdAt })
            : null,
          endCursor: result.items.length > 0
            ? encodeCursor({
                id: result.items[result.items.length - 1].id,
                createdAt: result.items[result.items.length - 1].createdAt,
              })
            : null,
        },
        totalCount: result.totalCount,
      };
    },
  },

  Order: {
    // DataLoader batches multiple customer lookups into a single query
    customer: (order: Order, _: unknown, context: GraphQLContext) => {
      return context.dataloaders.users.load(order.customerId);
    },

    items: (order: Order, _: unknown, context: GraphQLContext) => {
      return context.dataloaders.orderItems.load(order.id);
    },

    timeline: (order: Order, _: unknown, context: GraphQLContext) => {
      return context.dataloaders.orderEvents.load(order.id);
    },
  },

  Mutation: {
    createOrder: async (
      _: unknown,
      { input }: { input: CreateOrderInput },
      context: GraphQLContext
    ) => {
      // Idempotency check
      const existing = await context.services.idempotency.find(input.idempotencyKey);
      if (existing) return existing;

      try {
        const order = await context.services.orders.create({
          userId: context.currentUser.id,
          ...input,
        });

        const payload = { order, errors: [] };
        await context.services.idempotency.store(input.idempotencyKey, payload);
        return payload;
      } catch (error) {
        if (error instanceof InsufficientStockError) {
          return {
            order: null,
            errors: [{
              field: ['items'],
              message: `Insufficient stock for product ${error.productId}`,
              code: 'INSUFFICIENT_STOCK',
            }],
          };
        }
        throw error;
      }
    },
  },
};

// DataLoader factory: creates batched loaders per request
function createDataLoaders(services: Services): DataLoaders {
  return {
    orders: new DataLoader(async (ids: readonly string[]) => {
      const orders = await services.orders.findByIds([...ids]);
      const orderMap = new Map(orders.map(o => [o.id, o]));
      return ids.map(id => orderMap.get(id) || null);
    }),

    users: new DataLoader(async (ids: readonly string[]) => {
      const users = await services.users.findByIds([...ids]);
      const userMap = new Map(users.map(u => [u.id, u]));
      return ids.map(id => userMap.get(id) || null);
    }),

    orderItems: new DataLoader(async (orderIds: readonly string[]) => {
      const items = await services.orderItems.findByOrderIds([...orderIds]);
      const grouped = groupBy(items, 'orderId');
      return orderIds.map(id => grouped[id] || []);
    }),

    orderEvents: new DataLoader(async (orderIds: readonly string[]) => {
      const events = await services.orderEvents.findByOrderIds([...orderIds]);
      const grouped = groupBy(events, 'orderId');
      return orderIds.map(id => grouped[id] || []);
    }),
  };
}
```

### API Versioning Strategy

```typescript
/**
 * API versioning with content negotiation and transformation layers.
 * Supports multiple active versions simultaneously with minimal code duplication.
 */
import { Router, Request, Response, NextFunction } from 'express';

interface VersionConfig {
  version: number;
  deprecated?: boolean;
  sunsetDate?: string;
  transformResponse: (data: any) => any;
  transformRequest: (data: any) => any;
}

const versionConfigs: Map<number, VersionConfig> = new Map([
  [1, {
    version: 1,
    deprecated: true,
    sunsetDate: '2025-06-01',
    transformResponse: (order: InternalOrder) => ({
      id: order.id,
      status: order.status,
      total: order.totalCents / 100, // V1 used dollars (breaking change in V2)
      currency: order.currency,
      items: order.items.map(item => ({
        product_id: item.productId, // V1 used snake_case
        quantity: item.quantity,
        price: item.unitPriceCents / 100,
      })),
      created_at: order.createdAt.toISOString(),
    }),
    transformRequest: (data: any) => ({
      ...data,
      totalCents: Math.round(data.total * 100),
      items: data.items?.map((item: any) => ({
        productId: item.product_id,
        quantity: item.quantity,
        unitPriceCents: Math.round(item.price * 100),
      })),
    }),
  }],
  [2, {
    version: 2,
    transformResponse: (order: InternalOrder) => ({
      id: order.id,
      status: order.status,
      totalAmount: {
        cents: order.totalCents,       // V2 uses cents (no floating point)
        currency: order.currency,
        formatted: formatMoney(order.totalCents, order.currency),
      },
      items: order.items.map(item => ({
        productId: item.productId,     // V2 uses camelCase
        quantity: item.quantity,
        unitPrice: {
          cents: item.unitPriceCents,
          currency: order.currency,
          formatted: formatMoney(item.unitPriceCents, order.currency),
        },
      })),
      createdAt: order.createdAt.toISOString(),
      _links: {                        // V2 adds HATEOAS links
        self: { href: `/api/v2/orders/${order.id}` },
        cancel: order.status === 'PENDING'
          ? { href: `/api/v2/orders/${order.id}/cancel`, method: 'POST' }
          : undefined,
        customer: { href: `/api/v2/users/${order.customerId}` },
      },
    }),
    transformRequest: (data: any) => data, // V2 matches internal format
  }],
]);

/**
 * Version extraction middleware.
 * Supports URL path versioning (/v1/, /v2/) and Accept header versioning.
 */
function extractVersion(req: Request, res: Response, next: NextFunction): void {
  // Try URL path first: /api/v2/orders
  const pathMatch = req.path.match(/\/v(\d+)\//);
  if (pathMatch) {
    req.apiVersion = parseInt(pathMatch[1]);
    next();
    return;
  }

  // Fall back to Accept header: application/vnd.myapi+json;version=2
  const accept = req.headers.accept || '';
  const headerMatch = accept.match(/version=(\d+)/);
  if (headerMatch) {
    req.apiVersion = parseInt(headerMatch[1]);
    next();
    return;
  }

  // Default to latest version
  req.apiVersion = 2;
  next();
}

/**
 * Response transformation middleware.
 * Applies version-specific transformations and adds deprecation headers.
 */
function versionedResponse(req: Request, res: Response, next: NextFunction): void {
  const originalJson = res.json.bind(res);

  res.json = (data: any) => {
    const config = versionConfigs.get(req.apiVersion);
    if (!config) {
      return originalJson({ error: 'Unsupported API version' });
    }

    // Add deprecation headers for old versions
    if (config.deprecated) {
      res.setHeader('Deprecation', 'true');
      res.setHeader('Sunset', config.sunsetDate!);
      res.setHeader('Link', `</api/v2${req.path}>; rel="successor-version"`);
    }

    // Add version header
    res.setHeader('X-API-Version', config.version.toString());

    // Transform response data
    const transformed = Array.isArray(data)
      ? data.map(config.transformResponse)
      : config.transformResponse(data);

    return originalJson(transformed);
  };

  next();
}
```

## Common Pitfalls

- Breaking backward compatibility without versioning: changing response field names, removing fields, or altering data types in an existing API version breaks all existing clients simultaneously. Every breaking change requires a new API version with a migration period. Additive changes (new optional fields, new endpoints) are safe within a version; subtractive or type-changing modifications are not.

- Using HTTP status codes incorrectly: returning 200 for errors (with error details in the body), using 400 for all client errors without distinguishing between validation failures (422), authentication failures (401), and authorization failures (403), or returning 500 for expected business logic failures. Each status code has specific semantics that clients and intermediaries (proxies, CDNs, monitoring) rely on. Use 201 for resource creation, 204 for successful deletion, 409 for conflicts, and 422 for validation errors.

- Designing chatty APIs that require many round-trips: if rendering a single page requires 15 sequential API calls, the cumulative latency destroys user experience, especially on mobile networks. Design APIs around use cases rather than database tables. Provide composite endpoints, allow field expansion (`?include=items,customer`), or use GraphQL for complex data requirements. The BFF (Backend for Frontend) pattern creates purpose-built APIs for specific client needs.

- Exposing internal implementation details in API contracts: leaking database column names, internal IDs, or implementation-specific data structures into your API creates tight coupling between your API contract and your implementation. When you refactor internally, you break the API. Use DTOs (Data Transfer Objects) that represent the API contract independently of internal models, and map between them explicitly.

- Not implementing idempotency for non-GET operations: network failures, timeouts, and client retries are inevitable. Without idempotency keys, a retried POST request creates duplicate resources. Require clients to provide an `Idempotency-Key` header for all state-changing operations. Store the response for each key and return the stored response on duplicate requests. This is critical for payment APIs, order creation, and any operation with real-world side effects.

- Ignoring pagination for list endpoints: returning unbounded result sets causes memory issues on both server and client, increases response times, and makes the API unusable as data grows. Always paginate list endpoints with a reasonable default limit (20-50) and a maximum limit (100-200). Cursor-based pagination is preferred over offset-based for large datasets because it handles concurrent insertions correctly and does not degrade with high offsets.

## Real-World Use Cases

**Stripe API Design**: Stripe is widely considered the gold standard for API design. Their API uses URL-path versioning with dated versions (2023-10-16) that pin clients to specific API behavior. They support expandable objects (`?expand[]=customer`) to reduce round-trips, cursor-based pagination with `has_more` and `starting_after` parameters, and idempotency keys for all POST requests. Error responses include a `type` (api_error, card_error, invalid_request_error), a machine-readable `code`, and a human-readable `message`. Their webhook system uses signed payloads with timestamp-based replay protection. Stripe maintains backward compatibility within a version indefinitely and provides automatic migration tools between versions.

**GitHub REST and GraphQL APIs**: GitHub offers both REST (v3) and GraphQL (v4) APIs, demonstrating the evolution from resource-oriented REST to query-oriented GraphQL. Their REST API uses Link headers for pagination, conditional requests (ETag/If-None-Match) for caching, and OAuth scopes for fine-grained permissions. The GraphQL API solves REST's over-fetching problem: a single query can fetch a repository with its issues, pull requests, and contributors without multiple round-trips. GitHub implements query complexity limits (point-based) to prevent expensive queries from overloading their servers, and rate limits are separate for REST (5000/hour) and GraphQL (5000 points/hour).

**Twilio API Consistency**: Twilio maintains exceptional consistency across dozens of API products. Every resource follows the same patterns: list endpoints return paginated collections with `page_size` and `page_token`, all resources have `sid` (string ID), `date_created`, and `date_updated` fields, and all mutations return the full updated resource. Their error responses always include a numeric error code, a message, and a `more_info` URL linking to detailed documentation. This consistency means developers who learn one Twilio API can immediately use any other Twilio product without reading documentation for basic operations.

**Netflix API Gateway (Zuul)**: Netflix's API gateway handles billions of requests daily, implementing API composition, routing, and cross-cutting concerns. Their BFF pattern creates optimized APIs for each client type (iOS, Android, TV, Web) that aggregate data from dozens of microservices into single responses tailored to each device's screen and capabilities. The gateway handles authentication, rate limiting, request/response transformation, and circuit breaking. This architecture allows backend services to evolve independently while maintaining stable client-facing APIs.

## Interview Questions

**Q: How would you design an API versioning strategy for a public API with thousands of consumers?**

A: Use URL-path versioning (`/v1/`, `/v2/`) for major breaking changes because it is the most discoverable and debuggable approach. Within a version, use additive-only changes (new fields, new endpoints) that do not break existing clients. For the transition between versions: (1) announce deprecation with a timeline (minimum 12 months for public APIs), (2) add `Deprecation` and `Sunset` HTTP headers to old version responses, (3) provide migration guides and automated tooling where possible, (4) monitor old version usage and reach out to high-volume consumers directly, (5) maintain the old version in read-only mode after sunset before full removal. Internally, implement a transformation layer that converts between the canonical internal representation and each API version's format. This avoids maintaining separate codepaths for each version. The key tradeoff is between version proliferation (too many versions to maintain) and breaking changes (forcing consumers to update too frequently).

**Q: Compare REST and GraphQL. When would you choose each?**

A: REST excels when: resources map cleanly to CRUD operations, HTTP caching is important (GET requests are cacheable by default), the API serves many different client types with similar data needs, and simplicity and broad tooling support matter. GraphQL excels when: clients have diverse data requirements (mobile needs less data than web), the data model is deeply nested with many relationships, frontend teams need to iterate quickly without backend changes, and reducing round-trips is critical (single request for complex data). REST's weaknesses are over-fetching (getting fields you do not need) and under-fetching (needing multiple requests for related data). GraphQL's weaknesses are caching complexity (no HTTP-level caching for POST queries), query cost unpredictability (a single query can be trivial or extremely expensive), and the N+1 problem requiring DataLoader patterns. In practice, many organizations use both: GraphQL for client-facing BFF APIs and REST for service-to-service communication where simplicity and cacheability matter more.

**Q: How do you handle backward-compatible API evolution without versioning?**

A: Use additive-only changes within a version: add new optional fields to responses (clients ignore unknown fields), add new optional parameters to requests (server uses defaults for missing params), add new endpoints for new functionality, and add new enum values only if clients handle unknown values gracefully. Never remove fields, rename fields, change field types, make optional fields required, or change the semantic meaning of existing fields. Use feature flags or capability negotiation for gradual rollouts: clients can opt into new behavior via headers (`X-Feature: new-pricing-model`). For response format evolution, use the "tolerant reader" pattern where clients only parse fields they need and ignore everything else. This approach works well for internal APIs but has limits for public APIs where breaking changes are eventually necessary (hence versioning).

**Q: Design a pagination strategy for an API that serves a real-time feed with frequent insertions.**

A: Cursor-based pagination is essential here because offset-based pagination breaks when items are inserted: page 2 with offset 20 might show items that were already on page 1 if new items were inserted. Use an opaque cursor that encodes the last seen item's sort key (typically a timestamp + ID for uniqueness). The query becomes `WHERE (created_at, id) < (cursor_timestamp, cursor_id) ORDER BY created_at DESC, id DESC LIMIT 21` (fetch one extra to determine `hasNext`). For real-time feeds, also provide a "newer items" mechanism: return a `since` cursor that clients can poll with to get items newer than their latest. Combine with WebSocket push for truly real-time updates, using the cursor as a checkpoint for reconnection. The cursor should be opaque (base64-encoded) so you can change the underlying implementation without breaking clients.

## Production Tips

- Implement request correlation IDs that flow through all services. Generate a unique ID at the API gateway, pass it via headers (`X-Request-ID`) to all downstream services, include it in all log entries, and return it in error responses. This enables end-to-end request tracing for debugging production issues. Clients should also be able to provide their own correlation ID that gets logged alongside the server-generated one.

- Design your error responses for both humans and machines. Include a stable machine-readable error code (e.g., `INSUFFICIENT_FUNDS`) that clients can switch on programmatically, a human-readable message for debugging, a documentation URL for the specific error, and structured details for validation errors (which field failed, why, and what was the rejected value). Never expose internal stack traces, database errors, or implementation details in production error responses as they leak security-sensitive information.

- Monitor API usage patterns to inform design decisions. Track which fields are actually read by clients (using response field access logging or GraphQL query analysis), which endpoints have the highest latency, which error codes are most common, and which API versions still have active traffic. This data drives decisions about what to optimize, what to deprecate, and where to invest in new capabilities. Set up alerts for unusual patterns like sudden spikes in 4xx errors (indicates a client bug or breaking change) or 5xx errors (indicates a server issue).

## Related Topics

- [Rate Limiting](./rate-limiting.md) — Rate limiting is a critical cross-cutting concern in API design that protects services from abuse and ensures fair usage across clients
- [Load Balancing](./load-balancing.md) — API gateways combine routing, rate limiting, and load balancing to manage traffic to backend services
- [Event-Driven Architecture](./event-driven-architecture.md) — Webhooks and event-driven APIs complement request-response APIs for real-time notifications and async workflows
- [Distributed Systems](./distributed-systems.md) — API design for distributed systems must account for partial failures, eventual consistency, and network partitions
