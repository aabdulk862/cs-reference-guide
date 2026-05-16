# Integration Testing

## Quick Reference

- **Scope**: Verifies that multiple components work together correctly across real boundaries (databases, APIs, queues)
- **Speed**: Slower than unit tests (seconds to minutes) but faster than end-to-end tests
- **Dependencies**: Uses real or containerized infrastructure — not mocks
- **Test containers**: Docker-based ephemeral infrastructure for reproducible integration tests
- **Contract testing**: Verifies API compatibility between producer and consumer without full integration
- **Fixture management**: Seed data setup and teardown strategies for consistent test state
- **Isolation strategy**: Each test gets a clean database state via transactions, truncation, or fresh containers
- **CI requirement**: Integration tests need infrastructure access — use Docker Compose or cloud test environments
- **Failure signals**: Integration test failures indicate interface mismatches, schema drift, or configuration errors

## When to Use

Integration tests fill the confidence gap between unit tests and end-to-end tests. Write integration tests when you need to verify that your SQL queries actually work against a real database engine with real query planning, that your HTTP client correctly handles the actual response format from a third-party API, that your message consumer correctly deserializes and processes messages from a real broker, that your cache invalidation logic works with actual Redis TTL behavior, and that your ORM mappings correctly translate between domain objects and database schemas.

The key insight is that integration tests verify assumptions. Unit tests with mocked repositories assume the SQL is correct. Integration tests prove it. When a unit test mocks `repository.findByEmail(email)` to return a user, it assumes the actual query works. An integration test runs that query against PostgreSQL and discovers that the index is missing, the collation is wrong, or the query plan is catastrophically slow.

Use integration tests for code that crosses process or network boundaries, for database queries and migrations, for serialization and deserialization of external formats, for authentication and authorization flows that depend on external identity providers, and for any code where the mock might not accurately represent real behavior.

Avoid integration tests for pure business logic (use unit tests), for UI rendering (use component tests), and for scenarios where the integration boundary is stable and well-understood (a mature, versioned internal library).

## Code Examples

### Database Integration Testing with Test Containers

Test containers provide ephemeral, isolated database instances that start fresh for each test suite. This eliminates shared state problems and ensures tests run identically on developer machines and CI.

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { Pool } from 'pg';
import { UserRepository } from './user-repository';
import { runMigrations } from './migrations';

describe('UserRepository Integration', () => {
  let container: StartedTestContainer;
  let pool: Pool;
  let repository: UserRepository;

  beforeAll(async () => {
    // Start a PostgreSQL container
    container = await new GenericContainer('postgres:15-alpine')
      .withEnvironment({
        POSTGRES_DB: 'testdb',
        POSTGRES_USER: 'testuser',
        POSTGRES_PASSWORD: 'testpass',
      })
      .withExposedPorts(5432)
      .start();

    const connectionString = `postgresql://testuser:testpass@${container.getHost()}:${container.getMappedPort(5432)}/testdb`;

    pool = new Pool({ connectionString });
    await runMigrations(pool); // Apply schema
    repository = new UserRepository(pool);
  }, 60000); // Container startup timeout

  afterAll(async () => {
    await pool.end();
    await container.stop();
  });

  beforeEach(async () => {
    // Clean slate for each test — truncate with cascade
    await pool.query('TRUNCATE TABLE users, orders, sessions CASCADE');
  });

  it('should persist and retrieve a user with all fields', async () => {
    const user = {
      email: 'test@example.com',
      name: 'Test User',
      role: 'admin',
      metadata: { department: 'engineering', level: 'senior' },
    };

    const created = await repository.create(user);
    const retrieved = await repository.findById(created.id);

    expect(retrieved).not.toBeNull();
    expect(retrieved!.email).toBe('test@example.com');
    expect(retrieved!.metadata).toEqual({ department: 'engineering', level: 'senior' });
    expect(retrieved!.createdAt).toBeInstanceOf(Date);
  });

  it('should enforce unique email constraint', async () => {
    await repository.create({ email: 'dup@example.com', name: 'First', role: 'user' });

    await expect(
      repository.create({ email: 'dup@example.com', name: 'Second', role: 'user' })
    ).rejects.toThrow(/unique.*email/i);
  });

  it('should support pagination with correct ordering', async () => {
    // Seed 25 users
    for (let i = 0; i < 25; i++) {
      await repository.create({
        email: `user${i.toString().padStart(2, '0')}@example.com`,
        name: `User ${i}`,
        role: 'user',
      });
    }

    const page1 = await repository.findAll({ page: 1, pageSize: 10, orderBy: 'email' });
    const page2 = await repository.findAll({ page: 2, pageSize: 10, orderBy: 'email' });
    const page3 = await repository.findAll({ page: 3, pageSize: 10, orderBy: 'email' });

    expect(page1.items).toHaveLength(10);
    expect(page2.items).toHaveLength(10);
    expect(page3.items).toHaveLength(5);
    expect(page1.totalCount).toBe(25);
    // Verify ordering
    expect(page1.items[0].email).toBe('user00@example.com');
    expect(page1.items[9].email).toBe('user09@example.com');
  });

  it('should handle JSONB queries correctly', async () => {
    await repository.create({
      email: 'eng@example.com',
      name: 'Engineer',
      role: 'user',
      metadata: { department: 'engineering', skills: ['typescript', 'rust'] },
    });
    await repository.create({
      email: 'sales@example.com',
      name: 'Sales Rep',
      role: 'user',
      metadata: { department: 'sales', skills: ['negotiation'] },
    });

    const engineers = await repository.findByMetadata({ department: 'engineering' });

    expect(engineers).toHaveLength(1);
    expect(engineers[0].email).toBe('eng@example.com');
  });
});
```

### API Integration Testing with Supertest

API integration tests verify the full HTTP request/response cycle including routing, middleware, serialization, validation, and error handling.

```java
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.hamcrest.Matchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class OrderApiIntegrationTest {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:15-alpine")
        .withDatabaseName("orders_test")
        .withUsername("test")
        .withPassword("test");

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
    }

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private OrderRepository orderRepository;

    @BeforeEach
    void cleanDatabase() {
        orderRepository.deleteAll();
    }

    @Test
    @DisplayName("POST /api/orders - should create order and return 201")
    void createOrder() throws Exception {
        String orderJson = """
            {
                "customerId": "cust-123",
                "items": [
                    {"productId": "prod-1", "quantity": 2, "unitPrice": 29.99},
                    {"productId": "prod-2", "quantity": 1, "unitPrice": 49.99}
                ],
                "shippingAddress": {
                    "street": "123 Main St",
                    "city": "Portland",
                    "state": "OR",
                    "zip": "97201"
                }
            }
            """;

        mockMvc.perform(post("/api/orders")
                .contentType(MediaType.APPLICATION_JSON)
                .content(orderJson))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.id").exists())
            .andExpect(jsonPath("$.status").value("PENDING"))
            .andExpect(jsonPath("$.totalAmount").value(109.97))
            .andExpect(jsonPath("$.items", hasSize(2)))
            .andExpect(jsonPath("$.createdAt").exists());
    }

    @Test
    @DisplayName("POST /api/orders - should return 400 for invalid input")
    void createOrderValidationError() throws Exception {
        String invalidJson = """
            {
                "customerId": "",
                "items": []
            }
            """;

        mockMvc.perform(post("/api/orders")
                .contentType(MediaType.APPLICATION_JSON)
                .content(invalidJson))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.errors", hasSize(greaterThanOrEqualTo(2))))
            .andExpect(jsonPath("$.errors[*].field", hasItems("customerId", "items")));
    }

    @Test
    @DisplayName("GET /api/orders/{id} - should return 404 for non-existent order")
    void getOrderNotFound() throws Exception {
        mockMvc.perform(get("/api/orders/non-existent-id"))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.message").value("Order not found"));
    }

    @Test
    @DisplayName("PATCH /api/orders/{id}/cancel - should transition order to CANCELLED")
    void cancelOrder() throws Exception {
        // Create an order first
        Order order = orderRepository.save(Order.builder()
            .customerId("cust-123")
            .status(OrderStatus.PENDING)
            .totalAmount(new BigDecimal("59.99"))
            .build());

        mockMvc.perform(patch("/api/orders/" + order.getId() + "/cancel")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"reason\": \"changed_mind\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("CANCELLED"))
            .andExpect(jsonPath("$.cancellationReason").value("changed_mind"));
    }
}
```

### Contract Testing with Pact

Contract tests verify that API producers and consumers agree on the interface without requiring both services to be running simultaneously. This enables independent deployment of microservices.

```typescript
import { PactV3, MatchersV3 } from '@pact-foundation/pact';
import { resolve } from 'path';
import { UserApiClient } from './user-api-client';

const { like, eachLike, string, integer, iso8601DateTimeWithMillis } = MatchersV3;

const provider = new PactV3({
  consumer: 'OrderService',
  provider: 'UserService',
  dir: resolve(process.cwd(), 'pacts'),
});

describe('UserService Contract', () => {
  it('should return user details for a valid user ID', async () => {
    // Define the expected interaction
    provider
      .given('a user with ID user-123 exists')
      .uponReceiving('a request for user details')
      .withRequest({
        method: 'GET',
        path: '/api/users/user-123',
        headers: { Accept: 'application/json' },
      })
      .willRespondWith({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: {
          id: string('user-123'),
          email: string('john@example.com'),
          name: string('John Doe'),
          tier: string('premium'),
          createdAt: iso8601DateTimeWithMillis('2024-01-15T10:30:00.000Z'),
          orderCount: integer(42),
        },
      });

    await provider.executeTest(async (mockServer) => {
      const client = new UserApiClient(mockServer.url);
      const user = await client.getUserById('user-123');

      expect(user.id).toBe('user-123');
      expect(user.email).toBe('john@example.com');
      expect(user.tier).toBe('premium');
    });
  });

  it('should return 404 for non-existent user', async () => {
    provider
      .given('no user with ID user-999 exists')
      .uponReceiving('a request for a non-existent user')
      .withRequest({
        method: 'GET',
        path: '/api/users/user-999',
        headers: { Accept: 'application/json' },
      })
      .willRespondWith({
        status: 404,
        body: {
          error: string('USER_NOT_FOUND'),
          message: string('User with ID user-999 does not exist'),
        },
      });

    await provider.executeTest(async (mockServer) => {
      const client = new UserApiClient(mockServer.url);
      await expect(client.getUserById('user-999')).rejects.toThrow('User not found');
    });
  });
});
```

## Common Pitfalls

### 1. Shared Database State Between Tests

The most common integration test failure mode is test interdependence through shared database state. Test A inserts a record, Test B assumes the table is empty. When tests run in a different order or in parallel, they fail unpredictably.

**Solution**: Use transaction rollback (wrap each test in a transaction that rolls back), table truncation in `beforeEach`, or per-test database schemas. Test containers with fresh databases per suite eliminate this entirely at the cost of startup time.

### 2. Hardcoded Ports and Connection Strings

Tests that connect to `localhost:5432` or `localhost:6379` fail when those ports are occupied by other processes or when running in CI where services are on different hosts. Always use dynamic port allocation (test containers expose random mapped ports) or environment-variable-based configuration.

### 3. Ignoring Test Data Cleanup

Leaving test data in shared environments (staging databases, shared Redis instances) causes cascading failures across teams. Integration tests must clean up after themselves. Use `afterEach` or `afterAll` hooks, or better yet, use ephemeral infrastructure that is destroyed when tests complete.

### 4. Testing Too Much Through the Integration Layer

If your integration test verifies 15 different business logic branches through the API, you're using integration tests as unit tests. Integration tests should verify the integration — correct serialization, proper error codes, database constraint enforcement. Business logic permutations belong in unit tests where they run 100x faster.

### 5. Flaky Tests Due to Timing Dependencies

Integration tests that depend on timing — waiting for async events, polling for state changes, or assuming operations complete within a fixed timeout — are inherently flaky. Use explicit wait conditions (poll until state changes), event-driven assertions (wait for a specific message), or deterministic test clocks where possible.

### 6. Missing Network Failure Scenarios

Integration tests often only test the happy path. Real integrations fail: connections time out, services return 503, DNS resolution fails, TLS certificates expire. Test these failure modes explicitly by configuring test containers with network delays, using chaos testing tools, or injecting faults through proxy layers.

## Real-World Use Cases

### E-Commerce Order Pipeline

An e-commerce platform tests the full order pipeline: API receives order → validates inventory → charges payment → publishes event → updates database → sends confirmation email. Integration tests use test containers for PostgreSQL and Redis, a mock SMTP server for email verification, and Pact contracts for the payment gateway. The test suite catches schema drift between the order service and inventory service that unit tests with mocked interfaces would miss.

### Data Pipeline Validation

A data engineering team tests ETL pipelines that read from Kafka, transform records, and write to PostgreSQL and Elasticsearch. Integration tests use test containers for all three systems, publish known messages to Kafka topics, and verify that transformed data appears correctly in both sinks. Tests catch serialization mismatches, schema evolution issues, and exactly-once processing failures that only manifest with real infrastructure.

### Authentication Flow

An identity service tests the full OAuth2 flow: authorization code grant, token exchange, token refresh, and token revocation. Integration tests start a real Redis instance for session storage, use a test LDAP container for user lookup, and verify that JWTs contain correct claims with proper expiration. These tests caught a production bug where refresh tokens weren't being invalidated on password change — a scenario impossible to catch with mocked token stores.

### Database Migration Testing

A team tests database migrations by running them against a real PostgreSQL container, verifying schema state, then running rollback migrations and verifying the schema returns to its previous state. This catches migration ordering issues, missing foreign key constraints, and data loss during column type changes that would only surface in production deployments.

## Interview Questions

**Q: How do you handle database state in integration tests?**

A: There are four main strategies, each with trade-offs. **Transaction rollback** wraps each test in a transaction that rolls back at the end — fast but doesn't test commit behavior and fails with code that manages its own transactions. **Truncation** clears tables in `beforeEach` — reliable but slower and requires careful ordering for foreign key constraints. **Fresh containers** start a new database per test suite — completely isolated but adds 5-10 seconds of startup time. **Schema-per-test** creates isolated schemas within one database — good parallelization but complex setup. In practice, I use transaction rollback for most tests, truncation when testing transaction boundaries, and fresh containers for migration testing.

**Q: What is contract testing and when would you use it over integration testing?**

A: Contract testing verifies that two services agree on their API interface without requiring both to be running simultaneously. The consumer defines expectations (a contract), and the provider verifies it can fulfill those expectations independently. Use contract testing when services are owned by different teams with different release cycles, when spinning up the full dependency graph for integration tests is impractical, when you need to verify backward compatibility before deploying a new API version, and when you want faster feedback than full integration tests provide. Contract tests don't replace integration tests — they complement them by catching interface mismatches earlier in the pipeline. You still need integration tests to verify behavior that contracts can't express (timing, ordering, side effects).

**Q: How do you test microservice interactions without deploying all services?**

A: Use a layered approach. First, contract tests (Pact, Spring Cloud Contract) verify interface compatibility between each pair of services independently. Second, use service virtualization (WireMock, Mountebank) to simulate downstream services with realistic response patterns including errors and latency. Third, for critical paths, run focused integration tests with the actual downstream service in a test container. Fourth, use consumer-driven contracts where the consuming team defines what they need, and the producing team verifies they provide it. This approach gives you confidence in service interactions without the complexity and fragility of running 20 services simultaneously in a test environment.

**Q: How do you make integration tests fast enough for CI?**

A: Several strategies compound. **Parallel execution**: run independent test suites concurrently, each with their own container set. **Container reuse**: start containers once per suite rather than per test, using truncation for isolation. **Selective execution**: only run integration tests affected by changed code paths (use dependency graphs or file-based triggers). **Layered caching**: cache Docker images in CI, use tmpfs for database storage to eliminate disk I/O. **Test slicing**: Spring's `@DataJpaTest` loads only the persistence layer, not the full application context. A well-optimized integration suite of 200 tests can run in under 2 minutes with these techniques.

## Production Tips

### Use Docker Compose for Local Development Testing

Define a `docker-compose.test.yml` that mirrors your CI environment. Developers run `docker compose -f docker-compose.test.yml up -d` to start all required infrastructure locally. This eliminates "works on my machine" failures and ensures integration tests behave identically everywhere. Pin image versions to avoid surprise breakages from upstream updates.

```yaml
# docker-compose.test.yml
services:
  postgres:
    image: postgres:15.4-alpine
    environment:
      POSTGRES_DB: testdb
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test
    ports:
      - "5433:5432"  # Non-standard port to avoid conflicts
    tmpfs:
      - /var/lib/postgresql/data  # RAM-backed storage for speed

  redis:
    image: redis:7.2-alpine
    ports:
      - "6380:6379"

  localstack:
    image: localstack/localstack:3.0
    environment:
      SERVICES: s3,sqs,sns
    ports:
      - "4566:4566"
```

### Implement Test Data Builders with Realistic Defaults

Integration tests need realistic data that satisfies all constraints (foreign keys, not-null columns, unique indexes). Build a test data factory that generates valid entities with sensible defaults, allowing tests to override only the fields relevant to their scenario. This prevents tests from breaking when new required columns are added to the schema.

### Separate Integration Tests in CI Pipeline

Run unit tests first (fast gate), then integration tests (slower gate). If unit tests fail, skip integration tests entirely — there's no point testing integrations when the logic is broken. Use CI pipeline stages or test tags (`@Tag("integration")` in JUnit, `describe.concurrent` groups in Vitest) to control execution order and parallelism.

## Related Topics

- [Unit Testing](../unit-testing/unit-testing.md) — Foundation-level testing that integration tests build upon
- [Test Architecture](../test-strategy/test-architecture.md) — How integration tests fit into the test pyramid and CI pipeline strategy
- [Property-Based Testing](../test-strategy/property-based-testing.md) — Generate diverse inputs for integration test scenarios automatically
- [Mocking Strategies](../unit-testing/mocking-strategies.md) — Understanding when to use real dependencies versus test doubles
