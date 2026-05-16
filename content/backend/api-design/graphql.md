# GraphQL

## Quick Reference

- GraphQL is a query language for APIs where clients specify exactly what data they need — no over-fetching or under-fetching
- Schema-first development: define types and operations in SDL (Schema Definition Language) before implementing resolvers
- Three operation types: `query` (read), `mutation` (write), `subscription` (real-time via WebSocket)
- The N+1 problem is GraphQL's biggest performance trap — DataLoader batches and caches database calls within a single request
- Federation enables composing multiple GraphQL services into a single unified graph (Apollo Federation, Schema Stitching)
- Introspection allows clients to discover the schema at runtime — disable in production for security
- Persisted queries hash query strings to reduce payload size and prevent arbitrary query execution
- Complexity analysis and depth limiting prevent malicious queries from consuming excessive server resources

## When to Use

GraphQL excels when clients have diverse data requirements that a fixed REST endpoint cannot efficiently serve. Choose GraphQL for mobile applications where bandwidth is constrained and over-fetching wastes data, for frontend-heavy applications where different views need different subsets of the same entities, for API aggregation layers (BFF — Backend for Frontend) that compose data from multiple microservices, and for rapidly evolving UIs where adding new fields shouldn't require backend changes. GraphQL is less suitable for simple CRUD APIs with predictable access patterns (REST is simpler), for file uploads (requires multipart extensions), for real-time high-frequency data (gRPC streaming is more efficient), or when HTTP caching is critical (GraphQL uses POST, making CDN caching harder without persisted queries). The operational complexity of GraphQL — schema governance, performance monitoring per field, N+1 prevention, and query cost analysis — means it adds value primarily when the client diversity and data flexibility benefits outweigh the infrastructure investment.

## Code Examples

### Schema Design with TypeScript (Apollo Server)

```typescript
import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { GraphQLError } from 'graphql';

const typeDefs = `#graphql
  type Query {
    user(id: ID!): User
    users(filter: UserFilter, pagination: PaginationInput): UserConnection!
    order(id: ID!): Order
  }

  type Mutation {
    createUser(input: CreateUserInput!): CreateUserPayload!
    updateUser(id: ID!, input: UpdateUserInput!): UpdateUserPayload!
    createOrder(input: CreateOrderInput!): CreateOrderPayload!
  }

  type Subscription {
    orderStatusChanged(orderId: ID!): OrderStatusEvent!
  }

  # Relay-style connection for cursor pagination
  type UserConnection {
    edges: [UserEdge!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  type UserEdge {
    node: User!
    cursor: String!
  }

  type PageInfo {
    hasNextPage: Boolean!
    hasPreviousPage: Boolean!
    startCursor: String
    endCursor: String
  }

  type User {
    id: ID!
    email: String!
    name: String!
    role: UserRole!
    orders(first: Int = 10, after: String): OrderConnection!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type Order {
    id: ID!
    customer: User!
    items: [OrderItem!]!
    status: OrderStatus!
    total: Money!
    createdAt: DateTime!
  }

  type OrderItem {
    product: Product!
    quantity: Int!
    unitPrice: Money!
  }

  type Money {
    amount: Int!       # Cents to avoid floating point
    currency: String!  # ISO 4217
  }

  # Input types for mutations
  input CreateUserInput {
    email: String!
    name: String!
    role: UserRole = CUSTOMER
  }

  input CreateOrderInput {
    customerId: ID!
    items: [OrderItemInput!]!
    idempotencyKey: String!
  }

  input OrderItemInput {
    productId: ID!
    quantity: Int!
  }

  # Mutation payloads follow a consistent pattern
  type CreateUserPayload {
    user: User
    errors: [UserError!]!
  }

  type UserError {
    field: String
    message: String!
    code: ErrorCode!
  }

  enum UserRole { ADMIN CUSTOMER SELLER }
  enum OrderStatus { PENDING CONFIRMED SHIPPED DELIVERED CANCELLED }
  enum ErrorCode { VALIDATION_ERROR NOT_FOUND CONFLICT UNAUTHORIZED }

  scalar DateTime

  input UserFilter {
    role: UserRole
    createdAfter: DateTime
    search: String
  }

  input PaginationInput {
    first: Int = 20
    after: String
  }
`;
```

### Resolvers with DataLoader for N+1 Prevention

```typescript
import DataLoader from 'dataloader';
import { Resolvers } from './generated/types';

// DataLoader factory — create new loaders per request to avoid cross-request caching
function createLoaders(db: Database) {
  return {
    userLoader: new DataLoader<string, User>(async (ids) => {
      const users = await db.users.findByIds([...ids]);
      // DataLoader requires results in same order as input IDs
      const userMap = new Map(users.map(u => [u.id, u]));
      return ids.map(id => userMap.get(id) || new Error(`User ${id} not found`));
    }),

    ordersByUserLoader: new DataLoader<string, Order[]>(async (userIds) => {
      const orders = await db.orders.findByCustomerIds([...userIds]);
      const grouped = new Map<string, Order[]>();
      orders.forEach(order => {
        const existing = grouped.get(order.customerId) || [];
        existing.push(order);
        grouped.set(order.customerId, existing);
      });
      return userIds.map(id => grouped.get(id) || []);
    }),

    productLoader: new DataLoader<string, Product>(async (ids) => {
      const products = await db.products.findByIds([...ids]);
      const productMap = new Map(products.map(p => [p.id, p]));
      return ids.map(id => productMap.get(id) || new Error(`Product ${id} not found`));
    }),
  };
}

const resolvers: Resolvers = {
  Query: {
    user: async (_, { id }, { loaders }) => {
      return loaders.userLoader.load(id);
    },

    users: async (_, { filter, pagination }, { db }) => {
      const { first = 20, after } = pagination || {};
      const cursor = after ? decodeCursor(after) : null;

      const { items, hasMore, totalCount } = await db.users.findPaginated({
        filter,
        limit: first + 1, // Fetch one extra to determine hasNextPage
        afterId: cursor?.id,
      });

      const edges = items.slice(0, first).map(user => ({
        node: user,
        cursor: encodeCursor({ id: user.id }),
      }));

      return {
        edges,
        pageInfo: {
          hasNextPage: items.length > first,
          hasPreviousPage: !!after,
          startCursor: edges[0]?.cursor || null,
          endCursor: edges[edges.length - 1]?.cursor || null,
        },
        totalCount,
      };
    },
  },

  Mutation: {
    createOrder: async (_, { input }, { db, loaders, currentUser }) => {
      // Authorization check
      if (!currentUser) {
        return {
          order: null,
          errors: [{ message: 'Authentication required', code: 'UNAUTHORIZED' }],
        };
      }

      // Idempotency check
      const existing = await db.orders.findByIdempotencyKey(input.idempotencyKey);
      if (existing) {
        return { order: existing, errors: [] };
      }

      // Validate products exist and have sufficient stock
      const products = await Promise.all(
        input.items.map(item => loaders.productLoader.load(item.productId))
      );

      const errors = [];
      for (let i = 0; i < input.items.length; i++) {
        const product = products[i];
        if (product instanceof Error) {
          errors.push({
            field: `items[${i}].productId`,
            message: `Product not found`,
            code: 'NOT_FOUND' as const,
          });
        }
      }

      if (errors.length > 0) {
        return { order: null, errors };
      }

      const order = await db.orders.create({
        customerId: input.customerId,
        items: input.items,
        idempotencyKey: input.idempotencyKey,
      });

      return { order, errors: [] };
    },
  },

  // Field-level resolvers for relationships
  User: {
    orders: async (user, { first, after }, { loaders }) => {
      // DataLoader batches these calls across all users in the query
      const allOrders = await loaders.ordersByUserLoader.load(user.id);
      // Apply pagination on the loaded results
      return paginateArray(allOrders, { first, after });
    },
  },

  Order: {
    customer: async (order, _, { loaders }) => {
      return loaders.userLoader.load(order.customerId);
    },
  },

  OrderItem: {
    product: async (item, _, { loaders }) => {
      return loaders.productLoader.load(item.productId);
    },
  },
};
```

### Query Complexity and Depth Limiting

```typescript
import { ApolloServer } from '@apollo/server';
import { createComplexityLimitRule } from 'graphql-validation-complexity';
import depthLimit from 'graphql-depth-limit';

// Custom complexity calculation
const complexityRule = createComplexityLimitRule(1000, {
  scalarCost: 1,
  objectCost: 2,
  listFactor: 10, // Lists multiply child complexity
  introspectionListFactor: 2,
  formatErrorMessage: (cost: number) =>
    `Query complexity ${cost} exceeds maximum allowed complexity of 1000`,
});

const server = new ApolloServer({
  typeDefs,
  resolvers,
  validationRules: [
    depthLimit(7), // Max query depth
    complexityRule,
  ],
  plugins: [
    // Query cost logging
    {
      async requestDidStart() {
        const start = Date.now();
        return {
          async willSendResponse({ response, contextValue }) {
            const duration = Date.now() - start;
            contextValue.logger.info('GraphQL request completed', {
              duration,
              operationName: contextValue.operationName,
              complexity: contextValue.queryComplexity,
            });
          },
          async didEncounterErrors({ errors, contextValue }) {
            contextValue.logger.error('GraphQL errors', { errors });
          },
        };
      },
    },
    // Persisted queries for production
    {
      async requestDidStart({ request }) {
        if (process.env.NODE_ENV === 'production' && !request.extensions?.persistedQuery) {
          throw new GraphQLError('Only persisted queries allowed in production', {
            extensions: { code: 'PERSISTED_QUERY_REQUIRED' },
          });
        }
      },
    },
  ],
});
```

### Apollo Federation (Subgraph)

```typescript
import { buildSubgraphSchema } from '@apollo/subgraph';
import { ApolloServer } from '@apollo/server';
import gql from 'graphql-tag';

// Users subgraph — owns User entity
const typeDefs = gql`
  extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@shareable", "@external"])

  type Query {
    me: User
    user(id: ID!): User
  }

  type User @key(fields: "id") {
    id: ID!
    email: String!
    name: String!
    role: UserRole!
    createdAt: DateTime!
  }

  enum UserRole { ADMIN CUSTOMER SELLER }
  scalar DateTime
`;

const resolvers = {
  Query: {
    me: (_, __, { currentUser }) => currentUser,
    user: (_, { id }, { dataSources }) => dataSources.users.findById(id),
  },
  User: {
    // Federation resolver — called when other subgraphs reference User
    __resolveReference: (reference, { dataSources }) => {
      return dataSources.users.findById(reference.id);
    },
  },
};

// Orders subgraph — extends User with orders field
const ordersTypeDefs = gql`
  extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@external"])

  type Query {
    order(id: ID!): Order
  }

  type Order @key(fields: "id") {
    id: ID!
    customer: User!
    items: [OrderItem!]!
    status: OrderStatus!
    total: Int!
  }

  # Extend User from users subgraph
  type User @key(fields: "id") {
    id: ID! @external
    orders(first: Int = 10): [Order!]!
  }

  type OrderItem {
    productId: ID!
    quantity: Int!
    unitPrice: Int!
  }

  enum OrderStatus { PENDING CONFIRMED SHIPPED DELIVERED }
`;

const ordersResolvers = {
  User: {
    orders: (user, { first }, { dataSources }) => {
      return dataSources.orders.findByCustomerId(user.id, { limit: first });
    },
  },
  Order: {
    customer: (order) => ({ __typename: 'User', id: order.customerId }),
  },
};
```

## Common Pitfalls

- **The N+1 query problem**: Without DataLoader, fetching a list of 50 users with their orders generates 1 query for users + 50 individual queries for each user's orders. DataLoader batches these into 2 queries total. Always use DataLoader (or equivalent) for any field that triggers a database call
- **Unbounded queries without complexity limits**: A malicious client can craft deeply nested queries (`{ user { orders { items { product { reviews { author { orders ... } } } } } } }`) that exponentially increase server load. Implement depth limiting (max 7-10 levels) and query complexity scoring
- **Exposing internal data models directly**: Mapping database tables 1:1 to GraphQL types leaks implementation details and makes schema evolution difficult. Design the schema from the client's perspective, using resolvers to transform internal representations
- **Not handling partial failures**: In GraphQL, a single resolver failure can null out an entire branch of the response. Use nullable fields strategically — make fields non-null only when you can guarantee they'll resolve. Return partial data with errors rather than failing the entire query
- **Over-fetching in resolvers**: A resolver for `User.email` that loads the entire user record from the database wastes resources when only the email is needed. Use field-level selection awareness (`info.fieldNodes`) or DataLoader to batch and deduplicate
- **Schema design without pagination**: Returning unbounded lists (`orders: [Order!]!`) works in development but causes timeouts in production. Always paginate list fields using Relay connection spec (edges/nodes/pageInfo) or simple limit/offset arguments

## Real-World Use Cases

**GitHub's Public API**: GitHub migrated from REST (v3) to GraphQL (v4) because their REST API required clients to make 3-5 requests to assemble data for a single page view (repository + branches + pull requests + reviews). With GraphQL, clients fetch exactly what they need in one request. They use persisted queries, query complexity limits (point system per field), and rate limiting based on query cost rather than request count.

**Shopify's Storefront API**: Shopify exposes a GraphQL API for custom storefronts that serves millions of merchants. The schema is designed around commerce concepts (products, collections, carts, checkouts) rather than database tables. They use schema stitching to compose APIs from multiple internal services and implement aggressive caching at the CDN level using persisted query hashes as cache keys.

**Netflix's API Gateway**: Netflix uses GraphQL as a BFF (Backend for Frontend) layer that aggregates data from hundreds of microservices. Different clients (TV app, mobile app, web) send different queries optimized for their UI needs. The gateway resolves fields by calling appropriate microservices, with DataLoader batching calls to the same service within a single request.

## Interview Questions

**Q: Explain the N+1 problem in GraphQL and how DataLoader solves it.**

A: The N+1 problem occurs when resolving a list field triggers individual database queries for each item. Example: querying 100 users with their orders generates 1 query for users + 100 queries for orders (one per user). DataLoader solves this by batching and caching within a single request execution. When multiple resolvers call `loader.load(userId)` during the same tick of the event loop, DataLoader collects all IDs and makes a single batch call (`SELECT * FROM orders WHERE user_id IN (...)`) instead of 100 individual calls. Key implementation details: create new DataLoader instances per request (to avoid cross-request caching that could leak data between users), ensure the batch function returns results in the same order as input keys, and handle missing results by returning Error objects for individual keys rather than throwing. DataLoader also deduplicates — if the same user ID appears multiple times in a query, it's fetched only once.

**Q: How would you implement authorization in a GraphQL API?**

A: Layer authorization at multiple levels. First, operation-level: use middleware/plugins to check authentication before any resolver executes. Second, field-level: use schema directives (`@auth(requires: ADMIN)`) that wrap resolvers with permission checks. Third, data-level: resolvers filter results based on the authenticated user's permissions (a user can only see their own orders). Implementation pattern: inject the authenticated user into context, create an authorization layer that resolvers call (`ctx.authorize('order:read', order)`), and return null or throw `FORBIDDEN` for unauthorized fields. For federation, each subgraph handles its own authorization since it owns its data. Critical consideration: GraphQL's type system means a non-null field that fails authorization will null out the parent object. Design nullable fields for data that may be restricted, and use union types (`type OrderResult = Order | UnauthorizedError`) for explicit error handling.

**Q: Compare GraphQL Federation and Schema Stitching. When would you use each?**

A: Schema Stitching merges multiple schemas at the gateway level — the gateway fetches schemas from subservices and combines them, resolving cross-service references via delegated resolvers. Federation (Apollo) is a specification where each subgraph declares its own types and how they compose, and a router automatically builds the unified schema. Federation advantages: subgraphs are independently deployable, each team owns their portion of the schema, the router handles query planning automatically, and there's no central gateway code to maintain. Stitching advantages: works with any GraphQL server (no federation spec required), more flexible for legacy service integration, and simpler for small teams. Choose Federation when you have multiple teams owning different domains (users team, orders team, products team) and need independent deployment. Choose Stitching when integrating third-party GraphQL APIs you don't control, or when your services predate Federation and migration cost is high.

**Q: How do you handle caching in GraphQL given that most queries use POST?**

A: Multiple strategies: First, persisted queries — hash query strings and use GET requests with the hash as a query parameter (`GET /graphql?extensions={"persistedQuery":{"sha256Hash":"abc123"}}`), enabling standard HTTP/CDN caching. Second, response-level caching — cache full responses keyed by (query hash + variables + auth context) in Redis with TTLs based on the most volatile field in the response. Third, field-level caching — use `@cacheControl(maxAge: 3600)` directives on types/fields, and the server calculates the minimum maxAge across all resolved fields for the Cache-Control header. Fourth, DataLoader's per-request cache prevents redundant database calls within a single query. Fifth, application-level caching in resolvers (Redis/Memcached) for expensive computations. The key insight: GraphQL caching is more granular than REST because different queries touch different fields with different freshness requirements.

## Production Tips

- **Implement automatic persisted queries (APQ)** in production to reduce request payload size and enable query whitelisting. Clients send a hash on first request; if the server doesn't recognize it, the client sends the full query which gets cached. Subsequent requests use only the hash. This also prevents arbitrary query injection attacks
- **Monitor resolver performance per field**: Track execution time for every resolver, not just per-request latency. A single slow resolver (e.g., `User.recommendations` calling an ML service) can dominate response time. Use Apollo Studio, GraphQL Mesh, or custom tracing to identify hot resolvers and optimize or add caching selectively
- **Use schema linting and breaking change detection in CI**: Tools like `graphql-inspector` compare schema changes against the previous version and flag breaking changes (removed fields, changed types, removed enum values). Combine with client query analysis to determine if a "breaking" change actually affects any registered client queries
- **Implement query cost analysis with rate limiting**: Assign point costs to fields (scalar: 1, object: 2, list: 10 × child cost) and reject queries exceeding a threshold. Rate limit by total points consumed per time window rather than raw request count — a simple `{ user { name } }` should cost less quota than a complex nested query fetching thousands of records

## Related Topics

- [REST API Design](./rest-api-design.md) — Alternative API paradigm and comparison point for when to choose REST vs GraphQL
- [gRPC](./grpc.md) — High-performance alternative for internal service communication
- [Spring Data](../spring-framework/spring-data.md) — Data access patterns relevant to GraphQL resolver implementation
- [Security](../../security/security/security.md) — Authentication and authorization patterns applicable to GraphQL APIs
