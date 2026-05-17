# Distributed Systems

## Quick Reference

- A distributed system is a collection of independent computers that appears to users as a single coherent system, communicating over an unreliable network
- Partial failures are the defining challenge: some components fail while others continue operating, making correctness reasoning fundamentally harder than single-machine programs
- The Eight Fallacies of Distributed Computing (network is reliable, latency is zero, bandwidth is infinite, etc.) describe assumptions that cause production failures
- Key building blocks: RPCs, message queues, consensus protocols, gossip protocols, service discovery, circuit breakers, and idempotency mechanisms
- FLP impossibility theorem proves that no deterministic consensus algorithm can guarantee termination in an asynchronous system with even one faulty process
- Byzantine fault tolerance handles nodes that behave arbitrarily (including maliciously), while crash-fault tolerance only handles nodes that stop responding
- Exactly-once semantics are impossible in distributed systems; at-most-once and at-least-once with idempotency are the practical alternatives

## When to Use

Distributed systems knowledge applies whenever your application outgrows a single server's capacity, requires fault tolerance beyond what one machine provides, or needs geographic distribution to reduce latency for global users. You need distributed systems fundamentals when designing microservice architectures where services communicate over the network, when implementing event-driven systems with message brokers, when building data pipelines that process information across multiple nodes, or when architecting systems that must maintain availability during hardware failures, network partitions, or datacenter outages. Understanding these concepts is essential for system design interviews at senior levels, where candidates must reason about failure modes, coordination challenges, and the inherent tradeoffs of distributing computation and data across multiple machines.

## Code Examples

### Implementing Idempotent Operations with Idempotency Keys

```java
@Service
public class PaymentService {
    private final PaymentRepository paymentRepository;
    private final IdempotencyKeyStore idempotencyStore;
    private final PaymentGateway gateway;

    public PaymentService(PaymentRepository paymentRepository,
                          IdempotencyKeyStore idempotencyStore,
                          PaymentGateway gateway) {
        this.paymentRepository = paymentRepository;
        this.idempotencyStore = idempotencyStore;
        this.gateway = gateway;
    }

    /**
     * Process payment with idempotency guarantee.
     * If the same idempotencyKey is submitted multiple times,
     * only the first request is processed; subsequent requests
     * return the cached result.
     */
    public PaymentResult processPayment(String idempotencyKey, PaymentRequest request) {
        // Check if this request was already processed
        Optional<PaymentResult> cached = idempotencyStore.get(idempotencyKey);
        if (cached.isPresent()) {
            return cached.get(); // Return cached result for duplicate request
        }

        // Acquire a lock on the idempotency key to prevent concurrent processing
        boolean acquired = idempotencyStore.tryLock(idempotencyKey, Duration.ofSeconds(30));
        if (!acquired) {
            throw new ConcurrentRequestException(
                "Request with key " + idempotencyKey + " is already being processed"
            );
        }

        try {
            // Double-check after acquiring lock
            cached = idempotencyStore.get(idempotencyKey);
            if (cached.isPresent()) {
                return cached.get();
            }

            // Process the payment
            PaymentResult result = gateway.charge(request);
            Payment payment = new Payment(
                UUID.randomUUID().toString(),
                request.getAmount(),
                request.getCurrency(),
                result.getStatus(),
                Instant.now()
            );
            paymentRepository.save(payment);

            // Store result for future duplicate detection
            idempotencyStore.put(idempotencyKey, result, Duration.ofHours(24));
            return result;
        } finally {
            idempotencyStore.releaseLock(idempotencyKey);
        }
    }
}
```

### Circuit Breaker Pattern Implementation

```typescript
enum CircuitState {
  CLOSED = 'CLOSED',     // Normal operation, requests pass through
  OPEN = 'OPEN',         // Failing, requests are rejected immediately
  HALF_OPEN = 'HALF_OPEN' // Testing if service recovered
}

interface CircuitBreakerConfig {
  failureThreshold: number;    // Number of failures before opening
  recoveryTimeout: number;     // Milliseconds before trying half-open
  successThreshold: number;    // Successes in half-open before closing
  timeout: number;             // Request timeout in milliseconds
}

class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private readonly config: CircuitBreakerConfig;

  constructor(config: CircuitBreakerConfig) {
    this.config = config;
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() - this.lastFailureTime >= this.config.recoveryTimeout) {
        this.state = CircuitState.HALF_OPEN;
        this.successCount = 0;
      } else {
        throw new CircuitOpenError(
          `Circuit is open. Retry after ${this.config.recoveryTimeout}ms`
        );
      }
    }

    try {
      const result = await this.withTimeout(operation, this.config.timeout);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        this.state = CircuitState.CLOSED;
      }
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.config.failureThreshold) {
      this.state = CircuitState.OPEN;
    }
  }

  private withTimeout<T>(operation: () => Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      operation(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new TimeoutError(`Operation timed out after ${ms}ms`)), ms)
      )
    ]);
  }

  getState(): CircuitState {
    return this.state;
  }
}

// Usage
const breaker = new CircuitBreaker({
  failureThreshold: 5,
  recoveryTimeout: 30000,
  successThreshold: 3,
  timeout: 5000
});

async function callExternalService(userId: string): Promise<UserData> {
  return breaker.execute(async () => {
    const response = await fetch(`https://api.example.com/users/${userId}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  });
}
```

### Gossip Protocol for Failure Detection

```java
public class GossipFailureDetector {
    private final Map<String, NodeState> membershipList = new ConcurrentHashMap<>();
    private final String selfId;
    private final int gossipInterval;  // milliseconds
    private final int suspicionTimeout; // milliseconds
    private final Random random = new Random();

    public GossipFailureDetector(String selfId, int gossipInterval, int suspicionTimeout) {
        this.selfId = selfId;
        this.gossipInterval = gossipInterval;
        this.suspicionTimeout = suspicionTimeout;
        membershipList.put(selfId, new NodeState(selfId, 0, NodeStatus.ALIVE, Instant.now()));
    }

    /**
     * Periodically called to gossip with a random peer.
     * Sends our membership list and merges the response.
     */
    public void gossipRound() {
        // Increment own heartbeat
        NodeState self = membershipList.get(selfId);
        self.incrementHeartbeat();

        // Select random peer to gossip with
        List<String> peers = membershipList.keySet().stream()
            .filter(id -> !id.equals(selfId))
            .filter(id -> membershipList.get(id).getStatus() != NodeStatus.DEAD)
            .collect(Collectors.toList());

        if (peers.isEmpty()) return;

        String target = peers.get(random.nextInt(peers.size()));
        NodeState targetState = membershipList.get(target);

        // Send gossip message (in production, this would be a network call)
        GossipMessage message = new GossipMessage(selfId, new HashMap<>(membershipList));
        GossipMessage response = sendGossip(targetState.getAddress(), message);

        // Merge received membership list
        if (response != null) {
            mergeMembershipList(response.getMembershipList());
        }

        // Check for suspected/dead nodes
        detectFailures();
    }

    private void mergeMembershipList(Map<String, NodeState> received) {
        for (Map.Entry<String, NodeState> entry : received.entrySet()) {
            String nodeId = entry.getKey();
            NodeState remoteState = entry.getValue();
            NodeState localState = membershipList.get(nodeId);

            if (localState == null) {
                // New node discovered
                membershipList.put(nodeId, remoteState);
            } else if (remoteState.getHeartbeat() > localState.getHeartbeat()) {
                // Remote has newer information
                localState.updateFrom(remoteState);
            }
        }
    }

    private void detectFailures() {
        Instant now = Instant.now();
        for (Map.Entry<String, NodeState> entry : membershipList.entrySet()) {
            if (entry.getKey().equals(selfId)) continue;

            NodeState state = entry.getValue();
            Duration sinceLastUpdate = Duration.between(state.getLastUpdated(), now);

            if (sinceLastUpdate.toMillis() > suspicionTimeout * 2) {
                state.setStatus(NodeStatus.DEAD);
            } else if (sinceLastUpdate.toMillis() > suspicionTimeout) {
                state.setStatus(NodeStatus.SUSPECTED);
            }
        }
    }
}
```

## Common Pitfalls

- Treating network calls like local function calls: network calls can fail silently, return stale data, arrive out of order, or take arbitrarily long. Every remote call needs timeout handling, retry logic, and failure semantics that local calls do not require.

- Assuming clocks are synchronized: physical clocks on different machines drift apart. Using wall-clock timestamps for ordering events across nodes leads to subtle bugs. Use logical clocks (Lamport timestamps, vector clocks) or hybrid logical clocks for causal ordering.

- Not implementing idempotency: when a client retries a request because it did not receive a response (the request may have succeeded but the response was lost), non-idempotent operations execute twice. Every mutating operation in a distributed system should be idempotent or use idempotency keys.

- Ignoring partial failures in error handling: catching a generic exception and retrying the entire operation can cause duplicate side effects. Distinguish between transient failures (retry is safe), permanent failures (retry is pointless), and ambiguous failures (need idempotency check before retry).

- Synchronous chains of service calls: when Service A calls B which calls C which calls D, the overall availability is the product of individual availabilities (0.99^4 = 0.96). Use asynchronous messaging, event-driven architectures, or choreography to break synchronous chains.

- Not planning for split-brain scenarios: when network partitions occur, different parts of the system may independently elect leaders or accept writes. Without proper fencing tokens or consensus protocols, split-brain leads to data corruption that is extremely difficult to repair.

- Underestimating the blast radius of shared dependencies: a single overloaded database, a misconfigured DNS server, or a certificate expiration can take down dozens of services simultaneously. Map your dependency graph and identify single points of failure.

## Real-World Use Cases

**Netflix Microservices Architecture**: Netflix operates over 1000 microservices communicating via RPCs and asynchronous events. Their Hystrix library (now replaced by Resilience4j) pioneered the circuit breaker pattern at scale. When a downstream service becomes slow, circuit breakers prevent thread pool exhaustion in upstream services, allowing graceful degradation where some features become unavailable while the core streaming experience continues. Their Eureka service discovery system uses gossip-based replication so that service registry data is eventually consistent across all nodes, prioritizing availability over consistency for service lookup.

**Google Spanner**: Google's globally distributed database achieves external consistency (the strongest form of consistency) across datacenters using TrueTime, a clock synchronization system that provides bounded uncertainty intervals. Spanner waits out the uncertainty interval before committing transactions, guaranteeing that if transaction T1 commits before T2 starts, T1's commit timestamp is less than T2's. This demonstrates how solving the clock synchronization problem enables stronger consistency guarantees than what typical distributed systems achieve.

**Amazon DynamoDB**: DynamoDB uses consistent hashing for data partitioning, with each partition replicated across three availability zones using a quorum-based protocol. Write operations require acknowledgment from two of three replicas before returning success. During network partitions, DynamoDB prioritizes availability by allowing conflicting writes that are later resolved using vector clocks and application-defined conflict resolution. The system demonstrates the AP side of CAP theorem with mechanisms for eventual convergence.

**Uber's Ringpop**: Uber built Ringpop, a library implementing SWIM (Scalable Weakly-consistent Infection-style Membership) protocol for failure detection and consistent hashing for request routing. Each service instance maintains a membership list updated via gossip, enabling decentralized load balancing without a central coordinator. When a node fails, the gossip protocol detects the failure within seconds and redistributes its hash ring responsibilities to surviving nodes.

## Interview Questions

**Q: How would you design a distributed rate limiter that works across multiple application servers?**

A: Use a sliding window counter stored in a distributed cache (Redis) with atomic increment operations. Each request increments a counter keyed by `{user_id}:{window_start}`. The window slides by maintaining counters for the current and previous time windows, computing the weighted count. For high throughput, use local token buckets that periodically sync with the central store, accepting slight over-limit tolerance for reduced coordination. The tradeoff is between accuracy (checking Redis on every request adds latency) and performance (local counters may allow brief bursts above the limit).

**Q: Explain the difference between at-most-once, at-least-once, and exactly-once delivery semantics.**

A: At-most-once means messages may be lost but never duplicated (fire-and-forget with no retries). At-least-once means messages are never lost but may be duplicated (sender retries until acknowledged). Exactly-once is technically impossible in distributed systems due to the Two Generals Problem, but can be approximated by combining at-least-once delivery with idempotent processing (deduplication on the consumer side using unique message IDs). Kafka achieves "effectively exactly-once" within its ecosystem by combining idempotent producers, transactional writes, and consumer offset management in a single atomic operation.

**Q: What is the split-brain problem and how do you prevent it?**

A: Split-brain occurs when a network partition divides a cluster into two or more groups, each believing it is the sole active group. Both sides may elect leaders and accept writes, causing divergent state that is difficult to reconcile. Prevention strategies include: quorum-based decisions (only the partition with majority of nodes can operate), fencing tokens (monotonically increasing tokens that storage systems use to reject stale leaders), and STONITH (Shoot The Other Node In The Head) where a node that cannot confirm it holds leadership powers off the other node via out-of-band mechanism.

**Q: How does service discovery work in a microservices architecture, and what are the tradeoffs between client-side and server-side discovery?**

A: Client-side discovery (Eureka, Consul with client library) has each client query the service registry and load-balance across instances directly. This eliminates a network hop but couples clients to the discovery mechanism. Server-side discovery (AWS ALB, Kubernetes Services) places a load balancer between client and service instances; the client sends requests to a single endpoint and the infrastructure handles routing. This is simpler for clients but adds latency and a potential single point of failure. Hybrid approaches use DNS-based discovery with short TTLs for the initial lookup and client-side caching for subsequent requests.

## Production Tips

- Implement structured logging with correlation IDs that propagate across service boundaries. When a request flows through five services, a single correlation ID lets you trace the entire path in your log aggregation system. Use OpenTelemetry for standardized distributed tracing.

- Design all inter-service communication with explicit timeouts, retries with exponential backoff and jitter, and circuit breakers. A reasonable starting configuration: 5-second timeout, 3 retries with base delay of 100ms and full jitter, circuit opens after 50% failure rate over 10-second window.

- Use health check endpoints that distinguish between liveness (process is running) and readiness (process can serve traffic). A service that is alive but not ready (warming caches, loading configuration) should not receive traffic from the load balancer but should not be restarted by the orchestrator.

- Implement graceful shutdown: when receiving SIGTERM, stop accepting new requests, finish in-flight requests (with a deadline), close database connections, and flush metrics. Kubernetes sends SIGTERM 30 seconds before SIGKILL by default; ensure your shutdown completes within this window.

- Monitor the four golden signals for every service: latency (response time distribution), traffic (requests per second), errors (error rate), and saturation (resource utilization). Alert on symptoms (elevated error rate) rather than causes (high CPU), and use dashboards to investigate causes after alerts fire.

## Related Topics

- [Consistency Models](./consistency-models.md) — Deep dive into CAP theorem and consistency guarantees that govern distributed data stores
- [Scalability](./scalability.md) — Patterns for growing distributed systems horizontally while maintaining performance
- [Design Patterns](../design-patterns.md) — Microservice patterns (saga, CQRS, event sourcing) that build on distributed systems fundamentals
- [Networking](../networking.md) — TCP/IP, DNS, and network protocols that form the transport layer for distributed communication
