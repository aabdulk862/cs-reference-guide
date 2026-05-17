# Load Balancing

## Quick Reference

- L4 (Transport Layer) load balancers route based on IP/port tuples without inspecting payload — faster, protocol-agnostic, lower resource usage
- L7 (Application Layer) load balancers inspect HTTP headers, URLs, cookies, and body content — enabling content-based routing, SSL termination, and request modification
- Round Robin distributes requests sequentially; Weighted Round Robin accounts for heterogeneous server capacity
- Least Connections routes to the server with fewest active connections — adapts naturally to varying request processing times
- Consistent Hashing maps servers and requests onto a hash ring — adding/removing servers only redistributes ~1/N of requests
- Health checks: active (periodic probes) vs passive (monitoring real traffic for errors); shallow (TCP connect) vs deep (HTTP endpoint checking dependencies)
- Session affinity (sticky sessions) routes all requests from the same client to the same server — needed for server-local state but reduces distribution fairness
- Connection draining (graceful shutdown) stops sending new requests to a server while allowing in-flight requests to complete before removal
- Direct Server Return (DSR) allows response traffic to bypass the load balancer, reducing its bandwidth requirements for asymmetric workloads

## When to Use

Load balancing is required whenever you have more than one instance of a service and need to distribute traffic across them. This applies to web servers, API gateways, database read replicas, message queue consumers, and any horizontally scaled component. Without load balancing, you cannot achieve high availability (surviving individual server failures), horizontal scalability (adding capacity by adding servers), or efficient resource utilization (preventing hot spots).

Choose L4 load balancing when you need maximum throughput with minimal latency overhead, when the protocol isn't HTTP (TCP-based databases, custom protocols, gaming servers), or when you don't need content-based routing decisions. L4 balancers handle millions of connections per second with microsecond-level added latency. Choose L7 load balancing when you need URL-based routing (microservice path routing), header-based decisions (A/B testing, canary deployments), SSL/TLS termination, request/response modification, or WebSocket-aware routing.

Consistent hashing is specifically appropriate for caching layers (ensuring the same key always routes to the same cache server), stateful services (maintaining affinity without cookies), and scenarios where servers are frequently added/removed (minimizing cache invalidation during scaling events).

## Code Examples

```java
// Production-grade load balancer with multiple algorithms and health checking
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import java.security.MessageDigest;
import java.nio.charset.StandardCharsets;

public class LoadBalancer {
    
    public enum Algorithm {
        ROUND_ROBIN, WEIGHTED_ROUND_ROBIN, LEAST_CONNECTIONS, 
        CONSISTENT_HASH, RANDOM, LEAST_RESPONSE_TIME
    }
    
    public static class Server {
        final String address;
        final int weight;
        final AtomicInteger activeConnections = new AtomicInteger(0);
        final AtomicLong totalRequests = new AtomicLong(0);
        final AtomicLong totalResponseTimeMs = new AtomicLong(0);
        volatile boolean healthy = true;
        volatile long lastHealthCheck = 0;
        
        public Server(String address, int weight) {
            this.address = address;
            this.weight = weight;
        }
        
        public double avgResponseTime() {
            long total = totalRequests.get();
            return total == 0 ? 0 : (double) totalResponseTimeMs.get() / total;
        }
    }
    
    private final List<Server> servers;
    private final Algorithm algorithm;
    private final AtomicInteger roundRobinIndex = new AtomicInteger(0);
    
    // Consistent hash ring
    private final TreeMap<Long, Server> hashRing = new TreeMap<>();
    private static final int VIRTUAL_NODES = 150;
    
    // Weighted round robin state
    private final AtomicInteger weightedIndex = new AtomicInteger(0);
    private int[] weightedSequence;
    
    public LoadBalancer(List<Server> servers, Algorithm algorithm) {
        this.servers = new CopyOnWriteArrayList<>(servers);
        this.algorithm = algorithm;
        
        if (algorithm == Algorithm.CONSISTENT_HASH) {
            buildHashRing();
        }
        if (algorithm == Algorithm.WEIGHTED_ROUND_ROBIN) {
            buildWeightedSequence();
        }
    }
    
    public Server selectServer(String clientKey) {
        List<Server> healthy = getHealthyServers();
        if (healthy.isEmpty()) {
            throw new IllegalStateException("No healthy servers available");
        }
        
        return switch (algorithm) {
            case ROUND_ROBIN -> roundRobin(healthy);
            case WEIGHTED_ROUND_ROBIN -> weightedRoundRobin(healthy);
            case LEAST_CONNECTIONS -> leastConnections(healthy);
            case CONSISTENT_HASH -> consistentHash(clientKey);
            case RANDOM -> healthy.get(ThreadLocalRandom.current().nextInt(healthy.size()));
            case LEAST_RESPONSE_TIME -> leastResponseTime(healthy);
        };
    }
    
    private Server roundRobin(List<Server> servers) {
        int index = Math.abs(roundRobinIndex.getAndIncrement() % servers.size());
        return servers.get(index);
    }
    
    private Server weightedRoundRobin(List<Server> healthy) {
        // Smooth weighted round robin (Nginx algorithm)
        int index = Math.abs(weightedIndex.getAndIncrement() % weightedSequence.length);
        Server selected = servers.get(weightedSequence[index]);
        return selected.healthy ? selected : roundRobin(healthy);
    }
    
    private Server leastConnections(List<Server> servers) {
        return servers.stream()
            .min(Comparator.comparingInt(s -> s.activeConnections.get()))
            .orElseThrow();
    }
    
    private Server consistentHash(String key) {
        if (key == null || key.isEmpty()) {
            return roundRobin(getHealthyServers());
        }
        
        long hash = hash(key);
        Map.Entry<Long, Server> entry = hashRing.ceilingEntry(hash);
        if (entry == null) {
            entry = hashRing.firstEntry();
        }
        
        Server server = entry.getValue();
        if (!server.healthy) {
            // Walk clockwise to find next healthy server
            Long position = entry.getKey();
            for (int i = 0; i < hashRing.size(); i++) {
                Map.Entry<Long, Server> next = hashRing.higherEntry(position);
                if (next == null) next = hashRing.firstEntry();
                if (next.getValue().healthy) return next.getValue();
                position = next.getKey();
            }
            throw new IllegalStateException("No healthy servers on ring");
        }
        return server;
    }
    
    private Server leastResponseTime(List<Server> servers) {
        return servers.stream()
            .min(Comparator.comparingDouble(Server::avgResponseTime))
            .orElseThrow();
    }
    
    // --- Ring management ---
    
    private void buildHashRing() {
        hashRing.clear();
        for (Server server : servers) {
            for (int i = 0; i < VIRTUAL_NODES * server.weight; i++) {
                long hash = hash(server.address + "#" + i);
                hashRing.put(hash, server);
            }
        }
    }
    
    private void buildWeightedSequence() {
        int totalWeight = servers.stream().mapToInt(s -> s.weight).sum();
        weightedSequence = new int[totalWeight];
        int pos = 0;
        for (int i = 0; i < servers.size(); i++) {
            for (int w = 0; w < servers.get(i).weight; w++) {
                weightedSequence[pos++] = i;
            }
        }
        // Shuffle for better distribution
        Random rng = new Random(42);
        for (int i = weightedSequence.length - 1; i > 0; i--) {
            int j = rng.nextInt(i + 1);
            int tmp = weightedSequence[i];
            weightedSequence[i] = weightedSequence[j];
            weightedSequence[j] = tmp;
        }
    }
    
    public void addServer(Server server) {
        servers.add(server);
        if (algorithm == Algorithm.CONSISTENT_HASH) {
            for (int i = 0; i < VIRTUAL_NODES * server.weight; i++) {
                hashRing.put(hash(server.address + "#" + i), server);
            }
        }
    }
    
    public void removeServer(Server server) {
        server.healthy = false;
        servers.remove(server);
        if (algorithm == Algorithm.CONSISTENT_HASH) {
            hashRing.values().removeIf(s -> s.address.equals(server.address));
        }
    }
    
    private List<Server> getHealthyServers() {
        return servers.stream().filter(s -> s.healthy).toList();
    }
    
    private static long hash(String key) {
        try {
            MessageDigest md = MessageDigest.getInstance("MD5");
            byte[] digest = md.digest(key.getBytes(StandardCharsets.UTF_8));
            return ((long)(digest[0] & 0xFF) << 24) |
                   ((long)(digest[1] & 0xFF) << 16) |
                   ((long)(digest[2] & 0xFF) << 8) |
                   (digest[3] & 0xFF);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }
}
```

```java
// Health checker with active probing, passive monitoring, and circuit breaker
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;

public class HealthChecker {

    enum HealthStatus {
        HEALTHY, UNHEALTHY, DRAINING // DRAINING = no new requests, finish in-flight
    }

    static class HealthCheckConfig {
        double intervalSeconds = 10.0;
        double timeoutSeconds = 5.0;
        int healthyThreshold = 3;      // Consecutive successes to mark healthy
        int unhealthyThreshold = 2;    // Consecutive failures to mark unhealthy
        String path = "/health";
        int expectedStatus = 200;
    }

    static class ServerHealth {
        final String address;
        volatile HealthStatus status = HealthStatus.HEALTHY;
        int consecutiveSuccesses = 0;
        int consecutiveFailures = 0;
        volatile long lastCheckTimeMs = 0;
        volatile double lastResponseTimeMs = 0;
        private final Deque<Integer> errorRateWindow = new ArrayDeque<>(100);

        ServerHealth(String address) {
            this.address = address;
        }

        synchronized double errorRate() {
            if (errorRateWindow.isEmpty()) return 0.0;
            int sum = errorRateWindow.stream().mapToInt(Integer::intValue).sum();
            return (double) sum / errorRateWindow.size();
        }

        synchronized void recordResult(int value) {
            if (errorRateWindow.size() >= 100) errorRateWindow.pollFirst();
            errorRateWindow.addLast(value);
        }
    }

    private final HealthCheckConfig config;
    private final Map<String, ServerHealth> servers = new ConcurrentHashMap<>();
    private final AtomicBoolean running = new AtomicBoolean(false);
    private final HttpClient httpClient;
    private ScheduledExecutorService scheduler;

    /** Active + passive health checking with circuit breaker pattern. */
    public HealthChecker(List<String> serverAddresses, HealthCheckConfig config) {
        this.config = config != null ? config : new HealthCheckConfig();
        for (String addr : serverAddresses) {
            servers.put(addr, new ServerHealth(addr));
        }
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofMillis((long) (this.config.timeoutSeconds * 1000)))
                .build();
    }

    /** Start periodic active health checks. */
    public void start() {
        running.set(true);
        scheduler = Executors.newScheduledThreadPool(4);
        scheduler.scheduleAtFixedRate(this::checkAllServers,
                0, (long) (config.intervalSeconds * 1000), TimeUnit.MILLISECONDS);
    }

    public void stop() {
        running.set(false);
        if (scheduler != null) scheduler.shutdown();
    }

    private void checkAllServers() {
        for (ServerHealth health : servers.values()) {
            if (health.status != HealthStatus.DRAINING) {
                scheduler.submit(() -> checkServer(health));
            }
        }
    }

    /** Perform active health check against a server. */
    private void checkServer(ServerHealth health) {
        String url = "http://" + health.address + config.path;
        long start = System.nanoTime();

        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .timeout(Duration.ofMillis((long) (config.timeoutSeconds * 1000)))
                    .GET().build();

            HttpResponse<Void> response = httpClient.send(request,
                    HttpResponse.BodyHandlers.discarding());

            double elapsed = (System.nanoTime() - start) / 1_000_000.0;
            health.lastResponseTimeMs = elapsed;
            health.lastCheckTimeMs = System.currentTimeMillis();

            if (response.statusCode() == config.expectedStatus) {
                recordSuccess(health);
            } else {
                recordFailure(health, "Status " + response.statusCode());
            }
        } catch (Exception e) {
            double elapsed = (System.nanoTime() - start) / 1_000_000.0;
            health.lastResponseTimeMs = elapsed;
            health.lastCheckTimeMs = System.currentTimeMillis();
            recordFailure(health, e.getMessage());
        }
    }

    /** Passive health monitoring — called after each real request. */
    public void recordRequestResult(String address, boolean success, double responseTimeMs) {
        ServerHealth health = servers.get(address);
        if (health == null) return;

        health.recordResult(success ? 0 : 1);
        health.lastResponseTimeMs = responseTimeMs;

        // Circuit breaker: if error rate exceeds threshold, mark unhealthy
        if (health.errorRate() > 0.5) {
            if (health.status == HealthStatus.HEALTHY) {
                System.out.printf("Circuit breaker tripped for %s (error rate: %.1f%%)%n",
                        address, health.errorRate() * 100);
                health.status = HealthStatus.UNHEALTHY;
                health.consecutiveFailures = config.unhealthyThreshold;
            }
        }
    }

    private synchronized void recordSuccess(ServerHealth health) {
        health.consecutiveSuccesses++;
        health.consecutiveFailures = 0;
        health.recordResult(0);

        if (health.status == HealthStatus.UNHEALTHY
                && health.consecutiveSuccesses >= config.healthyThreshold) {
            System.out.printf("Server %s recovered → HEALTHY%n", health.address);
            health.status = HealthStatus.HEALTHY;
        }
    }

    private synchronized void recordFailure(ServerHealth health, String reason) {
        health.consecutiveFailures++;
        health.consecutiveSuccesses = 0;
        health.recordResult(1);

        if (health.status == HealthStatus.HEALTHY
                && health.consecutiveFailures >= config.unhealthyThreshold) {
            System.out.printf("Server %s failed → UNHEALTHY (%s)%n", health.address, reason);
            health.status = HealthStatus.UNHEALTHY;
        }
    }

    public List<String> getHealthyServers() {
        List<String> healthy = new ArrayList<>();
        for (ServerHealth h : servers.values()) {
            if (h.status == HealthStatus.HEALTHY) {
                healthy.add(h.address);
            }
        }
        return healthy;
    }

    /** Mark server for draining (graceful removal). */
    public void drainServer(String address) {
        ServerHealth health = servers.get(address);
        if (health != null) {
            health.status = HealthStatus.DRAINING;
            System.out.printf("Server %s marked for draining%n", address);
        }
    }
}
```

```yaml
# HAProxy L7 load balancer configuration with health checks and session affinity
global
    maxconn 50000
    log stdout format raw local0
    stats socket /var/run/haproxy.sock mode 660 level admin

defaults
    mode http
    log global
    option httplog
    option dontlognull
    
    # Timeouts
    timeout connect 5s
    timeout client 30s
    timeout server 30s
    timeout http-request 10s
    timeout http-keep-alive 60s
    timeout queue 30s        # Max time in queue waiting for a server
    
    # Retries
    retries 3
    option redispatch       # Retry on a different server after failure

frontend http_front
    bind *:443 ssl crt /etc/ssl/certs/combined.pem alpn h2,http/1.1
    
    # Rate limiting
    stick-table type ip size 100k expire 30s store http_req_rate(10s)
    http-request deny deny_status 429 if { sc_http_req_rate(0) gt 100 }
    
    # Content-based routing (L7)
    acl is_api path_beg /api/
    acl is_websocket hdr(Upgrade) -i websocket
    acl is_static path_beg /static/ /assets/
    
    use_backend api_servers if is_api
    use_backend ws_servers if is_websocket
    use_backend static_servers if is_static
    default_backend web_servers

backend api_servers
    balance leastconn
    option httpchk GET /health HTTP/1.1\r\nHost:\ api.internal
    
    # Health check configuration
    default-server inter 5s fall 2 rise 3 slowstart 30s
    
    # Connection limits per server
    default-server maxconn 200 maxqueue 50
    
    server api1 10.0.1.1:8080 check weight 3
    server api2 10.0.1.2:8080 check weight 3
    server api3 10.0.1.3:8080 check weight 2
    server api4 10.0.1.4:8080 check weight 2 backup  # Only used when others fail

backend ws_servers
    balance source          # IP-based affinity for WebSocket connections
    option httpchk GET /ws/health HTTP/1.1\r\nHost:\ ws.internal
    timeout server 3600s    # Long timeout for WebSocket connections
    timeout tunnel 3600s
    
    server ws1 10.0.2.1:8080 check
    server ws2 10.0.2.2:8080 check

backend web_servers
    balance roundrobin
    option httpchk GET /health
    
    # Cookie-based session affinity
    cookie SERVERID insert indirect nocache httponly secure
    
    server web1 10.0.3.1:8080 check cookie web1
    server web2 10.0.3.2:8080 check cookie web2
    server web3 10.0.3.3:8080 check cookie web3

backend static_servers
    balance uri             # Same URI always goes to same server (cache friendly)
    option httpchk GET /health
    
    server static1 10.0.4.1:8080 check
    server static2 10.0.4.2:8080 check
```

## Common Pitfalls

- **Health checks that only verify TCP connectivity**: A server that accepts TCP connections but returns 500 errors on every request passes TCP-level health checks. Always implement deep health checks that verify the application is ready to serve traffic — checking database connectivity, downstream service availability, and application initialization state. Return 503 during startup/shutdown to signal "not ready" vs 500 for "broken."

- **Session affinity without fallback strategy**: Sticky sessions route all requests from a client to the same server, but when that server fails, the client loses their session. Implement session externalization (Redis, database) as the primary strategy, with sticky sessions as a performance optimization (avoiding session store lookups). This way, failover to another server still works — just with a session store read.

- **Consistent hashing without virtual nodes**: Basic consistent hashing with one point per server on the ring produces highly uneven distribution — some servers get 3-5× more traffic than others. Use 100-200 virtual nodes per physical server to achieve uniform distribution. Weight virtual node count by server capacity for heterogeneous fleets.

- **Not implementing connection draining during deployments**: Removing a server from the load balancer pool immediately drops all in-flight requests, causing errors. Implement connection draining: stop sending new requests to the server, wait for in-flight requests to complete (with a timeout), then remove the server. Most load balancers support this natively (HAProxy `drain`, Kubernetes `terminationGracePeriodSeconds`).

- **Ignoring the load balancer as a single point of failure**: A single load balancer is itself a SPOF. Production deployments use redundant load balancers with failover (VRRP/keepalived for hardware LBs, multiple instances behind DNS for cloud LBs). Cloud load balancers (ALB, NLB) are inherently redundant across availability zones, but self-managed load balancers need explicit HA configuration.

- **Retry amplification overwhelming struggling backends**: When a backend is slow, the load balancer retries on another server. If all servers are slow (shared dependency issue), retries multiply the load by the retry count, making the situation worse. Implement retry budgets (limit retries to 20% of total requests), circuit breakers (stop sending to failing backends), and distinguish between retryable errors (503, timeout) and non-retryable errors (400, 404).

## Real-World Use Cases

**Kubernetes Service Load Balancing**: Kubernetes uses kube-proxy to implement L4 load balancing for ClusterIP services using iptables rules or IPVS. Each service gets a virtual IP, and traffic is distributed across healthy pods using round-robin (iptables) or various algorithms (IPVS supports round-robin, least connections, source hashing). For L7 load balancing, Ingress controllers (Nginx, Envoy/Istio, Traefik) provide HTTP routing, TLS termination, and path-based routing to different services.

**CDN Origin Selection**: CDNs use consistent hashing to route cache misses to specific origin servers, ensuring the same content is always fetched from the same origin (improving origin-side caching). When an origin server is removed, only its portion of the hash ring redistributes, minimizing cache invalidation. Multi-tier caching (edge → regional → origin shield → origin) uses different load balancing at each tier.

**Database Read Replica Routing**: Applications route read queries across multiple database replicas using least-connections balancing (adapting to query complexity differences) or round-robin (for uniform query patterns). Write queries always go to the primary. Connection poolers like PgBouncer or ProxySQL implement this routing transparently, with health checks that verify replication lag — a replica with high lag is removed from the read pool to prevent serving stale data.

**Global Server Load Balancing (GSLB)**: Multi-region deployments use DNS-based load balancing (GeoDNS) to route users to the nearest healthy region, combined with L7 load balancing within each region to distribute across servers. Failover between regions uses DNS health checks with low TTLs (30-60s). During regional outages, DNS automatically redirects traffic to surviving regions, which must have capacity headroom to absorb the additional load.

**API Gateway Rate Limiting and Routing**: API gateways (Kong, AWS API Gateway, Envoy) combine L7 load balancing with rate limiting, authentication, and request transformation. Different API paths route to different backend service clusters, each with independent scaling and health checking. Rate limiting uses token bucket or sliding window algorithms, often backed by Redis for distributed rate limit state across multiple gateway instances.

## Interview Questions

**Q: Explain the difference between L4 and L7 load balancing with specific use cases for each.**

A: L4 load balancers operate at the transport layer, making routing decisions based on source/destination IP and port without inspecting the payload. They're faster (no payload parsing), handle any TCP/UDP protocol, and add minimal latency (microseconds). Use L4 for: database connection routing, gaming servers, any non-HTTP protocol, or when maximum throughput matters. L7 load balancers operate at the application layer, inspecting HTTP headers, URLs, cookies, and even request bodies. They enable: path-based routing (/api → service A, /web → service B), header-based routing (A/B testing via cookie), SSL termination, request/response modification, and WebSocket-aware routing. Use L7 for: microservice routing, canary deployments, API gateways, and any scenario requiring content-aware decisions. The trade-off is throughput and latency (L7 adds milliseconds) vs routing intelligence.

**Q: How does consistent hashing work, and why is it preferred for distributed caches?**

A: Consistent hashing maps both servers and keys onto a circular hash space (ring). To find which server handles a key, hash the key and walk clockwise on the ring until hitting a server. When a server is added, only keys between it and its counter-clockwise neighbor redistribute — approximately 1/N of total keys. When a server is removed, its keys move to the next clockwise server. This is critical for distributed caches because traditional hash-mod-N redistributes ALL keys when N changes (adding one server invalidates the entire cache). With consistent hashing, adding a server to a 10-server cluster only invalidates ~10% of cached data. Virtual nodes (100-200 hash positions per physical server) ensure uniform distribution, and weighting virtual node count by server capacity handles heterogeneous hardware.

**Q: Design a health check system for a load balancer. What types of checks would you implement?**

A: Implement three layers: 1) Shallow checks (TCP connect) — verify the server is reachable and accepting connections. Fast (milliseconds) but doesn't verify application health. 2) Deep checks (HTTP GET /health) — verify the application is initialized, can reach its database, and is ready to serve traffic. The health endpoint should check critical dependencies and return 200 (healthy) or 503 (not ready). 3) Passive monitoring — track real request success/error rates per server. If error rate exceeds a threshold (e.g., 50% over 10 requests), mark unhealthy immediately without waiting for the next active check. Configure thresholds: unhealthy after 2-3 consecutive failures (fast detection), healthy after 3-5 consecutive successes (prevent flapping). Implement slow start: newly healthy servers receive gradually increasing traffic to warm caches and connection pools before taking full load.

**Q: How would you handle a rolling deployment without dropping requests?**

A: Implement connection draining with the load balancer: 1) Mark the target server as "draining" — it stops receiving new connections but continues processing in-flight requests. 2) Wait for in-flight requests to complete (with a maximum drain timeout, e.g., 30 seconds). 3) Once drained (or timeout reached), remove the server and deploy the new version. 4) After deployment, add the server back with slow start (gradually increasing traffic weight over 30-60 seconds) to warm caches and connection pools. 5) Repeat for the next server. For zero-downtime, ensure enough capacity remains during the rolling update — if you have 4 servers, update one at a time so 75% capacity is always available. Kubernetes implements this with `maxUnavailable` and `maxSurge` in rolling update strategy, combined with readiness probes that gate traffic until the new pod is ready.

## Production Tips

- **Implement slow start for newly added servers**: A server that just started has cold caches (CPU caches, application caches, connection pools). Sending it full traffic immediately causes latency spikes and potential overload. Gradually ramp traffic over 30-60 seconds (HAProxy `slowstart`, Envoy `slow_start_window`). This is especially important for JVM-based services that need JIT warmup.

- **Monitor load balancer queue depth and connection saturation**: When all backend servers are at their connection limit, new requests queue at the load balancer. Monitor queue depth and queue wait time — sustained queuing indicates you need more backend capacity. Set queue timeouts (e.g., 30 seconds) so clients get a fast 503 rather than waiting indefinitely. Alert on queue depth > 0 sustained for more than 30 seconds.

- **Use separate health check endpoints from application endpoints**: Don't use `/` or `/api/status` as your health check path — these may have authentication, rate limiting, or heavy processing. Create a dedicated `/health` or `/healthz` endpoint that's lightweight, unauthenticated, and checks only what's needed for routing decisions. Separate liveness (is the process alive?) from readiness (can it serve traffic?) checks.

- **Configure appropriate connection limits per backend server**: Without limits, a load balancer can overwhelm a backend with more connections than it can handle. Set `maxconn` per server based on the server's capacity (typically determined by load testing). When the limit is reached, requests queue at the load balancer rather than degrading the backend. This prevents cascading failures where an overloaded server becomes slower, gets more connections (least-connections routes away from it too slowly), and eventually crashes.

## Related Topics

- [TCP/IP](./tcp-ip.md) — L4 load balancers operate at the TCP layer, making decisions based on connection tuples and managing TCP connection state
- [HTTP](./http.md) — L7 load balancers parse HTTP to make content-based routing decisions, terminate TLS, and modify requests/responses
- [DNS](./dns.md) — DNS-based load balancing (GeoDNS, weighted records) provides global traffic distribution complementing local load balancers
- [WebSockets](./websockets.md) — WebSocket connections require sticky sessions or connection-aware routing due to their long-lived, stateful nature
