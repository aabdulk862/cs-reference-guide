# System Design Interviews

## Quick Reference

- **Time Structure**: 5 minutes requirements gathering, 10 minutes high-level design, 15 minutes deep dive, 5 minutes wrap-up and trade-offs
- **Start with Requirements**: Always clarify functional requirements, non-functional requirements (scale, latency, availability), and constraints before drawing anything
- **Back-of-Envelope Math**: Estimate QPS, storage, bandwidth, and memory requirements early to justify architectural decisions with concrete numbers
- **Trade-Off Articulation**: Every design decision involves trade-offs — explicitly state what you are optimizing for and what you are sacrificing
- **Depth Over Breadth**: Interviewers prefer deep expertise in 2-3 components over shallow coverage of the entire system
- **Communication Cadence**: Narrate your thinking continuously — silence signals confusion, not deep thought

## When to Use

System design interviews appear in virtually every senior engineering interview loop and carry significant weight in leveling decisions. These rounds evaluate your ability to architect large-scale distributed systems, make principled trade-offs under constraints, and communicate complex technical ideas clearly. At senior levels (L5+), system design performance often determines whether you receive an offer and at what level.

The skills tested in system design interviews directly mirror the daily work of senior engineers: scoping ambiguous problems, estimating resource requirements, choosing appropriate technologies, designing for failure modes, and communicating architectural decisions to diverse stakeholders. Companies use these rounds to assess whether you can operate at the scope expected for the target level — designing systems that serve millions of users, handle thousands of requests per second, and maintain high availability across distributed infrastructure.

Preparation for system design interviews requires a fundamentally different approach than coding interview preparation. Rather than memorizing solutions, you must develop a systematic framework for decomposing any open-ended design problem into manageable components, making justified decisions at each layer, and adapting your design as requirements evolve during the conversation. The interviewer is evaluating your process and reasoning as much as your final architecture.

System design rounds also test your ability to collaborate with the interviewer. The best candidates treat the session as a working design meeting — asking clarifying questions, proposing alternatives, soliciting feedback, and adjusting course based on hints. This collaborative dynamic demonstrates the communication skills essential for senior engineering roles where you regularly lead design discussions with cross-functional teams.

## Code Examples

### Capacity Estimation Framework

```python
class CapacityEstimator:
    """Back-of-envelope calculation framework for system design interviews."""

    def __init__(self, daily_active_users: int):
        self.dau = daily_active_users

    def estimate_qps(self, actions_per_user_per_day: int) -> dict:
        """Calculate queries per second from user activity patterns."""
        total_daily_requests = self.dau * actions_per_user_per_day
        avg_qps = total_daily_requests / 86400  # seconds in a day
        peak_qps = avg_qps * 3  # assume 3x peak-to-average ratio

        return {
            "total_daily_requests": total_daily_requests,
            "average_qps": round(avg_qps, 1),
            "peak_qps": round(peak_qps, 1),
            "requests_per_second_per_server": 1000,  # typical web server
            "servers_needed": max(1, int(peak_qps / 1000) + 1),
        }

    def estimate_storage(self, avg_object_size_kb: float,
                         objects_per_user_per_day: int,
                         retention_years: int) -> dict:
        """Calculate storage requirements over retention period."""
        daily_new_data_gb = (
            self.dau * objects_per_user_per_day * avg_object_size_kb
        ) / (1024 * 1024)
        total_storage_tb = (daily_new_data_gb * 365 * retention_years) / 1024

        return {
            "daily_new_data_gb": round(daily_new_data_gb, 2),
            "yearly_data_tb": round(daily_new_data_gb * 365 / 1024, 2),
            "total_storage_tb": round(total_storage_tb, 2),
            "with_replication_3x_tb": round(total_storage_tb * 3, 2),
        }

    def estimate_bandwidth(self, avg_response_size_kb: float,
                           peak_qps: float) -> dict:
        """Calculate network bandwidth requirements."""
        bandwidth_mbps = (peak_qps * avg_response_size_kb * 8) / 1024

        return {
            "peak_bandwidth_mbps": round(bandwidth_mbps, 1),
            "peak_bandwidth_gbps": round(bandwidth_mbps / 1024, 3),
            "cdn_offload_80_percent_gbps": round(bandwidth_mbps * 0.2 / 1024, 3),
        }


# Example: Design a URL shortener
estimator = CapacityEstimator(daily_active_users=100_000_000)
qps = estimator.estimate_qps(actions_per_user_per_day=5)
storage = estimator.estimate_storage(
    avg_object_size_kb=0.5, objects_per_user_per_day=1, retention_years=5
)
print(f"Peak QPS: {qps['peak_qps']}")
print(f"Total Storage (5yr): {storage['total_storage_tb']} TB")
```

### System Design Interview Template

```markdown
# [System Name] Design

## 1. Requirements Clarification (5 min)

### Functional Requirements
- Core feature 1: [description]
- Core feature 2: [description]
- Out of scope: [explicitly excluded features]

### Non-Functional Requirements
- Scale: [DAU, QPS estimates]
- Latency: [P50, P99 targets]
- Availability: [SLA target, e.g., 99.99%]
- Consistency: [strong vs eventual, with justification]
- Durability: [data loss tolerance]

### Constraints
- Budget/cost considerations
- Existing infrastructure to integrate with
- Regulatory requirements (GDPR, data residency)

## 2. High-Level Design (10 min)

### API Design
- Endpoint 1: POST /api/resource
- Endpoint 2: GET /api/resource/{id}

### Data Model
- Entity relationships
- Access patterns driving schema decisions

### Architecture Diagram
- Client → CDN → Load Balancer → App Servers → Cache → Database
- Async paths: App Servers → Message Queue → Workers

## 3. Deep Dive (15 min)

### Component 1: [Most critical/complex component]
- Detailed design decisions
- Scaling strategy
- Failure modes and mitigation

### Component 2: [Second priority component]
- Design decisions with trade-off analysis

## 4. Trade-offs and Extensions (5 min)

### Current Trade-offs
- Chose X over Y because [reason given constraints]
- Accepted limitation Z because [cost/benefit analysis]

### Future Extensions
- How design accommodates 10x growth
- Features deferred and how to add them later
```

## Common Pitfalls

- **Jumping into solutions without requirements**: The most common failure mode is immediately drawing boxes and arrows without understanding what the system needs to do, at what scale, and under what constraints. Spending 5 minutes on requirements clarification prevents designing the wrong system. Ask about user count, read/write ratio, latency requirements, consistency needs, and geographic distribution before proposing any architecture. Interviewers often intentionally leave requirements ambiguous to test whether you ask clarifying questions.

- **Ignoring back-of-envelope calculations**: Designing a system without estimating its resource requirements leads to architectures that cannot justify their complexity or miss critical scaling needs. A URL shortener serving 100 QPS does not need the same architecture as one serving 100,000 QPS. Spend 2-3 minutes on capacity estimation early in the discussion — it demonstrates engineering rigor and provides concrete justification for every subsequent design decision.

- **Over-engineering for hypothetical scale**: Proposing Kafka, Cassandra, and a custom sharding layer for a system that serves 1,000 users signals poor judgment about appropriate complexity. Match your architecture to the stated requirements. Start simple and explain how you would evolve the design as scale increases. Interviewers respect candidates who choose boring, proven technology when it meets requirements over those who reach for complex distributed systems unnecessarily.

- **Failing to discuss failure modes**: Every distributed system fails. Candidates who present only the happy path miss the opportunity to demonstrate production experience. For each major component, discuss: what happens when it fails, how the system detects the failure, how it recovers, and what the user experience is during degradation. This demonstrates the operational maturity that distinguishes senior engineers from those who only build systems but never run them.

- **Monologuing without checking in**: System design interviews are collaborative conversations, not presentations. Candidates who talk for 10 minutes without pausing miss signals from the interviewer about where to focus. Check in every 3-4 minutes: "Does this level of detail make sense, or should I go deeper on any component?" This collaborative approach mirrors how senior engineers actually lead design discussions.

- **Neglecting data model design**: Many candidates focus exclusively on service architecture while glossing over the data model. The database schema and access patterns often determine whether a system can meet its latency and consistency requirements. Spend time on entity relationships, indexing strategy, partition keys, and how your data model supports the primary query patterns without expensive joins or full table scans.

## Real-World Use Cases

System design interview skills directly translate to the daily work of senior engineers responsible for architecting production systems. The structured approach of requirements gathering, capacity estimation, component design, and trade-off analysis is exactly how experienced engineers approach new projects in their organizations. Companies evaluate this skill because it predicts on-the-job performance more accurately than any other interview signal at senior levels.

Design document authorship is the most direct application of system design interview skills. Senior engineers write design documents that follow nearly identical structure: problem statement, requirements, proposed architecture, alternatives considered, and trade-offs accepted. Engineers who practice system design interviews produce clearer, more thorough design documents that accelerate team alignment and reduce implementation surprises.

Architecture review participation requires the same analytical framework tested in system design interviews. When reviewing a colleague's design, you must quickly identify the key requirements, evaluate whether the proposed architecture meets them, spot missing failure modes, and suggest alternatives with clear trade-off analysis. The rapid assessment skills developed through interview preparation make you a more effective reviewer.

Incident response and post-mortem analysis benefit from system design thinking. Understanding how components interact, where single points of failure exist, and how cascading failures propagate through a distributed system enables faster root cause identification during outages. Engineers with strong system design intuition can hypothesize failure modes and validate them systematically rather than debugging blindly.

Technical leadership conversations with executives and product managers require the ability to explain complex architectural decisions in terms of business trade-offs. System design interview preparation develops the skill of translating technical constraints into business language: "We can achieve 99.99% availability but it requires 3x the infrastructure cost" or "Adding this feature requires a 6-week migration that will temporarily increase latency by 200ms."

## Interview Questions

**Q: How would you design a rate limiter for a distributed API gateway?**

A: I would start by clarifying requirements: what granularity (per-user, per-IP, per-endpoint), what limits (requests per second, per minute), and whether we need hard limits or soft limits with degradation. For a distributed system, I would use a sliding window counter stored in Redis with atomic increment operations. Each API gateway instance checks Redis before processing a request. The key would be `{user_id}:{endpoint}:{window_start}` with a TTL matching the window duration. For high availability, I would use Redis Cluster with read replicas. The trade-off is that Redis adds 1-2ms latency per request, but this is acceptable for the consistency guarantee. An alternative token bucket algorithm provides smoother rate limiting but requires more complex state management. I would implement a 429 response with Retry-After header and expose rate limit headers (X-RateLimit-Remaining) for client-side optimization.

**Q: Design a notification system that handles millions of notifications per day across multiple channels (push, email, SMS).**

A: The core challenge is handling high throughput with varying delivery latencies across channels while maintaining delivery guarantees. I would design a pipeline: API receives notification requests and writes to a message queue (Kafka for durability and ordering). Channel-specific consumer groups process messages at their own pace — push notifications need sub-second delivery while email can tolerate minutes of delay. Each channel has its own retry logic with exponential backoff and dead letter queues for permanent failures. A notification status service tracks delivery state per message per channel, enabling idempotent retries. For user preferences, a separate service manages opt-in/opt-out per channel with a caching layer. The key trade-off is eventual consistency in delivery status — we prioritize sending speed over real-time status accuracy. At scale, I would partition by user_id to maintain per-user ordering guarantees.

**Q: How would you design a real-time collaborative document editor like Google Docs?**

A: The fundamental challenge is conflict resolution when multiple users edit simultaneously. I would use Operational Transformation (OT) or CRDTs for conflict-free concurrent editing. The architecture has three layers: a WebSocket gateway for real-time communication, an operation transformation service that resolves conflicts and maintains document state, and a persistence layer that periodically snapshots the document. Each client maintains a local copy and sends operations (insert, delete, format) to the server. The server transforms concurrent operations against each other to maintain consistency, then broadcasts the transformed operations to all connected clients. For scalability, documents are partitioned across servers by document_id, with a coordination service handling user-to-server routing. The trade-off is complexity — OT algorithms are notoriously difficult to implement correctly, so I would evaluate using an existing library like Yjs (CRDT-based) rather than building from scratch. Persistence uses a combination of operation logs for recent history and periodic full snapshots for recovery.

**Q: Design a search autocomplete system that provides suggestions within 100ms.**

A: The latency requirement drives the architecture toward pre-computed suggestions with aggressive caching. I would build a trie data structure storing the top-K suggestions for each prefix, updated asynchronously from search analytics. The serving layer uses a distributed cache (Redis) with prefix keys mapping to ranked suggestion lists. When a user types, the client sends the current prefix to an API that performs a cache lookup — cache hits return in under 10ms. Cache misses fall through to a trie service that computes suggestions and populates the cache. Suggestion ranking uses a combination of query frequency, recency, and personalization signals. Updates flow through a streaming pipeline: search logs → aggregation → trie rebuild → cache invalidation. The key trade-off is freshness versus latency — suggestions may be minutes to hours stale, which is acceptable for most use cases. For personalization, I would add a lightweight user-specific layer that re-ranks the global suggestions based on the user's search history.

## Production Tips

- **Develop a consistent framework you apply to every problem**: Having a repeatable structure (requirements → estimation → high-level design → deep dive → trade-offs) prevents you from freezing on unfamiliar problems. The framework gives you a starting point regardless of the specific system being designed. Practice applying it to 15-20 different systems until the structure becomes automatic, freeing your cognitive resources for the actual design decisions rather than figuring out how to organize your response.

- **Build a mental catalog of building blocks and their properties**: Know the characteristics of common infrastructure components: Redis (sub-ms reads, limited by memory), Kafka (high throughput, ordered within partitions, durable), PostgreSQL (ACID, limited horizontal scaling), Cassandra (write-optimized, eventually consistent, linearly scalable), CDN (static content, geographic distribution, cache invalidation complexity). Understanding when each tool is appropriate and what trade-offs it introduces enables rapid, justified technology selection during interviews.

- **Practice drawing clean architecture diagrams quickly**: In whiteboard or virtual interviews, your diagram is the primary communication artifact. Practice drawing clear, well-labeled diagrams with consistent notation: boxes for services, cylinders for databases, arrows for data flow with labels indicating protocol and data type. A clean diagram demonstrates organized thinking and makes it easier for the interviewer to follow your reasoning and ask targeted questions.

- **Study real-world system architectures from engineering blogs**: Companies like Netflix, Uber, Airbnb, and Stripe publish detailed engineering blog posts about their system architectures. Reading these provides concrete examples of how production systems handle scale, failure, and evolution. Understanding why Netflix chose eventual consistency for their recommendation system or how Uber handles real-time location updates gives you authentic reference points during interviews.

## Related Topics

- [Coding Interviews](./coding-interviews.md) — Strong coding skills enable you to discuss implementation details credibly during system design deep dives
- [Technical Communication](./technical-communication.md) — System design interviews are fundamentally communication exercises evaluated through technical content
- [Behavioral Questions](./behavioral-questions.md) — System design rounds often include behavioral elements about past architectural decisions and trade-off navigation
