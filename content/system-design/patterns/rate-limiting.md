# Rate Limiting

## Quick Reference

- Rate limiting controls the number of requests a client can make to a service within a defined time window, protecting backend systems from overload and abuse
- Token bucket algorithm allows bursts up to bucket capacity while enforcing a sustained average rate; tokens are added at a fixed rate and consumed per request
- Leaky bucket processes requests at a constant rate regardless of burst, smoothing traffic by queuing excess requests and dropping them when the queue is full
- Sliding window log tracks exact timestamps of each request for precise rate enforcement; sliding window counter approximates this with lower memory by combining fixed window counts
- Fixed window counters are simplest but suffer from boundary burst problems: a client can make 2x the limit by timing requests at the window boundary
- Distributed rate limiting requires coordination across multiple instances via shared state (Redis) or gossip protocols; local-only limiting allows global over-limit by a factor of N instances
- HTTP 429 (Too Many Requests) is the standard response code; include `Retry-After` header and `X-RateLimit-Remaining` headers to help clients self-throttle
- Rate limits are typically applied per API key, per user, per IP, or per endpoint, with different tiers for different client categories (free vs. paid)

## When to Use

Rate limiting is essential whenever your system exposes APIs to external clients who might accidentally or intentionally overwhelm your infrastructure. Apply rate limiting at the API gateway layer to protect all downstream services uniformly, at individual service boundaries for fine-grained control over expensive operations, and at the database layer to prevent query floods from saturating connection pools. Rate limiting protects against denial-of-service attacks (both intentional and accidental), prevents noisy neighbors in multi-tenant systems from degrading service for other tenants, enforces business-tier usage quotas (free tier gets 100 requests/minute, paid tier gets 10,000), and provides backpressure signals to clients so they can implement retry logic with exponential backoff. In microservices architectures, rate limiting at service mesh level prevents cascading failures where one misbehaving service overwhelms another. For interview scenarios, rate limiting questions test your understanding of distributed coordination, algorithm tradeoffs, and operational concerns like monitoring and graceful degradation.

## Code Examples

### Token Bucket Implementation with Redis

```java
/**
 * Distributed token bucket rate limiter using Redis.
 * Atomic operations ensure correctness under concurrent access.
 * Supports configurable burst capacity and sustained rate.
 */
@Service
public class TokenBucketRateLimiter {
    private final RedisTemplate<String, String> redis;
    private static final String BUCKET_SCRIPT = """
        local key = KEYS[1]
        local capacity = tonumber(ARGV[1])
        local refillRate = tonumber(ARGV[2])
        local now = tonumber(ARGV[3])
        local requested = tonumber(ARGV[4])
        
        local bucket = redis.call('hmget', key, 'tokens', 'last_refill')
        local tokens = tonumber(bucket[1])
        local lastRefill = tonumber(bucket[2])
        
        -- Initialize bucket if it doesn't exist
        if tokens == nil then
            tokens = capacity
            lastRefill = now
        end
        
        -- Calculate tokens to add based on elapsed time
        local elapsed = now - lastRefill
        local tokensToAdd = elapsed * refillRate / 1000  -- refillRate is tokens/second
        tokens = math.min(capacity, tokens + tokensToAdd)
        
        -- Check if request can be fulfilled
        local allowed = tokens >= requested
        if allowed then
            tokens = tokens - requested
        end
        
        -- Update bucket state
        redis.call('hmset', key, 'tokens', tokens, 'last_refill', now)
        redis.call('expire', key, math.ceil(capacity / refillRate) + 60)
        
        return {allowed and 1 or 0, math.floor(tokens), math.ceil((requested - tokens) / refillRate * 1000)}
        """;

    private final RedisScript<List> bucketScript;

    public TokenBucketRateLimiter(RedisTemplate<String, String> redis) {
        this.redis = redis;
        this.bucketScript = RedisScript.of(BUCKET_SCRIPT, List.class);
    }

    /**
     * Attempt to consume tokens from the bucket.
     * Returns a RateLimitResult indicating whether the request is allowed
     * and how many tokens remain.
     */
    public RateLimitResult tryConsume(String clientId, RateLimitConfig config) {
        String key = "ratelimit:token:" + clientId;
        long now = System.currentTimeMillis();

        List<Long> result = redis.execute(
            bucketScript,
            List.of(key),
            String.valueOf(config.getBucketCapacity()),
            String.valueOf(config.getRefillRatePerSecond()),
            String.valueOf(now),
            String.valueOf(1)  // tokens requested
        );

        boolean allowed = result.get(0) == 1L;
        long remainingTokens = result.get(1);
        long retryAfterMs = result.get(2);

        return new RateLimitResult(
            allowed,
            remainingTokens,
            config.getBucketCapacity(),
            allowed ? 0 : retryAfterMs
        );
    }

    /**
     * Rate limit configuration per client tier.
     */
    public RateLimitConfig getConfigForTier(ClientTier tier) {
        return switch (tier) {
            case FREE -> new RateLimitConfig(10, 2);       // 10 burst, 2/sec sustained
            case BASIC -> new RateLimitConfig(50, 10);     // 50 burst, 10/sec sustained
            case PREMIUM -> new RateLimitConfig(200, 50);  // 200 burst, 50/sec sustained
            case ENTERPRISE -> new RateLimitConfig(1000, 200); // 1000 burst, 200/sec sustained
        };
    }
}

@Data
@AllArgsConstructor
public class RateLimitResult {
    private boolean allowed;
    private long remainingTokens;
    private long limit;
    private long retryAfterMs;
}
```

### Sliding Window Rate Limiter

```typescript
import Redis from 'ioredis';

interface SlidingWindowConfig {
  windowSizeMs: number;    // e.g., 60000 for 1 minute
  maxRequests: number;     // e.g., 100 requests per window
}

interface RateLimitResponse {
  allowed: boolean;
  remaining: number;
  resetAtMs: number;
  retryAfterMs: number;
}

/**
 * Sliding window log rate limiter using Redis sorted sets.
 * Each request timestamp is stored as a member; expired entries are pruned.
 * Provides exact counting but uses more memory than fixed windows.
 */
class SlidingWindowRateLimiter {
  private redis: Redis;
  private config: SlidingWindowConfig;

  constructor(redis: Redis, config: SlidingWindowConfig) {
    this.redis = redis;
    this.config = config;
  }

  /**
   * Check and record a request using sliding window log.
   * Uses a Redis sorted set where score = timestamp.
   * Atomic pipeline ensures consistency under concurrent access.
   */
  async checkRateLimit(clientId: string): Promise<RateLimitResponse> {
    const key = `ratelimit:sliding:${clientId}`;
    const now = Date.now();
    const windowStart = now - this.config.windowSizeMs;

    // Atomic pipeline: remove expired entries, count current, add new
    const pipeline = this.redis.pipeline();
    pipeline.zremrangebyscore(key, 0, windowStart);  // Remove expired
    pipeline.zcard(key);                              // Count current
    pipeline.zadd(key, now.toString(), `${now}:${Math.random()}`); // Add request
    pipeline.expire(key, Math.ceil(this.config.windowSizeMs / 1000) + 1);

    const results = await pipeline.exec();
    const currentCount = results![1][1] as number;

    if (currentCount >= this.config.maxRequests) {
      // Over limit: remove the entry we just added
      await this.redis.zremrangebyscore(key, now, now);

      // Calculate when the oldest request in the window will expire
      const oldestEntries = await this.redis.zrange(key, 0, 0, 'WITHSCORES');
      const oldestTimestamp = oldestEntries.length > 1
        ? parseInt(oldestEntries[1])
        : now;
      const retryAfterMs = oldestTimestamp + this.config.windowSizeMs - now;

      return {
        allowed: false,
        remaining: 0,
        resetAtMs: oldestTimestamp + this.config.windowSizeMs,
        retryAfterMs: Math.max(0, retryAfterMs),
      };
    }

    return {
      allowed: true,
      remaining: this.config.maxRequests - currentCount - 1,
      resetAtMs: now + this.config.windowSizeMs,
      retryAfterMs: 0,
    };
  }

  /**
   * Sliding window counter: hybrid approach combining fixed windows.
   * Uses less memory than sliding log while being more accurate than fixed window.
   * Approximates the count by weighting the previous window proportionally.
   */
  async checkRateLimitCounter(clientId: string): Promise<RateLimitResponse> {
    const now = Date.now();
    const windowSize = this.config.windowSizeMs;
    const currentWindow = Math.floor(now / windowSize);
    const previousWindow = currentWindow - 1;
    const elapsedInCurrentWindow = now - currentWindow * windowSize;
    const weightPrevious = 1 - elapsedInCurrentWindow / windowSize;

    const currentKey = `ratelimit:counter:${clientId}:${currentWindow}`;
    const previousKey = `ratelimit:counter:${clientId}:${previousWindow}`;

    const [currentCount, previousCount] = await Promise.all([
      this.redis.get(currentKey).then(v => parseInt(v || '0')),
      this.redis.get(previousKey).then(v => parseInt(v || '0')),
    ]);

    // Weighted count approximates the sliding window
    const approximateCount = Math.floor(previousCount * weightPrevious) + currentCount;

    if (approximateCount >= this.config.maxRequests) {
      const resetAtMs = (currentWindow + 1) * windowSize;
      return {
        allowed: false,
        remaining: 0,
        resetAtMs,
        retryAfterMs: resetAtMs - now,
      };
    }

    // Increment current window counter
    const pipeline = this.redis.pipeline();
    pipeline.incr(currentKey);
    pipeline.expire(currentKey, Math.ceil(windowSize / 1000) * 2);
    await pipeline.exec();

    return {
      allowed: true,
      remaining: this.config.maxRequests - approximateCount - 1,
      resetAtMs: (currentWindow + 1) * windowSize,
      retryAfterMs: 0,
    };
  }
}

/**
 * API Gateway rate limiting middleware with tiered limits.
 * Applies multiple rate limit rules per request (per-user, per-endpoint, global).
 */
class ApiGatewayRateLimiter {
  private limiter: SlidingWindowRateLimiter;
  private redis: Redis;

  constructor(redis: Redis) {
    this.redis = redis;
    this.limiter = new SlidingWindowRateLimiter(redis, {
      windowSizeMs: 60000,
      maxRequests: 100,
    });
  }

  /**
   * Apply layered rate limits: global → per-user → per-endpoint.
   * All layers must pass for the request to be allowed.
   */
  async checkMultiLayerLimit(
    userId: string,
    endpoint: string,
    tier: 'free' | 'pro' | 'enterprise'
  ): Promise<{ allowed: boolean; headers: Record<string, string> }> {
    const limits = this.getTierLimits(tier);

    // Check per-user global limit
    const userResult = await this.checkWithConfig(
      `user:${userId}`,
      { windowSizeMs: 60000, maxRequests: limits.perMinute }
    );

    if (!userResult.allowed) {
      return {
        allowed: false,
        headers: this.buildHeaders(userResult, limits.perMinute),
      };
    }

    // Check per-endpoint limit (protects expensive operations)
    const endpointResult = await this.checkWithConfig(
      `user:${userId}:endpoint:${endpoint}`,
      { windowSizeMs: 60000, maxRequests: limits.perEndpointPerMinute }
    );

    if (!endpointResult.allowed) {
      return {
        allowed: false,
        headers: this.buildHeaders(endpointResult, limits.perEndpointPerMinute),
      };
    }

    return {
      allowed: true,
      headers: this.buildHeaders(userResult, limits.perMinute),
    };
  }

  private getTierLimits(tier: string) {
    const tierLimits: Record<string, { perMinute: number; perEndpointPerMinute: number }> = {
      free: { perMinute: 60, perEndpointPerMinute: 10 },
      pro: { perMinute: 600, perEndpointPerMinute: 100 },
      enterprise: { perMinute: 6000, perEndpointPerMinute: 1000 },
    };
    return tierLimits[tier] || tierLimits.free;
  }

  private buildHeaders(result: RateLimitResponse, limit: number): Record<string, string> {
    return {
      'X-RateLimit-Limit': limit.toString(),
      'X-RateLimit-Remaining': result.remaining.toString(),
      'X-RateLimit-Reset': Math.ceil(result.resetAtMs / 1000).toString(),
      ...(result.allowed ? {} : { 'Retry-After': Math.ceil(result.retryAfterMs / 1000).toString() }),
    };
  }

  private async checkWithConfig(
    key: string,
    config: SlidingWindowConfig
  ): Promise<RateLimitResponse> {
    const limiter = new SlidingWindowRateLimiter(this.redis, config);
    return limiter.checkRateLimit(key);
  }
}
```

### Leaky Bucket with Queue Processing

```java
/**
 * Leaky bucket rate limiter that smooths bursty traffic into a constant output rate.
 * Requests are queued and processed at a fixed rate; excess requests are rejected.
 * Ideal for APIs that need constant throughput regardless of input burstiness.
 */
public class LeakyBucketProcessor<T> {
    private final BlockingQueue<TimestampedRequest<T>> queue;
    private final int maxQueueSize;
    private final double leakRatePerSecond;
    private final Consumer<T> processor;
    private final ScheduledExecutorService scheduler;
    private final AtomicLong processedCount = new AtomicLong(0);
    private final AtomicLong droppedCount = new AtomicLong(0);

    public LeakyBucketProcessor(int maxQueueSize, double leakRatePerSecond,
                                 Consumer<T> processor) {
        this.maxQueueSize = maxQueueSize;
        this.leakRatePerSecond = leakRatePerSecond;
        this.processor = processor;
        this.queue = new LinkedBlockingQueue<>(maxQueueSize);
        this.scheduler = Executors.newSingleThreadScheduledExecutor();

        // Schedule constant-rate processing (the "leak")
        long intervalMs = (long) (1000.0 / leakRatePerSecond);
        scheduler.scheduleAtFixedRate(this::processNext, 0, intervalMs, TimeUnit.MILLISECONDS);
    }

    /**
     * Submit a request to the leaky bucket.
     * Returns immediately: either queued for processing or rejected if queue is full.
     */
    public LeakyBucketResult submit(T request) {
        TimestampedRequest<T> timestamped = new TimestampedRequest<>(request, System.currentTimeMillis());

        boolean queued = queue.offer(timestamped);
        if (!queued) {
            droppedCount.incrementAndGet();
            long estimatedWaitMs = (long) (queue.size() / leakRatePerSecond * 1000);
            return new LeakyBucketResult(false, queue.size(), maxQueueSize, estimatedWaitMs);
        }

        long positionInQueue = queue.size();
        long estimatedWaitMs = (long) (positionInQueue / leakRatePerSecond * 1000);
        return new LeakyBucketResult(true, queue.size(), maxQueueSize, estimatedWaitMs);
    }

    private void processNext() {
        TimestampedRequest<T> request = queue.poll();
        if (request != null) {
            try {
                processor.accept(request.getPayload());
                processedCount.incrementAndGet();

                long queueTimeMs = System.currentTimeMillis() - request.getEnqueuedAt();
                if (queueTimeMs > 5000) {
                    log.warn("Request waited {}ms in leaky bucket queue", queueTimeMs);
                }
            } catch (Exception e) {
                log.error("Error processing request from leaky bucket", e);
            }
        }
    }

    public LeakyBucketStats getStats() {
        return new LeakyBucketStats(
            processedCount.get(),
            droppedCount.get(),
            queue.size(),
            maxQueueSize,
            leakRatePerSecond
        );
    }

    public void shutdown() {
        scheduler.shutdown();
    }
}
```

## Common Pitfalls

- Using fixed window counters without understanding boundary bursts: a client limited to 100 requests per minute can send 100 requests at 0:59 and another 100 at 1:00, effectively getting 200 requests in 2 seconds. This defeats the purpose of rate limiting for protecting backend systems. Use sliding window or token bucket algorithms that account for request distribution within the window rather than just counting per fixed interval.

- Implementing rate limiting only at the application layer without considering distributed deployments: if you have 10 application instances each with a local rate limiter set to 100 requests/minute, a client can actually make 1000 requests/minute by hitting different instances. Distributed rate limiting requires shared state (Redis, Memcached) or a centralized rate limiting service. The tradeoff is latency (network round-trip to Redis) versus accuracy (local limiting is fast but imprecise).

- Not providing meaningful rate limit headers to clients: without `X-RateLimit-Remaining`, `X-RateLimit-Reset`, and `Retry-After` headers, clients cannot implement intelligent backoff. They resort to blind retries that further overwhelm your system. Always include these headers on both successful and rate-limited responses so clients can proactively throttle themselves before hitting the limit.

- Applying the same rate limit to all endpoints regardless of cost: a lightweight health check endpoint and a complex search query that scans millions of records should not share the same rate limit. Expensive operations need stricter per-endpoint limits. Implement tiered rate limiting where each endpoint has its own limit based on its resource cost, in addition to a global per-user limit.

- Failing to handle rate limiter infrastructure failures gracefully: if Redis (your rate limit store) goes down, do you block all requests or allow all requests? Neither extreme is ideal. Implement a fallback strategy: switch to local in-memory rate limiting (less accurate but functional), or fail open with degraded limits (allow requests but at a reduced rate). Monitor rate limiter health separately from application health.

- Not accounting for retry amplification: when you rate-limit a client and they retry immediately, you are now handling both the original request and the retry, doubling load. Implement exponential backoff requirements in your API documentation, include `Retry-After` headers with meaningful values, and consider penalizing clients that retry too aggressively by temporarily reducing their rate limit further.

- Ignoring rate limit bypass through identifier rotation: sophisticated abusers rotate API keys, IP addresses, or user accounts to circumvent per-identity rate limits. Implement additional signals for abuse detection: request fingerprinting, behavioral analysis, and aggregate rate limits across suspicious groups of identifiers. Layer rate limiting with anomaly detection for robust protection.

## Real-World Use Cases

**Stripe API Rate Limiting**: Stripe implements a sophisticated multi-tier rate limiting system. Live mode API keys get 100 requests per second with burst allowance up to 200. Test mode keys get 25 requests per second. Rate limits are applied per-key and per-endpoint, with read endpoints (GET) having higher limits than write endpoints (POST). Stripe uses token bucket with Redis for distributed coordination across their global infrastructure. They provide detailed rate limit headers and a dedicated dashboard showing usage patterns. When limits are hit, responses include machine-readable error codes that SDKs use to implement automatic retry with jittered exponential backoff.

**GitHub API Rate Limiting**: GitHub uses a tiered system: unauthenticated requests get 60 per hour (per IP), authenticated requests get 5,000 per hour (per user), and GitHub Apps get 5,000 per installation per hour plus additional allowances for specific endpoints. Their GraphQL API uses a point-based system where different query complexities consume different numbers of points from a 5,000-point hourly budget. This prevents a single complex query from consuming the same quota as a simple one. GitHub provides `X-RateLimit-*` headers on every response and a dedicated `/rate_limit` endpoint for checking remaining quota without consuming it.

**Cloudflare Rate Limiting**: Cloudflare applies rate limiting at the edge (CDN layer) before requests reach origin servers. Rules are defined per URL pattern with configurable thresholds (e.g., 100 requests per 10 seconds from the same IP to `/api/*`). Actions include block, challenge (CAPTCHA), JS challenge, or managed challenge. Cloudflare's distributed architecture propagates rate limit state across 300+ edge locations using a gossip protocol with eventual consistency, accepting slight over-limit during propagation in exchange for sub-millisecond enforcement latency. They also offer advanced bot management that combines rate limiting with behavioral analysis and machine learning.

**AWS API Gateway Throttling**: AWS API Gateway provides two levels of throttling: account-level (10,000 requests per second across all APIs) and per-method throttling (configurable per API endpoint). It uses token bucket algorithm with configurable burst and steady-state rates. Usage plans allow different rate limits per API key, enabling tiered pricing. When throttled, API Gateway returns 429 with a `Retry-After` header. The service integrates with AWS WAF for additional protection and CloudWatch for monitoring throttle counts. API Gateway also supports per-client throttling within usage plans, allowing different customers to have different limits on the same API.

## Interview Questions

**Q: Compare token bucket and leaky bucket algorithms. When would you choose one over the other?**

A: Token bucket allows bursts up to the bucket capacity while maintaining a long-term average rate. Tokens accumulate when the system is idle and can be spent in bursts. Leaky bucket processes requests at a strictly constant rate, queuing excess requests and dropping them when the queue is full. Choose token bucket when you want to allow legitimate traffic bursts (e.g., a user loading a page that makes 20 API calls simultaneously) while still enforcing a sustained rate. Choose leaky bucket when you need smooth, constant-rate output regardless of input burstiness (e.g., writing to a database that performs best at steady throughput). In practice, token bucket is more common for API rate limiting because it provides better user experience by accommodating natural burst patterns. Leaky bucket is preferred for traffic shaping in network equipment and for protecting systems that degrade under bursty load.

**Q: How would you design a distributed rate limiter for a system with 50 instances behind a load balancer?**

A: Use a centralized Redis cluster as the shared state store. Each application instance checks Redis before processing a request, using atomic Lua scripts to ensure correctness under concurrent access. The Lua script atomically reads the current count, checks against the limit, and increments if allowed, all in a single Redis round-trip. For fault tolerance, deploy Redis in cluster mode with replicas. If Redis becomes unavailable, fall back to local in-memory rate limiting with limits divided by the number of instances (100/50 = 2 per instance), accepting reduced accuracy. To minimize Redis latency impact, batch rate limit checks for requests that arrive within a small time window, or use a local token bucket that synchronizes with Redis periodically (every 100ms) rather than on every request. The tradeoff is accuracy versus latency: per-request Redis checks are precise but add 1-2ms latency; periodic sync is faster but allows brief over-limit bursts.

**Q: A client is hitting your rate limit but claims they need higher throughput. How do you evaluate and handle this?**

A: First, analyze their actual usage pattern: are they hitting the limit due to legitimate traffic growth, inefficient API usage (making many small requests instead of batched ones), or retry storms? Check if they are using pagination, caching responses, and batching where possible. If their usage is efficient and legitimate, evaluate the cost of increasing their limit: will it impact other tenants, require infrastructure scaling, or violate SLAs? Options include: (1) upgrading their tier with appropriate pricing, (2) offering bulk/batch endpoints that accomplish more per request, (3) providing webhook-based push instead of polling, (4) implementing request prioritization where their critical requests get higher limits than non-critical ones. Document the decision and monitor the impact. Never simply raise limits without understanding the usage pattern, as it may mask an underlying integration problem.

**Q: How do you handle rate limiting in a microservices architecture where a single user request fans out to multiple internal services?**

A: Rate limit at the edge (API gateway) for external-facing limits, and implement separate internal rate limits between services to prevent cascading failures. The edge rate limit protects against external abuse, while internal limits protect individual services from being overwhelmed by other services. Use different strategies: external limits are strict (hard reject with 429), internal limits are softer (circuit breaker, queue, or shed load gracefully). For fan-out scenarios, reserve capacity: if a user request fans out to 5 services, the edge limit should account for the amplification factor. Implement priority-based rate limiting internally where user-facing requests get higher priority than background jobs. Use distributed tracing to attribute internal requests back to the originating user, enabling end-to-end rate limiting that accounts for the full cost of a user request across all services.

## Production Tips

- Implement rate limit monitoring with per-client dashboards showing request rates, rejection rates, and proximity to limits. Alert when a client consistently uses more than 80% of their quota, as this indicates they will likely hit the limit soon. Proactive outreach to high-usage clients before they hit limits improves customer experience and reduces support tickets. Track rate limit rejections as a key operational metric alongside latency and error rates.

- Deploy rate limiting infrastructure with higher availability than the services it protects. If your rate limiter goes down and you fail-open (allow all requests), you lose protection during the exact scenarios where you need it most (traffic spikes, attacks). Use Redis Sentinel or Redis Cluster with automatic failover, deploy rate limiting logic at multiple layers (CDN edge, API gateway, application), and implement local fallback rate limiting that activates when the distributed store is unreachable.

- Use adaptive rate limiting that adjusts limits based on system health. When backend services are healthy, allow full rate limits. When CPU, memory, or latency metrics indicate stress, automatically reduce rate limits to shed load before the system fails. This creates a feedback loop where rate limiting responds to actual system capacity rather than static thresholds. Implement this with a control loop that monitors backend health metrics and adjusts the rate limit multiplier (e.g., 1.0 at healthy, 0.5 at stressed, 0.1 at critical).

- Test rate limiting behavior under load before production deployment. Verify that the rate limiter itself does not become a bottleneck: a Redis-based rate limiter handling 100,000 checks per second needs adequate Redis capacity and network bandwidth. Load test with realistic client patterns including bursts, retries, and concurrent access from multiple clients. Verify that rate limit headers are correct, that the `Retry-After` values are accurate, and that clients using your SDK correctly back off when limited.

## Related Topics

- [Load Balancing](./load-balancing.md) — Load balancers distribute traffic across instances and can implement connection-level rate limiting as a first line of defense
- [Scalability](./scalability.md) — Rate limiting is a key mechanism for protecting systems during scaling events and preventing overload during traffic spikes
- [Caching](./caching.md) — Caching reduces the number of requests that reach rate-limited backend services, effectively increasing the useful throughput within rate limits
- [Distributed Systems](./distributed-systems.md) — Distributed rate limiting requires coordination primitives and consistency guarantees across multiple nodes
