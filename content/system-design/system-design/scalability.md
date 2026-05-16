# Scalability

## Quick Reference

- Horizontal scaling (scaling out) adds more machines to handle increased load; vertical scaling (scaling up) adds more resources to existing machines
- Stateless services are trivially horizontally scalable because any instance can handle any request without shared state
- Auto-scaling policies adjust instance count based on metrics like CPU utilization, request queue depth, or custom application metrics with configurable cooldown periods
- Connection pooling (PgBouncer, ProxySQL, HikariCP) prevents database connection exhaustion as application tier scales
- The Universal Scalability Law models throughput as a function of concurrency, accounting for both contention (serialization) and coherence (crosstalk) penalties
- Amdahl's Law limits speedup: if 5% of work is serial, maximum speedup is 20x regardless of parallelism
- Capacity planning uses load testing to establish the relationship between instance count, traffic volume, and response latency before production traffic arrives
- Read replicas scale read throughput linearly but do not help with write-heavy workloads

## When to Use

Scalability patterns apply whenever your system must handle growing traffic, data volume, or user count without proportional degradation in response time or availability. You need horizontal scaling when traffic is unpredictable or growing beyond what vertical scaling can provide, when you require fault tolerance through redundancy, or when geographic distribution demands multiple deployment locations. Vertical scaling is appropriate as a first step when your application is not yet designed for distribution, when the workload fits within available machine sizes, or when the operational complexity of distributed systems is not justified by current traffic levels. Auto-scaling becomes necessary when traffic patterns are variable (diurnal cycles, seasonal peaks, viral events) and maintaining peak capacity continuously would be cost-prohibitive. Understanding scalability tradeoffs is critical for system design interviews where candidates must articulate why certain architectures scale linearly while others hit walls, and how to identify and eliminate bottlenecks systematically.

## Code Examples

### Auto-Scaling Decision Engine

```java
public class AutoScaler {
    private final MetricsClient metricsClient;
    private final InstanceManager instanceManager;
    private final ScalingPolicy policy;
    private Instant lastScaleAction = Instant.EPOCH;

    public AutoScaler(MetricsClient metricsClient, InstanceManager instanceManager,
                      ScalingPolicy policy) {
        this.metricsClient = metricsClient;
        this.instanceManager = instanceManager;
        this.policy = policy;
    }

    /**
     * Evaluate scaling decision based on current metrics.
     * Implements cooldown period to prevent thrashing.
     */
    public ScalingDecision evaluate() {
        // Respect cooldown period
        Duration sinceLastAction = Duration.between(lastScaleAction, Instant.now());
        if (sinceLastAction.compareTo(policy.getCooldownPeriod()) < 0) {
            return ScalingDecision.noAction("Cooldown period active");
        }

        int currentInstances = instanceManager.getActiveInstanceCount();
        AggregatedMetrics metrics = metricsClient.getAggregatedMetrics(
            policy.getMetricWindow()
        );

        // Scale-out decision: based on leading indicators
        if (shouldScaleOut(metrics, currentInstances)) {
            int targetInstances = calculateScaleOutTarget(metrics, currentInstances);
            targetInstances = Math.min(targetInstances, policy.getMaxInstances());
            lastScaleAction = Instant.now();
            return ScalingDecision.scaleOut(targetInstances - currentInstances);
        }

        // Scale-in decision: more conservative, uses trailing indicators
        if (shouldScaleIn(metrics, currentInstances)) {
            int targetInstances = calculateScaleInTarget(metrics, currentInstances);
            targetInstances = Math.max(targetInstances, policy.getMinInstances());
            lastScaleAction = Instant.now();
            return ScalingDecision.scaleIn(currentInstances - targetInstances);
        }

        return ScalingDecision.noAction("Metrics within acceptable range");
    }

    private boolean shouldScaleOut(AggregatedMetrics metrics, int currentInstances) {
        return metrics.getAvgCpuUtilization() > policy.getScaleOutCpuThreshold()
            || metrics.getP99Latency() > policy.getScaleOutLatencyThreshold()
            || metrics.getQueueDepth() > policy.getScaleOutQueueThreshold();
    }

    private boolean shouldScaleIn(AggregatedMetrics metrics, int currentInstances) {
        return currentInstances > policy.getMinInstances()
            && metrics.getAvgCpuUtilization() < policy.getScaleInCpuThreshold()
            && metrics.getP99Latency() < policy.getScaleInLatencyThreshold()
            && metrics.getQueueDepth() < policy.getScaleInQueueThreshold();
    }

    private int calculateScaleOutTarget(AggregatedMetrics metrics, int current) {
        // Target: bring CPU utilization to 60% (leaving headroom for spikes)
        double targetUtilization = 0.6;
        double currentLoad = metrics.getAvgCpuUtilization() * current;
        return (int) Math.ceil(currentLoad / targetUtilization);
    }

    private int calculateScaleInTarget(AggregatedMetrics metrics, int current) {
        // Conservative: remove at most 25% of instances per scale-in event
        int maxRemoval = Math.max(1, current / 4);
        double targetUtilization = 0.7;
        double currentLoad = metrics.getAvgCpuUtilization() * current;
        int target = (int) Math.ceil(currentLoad / targetUtilization);
        return Math.max(target, current - maxRemoval);
    }
}
```

### Connection Pool with Health Checking

```typescript
interface PoolConfig {
  minConnections: number;
  maxConnections: number;
  acquireTimeout: number;      // ms to wait for available connection
  idleTimeout: number;         // ms before idle connection is closed
  healthCheckInterval: number; // ms between health checks
  maxLifetime: number;         // ms before connection is recycled
}

class ConnectionPool {
  private available: Connection[] = [];
  private inUse: Set<Connection> = new Set();
  private waitQueue: Array<{
    resolve: (conn: Connection) => void;
    reject: (err: Error) => void;
    timer: NodeJS.Timeout;
  }> = [];
  private config: PoolConfig;
  private healthCheckTimer: NodeJS.Timeout | null = null;

  constructor(config: PoolConfig) {
    this.config = config;
    this.initialize();
  }

  private async initialize(): Promise<void> {
    // Pre-warm minimum connections
    for (let i = 0; i < this.config.minConnections; i++) {
      const conn = await this.createConnection();
      this.available.push(conn);
    }
    // Start periodic health checks
    this.healthCheckTimer = setInterval(
      () => this.healthCheck(),
      this.config.healthCheckInterval
    );
  }

  async acquire(): Promise<Connection> {
    // Try to get an available connection
    while (this.available.length > 0) {
      const conn = this.available.pop()!;
      if (this.isHealthy(conn) && !this.isExpired(conn)) {
        this.inUse.add(conn);
        return conn;
      }
      // Connection is unhealthy or expired, discard it
      conn.destroy();
    }

    // Create new connection if under max limit
    const totalConnections = this.inUse.size + this.available.length;
    if (totalConnections < this.config.maxConnections) {
      const conn = await this.createConnection();
      this.inUse.add(conn);
      return conn;
    }

    // All connections in use and at max: wait in queue
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = this.waitQueue.findIndex(w => w.resolve === resolve);
        if (index !== -1) this.waitQueue.splice(index, 1);
        reject(new Error(
          `Connection acquire timeout after ${this.config.acquireTimeout}ms. ` +
          `Pool: ${this.inUse.size} active, ${this.available.length} idle, ` +
          `${this.waitQueue.length} waiting`
        ));
      }, this.config.acquireTimeout);

      this.waitQueue.push({ resolve, reject, timer });
    });
  }

  release(conn: Connection): void {
    this.inUse.delete(conn);

    // If waiters exist, give connection directly to next waiter
    if (this.waitQueue.length > 0) {
      const waiter = this.waitQueue.shift()!;
      clearTimeout(waiter.timer);
      this.inUse.add(conn);
      waiter.resolve(conn);
      return;
    }

    // Return to available pool if healthy
    if (this.isHealthy(conn) && !this.isExpired(conn)) {
      conn.lastUsed = Date.now();
      this.available.push(conn);
    } else {
      conn.destroy();
    }

    // Maintain minimum pool size
    this.replenishPool();
  }

  private async healthCheck(): Promise<void> {
    const now = Date.now();
    const toRemove: Connection[] = [];

    for (const conn of this.available) {
      // Remove idle connections beyond minimum
      if (now - conn.lastUsed > this.config.idleTimeout
          && this.available.length > this.config.minConnections) {
        toRemove.push(conn);
      }
      // Remove expired connections
      else if (this.isExpired(conn)) {
        toRemove.push(conn);
      }
    }

    for (const conn of toRemove) {
      const index = this.available.indexOf(conn);
      if (index !== -1) this.available.splice(index, 1);
      conn.destroy();
    }

    await this.replenishPool();
  }

  private isExpired(conn: Connection): boolean {
    return Date.now() - conn.createdAt > this.config.maxLifetime;
  }

  private isHealthy(conn: Connection): boolean {
    return conn.isConnected && !conn.hasError;
  }

  private async replenishPool(): Promise<void> {
    const total = this.inUse.size + this.available.length;
    const deficit = this.config.minConnections - total;
    for (let i = 0; i < deficit; i++) {
      try {
        const conn = await this.createConnection();
        this.available.push(conn);
      } catch {
        break; // Stop trying if connection creation fails
      }
    }
  }

  private async createConnection(): Promise<Connection> {
    // Implementation depends on the database driver
    const conn = await Connection.create();
    conn.createdAt = Date.now();
    conn.lastUsed = Date.now();
    return conn;
  }

  getStats(): PoolStats {
    return {
      active: this.inUse.size,
      idle: this.available.length,
      waiting: this.waitQueue.length,
      total: this.inUse.size + this.available.length
    };
  }
}
```

### Stateless Service Design with External Session Store

```java
/**
 * Demonstrates stateless service design where all session state
 * is externalized to Redis, allowing any instance to handle any request.
 */
@RestController
public class OrderController {
    private final RedisTemplate<String, CartState> sessionStore;
    private final OrderService orderService;
    private final String instanceId;

    public OrderController(RedisTemplate<String, CartState> sessionStore,
                           OrderService orderService) {
        this.sessionStore = sessionStore;
        this.orderService = orderService;
        this.instanceId = UUID.randomUUID().toString().substring(0, 8);
    }

    @PostMapping("/cart/{sessionId}/items")
    public ResponseEntity<CartState> addItem(
            @PathVariable String sessionId,
            @RequestBody AddItemRequest request) {

        // Load state from external store (any instance can serve this)
        String key = "cart:" + sessionId;
        CartState cart = sessionStore.opsForValue().get(key);
        if (cart == null) {
            cart = new CartState(sessionId);
        }

        // Apply business logic
        cart.addItem(request.getProductId(), request.getQuantity(), request.getPrice());
        cart.setLastModified(Instant.now());
        cart.setLastServedBy(instanceId); // For debugging routing

        // Persist state back to external store
        sessionStore.opsForValue().set(key, cart, Duration.ofHours(24));

        return ResponseEntity.ok(cart);
    }

    @PostMapping("/cart/{sessionId}/checkout")
    public ResponseEntity<OrderConfirmation> checkout(@PathVariable String sessionId) {
        String key = "cart:" + sessionId;
        CartState cart = sessionStore.opsForValue().get(key);

        if (cart == null || cart.getItems().isEmpty()) {
            return ResponseEntity.badRequest().build();
        }

        // Process order (idempotent via order ID)
        OrderConfirmation confirmation = orderService.placeOrder(cart);

        // Clear cart state after successful checkout
        sessionStore.delete(key);

        return ResponseEntity.ok(confirmation);
    }

    @GetMapping("/health/ready")
    public ResponseEntity<Map<String, Object>> readiness() {
        // Readiness depends on external dependencies being available
        boolean redisHealthy = checkRedisConnection();
        boolean dbHealthy = checkDatabaseConnection();

        Map<String, Object> status = Map.of(
            "instance", instanceId,
            "redis", redisHealthy,
            "database", dbHealthy,
            "ready", redisHealthy && dbHealthy
        );

        return (redisHealthy && dbHealthy)
            ? ResponseEntity.ok(status)
            : ResponseEntity.status(503).body(status);
    }
}
```

## Common Pitfalls

- Scaling prematurely before identifying the actual bottleneck: adding more application servers when the database is the bottleneck wastes resources and increases database connection pressure. Always profile and measure before scaling. Use load testing to identify whether the constraint is CPU, memory, I/O, network, or an external dependency.

- Ignoring cold start latency when auto-scaling: new instances need time to warm JIT compilers, populate caches, establish connection pools, and load configuration. During this warm-up period, the instance handles requests slowly, potentially triggering more scale-out events. Implement readiness probes that only mark instances as ready after warm-up completes, and pre-warm caches during startup.

- Treating all traffic equally without priority or load shedding: when the system is at capacity, serving all requests equally means all users experience degradation. Implement priority queues that serve critical operations (checkout, payment) before non-critical ones (recommendations, analytics), and shed low-priority load entirely when capacity is exhausted.

- Not accounting for thundering herd after recovery: when a failed service recovers, all queued requests and retries hit it simultaneously, potentially causing immediate re-failure. Implement gradual traffic ramp-up after recovery, use exponential backoff with jitter on the client side, and configure load balancers to slowly increase traffic to recovered instances.

- Scaling the wrong dimension: adding more CPU when the bottleneck is memory, or adding more instances when the bottleneck is a single database connection. Map your resource consumption to understand which dimension is constrained. Use profiling tools (async-profiler for JVM, perf for Linux) to identify whether the constraint is compute, memory, I/O, or lock contention.

- Assuming linear scaling without measuring: doubling instances rarely doubles throughput due to coordination overhead, shared resource contention, and Amdahl's Law. The Universal Scalability Law shows that throughput can actually decrease beyond a certain point due to coherence costs. Always validate scaling assumptions with load tests that measure throughput at various instance counts.

- Neglecting database connection limits: each application instance maintains a connection pool. Scaling from 5 to 50 instances with 20 connections each means 1000 database connections, which may exceed the database's maximum. Use connection pooling proxies (PgBouncer, ProxySQL) between the application tier and database to multiplex many application connections over fewer database connections.

## Real-World Use Cases

**Netflix Auto-Scaling**: Netflix uses Titus (their container management platform) with predictive auto-scaling that anticipates traffic patterns based on historical data. Rather than reacting to current CPU utilization, the system pre-scales before known traffic peaks (evening streaming hours, new show releases). They combine time-series forecasting with reactive scaling for unexpected spikes. Each microservice defines its own scaling policy with service-specific metrics (stream starts per second, encoding queue depth) rather than generic CPU thresholds.

**Slack's Real-Time Messaging**: Slack handles millions of concurrent WebSocket connections across their infrastructure. They scale their connection-holding tier (which is stateful by nature) separately from their API tier (which is stateless). The connection tier uses consistent hashing to route users to specific instances, enabling targeted message delivery without broadcasting. When scaling the connection tier, they implement graceful connection migration where existing connections are drained to new instances over minutes rather than disconnected abruptly.

**Shopify's Flash Sales**: Shopify handles extreme traffic spikes during flash sales (100x normal traffic in seconds). Their approach combines pre-provisioned capacity for known sales events, aggressive caching at the CDN and application layers, queue-based checkout that serializes purchase attempts for limited inventory, and graceful degradation that disables non-essential features (recommendations, reviews) during peak load. The checkout queue ensures fairness while preventing database overload.

**Twitter's Fan-Out Architecture**: Twitter's timeline service demonstrates the scalability tradeoff between fan-out-on-write (pre-computing timelines when tweets are posted) and fan-out-on-read (computing timelines when users request them). For most users, fan-out-on-write scales well because the average user has hundreds of followers. For celebrity accounts with millions of followers, fan-out-on-write is prohibitively expensive, so their tweets are merged at read time. This hybrid approach scales both dimensions independently.

**Google's Borg and Kubernetes**: Google's internal cluster management system (Borg, the predecessor to Kubernetes) manages millions of containers across their fleet. Scaling decisions happen at multiple levels: bin-packing containers onto machines for resource efficiency, auto-scaling individual services based on demand, and cluster-level scaling that adds or removes physical machines. The scheduler optimizes for both resource utilization (cost) and performance isolation (quality of service), demonstrating that scalability is not just about adding capacity but about using capacity efficiently.

## Interview Questions

**Q: How would you scale a service from 100 requests per second to 100,000 requests per second?**

A: Start by profiling the current bottleneck. If CPU-bound: scale horizontally with stateless instances behind a load balancer, targeting 60-70% CPU utilization per instance. If I/O-bound: add caching layers (application cache for hot data, CDN for static content), implement read replicas for database reads, and use async processing for non-critical writes. If database-bound: add read replicas first, then consider sharding for write scaling. At 100K RPS, you likely need all of these plus connection pooling, request batching, and potentially a message queue to absorb write spikes. The key is measuring at each step to confirm the bottleneck has shifted before adding the next layer.

**Q: What is the difference between vertical and horizontal scaling, and when would you choose each?**

A: Vertical scaling adds resources to a single machine (bigger CPU, more RAM, faster SSD). It is simpler operationally, requires no code changes, and works until you hit the largest available machine size. Choose vertical scaling for databases that are hard to distribute, for applications not designed for horizontal scaling, or when the cost of re-architecting exceeds the cost of a larger machine. Horizontal scaling adds more machines. It offers theoretically unlimited capacity, provides redundancy for fault tolerance, and enables geographic distribution. Choose horizontal scaling when traffic exceeds single-machine capacity, when you need high availability through redundancy, or when latency requirements demand geographic proximity to users. Most production systems use both: vertically scale individual instances to a cost-effective size, then horizontally scale the number of instances.

**Q: How do you handle stateful services in a horizontally scaled architecture?**

A: Three primary approaches: (1) Externalize state to a shared store (Redis, DynamoDB) so instances become stateless and interchangeable. This is the preferred approach for most services. (2) Use sticky sessions (affinity routing) to pin clients to specific instances, accepting that instance failure loses in-flight sessions. Appropriate for WebSocket connections or expensive-to-rebuild session state. (3) Replicate state across instances using consensus protocols or CRDTs, accepting the coordination overhead. Appropriate for low-latency requirements where external store round-trips are unacceptable. The choice depends on consistency requirements, latency budget, and operational complexity tolerance.

**Q: Explain capacity planning for a new service launch.**

A: Capacity planning involves: (1) Estimate expected traffic from product requirements and historical analogues. (2) Load test a single instance to determine its throughput ceiling (requests per second at acceptable P99 latency). (3) Calculate required instances: expected_peak_traffic / per_instance_throughput * safety_factor (typically 1.5-2x). (4) Validate with a full-scale load test at 2x expected peak. (5) Configure auto-scaling with thresholds derived from load test data (scale out at 70% of per-instance capacity, scale in at 30%). (6) Plan for failure: ensure the system handles expected traffic with N-1 instances (or N-2 for critical services). (7) Monitor actual traffic post-launch and adjust capacity model based on real data.

## Production Tips

- Use leading indicators for scale-out decisions and trailing indicators for scale-in decisions. Scale out when queue depth grows or P99 latency increases (before saturation). Scale in only after sustained low utilization (15-30 minutes) to avoid thrashing during brief traffic dips.

- Implement graceful shutdown in every service: stop accepting new requests, drain in-flight requests with a deadline, close connections cleanly, and deregister from service discovery before the process exits. This prevents request failures during scale-in events and deployments.

- Set auto-scaling cooldown periods asymmetrically: short cooldown for scale-out (2-3 minutes, react quickly to load) and long cooldown for scale-in (10-15 minutes, avoid premature removal). This asymmetry reflects the different costs of under-provisioning (user impact) versus over-provisioning (cost).

- Monitor and alert on scaling headroom: track how close you are to maximum configured instances. If auto-scaling regularly reaches 80% of max capacity, increase the ceiling proactively rather than discovering the limit during a traffic spike.

- Load test regularly (weekly or after significant changes) to validate that your scaling assumptions still hold. Code changes, dependency updates, and data growth can all change the per-instance throughput ceiling without any obvious signal until traffic increases.

## Related Topics

- [Load Balancing](./load-balancing.md) — Traffic distribution algorithms that enable horizontal scaling across multiple instances
- [Database Sharding](./database-sharding.md) — Data partitioning strategies for scaling write throughput beyond a single database
- [Caching](./caching.md) — Caching layers that reduce backend load and enable higher throughput per instance
- [Distributed Systems](./distributed-systems.md) — Foundational concepts of coordination and failure handling in scaled architectures
