# Redis

## Quick Reference

- Redis is an in-memory data structure store supporting strings, hashes, lists, sets, sorted sets, streams, bitmaps, and HyperLogLog
- Single-threaded event loop processes commands sequentially — no locks needed, but one slow command blocks everything
- Persistence options: RDB (point-in-time snapshots) for fast recovery, AOF (append-only file) for durability, or both combined
- Redis Cluster partitions data across 16,384 hash slots distributed among master nodes with automatic failover via replicas
- Default max memory policy is `noeviction` (returns errors when full); production typically uses `allkeys-lru` or `volatile-ttl`
- Pub/Sub delivers messages to all connected subscribers with at-most-once semantics — messages are lost if no subscriber is listening
- Lua scripts execute atomically on the server — no other command runs between script start and finish
- Redis 7.0+ supports Functions (persistent server-side Lua), ACLs for fine-grained access control, and multi-part AOF for faster rewrites

## When to Use

Redis excels as a caching layer, session store, rate limiter, real-time leaderboard, message broker for lightweight pub/sub, and distributed lock coordinator. Choose Redis when you need sub-millisecond read/write latency that databases cannot provide, when your access patterns are key-based (not complex queries), when data fits in memory (or you can tolerate eviction), and when the rich data structure support (sorted sets for rankings, HyperLogLog for cardinality estimation, streams for event logs) maps to your use case. Redis is less suitable as a primary database for data that must survive complete infrastructure failure (despite persistence, it's memory-first), for datasets larger than available RAM (consider Redis on Flash or a disk-based store), for complex relational queries (use PostgreSQL), or for strong consistency requirements across distributed nodes (Redis Cluster provides eventual consistency for cross-slot operations). The sweet spot is complementing a primary database: Redis handles the hot path (session lookups, cache hits, rate limit checks) while the database of record handles durability and complex queries.

## Code Examples

### Caching Patterns with Cache-Aside and Write-Through

```java
import redis.clients.jedis.Jedis;
import redis.clients.jedis.JedisPool;
import redis.clients.jedis.JedisPoolConfig;
import redis.clients.jedis.params.SetParams;
import redis.clients.jedis.resps.ScanResult;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.security.MessageDigest;
import java.time.Duration;
import java.util.Optional;
import java.util.function.Consumer;
import java.util.function.Supplier;

// Connection setup with pooling and timeouts
JedisPoolConfig poolConfig = new JedisPoolConfig();
poolConfig.setMaxTotal(50);
JedisPool pool = new JedisPool(poolConfig, "redis-cluster.internal", 6379, 2000, 1000);

ObjectMapper mapper = new ObjectMapper();

/**
 * Production cache manager with multiple strategies.
 */
public class CacheManager {

    private final JedisPool jedisPool;
    private final String prefix;
    private final ObjectMapper mapper = new ObjectMapper();

    public CacheManager(JedisPool jedisPool, String prefix) {
        this.jedisPool = jedisPool;
        this.prefix = prefix;
    }

    /** Cache-aside (lazy loading): check cache first, fetch on miss. */
    public <T> T cacheAside(String key, Duration ttl, Supplier<T> fetchFn, Class<T> type) {
        String cacheKey = prefix + ":" + key;

        try (Jedis jedis = jedisPool.getResource()) {
            // Try cache first
            String cached = jedis.get(cacheKey);
            if (cached != null) {
                return mapper.readValue(cached, type);
            }

            // Cache miss: fetch from source
            T value = fetchFn.get();
            if (value != null) {
                jedis.setex(cacheKey, (int) ttl.getSeconds(), mapper.writeValueAsString(value));
            }
            return value;
        } catch (Exception e) {
            throw new RuntimeException("Cache operation failed", e);
        }
    }

    /** Write-through: update cache and database together. */
    public <T> void writeThrough(String key, T value, Duration ttl, Consumer<T> persistFn) {
        String cacheKey = prefix + ":" + key;

        // Write to database first (source of truth)
        persistFn.accept(value);

        // Then update cache
        try (Jedis jedis = jedisPool.getResource()) {
            jedis.setex(cacheKey, (int) ttl.getSeconds(), mapper.writeValueAsString(value));
        } catch (Exception e) {
            throw new RuntimeException("Cache write-through failed", e);
        }
    }

    /** Prevent cache stampede using distributed lock. */
    public <T> Optional<T> cacheStampedeProtection(String key, Duration ttl,
                                                    Supplier<T> fetchFn, Class<T> type,
                                                    int lockTimeoutSeconds) {
        String cacheKey = prefix + ":" + key;
        String lockKey = prefix + ":lock:" + key;

        try (Jedis jedis = jedisPool.getResource()) {
            String cached = jedis.get(cacheKey);
            if (cached != null) {
                return Optional.of(mapper.readValue(cached, type));
            }

            // Acquire lock to prevent multiple concurrent fetches
            String acquired = jedis.set(lockKey, "1",
                    SetParams.setParams().nx().ex(lockTimeoutSeconds));
            if ("OK".equals(acquired)) {
                try {
                    T value = fetchFn.get();
                    if (value != null) {
                        jedis.setex(cacheKey, (int) ttl.getSeconds(),
                                mapper.writeValueAsString(value));
                    }
                    return Optional.ofNullable(value);
                } finally {
                    jedis.del(lockKey);
                }
            } else {
                // Another process is fetching; wait and retry
                Thread.sleep(100);
                cached = jedis.get(cacheKey);
                return cached != null ? Optional.of(mapper.readValue(cached, type))
                                      : Optional.empty();
            }
        } catch (Exception e) {
            throw new RuntimeException("Cache stampede protection failed", e);
        }
    }

    /** Invalidate cache entries matching a pattern. */
    public void invalidate(String pattern) {
        try (Jedis jedis = jedisPool.getResource()) {
            String cursor = "0";
            do {
                ScanResult<String> result = jedis.scan(cursor,
                        new redis.clients.jedis.params.ScanParams()
                                .match(prefix + ":" + pattern).count(100));
                cursor = result.getCursor();
                if (!result.getResult().isEmpty()) {
                    jedis.del(result.getResult().toArray(new String[0]));
                }
            } while (!"0".equals(cursor));
        }
    }
}

// Function-level caching utility
public class CachedFunction {

    private final JedisPool jedisPool;
    private final ObjectMapper mapper = new ObjectMapper();

    public CachedFunction(JedisPool jedisPool) {
        this.jedisPool = jedisPool;
    }

    /** Execute function with caching based on key derived from arguments. */
    public <T> T execute(String functionName, int ttlSeconds, String keyPrefix,
                         Supplier<T> function, Class<T> type, Object... args) {
        // Generate cache key from function name and arguments
        String keyData = functionName + ":" + java.util.Arrays.toString(args);
        String hash = md5(keyData);
        String cacheKey = keyPrefix + ":" + hash;

        try (Jedis jedis = jedisPool.getResource()) {
            String cachedResult = jedis.get(cacheKey);
            if (cachedResult != null) {
                return mapper.readValue(cachedResult, type);
            }

            T result = function.get();
            jedis.setex(cacheKey, ttlSeconds, mapper.writeValueAsString(result));
            return result;
        } catch (Exception e) {
            throw new RuntimeException("Cached function execution failed", e);
        }
    }

    private String md5(String input) {
        try {
            MessageDigest md = MessageDigest.getInstance("MD5");
            byte[] digest = md.digest(input.getBytes());
            StringBuilder sb = new StringBuilder();
            for (byte b : digest) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }
}

// Usage: expensive database query, cached for 60 seconds
CachedFunction cachedFn = new CachedFunction(pool);
Map<String, Object> profile = cachedFn.execute("getUserProfile", 60, "fn",
        () -> db.query("SELECT * FROM users WHERE id = ?", userId), Map.class, userId);
```

### Rate Limiting with Sliding Window

```java
import redis.clients.jedis.Jedis;
import redis.clients.jedis.JedisPool;
import redis.clients.jedis.Pipeline;
import redis.clients.jedis.resps.Tuple;

import java.util.*;

/**
 * Sliding window rate limiter using Redis sorted sets.
 */
public class RateLimiter {

    private final JedisPool jedisPool;

    public RateLimiter(JedisPool jedisPool) {
        this.jedisPool = jedisPool;
    }

    /**
     * Check if request is allowed under rate limit.
     * Returns RateLimitResult with allowed status and metadata including remaining requests and reset time.
     */
    public RateLimitResult isAllowed(String identifier, int maxRequests, int windowSeconds) {
        String key = "ratelimit:" + identifier;
        double now = System.currentTimeMillis() / 1000.0;
        double windowStart = now - windowSeconds;
        String member = now + ":" + UUID.randomUUID();

        try (Jedis jedis = jedisPool.getResource()) {
            // Use pipeline for atomic operation
            Pipeline pipe = jedis.pipelined();
            pipe.zremrangeByScore(key, 0, windowStart);  // Remove expired entries
            pipe.zadd(key, now, member);                  // Add current request
            pipe.zcard(key);                              // Count requests in window
            pipe.expire(key, windowSeconds + 1);          // Set TTL for cleanup
            List<Object> results = pipe.syncAndReturnAll();

            long currentCount = (Long) results.get(2);
            boolean allowed = currentCount <= maxRequests;

            if (!allowed) {
                // Remove the request we just added since it's denied
                jedis.zrem(key, member);
            }

            // Calculate metadata for response headers
            List<Tuple> oldestInWindow = jedis.zrangeWithScores(key, 0, 0);
            int resetTime = !oldestInWindow.isEmpty()
                    ? (int) (oldestInWindow.get(0).getScore() + windowSeconds)
                    : (int) (now + windowSeconds);

            Map<String, Integer> metadata = new HashMap<>();
            metadata.put("limit", maxRequests);
            metadata.put("remaining", (int) Math.max(0, maxRequests - currentCount));
            metadata.put("reset", resetTime);
            metadata.put("retry_after", !allowed ? Math.max(0, resetTime - (int) now) : 0);

            return new RateLimitResult(allowed, metadata);
        }
    }

    /**
     * Token bucket algorithm using Lua script for atomicity.
     * refillRate: tokens added per second.
     */
    public TokenBucketResult tokenBucket(String identifier, int capacity, double refillRate) {
        String luaScript = """
            local key = KEYS[1]
            local capacity = tonumber(ARGV[1])
            local refill_rate = tonumber(ARGV[2])
            local now = tonumber(ARGV[3])

            local bucket = redis.call('HMGET', key, 'tokens', 'last_refill')
            local tokens = tonumber(bucket[1]) or capacity
            local last_refill = tonumber(bucket[2]) or now

            -- Refill tokens based on elapsed time
            local elapsed = now - last_refill
            local new_tokens = math.min(capacity, tokens + (elapsed * refill_rate))

            if new_tokens >= 1 then
                new_tokens = new_tokens - 1
                redis.call('HMSET', key, 'tokens', new_tokens, 'last_refill', now)
                redis.call('EXPIRE', key, math.ceil(capacity / refill_rate) + 1)
                return {1, math.floor(new_tokens)}
            else
                redis.call('HMSET', key, 'tokens', new_tokens, 'last_refill', now)
                redis.call('EXPIRE', key, math.ceil(capacity / refill_rate) + 1)
                return {0, 0}
            end
            """;

        try (Jedis jedis = jedisPool.getResource()) {
            @SuppressWarnings("unchecked")
            List<Long> result = (List<Long>) jedis.eval(luaScript, 1, "bucket:" + identifier,
                    String.valueOf(capacity), String.valueOf(refillRate),
                    String.valueOf(System.currentTimeMillis() / 1000.0));
            return new TokenBucketResult(result.get(0) == 1, result.get(1).intValue());
        }
    }
}

// Result records
record RateLimitResult(boolean allowed, Map<String, Integer> metadata) {}
record TokenBucketResult(boolean allowed, int remainingTokens) {}
```

### Distributed Locking with Redlock Pattern

```java
import redis.clients.jedis.Jedis;
import redis.clients.jedis.JedisPool;
import redis.clients.jedis.params.SetParams;

import java.util.UUID;

/**
 * Redis distributed lock with automatic renewal and safety guarantees.
 */
public class DistributedLock implements AutoCloseable {

    private final JedisPool jedisPool;
    private final String lockValue;

    public DistributedLock(JedisPool jedisPool) {
        this.jedisPool = jedisPool;
        this.lockValue = UUID.randomUUID().toString();
    }

    // Lua script ensures atomic check-and-delete (only owner can release)
    private static final String RELEASE_SCRIPT = """
        if redis.call('GET', KEYS[1]) == ARGV[1] then
            return redis.call('DEL', KEYS[1])
        else
            return 0
        end
        """;

    private static final String EXTEND_SCRIPT = """
        if redis.call('GET', KEYS[1]) == ARGV[1] then
            return redis.call('PEXPIRE', KEYS[1], ARGV[2])
        else
            return 0
        end
        """;

    /** Attempt to acquire a distributed lock with retries. */
    public boolean acquire(String lockName, int ttlMs, int retryCount, int retryDelayMs) {
        String key = "lock:" + lockName;

        try (Jedis jedis = jedisPool.getResource()) {
            for (int attempt = 0; attempt < retryCount; attempt++) {
                String result = jedis.set(key, lockValue,
                        SetParams.setParams().nx().px(ttlMs));
                if ("OK".equals(result)) {
                    return true;
                }
                Thread.sleep(retryDelayMs);
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        return false;
    }

    /** Release lock only if we still own it (prevents releasing expired lock held by another process). */
    public boolean release(String lockName) {
        String key = "lock:" + lockName;
        try (Jedis jedis = jedisPool.getResource()) {
            Object result = jedis.eval(RELEASE_SCRIPT, 1, key, lockValue);
            return Long.valueOf(1).equals(result);
        }
    }

    /** Extend lock TTL if we still own it. */
    public boolean extend(String lockName, int additionalMs) {
        String key = "lock:" + lockName;
        try (Jedis jedis = jedisPool.getResource()) {
            Object result = jedis.eval(EXTEND_SCRIPT, 1, key, lockValue,
                    String.valueOf(additionalMs));
            return Long.valueOf(1).equals(result);
        }
    }

    /** Execute a task while holding the distributed lock. */
    public void withLock(String lockName, int ttlMs, Runnable task) {
        if (!acquire(lockName, ttlMs, 3, 200)) {
            throw new LockAcquisitionException("Failed to acquire lock: " + lockName);
        }
        try {
            task.run();
        } finally {
            release(lockName);
        }
    }

    @Override
    public void close() {
        // Pool is managed externally
    }
}

// Custom exception for lock failures
class LockAcquisitionException extends RuntimeException {
    public LockAcquisitionException(String message) {
        super(message);
    }
}

// Usage example: preventing double-processing
JedisPool pool = new JedisPool("localhost", 6379);
DistributedLock lockManager = new DistributedLock(pool);

public void processPayment(String orderId) {
    /** Process payment with distributed lock to prevent double-charging. */
    lockManager.withLock("payment:" + orderId, 30000, () -> {
        // Only one instance processes this payment at a time
        if (isAlreadyProcessed(orderId)) {
            return;  // Idempotency check
        }
        chargeCustomer(orderId);
        markAsProcessed(orderId);
    });
}
```

### Redis Streams for Event Processing

```java
import redis.clients.jedis.Jedis;
import redis.clients.jedis.JedisPool;
import redis.clients.jedis.StreamEntryID;
import redis.clients.jedis.resps.StreamEntry;
import redis.clients.jedis.params.XAddParams;
import redis.clients.jedis.params.XReadGroupParams;
import redis.clients.jedis.params.XAutoClaimParams;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.*;
import java.util.stream.Collectors;

/**
 * Redis Streams-based event processing with consumer groups.
 */
public class EventStream {

    private final JedisPool jedisPool;
    private final String stream;
    private final ObjectMapper mapper = new ObjectMapper();

    public EventStream(JedisPool jedisPool, String streamName) {
        this.jedisPool = jedisPool;
        this.stream = streamName;
    }

    /** Publish event to stream. Returns the event ID. */
    public String publish(String eventType, Map<String, Object> data) {
        Map<String, String> entry = new HashMap<>();
        entry.put("type", eventType);
        try {
            entry.put("data", mapper.writeValueAsString(data));
        } catch (Exception e) {
            throw new RuntimeException("Serialization failed", e);
        }
        entry.put("timestamp", String.valueOf(System.currentTimeMillis() / 1000.0));

        try (Jedis jedis = jedisPool.getResource()) {
            // MAXLEN ~ 10000 keeps stream bounded with approximate trimming
            StreamEntryID id = jedis.xadd(stream, XAddParams.xAddParams()
                    .maxLen(10000).approximateTrimming(), entry);
            return id.toString();
        }
    }

    /** Create consumer group, starting from beginning or latest. */
    public void createConsumerGroup(String groupName, String startId) {
        try (Jedis jedis = jedisPool.getResource()) {
            try {
                jedis.xgroupCreate(stream, groupName,
                        new StreamEntryID(startId), true); // mkstream=true
            } catch (Exception e) {
                if (!e.getMessage().contains("BUSYGROUP")) {
                    throw e;
                }
            }
        }
    }

    /** Read new messages from consumer group. */
    public List<Map<String, Object>> consume(String groupName, String consumerName,
                                              int count, int blockMs) {
        try (Jedis jedis = jedisPool.getResource()) {
            Map.Entry<String, StreamEntryID> streamQuery =
                    new AbstractMap.SimpleEntry<>(stream, StreamEntryID.UNRECEIVED_ENTRY); // '>' means only new messages

            @SuppressWarnings("unchecked")
            List<Map.Entry<String, List<StreamEntry>>> messages = jedis.xreadGroup(
                    groupName, consumerName,
                    XReadGroupParams.xReadGroupParams().count(count).block(blockMs),
                    streamQuery);

            if (messages == null || messages.isEmpty()) {
                return Collections.emptyList();
            }

            List<Map<String, Object>> events = new ArrayList<>();
            for (Map.Entry<String, List<StreamEntry>> streamMessages : messages) {
                for (StreamEntry entry : streamMessages.getValue()) {
                    Map<String, Object> event = new HashMap<>();
                    event.put("id", entry.getID().toString());
                    event.put("type", entry.getFields().get("type"));
                    try {
                        event.put("data", mapper.readValue(
                                entry.getFields().get("data"), Map.class));
                    } catch (Exception e) {
                        event.put("data", entry.getFields().get("data"));
                    }
                    event.put("timestamp",
                            Double.parseDouble(entry.getFields().get("timestamp")));
                    events.add(event);
                }
            }
            return events;
        }
    }

    /** Acknowledge processed messages. */
    public void acknowledge(String groupName, String... messageIds) {
        try (Jedis jedis = jedisPool.getResource()) {
            StreamEntryID[] ids = Arrays.stream(messageIds)
                    .map(StreamEntryID::new)
                    .toArray(StreamEntryID[]::new);
            jedis.xack(stream, groupName, ids);
        }
    }

    /** Claim messages that have been pending too long (consumer crashed). */
    public List<StreamEntry> claimStaleMessages(String groupName, String consumerName,
                                                 long minIdleMs, int count) {
        try (Jedis jedis = jedisPool.getResource()) {
            Map.Entry<StreamEntryID, List<StreamEntry>> result = jedis.xautoclaim(
                    stream, groupName, consumerName, minIdleMs,
                    new StreamEntryID("0-0"), XAutoClaimParams.xAutoClaimParams().count(count));
            return result.getValue();
        }
    }
}

// Producer
JedisPool pool = new JedisPool("localhost", 6379);
EventStream stream = new EventStream(pool, "orders");
stream.publish("order.created", Map.of("order_id", "ORD-123", "total", 99.99));
stream.publish("order.paid", Map.of("order_id", "ORD-123", "payment_id", "PAY-456"));

// Consumer (run in separate thread/process)
stream.createConsumerGroup("inventory-service", "0");

while (true) {
    List<Map<String, Object>> events = stream.consume(
            "inventory-service", "worker-1", 10, 5000);
    for (Map<String, Object> event : events) {
        try {
            if ("order.created".equals(event.get("type"))) {
                @SuppressWarnings("unchecked")
                Map<String, Object> data = (Map<String, Object>) event.get("data");
                reserveInventory((String) data.get("order_id"));
            }
            stream.acknowledge("inventory-service", (String) event.get("id"));
        } catch (Exception e) {
            // Message stays pending, will be retried or claimed by another consumer
            log.error("Failed to process {}: {}", event.get("id"), e.getMessage());
        }
    }
}
```

### Sorted Sets for Leaderboards and Rankings

```java
import redis.clients.jedis.Jedis;
import redis.clients.jedis.JedisPool;
import redis.clients.jedis.resps.Tuple;

import java.util.*;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

/**
 * Real-time leaderboard using Redis sorted sets.
 */
public class Leaderboard {

    private final JedisPool jedisPool;
    private final String key;

    public Leaderboard(JedisPool jedisPool, String name) {
        this.jedisPool = jedisPool;
        this.key = "leaderboard:" + name;
    }

    /** Update player score (sorted set automatically maintains order). */
    public void updateScore(String playerId, double score) {
        try (Jedis jedis = jedisPool.getResource()) {
            jedis.zadd(key, score, playerId);
        }
    }

    /** Atomically increment player score and return new value. */
    public double incrementScore(String playerId, double increment) {
        try (Jedis jedis = jedisPool.getResource()) {
            return jedis.zincrby(key, increment, playerId);
        }
    }

    /** Get player's rank (1-indexed, highest score = rank 1). */
    public Optional<Long> getRank(String playerId) {
        try (Jedis jedis = jedisPool.getResource()) {
            Long rank = jedis.zrevrank(key, playerId);
            return rank != null ? Optional.of(rank + 1) : Optional.empty();
        }
    }

    /** Get top N players with scores. */
    public List<Tuple> getTop(int count) {
        try (Jedis jedis = jedisPool.getResource()) {
            return jedis.zrevrangeWithScores(key, 0, count - 1);
        }
    }

    /** Get players around a specific player's rank. */
    public List<PlayerRankEntry> getAroundPlayer(String playerId, int rangeSize) {
        try (Jedis jedis = jedisPool.getResource()) {
            Long rank = jedis.zrevrank(key, playerId);
            if (rank == null) {
                return Collections.emptyList();
            }

            long start = Math.max(0, rank - rangeSize);
            long end = rank + rangeSize;

            List<Tuple> players = jedis.zrevrangeWithScores(key, start, end);
            List<PlayerRankEntry> result = new ArrayList<>();
            for (int i = 0; i < players.size(); i++) {
                Tuple t = players.get(i);
                result.add(new PlayerRankEntry(
                        t.getElement(), t.getScore(), (int) (start + i + 1)));
            }
            return result;
        }
    }

    /** Get total number of players on leaderboard. */
    public long getTotalPlayers() {
        try (Jedis jedis = jedisPool.getResource()) {
            return jedis.zcard(key);
        }
    }

    /** Get player's percentile ranking. */
    public Optional<Double> getPercentile(String playerId) {
        try (Jedis jedis = jedisPool.getResource()) {
            Long rank = jedis.zrevrank(key, playerId);
            long total = jedis.zcard(key);
            if (rank == null || total == 0) {
                return Optional.empty();
            }
            double percentile = Math.round((1.0 - (double) rank / total) * 10000.0) / 100.0;
            return Optional.of(percentile);
        }
    }
}

// Helper record for player rank entries
record PlayerRankEntry(String playerId, double score, int rank) {}
```

## Common Pitfalls

- **Using KEYS command in production**: `KEYS *` scans the entire keyspace, blocking the single-threaded event loop for seconds on large datasets. Use `SCAN` with cursor-based iteration instead, which processes keys incrementally without blocking
- **Not setting TTL on cache entries**: Without expiration, cache entries accumulate until memory is exhausted, triggering eviction of potentially important keys. Always set explicit TTLs, and configure `maxmemory-policy` to `allkeys-lru` or `volatile-lru` as a safety net
- **Storing large values (>100KB)**: Large values cause network latency spikes and can block the event loop during serialization. Break large objects into smaller keys (hash fields), use compression, or store in S3 with Redis holding only the reference
- **Pub/Sub message loss**: Redis Pub/Sub has no persistence — if a subscriber disconnects, messages published during the disconnection are permanently lost. For reliable messaging, use Redis Streams with consumer groups which persist messages and support acknowledgment
- **Single point of failure without replication**: Running a single Redis instance means any crash loses all cached data and blocks dependent services. Use Redis Sentinel for automatic failover with replicas, or Redis Cluster for horizontal scaling with built-in replication
- **Lua script timeout blocking**: A Lua script that runs longer than `lua-time-limit` (default 5 seconds) blocks all other commands. Redis cannot kill a running script (only `SCRIPT KILL` works for read-only scripts). Keep scripts short and test with production-scale data
- **Hot key problem in Redis Cluster**: A single key receiving disproportionate traffic (celebrity profile, viral content) overloads one shard. Solutions: read from replicas (`READONLY` mode), add local caching in the application layer, or shard the hot key across multiple keys with client-side fan-out

## Real-World Use Cases

**Session Store for Distributed Web Application**: A SaaS platform stores user sessions in Redis instead of sticky sessions on individual servers. Each session is a Redis hash with fields for user ID, permissions, CSRF token, and last activity timestamp. TTL of 30 minutes auto-expires inactive sessions. Redis Cluster distributes sessions across 6 nodes, handling 50,000 concurrent sessions with sub-millisecond lookups. When a node fails, Sentinel promotes a replica within 5 seconds, and the application reconnects transparently.

**Real-Time Analytics Dashboard**: A social media platform uses Redis HyperLogLog to count unique visitors per page (12KB per counter regardless of cardinality), sorted sets for trending topics (score = engagement velocity, updated every second), and Redis Streams to ingest clickstream events at 100,000 events/second. The dashboard queries Redis directly for real-time metrics while batch analytics run against the data warehouse for historical analysis.

**Distributed Rate Limiting for API Gateway**: An API platform implements tiered rate limiting using Redis. Free tier: 100 requests/minute (sliding window with sorted sets). Premium tier: 10,000 requests/minute (token bucket with Lua scripts). Enterprise tier: custom limits per endpoint. Redis Cluster ensures rate limit state is consistent across all API gateway instances globally. The Lua-based token bucket handles 200,000 rate limit checks per second with p99 latency under 1ms.

## Interview Questions

**Q: Explain Redis persistence options and their trade-offs.**

A: Redis offers two persistence mechanisms. RDB (Redis Database): creates point-in-time snapshots at configured intervals (e.g., every 60 seconds if 1000+ keys changed). Advantages: compact single-file backups, fast restart (just load the file), minimal performance impact (fork + copy-on-write). Disadvantages: data loss between snapshots (up to 60 seconds of writes lost on crash), fork can cause latency spikes on large datasets (copying page tables). AOF (Append Only File): logs every write operation. Advantages: configurable durability (`always` = fsync every write, `everysec` = fsync every second, `no` = OS decides). Disadvantages: larger file size, slower restart (must replay all operations), rewrite process needed periodically to compact the file. Production recommendation: use both — AOF with `everysec` for durability (max 1 second data loss) and RDB for fast disaster recovery and backups. Redis 7.0's multi-part AOF eliminates the rewrite blocking issue by writing to a new file while the old one is still active.

**Q: How does Redis Cluster handle data partitioning and what happens during a node failure?**

A: Redis Cluster uses hash slot partitioning: the key space is divided into 16,384 slots, and each master node owns a subset. The slot for a key is determined by `CRC16(key) mod 16384`. Clients cache the slot-to-node mapping and route commands directly to the correct node. If a client sends a command to the wrong node, it receives a `MOVED` redirect. During resharding, `ASK` redirects handle keys being migrated. Node failure: each master has one or more replicas. If a master becomes unreachable (detected via gossip protocol, majority vote after `cluster-node-timeout`), its replica is promoted to master automatically. The cluster remains available for slots owned by healthy masters. If a master fails with no replicas, those slots become unavailable and the cluster enters a degraded state (configurable: `cluster-require-full-coverage yes/no`). Multi-key operations only work when all keys hash to the same slot — use hash tags (`{user:123}:profile`, `{user:123}:orders`) to colocate related keys.

**Q: How would you implement a distributed rate limiter that handles 100K requests/second?**

A: Use the token bucket algorithm implemented as a Lua script for atomicity. Each client identifier gets a Redis hash storing current token count and last refill timestamp. On each request, the Lua script: calculates tokens to add based on elapsed time, checks if a token is available, decrements if yes (allow), returns denied if no. Why Lua: the check-and-decrement must be atomic to prevent race conditions under concurrent access. Why token bucket over sliding window: token bucket uses O(1) memory per client (just two fields) versus sorted sets which store every request timestamp. For 100K req/s: Redis handles this easily on a single node since Lua scripts execute in microseconds. For global distribution, use Redis Cluster with hash tags to keep each client's rate limit state on one shard. Alternative for extreme scale: use local in-memory rate limiting with periodic Redis synchronization (slightly less accurate but eliminates Redis as a bottleneck).

**Q: What is the hot key problem and how do you solve it?**

A: A hot key is a single Redis key receiving disproportionate read/write traffic — for example, a viral tweet's like count, a flash sale product page, or a shared configuration value. In Redis Cluster, this overloads the single shard owning that key's hash slot since Redis is single-threaded per shard. Solutions: (1) Read replicas: route reads to replicas using `READONLY` command, distributing read load across multiple nodes. (2) Local caching: cache hot keys in application memory (with short TTL) to absorb most reads without hitting Redis. Redis 6.0+ supports server-assisted client caching with invalidation messages. (3) Key sharding: split one logical key into N physical keys (`hot_key:0` through `hot_key:7`), write to a random shard, read from all and aggregate. Works for counters (`INCRBY` on random shard, sum all shards for total). (4) Proxy layer: use a Redis proxy (like Twemproxy or Redis Enterprise's proxy) that can replicate hot keys across multiple shards transparently.

## Production Tips

- **Configure `maxmemory` and `maxmemory-policy` explicitly**: Never run Redis without a memory limit in production. Set `maxmemory` to 75% of available RAM (leaving room for fork operations and OS), and choose an eviction policy that matches your use case: `allkeys-lru` for general caching, `volatile-ttl` when only TTL-bearing keys should be evicted, `noeviction` for data that must never be lost (but handle OOM errors in your application)
- **Monitor slow log and latency**: Enable `slowlog-log-slower-than 10000` (10ms) to capture slow commands. Monitor `INFO commandstats` for command frequency and average latency. Set up alerts on `connected_clients` approaching `maxclients`, `used_memory` approaching `maxmemory`, and `rejected_connections` > 0. Use `LATENCY DOCTOR` for automated latency diagnosis
- **Use connection pooling**: Creating a new TCP connection per Redis command adds 1-3ms overhead. Use connection pools (default in most Redis clients) with pool size matching your concurrency level. For Java: `JedisPool` with `JedisPoolConfig.setMaxTotal(50)`, or Lettuce's built-in connection pooling with `RedisClient` and `StatefulRedisConnection`
- **Implement circuit breakers for Redis calls**: When Redis is unavailable, your application should degrade gracefully (serve stale data, skip caching, use defaults) rather than failing entirely. Wrap Redis calls in a circuit breaker that opens after N consecutive failures, serving fallback responses for a cooldown period before retrying

## Related Topics

- [Messaging Patterns](../../backend/messaging/messaging-patterns.md) — Redis Pub/Sub and Streams as lightweight messaging alternatives
- [REST API Design](../../backend/api-design/rest-api-design.md) — Rate limiting and caching patterns that Redis enables for APIs
- [SQL Performance Tuning](../sql-foundations/sql-performance-tuning.md) — Complementary database optimization techniques for hybrid architectures
- [Transactions and Consistency](../sql-foundations/transactions-and-consistency.md) — Redis persistence and consistency guarantees compared to traditional databases
