# Common Interview Problems

## Quick Reference

- URL shortener: hash or counter-based ID generation, base62 encoding, 301 vs 302 redirects, read-heavy workload (100:1 read/write ratio), analytics tracking
- Chat system: WebSocket connections for real-time delivery, message ordering with Lamport timestamps, presence detection via heartbeats, group chat fan-out strategies, offline message queuing
- Notification service: multi-channel delivery (push, email, SMS), priority queues, rate limiting per user, template rendering, delivery tracking with retry logic
- News feed: fan-out-on-write for normal users, fan-out-on-read for celebrities, ranked feed with ML scoring, cache pre-computation, real-time updates via long polling or SSE
- Distributed cache: consistent hashing for key distribution, replication for fault tolerance, cache-aside vs write-through patterns, hot key detection and splitting
- Back-of-envelope estimation: 1 million daily users ≈ 12 requests/second average, 1 KB per record × 1 billion records = 1 TB storage, 1 server handles ~10K concurrent connections
- System design interview framework: requirements gathering → capacity estimation → high-level design → detailed component design → bottleneck identification → scaling discussion

## When to Use

These common interview problems appear in virtually every system design interview at top technology companies. Each problem tests specific distributed systems concepts: URL shorteners test hashing, encoding, and database design; chat systems test real-time communication, ordering, and presence; notification services test queue management, multi-channel delivery, and reliability; news feeds test fan-out strategies, caching, and ranking; distributed caches test consistent hashing, replication, and eviction. Understanding these canonical problems provides a framework for approaching novel system design questions because the underlying patterns (sharding, caching, queuing, fan-out) recur across different domains. Practice these problems to build intuition about capacity estimation, component selection, and tradeoff articulation. In interviews, demonstrate depth by discussing failure modes, monitoring strategies, and operational concerns beyond the happy path.

## Code Examples

### URL Shortener Service

```java
/**
 * URL shortener with distributed ID generation and analytics.
 * Uses a counter-based approach with base62 encoding for short, predictable URLs.
 * Handles 10,000 writes/sec and 1,000,000 reads/sec.
 */
@Service
public class UrlShortenerService {
    private final UrlRepository urlRepository;
    private final RedisTemplate<String, String> cache;
    private final DistributedIdGenerator idGenerator;
    private final AnalyticsPublisher analytics;
    private static final String BASE62_CHARS =
        "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    private static final int SHORT_URL_LENGTH = 7; // 62^7 = 3.5 trillion combinations

    /**
     * Create a short URL. Uses distributed counter for globally unique IDs.
     * Counter ranges are pre-allocated to each instance to avoid coordination.
     */
    public ShortUrlResponse createShortUrl(CreateShortUrlRequest request) {
        // Validate URL
        if (!isValidUrl(request.getLongUrl())) {
            throw new InvalidUrlException("Invalid URL format: " + request.getLongUrl());
        }

        // Check for existing mapping (deduplication)
        Optional<UrlMapping> existing = urlRepository.findByLongUrl(request.getLongUrl());
        if (existing.isPresent()) {
            return toResponse(existing.get());
        }

        // Generate unique short code using distributed counter
        long uniqueId = idGenerator.nextId(); // Snowflake-like ID
        String shortCode = encodeBase62(uniqueId);

        // Ensure exactly SHORT_URL_LENGTH characters
        shortCode = padOrTruncate(shortCode, SHORT_URL_LENGTH);

        UrlMapping mapping = UrlMapping.builder()
            .shortCode(shortCode)
            .longUrl(request.getLongUrl())
            .userId(request.getUserId())
            .expiresAt(request.getExpiresAt())
            .createdAt(Instant.now())
            .build();

        urlRepository.save(mapping);

        // Pre-warm cache for immediate reads
        cache.opsForValue().set(
            "url:" + shortCode,
            request.getLongUrl(),
            Duration.ofDays(30)
        );

        return toResponse(mapping);
    }

    /**
     * Resolve short URL to long URL with caching and analytics.
     * Read path is optimized for extreme throughput (1M+ reads/sec).
     */
    public ResolveResult resolve(String shortCode, HttpServletRequest httpRequest) {
        // L1: Check Redis cache (sub-millisecond)
        String cachedUrl = cache.opsForValue().get("url:" + shortCode);
        if (cachedUrl != null) {
            // Async analytics: don't block the redirect
            publishAnalyticsAsync(shortCode, httpRequest);
            return new ResolveResult(cachedUrl, true);
        }

        // L2: Database lookup
        UrlMapping mapping = urlRepository.findByShortCode(shortCode)
            .orElseThrow(() -> new ShortUrlNotFoundException(shortCode));

        // Check expiration
        if (mapping.getExpiresAt() != null && mapping.getExpiresAt().isBefore(Instant.now())) {
            throw new ShortUrlExpiredException(shortCode);
        }

        // Populate cache for future reads
        cache.opsForValue().set(
            "url:" + shortCode,
            mapping.getLongUrl(),
            Duration.ofDays(30)
        );

        publishAnalyticsAsync(shortCode, httpRequest);
        return new ResolveResult(mapping.getLongUrl(), false);
    }

    /**
     * Base62 encoding: converts numeric ID to alphanumeric string.
     * 62^7 gives 3.5 trillion unique codes, sufficient for most use cases.
     */
    private String encodeBase62(long number) {
        StringBuilder sb = new StringBuilder();
        while (number > 0) {
            sb.append(BASE62_CHARS.charAt((int) (number % 62)));
            number /= 62;
        }
        return sb.reverse().toString();
    }

    private void publishAnalyticsAsync(String shortCode, HttpServletRequest request) {
        CompletableFuture.runAsync(() -> {
            analytics.publish(ClickEvent.builder()
                .shortCode(shortCode)
                .timestamp(Instant.now())
                .userAgent(request.getHeader("User-Agent"))
                .referer(request.getHeader("Referer"))
                .ipAddress(request.getRemoteAddr())
                .country(geoIpService.getCountry(request.getRemoteAddr()))
                .build());
        });
    }
}

/**
 * Distributed ID generator using Snowflake-like approach.
 * Each instance gets a unique worker ID and generates IDs locally
 * without coordination, ensuring global uniqueness.
 */
public class DistributedIdGenerator {
    private static final long EPOCH = 1704067200000L; // 2024-01-01
    private static final int WORKER_ID_BITS = 10;     // 1024 workers
    private static final int SEQUENCE_BITS = 12;      // 4096 per millisecond

    private final long workerId;
    private long lastTimestamp = -1L;
    private long sequence = 0L;

    public DistributedIdGenerator(long workerId) {
        if (workerId < 0 || workerId >= (1L << WORKER_ID_BITS)) {
            throw new IllegalArgumentException("Worker ID out of range");
        }
        this.workerId = workerId;
    }

    public synchronized long nextId() {
        long timestamp = System.currentTimeMillis();

        if (timestamp == lastTimestamp) {
            sequence = (sequence + 1) & ((1L << SEQUENCE_BITS) - 1);
            if (sequence == 0) {
                // Sequence exhausted: wait for next millisecond
                timestamp = waitNextMillis(lastTimestamp);
            }
        } else {
            sequence = 0;
        }

        if (timestamp < lastTimestamp) {
            throw new RuntimeException("Clock moved backwards");
        }

        lastTimestamp = timestamp;

        return ((timestamp - EPOCH) << (WORKER_ID_BITS + SEQUENCE_BITS))
            | (workerId << SEQUENCE_BITS)
            | sequence;
    }

    private long waitNextMillis(long lastTimestamp) {
        long timestamp = System.currentTimeMillis();
        while (timestamp <= lastTimestamp) {
            timestamp = System.currentTimeMillis();
        }
        return timestamp;
    }
}
```

### Real-Time Chat System

```typescript
import { WebSocket, WebSocketServer } from 'ws';
import { Redis } from 'ioredis';

/**
 * Distributed chat system supporting 1:1 and group messaging.
 * Uses WebSocket for real-time delivery with Redis Pub/Sub for
 * cross-instance message routing.
 */
interface ChatMessage {
  messageId: string;
  conversationId: string;
  senderId: string;
  content: string;
  type: 'text' | 'image' | 'file';
  timestamp: number;
  sequenceNumber: number; // Per-conversation ordering
}

interface UserConnection {
  userId: string;
  socket: WebSocket;
  deviceId: string;
  connectedAt: number;
}

class ChatServer {
  private connections: Map<string, UserConnection[]> = new Map(); // userId -> connections
  private redis: Redis;
  private redisSub: Redis;
  private serverId: string;

  constructor(redis: Redis) {
    this.redis = redis;
    this.redisSub = redis.duplicate();
    this.serverId = generateServerId();
    this.subscribeToMessages();
  }

  /**
   * Handle new WebSocket connection.
   * Authenticates user, registers connection, and delivers offline messages.
   */
  async handleConnection(socket: WebSocket, token: string): Promise<void> {
    const user = await this.authenticate(token);
    if (!user) {
      socket.close(4001, 'Authentication failed');
      return;
    }

    const connection: UserConnection = {
      userId: user.id,
      socket,
      deviceId: user.deviceId,
      connectedAt: Date.now(),
    };

    // Register connection locally and in Redis (for cross-instance routing)
    this.addConnection(user.id, connection);
    await this.redis.sadd(`user:${user.id}:servers`, this.serverId);
    await this.redis.set(`user:${user.id}:online`, '1', 'EX', 300);

    // Deliver offline messages
    const offlineMessages = await this.getOfflineMessages(user.id);
    for (const msg of offlineMessages) {
      socket.send(JSON.stringify({ type: 'message', data: msg }));
    }
    await this.clearOfflineMessages(user.id);

    // Publish presence update
    await this.publishPresence(user.id, 'online');

    // Handle incoming messages
    socket.on('message', (data) => this.handleIncomingMessage(user.id, data));
    socket.on('close', () => this.handleDisconnect(user.id, connection));

    // Start heartbeat for presence detection
    this.startHeartbeat(user.id, socket);
  }

  /**
   * Send message to a conversation (1:1 or group).
   * Ensures ordering via per-conversation sequence numbers.
   */
  async sendMessage(senderId: string, request: SendMessageRequest): Promise<ChatMessage> {
    // Generate globally unique message ID and per-conversation sequence number
    const messageId = generateId();
    const sequenceNumber = await this.redis.incr(
      `conversation:${request.conversationId}:seq`
    );

    const message: ChatMessage = {
      messageId,
      conversationId: request.conversationId,
      senderId,
      content: request.content,
      type: request.type || 'text',
      timestamp: Date.now(),
      sequenceNumber,
    };

    // Persist message (write to database)
    await this.persistMessage(message);

    // Get all members of the conversation
    const members = await this.getConversationMembers(request.conversationId);

    // Deliver to each member
    for (const memberId of members) {
      if (memberId === senderId) continue; // Don't echo back to sender

      const isOnline = await this.isUserOnline(memberId);
      if (isOnline) {
        // Publish via Redis Pub/Sub for cross-instance delivery
        await this.redis.publish(
          `user:${memberId}:messages`,
          JSON.stringify(message)
        );
      } else {
        // Store for offline delivery
        await this.storeOfflineMessage(memberId, message);
        // Trigger push notification
        await this.triggerPushNotification(memberId, message);
      }
    }

    // Send delivery receipt to sender
    return message;
  }

  /**
   * Subscribe to Redis Pub/Sub for cross-instance message delivery.
   * When a message is published for a user connected to this instance,
   * deliver it via their WebSocket connection.
   */
  private subscribeToMessages(): void {
    this.redisSub.psubscribe('user:*:messages');
    this.redisSub.on('pmessage', (pattern, channel, data) => {
      const userId = channel.split(':')[1];
      const connections = this.connections.get(userId);

      if (connections) {
        const message = JSON.parse(data);
        for (const conn of connections) {
          if (conn.socket.readyState === WebSocket.OPEN) {
            conn.socket.send(JSON.stringify({ type: 'message', data: message }));
          }
        }
      }
    });
  }

  /**
   * Heartbeat-based presence detection.
   * If heartbeat is missed for 30 seconds, mark user as offline.
   */
  private startHeartbeat(userId: string, socket: WebSocket): void {
    const interval = setInterval(async () => {
      if (socket.readyState !== WebSocket.OPEN) {
        clearInterval(interval);
        return;
      }

      // Refresh presence TTL
      await this.redis.set(`user:${userId}:online`, '1', 'EX', 30);
      socket.ping();
    }, 10000); // Ping every 10 seconds

    socket.on('close', () => clearInterval(interval));
  }

  private async handleDisconnect(userId: string, connection: UserConnection): Promise<void> {
    this.removeConnection(userId, connection);

    // Check if user has any remaining connections
    const remaining = this.connections.get(userId);
    if (!remaining || remaining.length === 0) {
      await this.redis.srem(`user:${userId}:servers`, this.serverId);

      // Check if user is connected to any other server
      const serverCount = await this.redis.scard(`user:${userId}:servers`);
      if (serverCount === 0) {
        await this.redis.del(`user:${userId}:online`);
        await this.publishPresence(userId, 'offline');
      }
    }
  }

  private addConnection(userId: string, conn: UserConnection): void {
    const existing = this.connections.get(userId) || [];
    existing.push(conn);
    this.connections.set(userId, existing);
  }

  private removeConnection(userId: string, conn: UserConnection): void {
    const existing = this.connections.get(userId) || [];
    const filtered = existing.filter(c => c.deviceId !== conn.deviceId);
    if (filtered.length === 0) {
      this.connections.delete(userId);
    } else {
      this.connections.set(userId, filtered);
    }
  }
}
```


### News Feed Generation with Hybrid Fan-Out

```java
/**
 * News feed service using hybrid fan-out strategy.
 * Fan-out-on-write for normal users (pre-compute feeds).
 * Fan-out-on-read for celebrity users (compute at read time).
 * Threshold: users with >10,000 followers use fan-out-on-read.
 */
@Service
public class NewsFeedService {
    private final RedisTemplate<String, String> redis;
    private final PostRepository postRepository;
    private final FollowerRepository followerRepository;
    private final RankingService rankingService;
    private static final int CELEBRITY_THRESHOLD = 10_000;
    private static final int FEED_CACHE_SIZE = 500;
    private static final int FEED_PAGE_SIZE = 20;

    /**
     * Publish a new post: fan-out to followers' feeds.
     * For normal users: write to all followers' cached feeds immediately.
     * For celebrities: skip fan-out; their posts are merged at read time.
     */
    public void publishPost(Post post) {
        // Persist the post
        postRepository.save(post);

        long followerCount = followerRepository.countFollowers(post.getAuthorId());

        if (followerCount <= CELEBRITY_THRESHOLD) {
            // Fan-out-on-write: push to all followers' feeds
            fanOutOnWrite(post);
        } else {
            // Celebrity: only add to their own timeline
            // Followers will pull this at read time
            redis.opsForZSet().add(
                "timeline:" + post.getAuthorId(),
                post.getId(),
                post.getCreatedAt().toEpochMilli()
            );
        }
    }

    /**
     * Fan-out-on-write: push post to each follower's feed cache.
     * Uses async processing to avoid blocking the publisher.
     */
    private void fanOutOnWrite(Post post) {
        // Process in batches to avoid memory issues with large follower lists
        long offset = 0;
        int batchSize = 1000;

        while (true) {
            List<String> followerBatch = followerRepository
                .getFollowerIds(post.getAuthorId(), offset, batchSize);

            if (followerBatch.isEmpty()) break;

            // Async fan-out to each follower's feed
            for (String followerId : followerBatch) {
                CompletableFuture.runAsync(() -> {
                    String feedKey = "feed:" + followerId;
                    redis.opsForZSet().add(feedKey, post.getId(),
                        post.getCreatedAt().toEpochMilli());

                    // Trim feed to prevent unbounded growth
                    redis.opsForZSet().removeRange(feedKey, 0,
                        -(FEED_CACHE_SIZE + 1));
                });
            }

            offset += batchSize;
        }
    }

    /**
     * Get user's feed: merge pre-computed feed with celebrity posts.
     * Applies ranking algorithm to determine final ordering.
     */
    public FeedResponse getFeed(String userId, String cursor, int limit) {
        limit = Math.min(limit, FEED_PAGE_SIZE);

        // Get pre-computed feed entries (from fan-out-on-write)
        double maxScore = cursor != null ? Double.parseDouble(cursor) : Double.MAX_VALUE;
        Set<String> feedPostIds = redis.opsForZSet().reverseRangeByScore(
            "feed:" + userId, 0, maxScore, 0, limit + 10 // Fetch extra for merging
        );

        // Get posts from celebrities this user follows (fan-out-on-read)
        List<String> celebrityFollowing = followerRepository
            .getCelebrityFollowing(userId, CELEBRITY_THRESHOLD);

        Set<String> celebrityPostIds = new HashSet<>();
        for (String celebrityId : celebrityFollowing) {
            Set<String> posts = redis.opsForZSet().reverseRangeByScore(
                "timeline:" + celebrityId, 0, maxScore, 0, limit
            );
            celebrityPostIds.addAll(posts);
        }

        // Merge and deduplicate
        Set<String> allPostIds = new LinkedHashSet<>();
        allPostIds.addAll(feedPostIds);
        allPostIds.addAll(celebrityPostIds);

        // Fetch full post objects
        List<Post> posts = postRepository.findByIds(new ArrayList<>(allPostIds));

        // Apply ranking (engagement score, recency, relevance)
        List<RankedPost> rankedPosts = rankingService.rank(posts, userId);

        // Paginate
        List<RankedPost> page = rankedPosts.stream()
            .limit(limit)
            .toList();

        String nextCursor = page.isEmpty() ? null :
            String.valueOf(page.get(page.size() - 1).getPost().getCreatedAt().toEpochMilli());

        return new FeedResponse(
            page.stream().map(this::toFeedItem).toList(),
            nextCursor,
            page.size() == limit
        );
    }

    /**
     * Ranking service: scores posts based on multiple signals.
     * Combines recency, engagement, and user affinity.
     */
    @Service
    static class RankingService {
        public List<RankedPost> rank(List<Post> posts, String userId) {
            return posts.stream()
                .map(post -> {
                    double score = calculateScore(post, userId);
                    return new RankedPost(post, score);
                })
                .sorted(Comparator.comparingDouble(RankedPost::getScore).reversed())
                .toList();
        }

        private double calculateScore(Post post, String userId) {
            double recencyScore = calculateRecency(post.getCreatedAt());
            double engagementScore = calculateEngagement(post);
            double affinityScore = calculateAffinity(post.getAuthorId(), userId);

            // Weighted combination
            return 0.3 * recencyScore + 0.4 * engagementScore + 0.3 * affinityScore;
        }

        private double calculateRecency(Instant createdAt) {
            long ageHours = Duration.between(createdAt, Instant.now()).toHours();
            return Math.exp(-ageHours / 24.0); // Exponential decay over 24 hours
        }

        private double calculateEngagement(Post post) {
            // Normalize engagement metrics
            double likes = Math.log1p(post.getLikeCount());
            double comments = Math.log1p(post.getCommentCount()) * 2; // Comments weighted higher
            double shares = Math.log1p(post.getShareCount()) * 3;
            return (likes + comments + shares) / 10.0;
        }

        private double calculateAffinity(String authorId, String userId) {
            // Based on historical interaction frequency
            // (simplified: would use ML model in production)
            return 0.5; // Placeholder
        }
    }
}
```

## Common Pitfalls

- Starting with detailed component design before clarifying requirements: jumping into database schema or API design without first understanding the scale (how many users? how many requests per second?), the access patterns (read-heavy or write-heavy?), and the consistency requirements (can we tolerate eventual consistency?) leads to designs that solve the wrong problem. Always spend the first 5 minutes of an interview clarifying functional and non-functional requirements.

- Designing for a single machine when the problem requires distribution: many candidates design systems that work perfectly on one server but fail to address how the system scales beyond a single machine's capacity. Every component should have a scaling story: how does the database handle 10x growth? How do you add more application servers? Where are the bottlenecks at 100x scale? Think about horizontal scaling from the beginning.

- Ignoring failure modes and only designing the happy path: production systems fail constantly. Networks partition, servers crash, disks fill up, and dependencies become unavailable. For each component, articulate what happens when it fails: does the system degrade gracefully or crash entirely? What data might be lost? How long does recovery take? Interviewers specifically look for candidates who proactively discuss failure scenarios.

- Over-engineering with unnecessary complexity: adding Kafka, Redis, Elasticsearch, and a service mesh to a system that serves 1000 users is over-engineering. Start simple and add complexity only when justified by specific requirements. A monolithic application with a single PostgreSQL database handles most workloads up to millions of users. Introduce distributed components only when you can articulate the specific problem they solve and the tradeoff they introduce.

- Not performing back-of-envelope calculations to validate design decisions: claiming "we need 100 servers" without showing the math is unconvincing. Calculate storage requirements (records × size × retention), throughput requirements (daily users × actions per user ÷ seconds per day), and bandwidth requirements (response size × requests per second). These calculations validate your architecture and demonstrate quantitative reasoning.

- Treating all data the same regardless of access patterns: user profile data (read frequently, written rarely) and analytics events (written frequently, read in batch) have fundamentally different requirements. Using the same storage system and access pattern for both leads to suboptimal performance. Identify hot data vs. cold data, read-heavy vs. write-heavy paths, and choose appropriate storage and caching strategies for each.

## Real-World Use Cases

**TinyURL / Bitly URL Shortening at Scale**: Bitly processes billions of link clicks per month, requiring sub-10ms redirect latency globally. Their architecture uses a distributed key-value store (originally backed by MySQL, now custom) with aggressive multi-layer caching: browser cache (301 redirects), CDN edge cache, regional Redis clusters, and local in-memory caches. Link creation uses a distributed counter with pre-allocated ranges per data center to avoid cross-datacenter coordination. Analytics are processed asynchronously via Kafka, with real-time click counts maintained in Redis and historical analytics in a columnar store (ClickHouse). Geographic distribution ensures redirects are served from the nearest edge location regardless of where the link was created.

**WhatsApp Messaging Architecture**: WhatsApp handles over 100 billion messages per day with a remarkably small engineering team (fewer than 50 engineers at acquisition). Their architecture uses Erlang for the messaging server (optimized for millions of concurrent connections per server), Mnesia for in-memory message routing tables, and a custom protocol over TCP for mobile efficiency. Messages are stored temporarily until delivered (not permanently stored on servers for privacy). The system uses a "store and forward" model: messages are persisted until the recipient acknowledges receipt, then deleted. End-to-end encryption means servers cannot read message content. Group messages use a fan-out approach where the sender's server distributes to each recipient's server.

**Twitter/X News Feed Architecture**: Twitter's feed system evolved from a simple pull model (query all followed users' tweets at read time) to a hybrid push/pull model. For users with fewer than a certain follower threshold, tweets are fanned out on write to followers' pre-computed timelines stored in Redis. For high-follower accounts (celebrities, news organizations), tweets are merged at read time to avoid the cost of writing to millions of timelines. The ranking algorithm considers recency, engagement signals, user affinity, and content type. Twitter's infrastructure processes over 500 million tweets per day, with the feed service handling millions of reads per second from Redis clusters containing billions of timeline entries.

**Discord Real-Time Chat Infrastructure**: Discord supports millions of concurrent users across millions of servers (chat groups) with sub-100ms message delivery. Their architecture uses Elixir/Erlang for the real-time messaging layer (leveraging the BEAM VM's ability to handle millions of lightweight processes), with each Discord server mapped to a process that manages its state and message routing. Messages are persisted to Cassandra (optimized for write-heavy workloads) and cached in Redis for recent message retrieval. For large servers (100,000+ members), Discord uses a "lazy loading" approach where only members who are actively viewing a channel receive real-time updates. Presence (online/offline status) is tracked via a distributed system that aggregates heartbeats across all gateway servers.

## Interview Questions

**Q: Design a URL shortener that handles 100 million URLs and 10 billion redirects per month. What are the key design decisions?**

A: Key decisions: (1) ID generation: use a distributed counter (Snowflake) rather than hashing to avoid collisions and enable sequential storage. Base62 encode the counter for short URLs (7 chars = 3.5 trillion combinations). (2) Storage: use a key-value store (DynamoDB or Cassandra) optimized for point lookups by short code. Separate analytics data into a time-series store. (3) Caching: with 10B redirects/month (~3,800/sec), cache hot URLs in Redis. The 80/20 rule means 20% of URLs get 80% of traffic, so a modest cache handles most reads. (4) Redirect type: use 302 (temporary) if you need analytics on every click, 301 (permanent) if you want browsers to cache and reduce server load. (5) Geographic distribution: deploy read replicas and cache layers in multiple regions for low-latency redirects globally. (6) Analytics: process click events asynchronously via Kafka to avoid adding latency to the redirect path. Storage estimate: 100M URLs × 1KB = 100GB, easily fits on a single database with replication.

**Q: Design a notification service that delivers push notifications, emails, and SMS to 500 million users.**

A: Architecture: (1) API layer accepts notification requests with priority, channel preferences, and template ID. (2) Priority queue (Kafka with priority topics or SQS with separate queues per priority) buffers notifications for processing. (3) Worker fleet processes notifications: resolves templates, applies user preferences (opt-outs, quiet hours, channel preferences), rate limits per user (max 5 push/hour), and routes to channel-specific senders. (4) Channel adapters: push (APNs for iOS, FCM for Android), email (SES/SendGrid), SMS (Twilio). Each has different throughput limits and failure modes. (5) Delivery tracking: store delivery status (sent, delivered, opened, failed) for each notification with retry logic (exponential backoff, max 3 retries). (6) Rate limiting: per-user limits prevent notification fatigue, per-channel limits respect provider quotas. Key tradeoffs: exactly-once delivery is impossible across channels, so design for at-least-once with deduplication at the device level. Batch similar notifications (e.g., "3 people liked your post" instead of 3 separate notifications). Use dead letter queues for permanently failed deliveries.

**Q: How would you design a distributed cache that handles 1 million requests per second with 99.9% availability?**

A: (1) Partitioning: use consistent hashing with virtual nodes to distribute keys across cache nodes. Virtual nodes (150-200 per physical node) ensure even distribution and smooth rebalancing when nodes are added/removed. (2) Replication: replicate each partition to 2-3 nodes for fault tolerance. Use async replication for performance (accept brief inconsistency on failover). (3) Client routing: clients use a consistent hash ring to route directly to the correct node (no proxy bottleneck). Library handles failover to replica nodes. (4) Hot key handling: detect hot keys via access counting, replicate them to multiple nodes, and load-balance reads across replicas. (5) Eviction: LRU with memory pressure monitoring. Alert at 80% capacity, evict aggressively at 90%. (6) Failure handling: when a node fails, its replicas serve traffic immediately. A new node is provisioned and warmed from replicas. The consistent hash ring is updated, and only 1/N of keys need to be redistributed. (7) Capacity: at 1M req/sec with average 1KB values, you need ~10 nodes (each handling 100K req/sec, which is within Redis's capability). Deploy across 3 availability zones for zone-level fault tolerance.

**Q: Design a chat system that supports 1:1 messaging, group chats (up to 500 members), and message history. How do you handle ordering and delivery guarantees?**

A: (1) Connection layer: WebSocket servers maintain persistent connections. Use Redis Pub/Sub or a message broker to route messages between servers when sender and recipient are on different instances. (2) Message ordering: assign a per-conversation monotonically increasing sequence number (Redis INCR on conversation key). Clients use sequence numbers to detect gaps and request missing messages. (3) Delivery guarantees: store messages in database before acknowledging to sender. Mark as "sent" when persisted, "delivered" when recipient's device acknowledges, "read" when user opens the conversation. (4) Group messages: for groups under 500 members, fan-out on write (send to each member's message queue). For each member, check if they are online (deliver via WebSocket) or offline (store for later delivery + push notification). (5) Offline handling: queue messages per user in Redis sorted set (score = timestamp). On reconnect, deliver queued messages in order and clear the queue. (6) Message history: store in Cassandra partitioned by conversation_id with clustering key on timestamp. This enables efficient range queries for loading chat history. (7) Presence: heartbeat every 10 seconds, mark offline after 30 seconds of no heartbeat. Publish presence changes to conversation members.

## Production Tips

- Implement circuit breakers between all external service calls in your system design. When a downstream service (payment provider, notification service, third-party API) becomes slow or unavailable, the circuit breaker prevents cascading failures by failing fast rather than accumulating timeouts. Use three states: closed (normal operation), open (all requests fail immediately), and half-open (allow a few test requests to check recovery). Monitor circuit breaker state transitions as a key operational metric.

- Design for observability from the start: every system design should include logging (structured JSON logs with correlation IDs), metrics (request rate, latency percentiles, error rate, queue depth), and tracing (distributed traces across service boundaries). In interviews, mentioning specific metrics you would monitor demonstrates operational maturity. For example, in a URL shortener: monitor redirect latency p99, cache hit rate, database query latency, and short code generation rate. Set alerts on anomalies rather than static thresholds.

- Use feature flags and gradual rollouts for any new system component. When launching a new feed ranking algorithm, notification channel, or caching layer, roll out to 1% of users first, monitor for regressions, then gradually increase. This limits blast radius when things go wrong and provides a quick rollback mechanism. In interviews, mentioning gradual rollout strategies shows you think about operational safety, not just system architecture.

## Related Topics

- [Scalability](./scalability.md) — Every interview problem requires reasoning about how the system scales from thousands to millions of users
- [Caching](./caching.md) — Caching strategies are central to URL shorteners, news feeds, and chat systems for achieving low-latency reads at scale
- [Load Balancing](./load-balancing.md) — Distributing traffic across application instances is fundamental to handling high request volumes in all interview problems
- [Event-Driven Architecture](./event-driven-architecture.md) — Notification services and news feed fan-out rely on event-driven patterns for asynchronous processing
- [Rate Limiting](./rate-limiting.md) — Protecting services from abuse and managing throughput is a cross-cutting concern in every system design
