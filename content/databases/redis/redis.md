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

```python
import redis
import json
import hashlib
from typing import Optional, Any, Callable
from functools import wraps
from datetime import timedelta

r = redis.Redis(host='redis-cluster.internal', port=6379, decode_responses=True,
                socket_connect_timeout=2, socket_timeout=1, retry_on_timeout=True)

class CacheManager:
    """Production cache manager with multiple strategies."""

    def __init__(self, redis_client: redis.Redis, prefix: str = "cache"):
        self.redis = redis_client
        self.prefix = prefix

    def cache_aside(self, key: str, ttl: timedelta, fetch_fn: Callable[[], Any]) -> Any:
        """Cache-aside (lazy loading): check cache first, fetch on miss."""
        cache_key = f"{self.prefix}:{key}"

        # Try cache first
        cached = self.redis.get(cache_key)
        if cached is not None:
            return json.loads(cached)

        # Cache miss: fetch from source
        value = fetch_fn()
        if value is not None:
            self.redis.setex(cache_key, int(ttl.total_seconds()), json.dumps(value))

        return value

    def write_through(self, key: str, value: Any, ttl: timedelta, persist_fn: Callable[[Any], None]):
        """Write-through: update cache and database together."""
        cache_key = f"{self.prefix}:{key}"

        # Write to database first (source of truth)
        persist_fn(value)

        # Then update cache
        self.redis.setex(cache_key, int(ttl.total_seconds()), json.dumps(value))

    def cache_stampede_protection(self, key: str, ttl: timedelta, fetch_fn: Callable[[], Any],
                                   lock_timeout: int = 5) -> Optional[Any]:
        """Prevent cache stampede using distributed lock."""
        cache_key = f"{self.prefix}:{key}"
        lock_key = f"{self.prefix}:lock:{key}"

        cached = self.redis.get(cache_key)
        if cached is not None:
            return json.loads(cached)

        # Acquire lock to prevent multiple concurrent fetches
        acquired = self.redis.set(lock_key, "1", nx=True, ex=lock_timeout)
        if acquired:
            try:
                value = fetch_fn()
                if value is not None:
                    self.redis.setex(cache_key, int(ttl.total_seconds()), json.dumps(value))
                return value
            finally:
                self.redis.delete(lock_key)
        else:
            # Another process is fetching; wait and retry
            import time
            time.sleep(0.1)
            cached = self.redis.get(cache_key)
            return json.loads(cached) if cached else None

    def invalidate(self, pattern: str):
        """Invalidate cache entries matching a pattern."""
        cursor = 0
        while True:
            cursor, keys = self.redis.scan(cursor, match=f"{self.prefix}:{pattern}", count=100)
            if keys:
                self.redis.delete(*keys)
            if cursor == 0:
                break


# Decorator for function-level caching
def cached(ttl_seconds: int = 300, key_prefix: str = "fn"):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Generate cache key from function name and arguments
            key_data = f"{func.__name__}:{args}:{sorted(kwargs.items())}"
            cache_key = f"{key_prefix}:{hashlib.md5(key_data.encode()).hexdigest()}"

            cached_result = r.get(cache_key)
            if cached_result is not None:
                return json.loads(cached_result)

            result = func(*args, **kwargs)
            r.setex(cache_key, ttl_seconds, json.dumps(result))
            return result
        return wrapper
    return decorator

@cached(ttl_seconds=60)
def get_user_profile(user_id: str) -> dict:
    """Expensive database query, cached for 60 seconds."""
    return db.query("SELECT * FROM users WHERE id = %s", user_id)
```

### Rate Limiting with Sliding Window

```python
import redis
import time
from typing import Tuple

r = redis.Redis(host='localhost', port=6379, decode_responses=True)

class RateLimiter:
    """Sliding window rate limiter using Redis sorted sets."""

    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client

    def is_allowed(self, identifier: str, max_requests: int, window_seconds: int) -> Tuple[bool, dict]:
        """
        Check if request is allowed under rate limit.
        Returns (allowed, metadata) where metadata includes remaining requests and reset time.
        """
        key = f"ratelimit:{identifier}"
        now = time.time()
        window_start = now - window_seconds

        # Use pipeline for atomic operation
        pipe = self.redis.pipeline()
        pipe.zremrangebyscore(key, 0, window_start)  # Remove expired entries
        pipe.zadd(key, {f"{now}:{id(now)}": now})    # Add current request
        pipe.zcard(key)                               # Count requests in window
        pipe.expire(key, window_seconds + 1)          # Set TTL for cleanup
        results = pipe.execute()

        current_count = results[2]
        allowed = current_count <= max_requests

        if not allowed:
            # Remove the request we just added since it's denied
            pipe = self.redis.pipeline()
            pipe.zrem(key, f"{now}:{id(now)}")
            pipe.execute()

        # Calculate metadata for response headers
        oldest_in_window = self.redis.zrange(key, 0, 0, withscores=True)
        reset_time = int(oldest_in_window[0][1] + window_seconds) if oldest_in_window else int(now + window_seconds)

        return allowed, {
            'limit': max_requests,
            'remaining': max(0, max_requests - current_count),
            'reset': reset_time,
            'retry_after': max(0, reset_time - int(now)) if not allowed else 0,
        }

    def token_bucket(self, identifier: str, capacity: int, refill_rate: float) -> Tuple[bool, int]:
        """
        Token bucket algorithm using Lua script for atomicity.
        refill_rate: tokens added per second.
        """
        lua_script = """
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
        """
        result = self.redis.eval(lua_script, 1, f"bucket:{identifier}",
                                  capacity, refill_rate, time.time())
        return bool(result[0]), int(result[1])
```

### Distributed Locking with Redlock Pattern

```python
import redis
import time
import uuid
from typing import Optional
from contextlib import contextmanager

class DistributedLock:
    """Redis distributed lock with automatic renewal and safety guarantees."""

    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client
        self.lock_value = str(uuid.uuid4())

    # Lua script ensures atomic check-and-delete (only owner can release)
    RELEASE_SCRIPT = """
    if redis.call('GET', KEYS[1]) == ARGV[1] then
        return redis.call('DEL', KEYS[1])
    else
        return 0
    end
    """

    EXTEND_SCRIPT = """
    if redis.call('GET', KEYS[1]) == ARGV[1] then
        return redis.call('PEXPIRE', KEYS[1], ARGV[2])
    else
        return 0
    end
    """

    def acquire(self, lock_name: str, ttl_ms: int = 10000, retry_count: int = 3,
                retry_delay_ms: int = 200) -> bool:
        """Attempt to acquire a distributed lock with retries."""
        key = f"lock:{lock_name}"

        for attempt in range(retry_count):
            acquired = self.redis.set(key, self.lock_value, nx=True, px=ttl_ms)
            if acquired:
                return True
            time.sleep(retry_delay_ms / 1000.0)

        return False

    def release(self, lock_name: str) -> bool:
        """Release lock only if we still own it (prevents releasing expired lock held by another process)."""
        key = f"lock:{lock_name}"
        result = self.redis.eval(self.RELEASE_SCRIPT, 1, key, self.lock_value)
        return bool(result)

    def extend(self, lock_name: str, additional_ms: int = 10000) -> bool:
        """Extend lock TTL if we still own it."""
        key = f"lock:{lock_name}"
        result = self.redis.eval(self.EXTEND_SCRIPT, 1, key, self.lock_value, additional_ms)
        return bool(result)

    @contextmanager
    def lock(self, lock_name: str, ttl_ms: int = 10000):
        """Context manager for distributed locking."""
        if not self.acquire(lock_name, ttl_ms):
            raise LockAcquisitionError(f"Failed to acquire lock: {lock_name}")
        try:
            yield self
        finally:
            self.release(lock_name)


# Usage example: preventing double-processing
lock_manager = DistributedLock(redis.Redis())

def process_payment(order_id: str):
    """Process payment with distributed lock to prevent double-charging."""
    with lock_manager.lock(f"payment:{order_id}", ttl_ms=30000):
        # Only one instance processes this payment at a time
        if is_already_processed(order_id):
            return  # Idempotency check

        charge_customer(order_id)
        mark_as_processed(order_id)
```

### Redis Streams for Event Processing

```python
import redis
import time
import json
from typing import Optional

r = redis.Redis(host='localhost', port=6379, decode_responses=True)

class EventStream:
    """Redis Streams-based event processing with consumer groups."""

    def __init__(self, redis_client: redis.Redis, stream_name: str):
        self.redis = redis_client
        self.stream = stream_name

    def publish(self, event_type: str, data: dict) -> str:
        """Publish event to stream. Returns the event ID."""
        entry = {
            'type': event_type,
            'data': json.dumps(data),
            'timestamp': str(time.time()),
        }
        # MAXLEN ~ 10000 keeps stream bounded with approximate trimming
        event_id = self.redis.xadd(self.stream, entry, maxlen=10000, approximate=True)
        return event_id

    def create_consumer_group(self, group_name: str, start_id: str = '0'):
        """Create consumer group, starting from beginning or latest."""
        try:
            self.redis.xgroup_create(self.stream, group_name, start_id, mkstream=True)
        except redis.ResponseError as e:
            if "BUSYGROUP" not in str(e):
                raise

    def consume(self, group_name: str, consumer_name: str,
                count: int = 10, block_ms: int = 5000) -> list:
        """Read new messages from consumer group."""
        messages = self.redis.xreadgroup(
            groupname=group_name,
            consumername=consumer_name,
            streams={self.stream: '>'},  # '>' means only new messages
            count=count,
            block=block_ms,
        )

        if not messages:
            return []

        events = []
        for stream_name, entries in messages:
            for entry_id, fields in entries:
                events.append({
                    'id': entry_id,
                    'type': fields['type'],
                    'data': json.loads(fields['data']),
                    'timestamp': float(fields['timestamp']),
                })
        return events

    def acknowledge(self, group_name: str, *message_ids: str):
        """Acknowledge processed messages."""
        self.redis.xack(self.stream, group_name, *message_ids)

    def claim_stale_messages(self, group_name: str, consumer_name: str,
                              min_idle_ms: int = 60000, count: int = 10) -> list:
        """Claim messages that have been pending too long (consumer crashed)."""
        messages = self.redis.xautoclaim(
            self.stream, group_name, consumer_name, min_idle_ms, start_id='0-0', count=count
        )
        return messages


# Producer
stream = EventStream(r, 'orders')
stream.publish('order.created', {'order_id': 'ORD-123', 'total': 99.99})
stream.publish('order.paid', {'order_id': 'ORD-123', 'payment_id': 'PAY-456'})

# Consumer (run in separate process)
stream.create_consumer_group('inventory-service')

while True:
    events = stream.consume('inventory-service', 'worker-1', count=10, block_ms=5000)
    for event in events:
        try:
            if event['type'] == 'order.created':
                reserve_inventory(event['data']['order_id'])
            stream.acknowledge('inventory-service', event['id'])
        except Exception as e:
            # Message stays pending, will be retried or claimed by another consumer
            log.error(f"Failed to process {event['id']}: {e}")
```

### Sorted Sets for Leaderboards and Rankings

```python
import redis
from typing import List, Tuple, Optional

r = redis.Redis(host='localhost', port=6379, decode_responses=True)

class Leaderboard:
    """Real-time leaderboard using Redis sorted sets."""

    def __init__(self, redis_client: redis.Redis, name: str):
        self.redis = redis_client
        self.key = f"leaderboard:{name}"

    def update_score(self, player_id: str, score: float):
        """Update player score (sorted set automatically maintains order)."""
        self.redis.zadd(self.key, {player_id: score})

    def increment_score(self, player_id: str, increment: float) -> float:
        """Atomically increment player score and return new value."""
        return self.redis.zincrby(self.key, increment, player_id)

    def get_rank(self, player_id: str) -> Optional[int]:
        """Get player's rank (0-indexed, highest score = rank 0)."""
        rank = self.redis.zrevrank(self.key, player_id)
        return rank + 1 if rank is not None else None

    def get_top(self, count: int = 10) -> List[Tuple[str, float]]:
        """Get top N players with scores."""
        return self.redis.zrevrange(self.key, 0, count - 1, withscores=True)

    def get_around_player(self, player_id: str, range_size: int = 5) -> List[Tuple[str, float, int]]:
        """Get players around a specific player's rank."""
        rank = self.redis.zrevrank(self.key, player_id)
        if rank is None:
            return []

        start = max(0, rank - range_size)
        end = rank + range_size

        players = self.redis.zrevrange(self.key, start, end, withscores=True)
        return [(player, score, start + i + 1) for i, (player, score) in enumerate(players)]

    def get_total_players(self) -> int:
        """Get total number of players on leaderboard."""
        return self.redis.zcard(self.key)

    def get_percentile(self, player_id: str) -> Optional[float]:
        """Get player's percentile ranking."""
        rank = self.redis.zrevrank(self.key, player_id)
        total = self.redis.zcard(self.key)
        if rank is None or total == 0:
            return None
        return round((1 - rank / total) * 100, 2)
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
- **Use connection pooling**: Creating a new TCP connection per Redis command adds 1-3ms overhead. Use connection pools (default in most Redis clients) with pool size matching your concurrency level. For Python: `redis.ConnectionPool(max_connections=50)`. For Java: Lettuce's built-in connection pooling or Jedis pool
- **Implement circuit breakers for Redis calls**: When Redis is unavailable, your application should degrade gracefully (serve stale data, skip caching, use defaults) rather than failing entirely. Wrap Redis calls in a circuit breaker that opens after N consecutive failures, serving fallback responses for a cooldown period before retrying

## Related Topics

- [Messaging Patterns](../backend/messaging/messaging-patterns.md) — Redis Pub/Sub and Streams as lightweight messaging alternatives
- [REST API Design](../backend/rest-api-design.md) — Rate limiting and caching patterns that Redis enables for APIs
- [Cloud Architecture Patterns](../cloud/cloud/cloud-architecture-patterns.md) — Redis in multi-region caching and session management architectures
- [Web Performance](../frontend/web-performance.md) — Server-side caching with Redis reducing API latency for frontend performance
