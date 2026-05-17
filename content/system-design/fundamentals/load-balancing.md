# Load Balancing

## Quick Reference

- Load balancing distributes incoming network traffic across multiple backend servers to ensure no single server bears too much demand
- Layer 4 (transport) load balancers route based on IP and TCP/UDP port information without inspecting packet contents; Layer 7 (application) load balancers route based on HTTP headers, URLs, cookies, or request content
- Common algorithms: Round Robin, Weighted Round Robin, Least Connections, Least Response Time, IP Hash, and Consistent Hashing
- Health checks (active probing and passive monitoring) detect unhealthy backends and remove them from the rotation automatically
- Session affinity (sticky sessions) routes all requests from a client to the same backend, trading even distribution for stateful connection handling
- Global Server Load Balancing (GSLB) uses DNS-based routing to direct users to the nearest healthy datacenter
- Connection draining allows in-flight requests to complete before removing a backend from service during deployments or scale-in events

## When to Use

Load balancing is essential whenever you run multiple instances of a service and need to distribute traffic among them. This applies to web applications serving user traffic, API gateways routing to microservices, database read replicas handling query load, message consumers processing from shared queues, and any system where horizontal scaling requires traffic distribution. You need load balancing when a single server cannot handle the request volume, when you require high availability through redundancy (if one server fails, others absorb its traffic), when you need to perform zero-downtime deployments by gradually shifting traffic between old and new versions, or when geographic distribution requires routing users to the nearest datacenter. Understanding load balancing algorithms and their tradeoffs is critical for system design interviews where candidates must explain how traffic flows through their architecture and how the system behaves when individual components fail.

## Code Examples

### Weighted Round Robin Load Balancer

```java
public class WeightedRoundRobinBalancer {
    private final List<WeightedBackend> backends;
    private final AtomicInteger currentIndex = new AtomicInteger(0);
    private final AtomicInteger currentWeight = new AtomicInteger(0);
    private final int maxWeight;
    private final int gcdWeight;

    public WeightedRoundRobinBalancer(List<WeightedBackend> backends) {
        this.backends = new ArrayList<>(backends);
        this.maxWeight = backends.stream()
            .mapToInt(WeightedBackend::getWeight)
            .max()
            .orElse(1);
        this.gcdWeight = computeGcd(backends.stream()
            .mapToInt(WeightedBackend::getWeight)
            .toArray());
    }

    /**
     * Select next backend using weighted round-robin algorithm.
     * Backends with higher weights receive proportionally more requests.
     * A backend with weight 3 receives 3x the traffic of weight 1.
     */
    public synchronized Backend nextBackend() {
        List<WeightedBackend> healthy = backends.stream()
            .filter(WeightedBackend::isHealthy)
            .collect(Collectors.toList());

        if (healthy.isEmpty()) {
            throw new NoHealthyBackendException("All backends are unhealthy");
        }

        while (true) {
            int index = currentIndex.get() % healthy.size();

            if (index == 0) {
                int weight = currentWeight.addAndGet(-gcdWeight);
                if (weight <= 0) {
                    currentWeight.set(maxWeight);
                    weight = maxWeight;
                }
            }

            WeightedBackend candidate = healthy.get(index);
            currentIndex.incrementAndGet();

            if (candidate.getWeight() >= currentWeight.get()) {
                return candidate.getBackend();
            }
        }
    }

    private int computeGcd(int[] values) {
        int result = values[0];
        for (int i = 1; i < values.length; i++) {
            result = gcd(result, values[i]);
        }
        return result;
    }

    private int gcd(int a, int b) {
        while (b != 0) {
            int temp = b;
            b = a % b;
            a = temp;
        }
        return a;
    }
}

public class WeightedBackend {
    private final Backend backend;
    private final int weight;
    private volatile boolean healthy = true;
    private volatile long lastHealthCheck;

    public WeightedBackend(Backend backend, int weight) {
        this.backend = backend;
        this.weight = weight;
        this.lastHealthCheck = System.currentTimeMillis();
    }

    public void markUnhealthy() {
        this.healthy = false;
        this.lastHealthCheck = System.currentTimeMillis();
    }

    public void markHealthy() {
        this.healthy = true;
        this.lastHealthCheck = System.currentTimeMillis();
    }

    public Backend getBackend() { return backend; }
    public int getWeight() { return weight; }
    public boolean isHealthy() { return healthy; }
}
```

### Consistent Hashing Load Balancer with Virtual Nodes

```typescript
import * as crypto from 'crypto';

interface Backend {
  id: string;
  address: string;
  weight: number;
}

class ConsistentHashBalancer {
  private ring: Map<number, string> = new Map(); // hash -> backendId
  private sortedHashes: number[] = [];
  private backends: Map<string, Backend> = new Map();
  private readonly virtualNodesPerUnit: number;

  constructor(virtualNodesPerUnit: number = 150) {
    this.virtualNodesPerUnit = virtualNodesPerUnit;
  }

  /**
   * Add a backend to the hash ring.
   * Virtual nodes are proportional to weight for weighted distribution.
   */
  addBackend(backend: Backend): void {
    this.backends.set(backend.id, backend);
    const virtualNodes = this.virtualNodesPerUnit * backend.weight;

    for (let i = 0; i < virtualNodes; i++) {
      const hash = this.hash(`${backend.id}:${i}`);
      this.ring.set(hash, backend.id);
    }

    this.rebuildSortedHashes();
  }

  /**
   * Remove a backend from the hash ring.
   * Keys previously routed to this backend will be redistributed
   * to the next backend on the ring (minimal disruption).
   */
  removeBackend(backendId: string): void {
    const backend = this.backends.get(backendId);
    if (!backend) return;

    const virtualNodes = this.virtualNodesPerUnit * backend.weight;
    for (let i = 0; i < virtualNodes; i++) {
      const hash = this.hash(`${backendId}:${i}`);
      this.ring.delete(hash);
    }

    this.backends.delete(backendId);
    this.rebuildSortedHashes();
  }

  /**
   * Route a key to a backend using consistent hashing.
   * The key is hashed and mapped to the next clockwise node on the ring.
   */
  getBackend(key: string): Backend | null {
    if (this.sortedHashes.length === 0) return null;

    const hash = this.hash(key);
    // Binary search for the first hash >= key hash
    let index = this.binarySearchCeil(hash);

    // Wrap around to the first node if past the end
    if (index >= this.sortedHashes.length) {
      index = 0;
    }

    const backendId = this.ring.get(this.sortedHashes[index])!;
    return this.backends.get(backendId) || null;
  }

  /**
   * Get N distinct backends for replication.
   * Walks clockwise from the key's position, skipping duplicate backends.
   */
  getBackends(key: string, count: number): Backend[] {
    if (this.sortedHashes.length === 0) return [];

    const hash = this.hash(key);
    let index = this.binarySearchCeil(hash);
    const result: Backend[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < this.sortedHashes.length && result.length < count; i++) {
      const wrappedIndex = (index + i) % this.sortedHashes.length;
      const backendId = this.ring.get(this.sortedHashes[wrappedIndex])!;

      if (!seen.has(backendId)) {
        seen.add(backendId);
        const backend = this.backends.get(backendId);
        if (backend) result.push(backend);
      }
    }

    return result;
  }

  private hash(key: string): number {
    const md5 = crypto.createHash('md5').update(key).digest();
    return md5.readUInt32BE(0);
  }

  private binarySearchCeil(target: number): number {
    let low = 0;
    let high = this.sortedHashes.length - 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (this.sortedHashes[mid] < target) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return low;
  }

  private rebuildSortedHashes(): void {
    this.sortedHashes = Array.from(this.ring.keys()).sort((a, b) => a - b);
  }

  getStats(): { backendId: string; keyCount: number; percentage: number }[] {
    const counts = new Map<string, number>();
    // Sample 10000 random keys to estimate distribution
    for (let i = 0; i < 10000; i++) {
      const backend = this.getBackend(`sample-key-${i}`);
      if (backend) {
        counts.set(backend.id, (counts.get(backend.id) || 0) + 1);
      }
    }
    return Array.from(counts.entries()).map(([id, count]) => ({
      backendId: id,
      keyCount: count,
      percentage: (count / 10000) * 100
    }));
  }
}
```

### Health Check System with Circuit Breaking

```java
public class HealthChecker {
    private final ScheduledExecutorService scheduler;
    private final Map<String, BackendHealth> healthStates = new ConcurrentHashMap<>();
    private final HealthCheckConfig config;
    private final LoadBalancer loadBalancer;

    public HealthChecker(LoadBalancer loadBalancer, HealthCheckConfig config) {
        this.loadBalancer = loadBalancer;
        this.config = config;
        this.scheduler = Executors.newScheduledThreadPool(4);
    }

    public void startMonitoring(List<Backend> backends) {
        for (Backend backend : backends) {
            healthStates.put(backend.getId(), new BackendHealth(backend));
            scheduler.scheduleAtFixedRate(
                () -> checkHealth(backend),
                0,
                config.getCheckInterval().toMillis(),
                TimeUnit.MILLISECONDS
            );
        }
    }

    private void checkHealth(Backend backend) {
        BackendHealth health = healthStates.get(backend.getId());

        try {
            HttpResponse response = sendHealthProbe(backend);
            long latency = response.getLatencyMs();

            if (response.getStatusCode() == 200 && latency < config.getLatencyThreshold()) {
                health.recordSuccess(latency);
                if (!health.isHealthy() && health.getConsecutiveSuccesses()
                        >= config.getHealthyThreshold()) {
                    // Backend recovered: add back to rotation
                    health.markHealthy();
                    loadBalancer.addBackend(backend);
                    logEvent("Backend recovered", backend, health);
                }
            } else {
                health.recordFailure(response.getStatusCode(), latency);
                handleFailure(backend, health);
            }
        } catch (Exception e) {
            health.recordFailure(-1, -1);
            handleFailure(backend, health);
        }
    }

    private void handleFailure(Backend backend, BackendHealth health) {
        if (health.isHealthy() && health.getConsecutiveFailures()
                >= config.getUnhealthyThreshold()) {
            // Backend failed: remove from rotation
            health.markUnhealthy();
            loadBalancer.removeBackend(backend);
            logEvent("Backend removed", backend, health);
        }
    }

    private HttpResponse sendHealthProbe(Backend backend) {
        // Send HTTP GET to backend's health endpoint with timeout
        String url = backend.getAddress() + config.getHealthPath();
        return httpClient.get(url)
            .timeout(config.getProbeTimeout())
            .execute();
    }

    public Map<String, BackendHealthStatus> getHealthReport() {
        Map<String, BackendHealthStatus> report = new LinkedHashMap<>();
        for (Map.Entry<String, BackendHealth> entry : healthStates.entrySet()) {
            BackendHealth health = entry.getValue();
            report.put(entry.getKey(), new BackendHealthStatus(
                health.isHealthy(),
                health.getAverageLatency(),
                health.getSuccessRate(),
                health.getLastCheckTime(),
                health.getConsecutiveFailures()
            ));
        }
        return report;
    }
}

class BackendHealth {
    private final Backend backend;
    private volatile boolean healthy = true;
    private final AtomicInteger consecutiveSuccesses = new AtomicInteger(0);
    private final AtomicInteger consecutiveFailures = new AtomicInteger(0);
    private final SlidingWindowCounter successCounter;
    private final SlidingWindowCounter totalCounter;
    private final MovingAverage latencyAverage;
    private volatile Instant lastCheckTime;

    public BackendHealth(Backend backend) {
        this.backend = backend;
        this.successCounter = new SlidingWindowCounter(Duration.ofMinutes(5));
        this.totalCounter = new SlidingWindowCounter(Duration.ofMinutes(5));
        this.latencyAverage = new MovingAverage(100); // Last 100 samples
    }

    public void recordSuccess(long latencyMs) {
        consecutiveSuccesses.incrementAndGet();
        consecutiveFailures.set(0);
        successCounter.increment();
        totalCounter.increment();
        latencyAverage.add(latencyMs);
        lastCheckTime = Instant.now();
    }

    public void recordFailure(int statusCode, long latencyMs) {
        consecutiveFailures.incrementAndGet();
        consecutiveSuccesses.set(0);
        totalCounter.increment();
        if (latencyMs > 0) latencyAverage.add(latencyMs);
        lastCheckTime = Instant.now();
    }

    public double getSuccessRate() {
        long total = totalCounter.getCount();
        return total == 0 ? 1.0 : (double) successCounter.getCount() / total;
    }

    public void markHealthy() { this.healthy = true; }
    public void markUnhealthy() { this.healthy = false; }
    public boolean isHealthy() { return healthy; }
    public int getConsecutiveSuccesses() { return consecutiveSuccesses.get(); }
    public int getConsecutiveFailures() { return consecutiveFailures.get(); }
    public double getAverageLatency() { return latencyAverage.getAverage(); }
    public Instant getLastCheckTime() { return lastCheckTime; }
}
```

## Common Pitfalls

- Using round-robin when backends have different capacities: round-robin distributes requests equally regardless of backend processing power. A backend with half the CPU receives the same traffic as one with double the CPU, leading to overload on weaker instances. Use weighted algorithms or least-connections to account for heterogeneous capacity.

- Not implementing proper health checks: without health checks, the load balancer continues sending traffic to failed backends, causing a percentage of requests to fail proportional to the number of dead backends. Implement both active health probes (periodic HTTP checks) and passive monitoring (tracking error rates from real traffic) for comprehensive failure detection.

- Configuring overly aggressive health check thresholds: marking a backend unhealthy after a single failed probe causes flapping during transient network issues. A backend that is briefly slow (garbage collection pause, temporary network congestion) gets removed and re-added repeatedly, causing traffic oscillation. Use consecutive failure counts (typically 3-5) before marking unhealthy.

- Ignoring connection draining during deployments: removing a backend immediately drops all in-flight requests, causing errors for active users. Implement connection draining that stops sending new requests to the backend while allowing existing connections to complete within a deadline (typically 30-60 seconds).

- Session affinity without fallback strategy: sticky sessions route all requests from a client to the same backend. When that backend fails, the client loses its session state entirely. Implement session externalization (Redis, database) as a fallback, or accept session loss and design the application to handle re-authentication gracefully.

- Not monitoring load balancer capacity itself: the load balancer is a shared resource that can become a bottleneck. A single load balancer handling millions of connections may exhaust its connection table, CPU, or network bandwidth. Monitor load balancer metrics (active connections, bandwidth, CPU) and scale the load balancing tier itself when needed.

- Choosing Layer 7 when Layer 4 suffices: Layer 7 load balancers inspect and potentially modify every HTTP request, adding latency and CPU overhead. For services that do not need content-based routing, URL rewriting, or SSL termination at the load balancer, Layer 4 provides higher throughput with lower latency.

## Real-World Use Cases

**AWS Application Load Balancer**: ALB operates at Layer 7, supporting content-based routing rules that direct traffic based on URL path, hostname, HTTP headers, or query parameters. A single ALB can route `/api/*` to one target group, `/static/*` to another, and `admin.example.com` to a third. ALB integrates with AWS Auto Scaling to automatically register and deregister instances, performs health checks at configurable intervals, and supports weighted target groups for blue-green deployments where traffic is gradually shifted from the old version to the new version.

**Nginx as Reverse Proxy**: Nginx handles millions of concurrent connections using an event-driven architecture with minimal memory footprint. In production deployments, Nginx performs SSL termination (offloading encryption from backends), request buffering (absorbing slow client uploads before forwarding to backends), response caching, rate limiting, and load balancing across upstream servers. Its configuration supports multiple balancing algorithms, health checks, and connection limits per backend, making it suitable as both an edge load balancer and an internal service mesh component.

**Envoy Proxy in Service Mesh**: Envoy operates as a sidecar proxy in service mesh architectures (Istio, Consul Connect), handling all inter-service communication. Each service instance has its own Envoy proxy that performs client-side load balancing with algorithms like least-request, ring-hash, and random. Envoy implements circuit breaking per upstream cluster, automatic retries with configurable budgets, outlier detection that ejects unhealthy instances based on consecutive errors or latency, and distributed tracing propagation. The control plane (Istio Pilot) dynamically updates Envoy's routing configuration without restarts.

**Cloudflare Global Load Balancing**: Cloudflare's Anycast network routes users to the nearest datacenter using BGP routing at the network layer. Within each datacenter, application-layer load balancing distributes traffic across origin servers. Health checks from multiple Cloudflare locations detect regional outages and automatically failover traffic to healthy datacenters. Traffic steering policies support geographic routing (EU users to EU origins), latency-based routing (route to fastest origin), and weighted distribution for gradual migrations between datacenters.

**HAProxy for Database Load Balancing**: HAProxy balances read queries across PostgreSQL read replicas using health checks that verify replication lag. Backends with replication lag exceeding a threshold are temporarily removed from rotation, ensuring reads return reasonably fresh data. HAProxy's TCP mode (Layer 4) minimizes overhead for database connections, while its connection queuing prevents overwhelming replicas during traffic spikes. The stats interface provides real-time visibility into connection counts, error rates, and backend health across the replica fleet.

## Interview Questions

**Q: How would you implement zero-downtime deployments using a load balancer?**

A: Use rolling deployment with connection draining: (1) Deploy new version to a subset of instances. (2) Run health checks against new instances until they pass. (3) Add new instances to the load balancer rotation. (4) Remove old instances from rotation with connection draining enabled (stop new requests, allow in-flight requests 30-60 seconds to complete). (5) Repeat until all instances are updated. For more control, use blue-green deployment: maintain two identical environments, deploy to the inactive one, run smoke tests, then switch the load balancer to point to the new environment. If issues arise, switch back immediately. Canary deployment routes a small percentage (1-5%) of traffic to the new version first, monitoring error rates and latency before proceeding with full rollout.

**Q: What is the difference between Layer 4 and Layer 7 load balancing, and when would you choose each?**

A: Layer 4 operates at the transport layer, routing based on source/destination IP and port without inspecting packet contents. It is faster (no payload parsing), supports any protocol (not just HTTP), and handles more connections per instance. Choose Layer 4 for high-throughput TCP services, database connection routing, or when content-based routing is unnecessary. Layer 7 operates at the application layer, inspecting HTTP headers, URLs, cookies, and request bodies. It enables content-based routing, URL rewriting, SSL termination, request/response modification, and WebSocket upgrade handling. Choose Layer 7 when you need path-based routing to different backends, A/B testing via header inspection, or authentication at the load balancer level. Many architectures use both: Layer 4 at the edge for raw throughput, Layer 7 internally for intelligent routing.

**Q: How does consistent hashing improve load balancer behavior compared to simple round-robin?**

A: Consistent hashing maps both servers and requests to positions on a hash ring. Each request is routed to the next server clockwise on the ring. The key advantage is minimal disruption when servers are added or removed: only keys between the new/removed server and its predecessor are redistributed, while all other mappings remain stable. With round-robin, adding or removing a server changes the routing for nearly all requests. This matters for stateful services (WebSocket connections, in-memory caches) where re-routing means losing state. Virtual nodes (multiple ring positions per physical server) improve distribution uniformity. The tradeoff is that consistent hashing does not account for server load, so it is often combined with bounded-load consistent hashing that redistributes keys from overloaded servers.

**Q: How do you handle the thundering herd problem when a backend recovers after failure?**

A: When a backend recovers, all queued requests and retries can flood it simultaneously, causing immediate re-failure. Solutions include: (1) Slow start: the load balancer gradually increases traffic to the recovered backend over 30-60 seconds rather than immediately sending full load. (2) Request queuing with rate limiting: limit the rate of requests sent to a recovering backend regardless of demand. (3) Client-side exponential backoff with jitter: clients that were retrying spread their retry attempts over time rather than all retrying at the same instant. (4) Health check hysteresis: require multiple consecutive successful health checks before adding the backend back to rotation, ensuring it is truly recovered rather than briefly responsive.

## Production Tips

- Configure health check intervals based on your availability SLA. For 99.99% availability, you need to detect failures within seconds, requiring health checks every 2-3 seconds with a 2-failure threshold (6-9 seconds to detection). For 99.9% availability, 10-second intervals with a 3-failure threshold (30 seconds to detection) may suffice. Faster detection means more health check traffic and higher risk of false positives.

- Implement connection draining with a deadline that matches your longest expected request duration. If your P99 request latency is 5 seconds, set the draining deadline to 30 seconds (6x P99) to handle outliers. Monitor drained connections to ensure they complete within the deadline; connections that consistently hit the deadline indicate a backend performance problem.

- Use least-connections algorithm as the default for most HTTP services. It naturally adapts to backends with different processing speeds (slow backends accumulate connections, receiving fewer new requests) and handles variable request durations better than round-robin. Switch to consistent hashing only when you need session affinity or cache locality.

- Monitor the ratio of healthy to total backends and alert when it drops below a threshold (e.g., 70%). A gradual decline in healthy backends indicates a systemic issue (bad deployment, resource exhaustion) rather than isolated failures. Automated rollback triggers can revert deployments when healthy backend count drops below the threshold.

## Related Topics

- [Scalability](./scalability.md) — Horizontal scaling patterns that depend on load balancing for traffic distribution
- [Distributed Systems](./distributed-systems.md) — Service discovery and failure detection that inform load balancer routing decisions
- [Caching](./caching.md) — CDN and distributed cache routing that uses consistent hashing for cache locality
- [Database Sharding](./database-sharding.md) — Data routing strategies that parallel load balancing algorithms at the storage layer
