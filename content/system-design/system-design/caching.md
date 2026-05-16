# Caching

## Quick Reference

- Caching stores frequently accessed data in a faster storage layer to reduce latency and backend load, trading freshness for speed
- Cache hierarchy spans multiple levels: CPU caches (L1/L2/L3), application in-memory caches, distributed caches (Redis, Memcached), CDN edge caches, and browser caches
- Cache-aside (lazy loading) is the most common pattern: check cache first, on miss read from database, store result in cache, return to caller
- Write-through writes to cache and database simultaneously; write-behind writes to cache immediately and flushes to database asynchronously
- Cache invalidation strategies: TTL-based expiration, event-driven invalidation, versioned keys, and explicit deletion on write
- LRU (Least Recently Used) is the default eviction policy; LFU (Least Frequently Used) works better for skewed access patterns
- Cache hit rate below 80% indicates the cache is too small, the access pattern is not cache-friendly, or TTLs are too short
- Thundering herd occurs when a popular cache key expires and many concurrent requests simultaneously miss and hit the database

## When to Use

Caching is appropriate whenever your system has read-heavy workloads where the same data is requested repeatedly, when acceptable staleness windows exist (users can tolerate data that is seconds or minutes old), when the cost of computing or fetching the data is significantly higher than reading from cache, or when you need to protect backend systems from traffic spikes. Apply caching at the CDN layer for static assets and semi-static content served to many users, at the application layer for computed results and database query results, at the distributed cache layer for shared state across multiple application instances, and at the database layer for query result caching and buffer pools. Caching is not appropriate for write-heavy workloads where data changes faster than it is read, for data that must always be perfectly fresh (real-time financial trading), or when the working set is larger than available cache memory (low hit rates waste resources). Understanding caching tradeoffs is essential for system design interviews where candidates must explain how their architecture handles millions of reads per second while keeping data reasonably fresh.

## Code Examples

### Cache-Aside Pattern with Stampede Protection

```java
@Service
public class ProductCatalogService {
    private final ProductRepository repository;
    private final RedisTemplate<String, Product> cache;
    private final Map<String, CompletableFuture<Product>> inflightRequests =
        new ConcurrentHashMap<>();
    private static final Duration CACHE_TTL = Duration.ofMinutes(10);
    private static final Duration JITTER_RANGE = Duration.ofMinutes(2);

    public ProductCatalogService(ProductRepository repository,
                                  RedisTemplate<String, Product> cache) {
        this.repository = repository;
        this.cache = cache;
    }

    /**
     * Get product with cache-aside pattern and singleflight protection.
     * Only one thread fetches from DB on cache miss; others wait for the result.
     * This prevents thundering herd on popular keys.
     */
    public Product getProduct(String productId) {
        String cacheKey = "product:" + productId;

        // Check cache first
        Product cached = cache.opsForValue().get(cacheKey);
        if (cached != null) {
            return cached;
        }

        // Singleflight: coalesce concurrent requests for the same key
        CompletableFuture<Product> future = inflightRequests.computeIfAbsent(
            cacheKey,
            key -> CompletableFuture.supplyAsync(() -> {
                try {
                    Product product = repository.findById(productId)
                        .orElseThrow(() -> new ProductNotFoundException(productId));

                    // Store in cache with jittered TTL to prevent synchronized expiration
                    Duration ttl = CACHE_TTL.plus(Duration.ofMillis(
                        ThreadLocalRandom.current().nextLong(JITTER_RANGE.toMillis())
                    ));
                    cache.opsForValue().set(cacheKey, product, ttl);

                    return product;
                } finally {
                    // Remove from inflight map after completion
                    inflightRequests.remove(cacheKey);
                }
            })
        );

        try {
            return future.get(5, TimeUnit.SECONDS);
        } catch (Exception e) {
            inflightRequests.remove(cacheKey);
            throw new CacheException("Failed to load product: " + productId, e);
        }
    }

    /**
     * Invalidate cache on product update.
     * Uses delete rather than update to avoid race conditions between
     * concurrent reads and writes.
     */
    public Product updateProduct(String productId, ProductUpdateRequest request) {
        Product updated = repository.save(applyUpdate(productId, request));
        cache.delete("product:" + productId);

        // Also invalidate any aggregate caches that include this product
        cache.delete("category-products:" + updated.getCategoryId());
        cache.delete("search-results:*"); // Pattern-based invalidation

        return updated;
    }

    /**
     * Probabilistic early expiration: refresh cache before TTL expires
     * to prevent cache misses during high-traffic periods.
     */
    public Product getProductWithEarlyRefresh(String productId) {
        String cacheKey = "product:" + productId;
        CachedValue<Product> entry = getWithMetadata(cacheKey);

        if (entry != null) {
            // Check if we should probabilistically refresh
            double remainingTtlRatio = entry.getRemainingTtlRatio();
            double refreshProbability = Math.exp(-remainingTtlRatio * 10);

            if (ThreadLocalRandom.current().nextDouble() < refreshProbability) {
                // Async refresh: return stale value immediately, update cache in background
                CompletableFuture.runAsync(() -> refreshCache(productId, cacheKey));
            }
            return entry.getValue();
        }

        // Cache miss: synchronous fetch
        return getProduct(productId);
    }
}
```

### Multi-Level Cache with Write-Through

```typescript
interface CacheEntry<T> {
  value: T;
  version: number;
  expiresAt: number;
  source: 'l1' | 'l2' | 'origin';
}

interface CacheConfig {
  l1MaxSize: number;        // Local in-memory cache size
  l1TtlMs: number;         // L1 TTL (short, e.g., 30 seconds)
  l2TtlMs: number;         // L2 TTL (longer, e.g., 5 minutes)
  l2Client: RedisClient;   // Distributed cache client
}

class MultiLevelCache<T> {
  private l1Cache: Map<string, CacheEntry<T>> = new Map();
  private l1AccessOrder: string[] = []; // For LRU eviction
  private config: CacheConfig;
  private stats = { l1Hits: 0, l2Hits: 0, misses: 0, writes: 0 };

  constructor(config: CacheConfig) {
    this.config = config;
  }

  /**
   * Read-through: check L1, then L2, then origin.
   * Populate lower cache levels on miss.
   */
  async get(key: string, fetchFromOrigin: () => Promise<T>): Promise<T> {
    // Level 1: Local in-memory cache (fastest, smallest)
    const l1Entry = this.l1Cache.get(key);
    if (l1Entry && l1Entry.expiresAt > Date.now()) {
      this.stats.l1Hits++;
      this.touchLru(key);
      return l1Entry.value;
    }

    // Level 2: Distributed cache (Redis)
    const l2Value = await this.config.l2Client.get(key);
    if (l2Value) {
      this.stats.l2Hits++;
      const entry: CacheEntry<T> = JSON.parse(l2Value);
      // Promote to L1
      this.setL1(key, entry.value, entry.version);
      return entry.value;
    }

    // Origin: Database or upstream service
    this.stats.misses++;
    const value = await fetchFromOrigin();
    const version = Date.now();

    // Write-through: populate both cache levels
    await this.setL2(key, value, version);
    this.setL1(key, value, version);

    return value;
  }

  /**
   * Write-through: update origin, then invalidate/update caches.
   * Ensures caches never serve data newer than what is in the origin.
   */
  async put(key: string, value: T, writeToOrigin: (v: T) => Promise<void>): Promise<void> {
    this.stats.writes++;
    const version = Date.now();

    // Write to origin first (source of truth)
    await writeToOrigin(value);

    // Update caches with new value
    await this.setL2(key, value, version);
    this.setL1(key, value, version);
  }

  /**
   * Invalidate across all cache levels.
   * Used when the update is complex and re-caching the new value is not straightforward.
   */
  async invalidate(key: string): Promise<void> {
    this.l1Cache.delete(key);
    await this.config.l2Client.del(key);
  }

  private setL1(key: string, value: T, version: number): void {
    // Evict if at capacity (LRU)
    while (this.l1Cache.size >= this.config.l1MaxSize) {
      const evictKey = this.l1AccessOrder.shift();
      if (evictKey) this.l1Cache.delete(evictKey);
    }

    this.l1Cache.set(key, {
      value,
      version,
      expiresAt: Date.now() + this.config.l1TtlMs,
      source: 'l1'
    });
    this.touchLru(key);
  }

  private async setL2(key: string, value: T, version: number): Promise<void> {
    const entry: CacheEntry<T> = {
      value,
      version,
      expiresAt: Date.now() + this.config.l2TtlMs,
      source: 'l2'
    };
    await this.config.l2Client.set(key, JSON.stringify(entry), {
      PX: this.config.l2TtlMs
    });
  }

  private touchLru(key: string): void {
    const index = this.l1AccessOrder.indexOf(key);
    if (index !== -1) this.l1AccessOrder.splice(index, 1);
    this.l1AccessOrder.push(key);
  }

  getStats() {
    const total = this.stats.l1Hits + this.stats.l2Hits + this.stats.misses;
    return {
      ...this.stats,
      l1HitRate: total > 0 ? this.stats.l1Hits / total : 0,
      l2HitRate: total > 0 ? this.stats.l2Hits / total : 0,
      overallHitRate: total > 0 ? (this.stats.l1Hits + this.stats.l2Hits) / total : 0,
      l1Size: this.l1Cache.size,
      l1Capacity: this.config.l1MaxSize
    };
  }
}
```

### CDN Cache Invalidation with Surrogate Keys

```java
/**
 * CDN cache management using surrogate keys (cache tags).
 * Surrogate keys allow invalidating groups of cached responses
 * without knowing their exact URLs.
 */
@Service
public class CdnCacheManager {
    private final CdnClient cdnClient; // Fastly, CloudFront, etc.
    private final EventPublisher eventPublisher;

    public CdnCacheManager(CdnClient cdnClient, EventPublisher eventPublisher) {
        this.cdnClient = cdnClient;
        this.eventPublisher = eventPublisher;
    }

    /**
     * Generate cache headers for a product page response.
     * Surrogate keys enable targeted invalidation when product data changes.
     */
    public HttpHeaders generateCacheHeaders(Product product) {
        HttpHeaders headers = new HttpHeaders();

        // Browser cache: short TTL for freshness
        headers.setCacheControl(CacheControl.maxAge(60, TimeUnit.SECONDS)
            .staleWhileRevalidate(300, TimeUnit.SECONDS));

        // CDN cache: longer TTL, rely on invalidation for freshness
        headers.set("Surrogate-Control", "max-age=3600");

        // Surrogate keys for targeted invalidation
        // When product changes: purge all responses tagged with this product
        String surrogateKeys = String.join(" ",
            "product-" + product.getId(),
            "category-" + product.getCategoryId(),
            "brand-" + product.getBrandId(),
            product.isOnSale() ? "sale-items" : "regular-items"
        );
        headers.set("Surrogate-Key", surrogateKeys);

        // Vary header for content negotiation
        headers.set("Vary", "Accept-Encoding, Accept-Language");

        return headers;
    }

    /**
     * Invalidate CDN cache when product is updated.
     * Uses surrogate keys to purge all cached responses containing this product.
     */
    @EventListener
    public void onProductUpdated(ProductUpdatedEvent event) {
        String productKey = "product-" + event.getProductId();

        // Purge all CDN responses tagged with this product's surrogate key
        cdnClient.purgeByKey(productKey)
            .thenAccept(result -> {
                if (result.getPurgedCount() > 0) {
                    log.info("Purged {} CDN objects for product {}",
                        result.getPurgedCount(), event.getProductId());
                }
            })
            .exceptionally(e -> {
                log.error("CDN purge failed for product {}", event.getProductId(), e);
                // Schedule retry with exponential backoff
                scheduleRetry(productKey, 1);
                return null;
            });
    }

    /**
     * Bulk invalidation for category-wide changes (e.g., sale starts).
     */
    public CompletableFuture<PurgeResult> invalidateCategory(String categoryId) {
        return cdnClient.purgeByKey("category-" + categoryId);
    }

    /**
     * Soft purge: mark cached content as stale rather than deleting it.
     * Stale content is served while fresh content is fetched in the background.
     * This prevents origin overload during mass invalidation events.
     */
    public CompletableFuture<PurgeResult> softPurge(String surrogateKey) {
        return cdnClient.softPurgeByKey(surrogateKey);
    }
}
```

## Common Pitfalls

- Caching without considering invalidation strategy: adding a cache is easy; keeping it consistent with the source of truth is the hard part. Every cached value needs a clear invalidation path, whether TTL-based, event-driven, or explicit deletion. Without a strategy, stale data accumulates and causes bugs that are extremely difficult to reproduce because they depend on timing.

- Setting uniform TTLs across all cache keys: different data has different change frequencies and staleness tolerances. User profile data might tolerate 5-minute staleness, while inventory counts need 10-second freshness. Setting a single TTL for all keys either wastes cache capacity (too short) or serves unacceptably stale data (too long). Categorize your data by change frequency and set TTLs accordingly.

- Not protecting against thundering herd (cache stampede): when a popular cache key expires, hundreds of concurrent requests simultaneously miss the cache and hit the database. This can cause cascading failures if the database cannot handle the spike. Implement singleflight (request coalescing), probabilistic early expiration, or lock-based single-flight patterns to ensure only one request fetches on miss while others wait.

- Caching negative results (cache poisoning): if a database lookup returns null and you cache that null result, subsequent requests for the same key will get null even after the data is created. Either do not cache negative results, or cache them with very short TTLs (seconds) and invalidate on write. Be especially careful with user-facing lookups where a brief absence should not be permanently cached.

- Over-caching computed aggregates without tracking dependencies: caching a dashboard that aggregates data from 10 tables means any change to any of those tables potentially invalidates the cache. Without dependency tracking, you either invalidate too aggressively (defeating the cache) or serve stale aggregates. Use surrogate keys or explicit dependency graphs to invalidate only when relevant data changes.

- Ignoring cache memory pressure and eviction behavior: when cache memory is full, the eviction policy determines what gets removed. If your access pattern does not match the eviction policy (e.g., LRU with periodic batch access that evicts hot keys), cache effectiveness drops dramatically. Monitor eviction rates and adjust cache size or eviction policy based on observed access patterns.

- Using cache as the primary data store: caches are ephemeral by design. Redis can lose data during failover, Memcached loses everything on restart, and in-memory caches are lost on process restart. Never use cache as the only copy of data. Always have a durable backing store and design your system to function (with degraded performance) when the cache is cold or unavailable.

## Real-World Use Cases

**Facebook's Memcached at Scale (TAO)**: Facebook operates the largest Memcached deployment in the world, caching social graph data across multiple datacenters. Their TAO system uses a two-level cache hierarchy: a local datacenter cache (L1) and a remote datacenter cache (L2). Writes go to the primary datacenter and invalidate caches in all datacenters via an invalidation daemon. The system handles billions of reads per second with sub-millisecond latency. Key innovations include lease-based thundering herd prevention (a lease token prevents multiple concurrent fills for the same key) and stale-set semantics (serving slightly stale data during cache fills rather than blocking).

**Netflix EVCache**: Netflix's distributed caching layer (built on Memcached) stores session data, user preferences, and pre-computed recommendations. EVCache replicates data across availability zones for fault tolerance, with each zone maintaining a complete copy. Reads go to the local zone (low latency), while writes replicate to all zones asynchronously. During zone failures, reads automatically fall back to other zones. Netflix uses cache warming (pre-populating caches before traffic shifts) during deployments and zone evacuations to prevent cold-cache performance degradation.

**Cloudflare CDN Edge Caching**: Cloudflare caches content at 300+ edge locations worldwide, serving cached responses within milliseconds of the user. Their tiered caching architecture uses regional "upper-tier" caches between edge locations and origin servers, reducing origin load by 90%+ for popular content. Cache keys incorporate URL, headers, cookies, and device type for personalized caching. Automatic cache purge propagates globally within seconds using a gossip-based invalidation protocol. Workers (edge compute) enable custom cache logic like A/B test variant caching and geographic content adaptation.

**Redis as Application Cache (Instagram)**: Instagram uses Redis extensively for caching user feeds, story data, and session information. Their deployment handles millions of operations per second across hundreds of Redis instances. They use Redis Cluster for automatic sharding and failover, with application-level consistent hashing for cache key distribution. Hot keys (celebrity profiles, viral posts) are replicated across multiple Redis instances to prevent single-instance bottlenecks. They implement probabilistic cache refresh where popular keys are refreshed before expiration based on access frequency.

**Browser Cache and Service Workers**: Modern web applications use the browser's HTTP cache (controlled via Cache-Control headers) for static assets and API responses. Service Workers provide programmatic cache control, enabling offline-first architectures where the application serves cached content immediately and updates in the background. Strategies include cache-first (fastest, potentially stale), network-first (freshest, slower), and stale-while-revalidate (fast response with background refresh). Versioned asset URLs (content hashing) enable aggressive caching with instant invalidation on deployment.

## Interview Questions

**Q: How would you design a caching strategy for a social media feed that serves 100M daily active users?**

A: Use a multi-level approach: (1) CDN caches the feed page shell and static assets. (2) A distributed cache (Redis Cluster) stores pre-computed feed data per user, with TTL of 60 seconds. (3) Fan-out-on-write pre-computes feeds for most users when new posts are created, storing results directly in cache. (4) For users following high-volume accounts (celebrities), use fan-out-on-read to merge cached follower feeds with celebrity posts at read time. (5) Implement cache warming for users likely to open the app (based on historical patterns). The key tradeoff is between write amplification (fan-out-on-write to millions of follower caches) and read latency (fan-out-on-read computing feeds on demand). The hybrid approach optimizes both by treating high-follower accounts differently.

**Q: Explain cache invalidation strategies and their tradeoffs.**

A: TTL-based expiration is simplest: set a time limit and accept staleness within that window. Low operational complexity but no control over freshness. Event-driven invalidation publishes cache-bust messages when data changes, offering near-real-time freshness at the cost of infrastructure complexity (message broker, consumers, delivery guarantees). Write-through invalidation deletes or updates the cache on every write, ensuring consistency but coupling write performance to cache operations. Versioned keys append a version to the cache key, allowing atomic transitions between versions without race conditions. In practice, combine TTL as a safety net (catches missed invalidation events) with event-driven invalidation for freshness. The choice depends on your staleness tolerance, write frequency, and operational complexity budget.

**Q: What is the thundering herd problem and how do you solve it?**

A: Thundering herd occurs when a popular cache key expires and many concurrent requests simultaneously miss the cache, all hitting the database at once. This can overwhelm the database and cause cascading failures. Solutions: (1) Singleflight/request coalescing: only one request fetches from the database while others wait for the result. Implemented with a concurrent map of in-flight requests. (2) Probabilistic early expiration: each request has a small probability of refreshing the cache before TTL expires, spreading refreshes over time. (3) Lock-based approach: acquire a distributed lock before fetching; other requests either wait or serve stale data. (4) Stale-while-revalidate: serve the expired cached value immediately while one request refreshes in the background. (5) Never-expire with background refresh: cache keys never expire; a background process refreshes them periodically.

**Q: How do you handle cache consistency in a microservices architecture where multiple services cache the same data?**

A: Publish domain events to a message broker (Kafka, SNS) when data changes. Each service subscribes to events relevant to its cached data and invalidates or refreshes accordingly. This decouples services while ensuring caches stay reasonably fresh. Combine with TTL as a safety net for missed events (message broker delivery is at-least-once, not exactly-once). For critical data, use a cache-aside pattern where each service owns its cache and is responsible for invalidation. For shared reference data (product catalog, configuration), consider a dedicated caching service that other services query, centralizing invalidation logic. The key principle is that the service that owns the data is responsible for publishing change events, and consuming services decide how to react.

## Production Tips

- Monitor cache hit rates per key prefix and alert when they drop below 80%. A sudden drop indicates either a traffic pattern change (new feature accessing uncached data), a cache capacity issue (evictions increasing), or a bug in cache population logic. Dashboard hit rates alongside latency to correlate cache effectiveness with user experience.

- Implement cache warming during deployments and instance scaling. When a new instance starts with a cold cache, it generates a burst of database queries that can overwhelm the backend. Pre-populate the cache with the most frequently accessed keys during startup, either by replaying recent access logs or by copying from a warm instance. Kubernetes init containers or readiness probes that wait for cache warm-up prevent cold instances from receiving traffic.

- Use jittered TTLs to prevent synchronized expiration. If 1000 keys are all cached at the same time with the same TTL, they all expire simultaneously, causing a burst of cache misses. Add random jitter (e.g., TTL ± 10-20%) to spread expirations over time. This is especially important for bulk cache population during startup or batch processing.

- Set up separate Redis instances (or logical databases) for different data categories with different eviction policies. Session data should use volatile-lru (evict keys with TTL set, least recently used first). Computed aggregates should use allkeys-lfu (evict least frequently used across all keys). Mixing data types in a single instance means the eviction policy is suboptimal for at least one category.

## Related Topics

- [Scalability](./scalability.md) — Caching enables higher throughput per instance, reducing the number of instances needed for a given traffic level
- [Load Balancing](./load-balancing.md) — Consistent hashing in load balancers provides cache locality, improving hit rates for stateful caching
- [Database Sharding](./database-sharding.md) — Caching reduces database load, potentially deferring the need for sharding
- [Consistency Models](./consistency-models.md) — Cache consistency guarantees depend on the underlying consistency model of the data store
