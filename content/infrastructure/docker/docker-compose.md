# Docker Compose

## Quick Reference

- Docker Compose defines and runs multi-container applications using a declarative `docker-compose.yml` (or `compose.yaml`) file
- Services, networks, and volumes are the three top-level concepts in a Compose file
- `docker compose up -d` starts all services in detached mode; `docker compose down` stops and removes them
- Service dependencies use `depends_on` with `condition: service_healthy` for readiness-aware startup ordering
- Environment variable interpolation uses `${VAR:-default}` syntax for environment-specific configuration
- Compose profiles selectively enable services: `docker compose --profile debug up`
- `docker compose watch` (v2.22+) enables hot-reload by syncing file changes into running containers
- Override files (`docker-compose.override.yml`) layer environment-specific configuration without modifying the base file
- Compose V2 is a Docker CLI plugin invoked as `docker compose` (not the legacy `docker-compose` binary)

## When to Use

Docker Compose is the standard tool for local development environments that mirror production topology. Use it when your application consists of multiple services (API, database, cache, message broker) that need to run together for development and testing. Compose eliminates the need for developers to manually start and configure each dependency, reducing onboarding time from hours to minutes with a single `docker compose up` command.

Compose is also valuable for integration testing in CI pipelines where you need real service dependencies rather than mocks. Spin up the full stack, run integration tests against it, and tear it down in a clean, reproducible manner. For production deployments, Compose is appropriate for single-host scenarios but should be replaced by Kubernetes or ECS for multi-host orchestration with advanced scheduling, self-healing, and rolling updates.

## Code Examples

### Full-Stack Development Environment

```yaml
# compose.yaml - Microservice development environment
name: order-platform

services:
  api-gateway:
    build:
      context: ./gateway
      dockerfile: Dockerfile
      target: development
    ports:
      - "8080:8080"
    environment:
      - SPRING_PROFILES_ACTIVE=docker
      - ORDER_SERVICE_URL=http://order-service:8081
      - INVENTORY_SERVICE_URL=http://inventory-service:8082
    depends_on:
      order-service:
        condition: service_healthy
      inventory-service:
        condition: service_healthy
    develop:
      watch:
        - action: rebuild
          path: ./gateway/src
    networks:
      - frontend
      - backend

  order-service:
    build:
      context: ./order-service
      target: development
    ports:
      - "8081:8081"
    environment:
      - SPRING_DATASOURCE_URL=jdbc:postgresql://postgres:5432/orders
      - SPRING_KAFKA_BOOTSTRAP_SERVERS=kafka:9092
    depends_on:
      postgres:
        condition: service_healthy
      kafka:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8081/actuator/health"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s
    volumes:
      - ./order-service/src:/app/src
    networks:
      - backend

  inventory-service:
    build:
      context: ./inventory-service
      target: development
    ports:
      - "8082:8082"
    environment:
      - SPRING_DATA_MONGODB_URI=mongodb://mongo:27017/inventory
    depends_on:
      mongo:
        condition: service_started
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8082/actuator/health"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s
    networks:
      - backend

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: orders
      POSTGRES_USER: orderuser
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-devpassword}
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ./init-scripts/postgres:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U orderuser -d orders"]
      interval: 5s
      timeout: 3s
      retries: 5
    ports:
      - "5432:5432"
    networks:
      - backend

  mongo:
    image: mongo:7
    volumes:
      - mongo-data:/data/db
      - ./init-scripts/mongo:/docker-entrypoint-initdb.d:ro
    ports:
      - "27017:27017"
    networks:
      - backend

  kafka:
    image: confluentinc/cp-kafka:7.5.0
    environment:
      KAFKA_NODE_ID: 1
      KAFKA_PROCESS_ROLES: broker,controller
      KAFKA_LISTENERS: PLAINTEXT://0.0.0.0:9092,CONTROLLER://0.0.0.0:9093
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:9092
      KAFKA_CONTROLLER_QUORUM_VOTERS: 1@kafka:9093
      KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
      CLUSTER_ID: "MkU3OEVBNTcwNTJENDM2Qk"
    healthcheck:
      test: ["CMD", "kafka-broker-api-versions", "--bootstrap-server", "localhost:9092"]
      interval: 10s
      timeout: 5s
      retries: 5
    ports:
      - "9092:9092"
    networks:
      - backend

  redis:
    image: redis:7-alpine
    command: redis-server --maxmemory 128mb --maxmemory-policy allkeys-lru
    ports:
      - "6379:6379"
    networks:
      - backend
    profiles:
      - cache

volumes:
  postgres-data:
  mongo-data:

networks:
  frontend:
    driver: bridge
  backend:
    driver: bridge
```

### CI/CD Integration Testing with Compose

```yaml
# compose.ci.yaml - Integration test environment
name: order-platform-ci

services:
  api:
    build:
      context: .
      dockerfile: Dockerfile
      target: test
    environment:
      - DATABASE_URL=postgresql://testuser:testpass@postgres:5432/testdb
      - REDIS_URL=redis://redis:6379
      - KAFKA_BROKERS=kafka:9092
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started
      kafka:
        condition: service_healthy
    command: ["npm", "run", "test:integration"]

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: testdb
      POSTGRES_USER: testuser
      POSTGRES_PASSWORD: testpass
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U testuser -d testdb"]
      interval: 2s
      timeout: 2s
      retries: 10
    tmpfs:
      - /var/lib/postgresql/data  # RAM-backed for speed

  redis:
    image: redis:7-alpine
    command: redis-server --save ""  # Disable persistence for tests

  kafka:
    image: confluentinc/cp-kafka:7.5.0
    environment:
      KAFKA_NODE_ID: 1
      KAFKA_PROCESS_ROLES: broker,controller
      KAFKA_LISTENERS: PLAINTEXT://0.0.0.0:9092,CONTROLLER://0.0.0.0:9093
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:9092
      KAFKA_CONTROLLER_QUORUM_VOTERS: 1@kafka:9093
      KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
      CLUSTER_ID: "test-cluster-id-12345"
    healthcheck:
      test: ["CMD", "kafka-broker-api-versions", "--bootstrap-server", "localhost:9092"]
      interval: 5s
      timeout: 5s
      retries: 10
```

```bash
#!/bin/bash
# CI script for running integration tests with Compose
set -e

# Start dependencies and wait for health checks
docker compose -f compose.ci.yaml up -d postgres redis kafka
docker compose -f compose.ci.yaml up --exit-code-from api api

# Capture exit code
EXIT_CODE=$?

# Always clean up
docker compose -f compose.ci.yaml down --volumes --remove-orphans

exit $EXIT_CODE
```

## Common Pitfalls

- **Using `depends_on` without health checks**: The basic `depends_on` only waits for the container to start, not for the service inside to be ready. A database container starts in milliseconds but PostgreSQL takes seconds to accept connections. Always use `condition: service_healthy` with proper health checks to ensure dependencies are actually ready before dependent services start.

- **Hardcoding environment values instead of using interpolation**: Committing passwords and environment-specific URLs directly in `compose.yaml` makes the file unusable across environments and risks leaking secrets to version control. Use `${VARIABLE:-default}` syntax with `.env` files for local defaults and CI-injected variables for pipelines.

- **Not using profiles for optional services**: Including debugging tools (pgAdmin, Kafka UI, Jaeger) in the default service set slows down `docker compose up` for developers who do not need them. Use profiles to group optional services that are only started when explicitly requested with `--profile debug`.

- **Forgetting `--remove-orphans` during development**: When you rename or remove services from the Compose file, old containers from previous configurations continue running. Use `docker compose up --remove-orphans` or `docker compose down --remove-orphans` to clean up containers from services no longer defined in the current file.

- **Volume mount performance on macOS**: Docker Desktop on macOS uses a Linux VM, and bind mounts between the macOS host and the VM have significant I/O overhead. For Node.js projects with large `node_modules`, this can make builds 5-10x slower. Use named volumes for `node_modules` and bind mount only source code, or use Docker's `cached` or `delegated` mount consistency options.

- **Not setting memory limits on development services**: A Kafka or Elasticsearch container without memory limits can consume 4-8GB of RAM, leaving insufficient memory for your IDE and application. Set explicit memory limits on resource-hungry services in development to prevent laptop slowdowns.

## Real-World Use Cases

Development teams use Compose to standardize local environments across a team of 20+ engineers. A new hire clones the repository, copies `.env.example` to `.env`, runs `docker compose up`, and has the full application stack running within 5 minutes. The Compose file documents the entire system topology, serving as living infrastructure documentation that is always in sync with the actual service dependencies.

Integration testing in CI pipelines uses Compose to spin up real dependencies instead of mocks. The pipeline starts PostgreSQL, Redis, and Kafka containers, runs the test suite against them, and tears everything down. Using `tmpfs` for database storage and disabling persistence for Redis makes tests run faster while still validating real service interactions. Test isolation is guaranteed because each pipeline run gets fresh containers with no state from previous runs.

Feature branch environments use Compose with dynamic port allocation to run multiple instances of the application stack simultaneously. Each feature branch gets its own set of containers with unique port mappings, enabling parallel development and QA review without conflicts. A lightweight script generates the `.env` file with branch-specific ports and service names.

Demo and sales environments use Compose to run the full product on a single EC2 instance for customer demonstrations. The Compose file includes seed data scripts that populate databases with realistic sample data, providing a self-contained demo environment that can be spun up in any region within minutes for customer calls across time zones.

## Interview Questions

**Q: How does Docker Compose handle service startup ordering and readiness?**

A: Compose uses `depends_on` to control startup order, but basic `depends_on` only ensures the dependency container has started, not that the service inside is ready. For true readiness-aware ordering, use `depends_on` with `condition: service_healthy` combined with `healthcheck` definitions on dependency services. The health check runs inside the container and reports whether the service can accept connections. Compose waits for the health check to pass before starting dependent services. Without this, race conditions cause connection failures during startup.

**Q: What is the difference between `docker compose up` and `docker compose run`?**

A: `docker compose up` starts all services defined in the Compose file (or a specified subset) and attaches to their logs. It is designed for running the full application stack. `docker compose run` starts a single service with a one-off command, creating a new container that is removed after the command exits. Use `run` for one-time tasks like database migrations (`docker compose run api npm run migrate`), running tests, or executing administrative commands against a running stack.

**Q: How would you manage environment-specific configuration in Compose?**

A: Use a layered approach: the base `compose.yaml` defines service structure and defaults, `compose.override.yaml` (auto-loaded) adds development-specific settings like volume mounts and debug ports, and named override files (`compose.ci.yaml`, `compose.prod.yaml`) provide environment-specific configuration loaded with `-f` flags. Environment variables use `${VAR:-default}` interpolation with `.env` files for local values. This keeps the base file clean and reusable while allowing full customization per environment.

**Q: How do you debug networking issues between Compose services?**

A: First, verify services are on the same network with `docker compose ps` and `docker network inspect`. Use `docker compose exec <service> nslookup <target>` to test DNS resolution. Run `docker compose exec <service> curl -v http://target:port/health` to test connectivity. For deeper analysis, attach a network debugging container: `docker run --rm --network <compose-network> nicolaka/netshoot tcpdump -i eth0`. Check that services are listening on the correct interface (0.0.0.0, not 127.0.0.1) inside the container.

## Production Tips

- **Use `docker compose watch` for development hot-reload**: Instead of rebuilding containers on every code change, configure the `develop.watch` section to sync file changes directly into running containers. This provides sub-second feedback loops for interpreted languages (Python, Node.js) and triggers rebuilds only for compiled languages when source files change.

- **Implement health checks on every service**: Even in development, health checks prevent cascading startup failures and make `depends_on` conditions work correctly. For databases, check connection readiness. For HTTP services, check a health endpoint. For message brokers, verify the broker is accepting connections. This eliminates the most common class of "works on my machine" issues.

- **Use named volumes for dependency data, bind mounts for source code**: Named volumes for `node_modules`, Maven repositories, and database data avoid the performance overhead of bind mounts on macOS while keeping data persistent across container recreations. Bind mount only the source code directory that needs hot-reload capability.

## Related Topics

- [Networking and Storage](./networking-and-storage.md) — Deep dive into Docker networking modes and volume drivers
- [Container Fundamentals](./container-fundamentals.md) — Core container concepts underlying Compose services
- [CI/CD Pipelines](../ci-cd-pipelines.md) — Using Compose for integration testing in automated pipelines
