# RabbitMQ

## Quick Reference

- RabbitMQ is an open-source message broker implementing AMQP 0-9-1 (Advanced Message Queuing Protocol)
- Core model: Producers → Exchanges → Bindings → Queues → Consumers
- Exchange types: Direct (exact routing key match), Fanout (broadcast), Topic (pattern-based), Headers (attribute-based)
- Delivery guarantees: at-most-once (auto-ack), at-least-once (manual ack + publisher confirms), effectively-once (deduplication)
- Persistence: durable exchanges/queues survive broker restart; persistent messages (delivery_mode=2) written to disk
- Quorum queues (3.8+) use Raft consensus for replicated, highly-available queues replacing classic mirrored queues
- Dead-letter exchanges (DLX) handle rejected, expired, or overflow messages for retry or inspection
- Management UI on port 15672; CLI tools via `rabbitmqctl` and `rabbitmq-diagnostics`

## When to Use

RabbitMQ is ideal when you need a traditional message broker with sophisticated routing capabilities, reliable delivery guarantees, and support for multiple messaging patterns including point-to-point, publish-subscribe, request-reply, and work queues. Choose RabbitMQ when your application requires complex routing logic through exchange types and binding rules, when you need per-message acknowledgments with redelivery on failure, or when you want built-in support for dead-letter exchanges to handle poison messages gracefully. RabbitMQ excels in enterprise integration scenarios where different services need different subsets of messages routed based on content or headers, and in task distribution systems where work must be load-balanced across multiple workers with guaranteed processing. It is particularly well-suited for systems that need priority queues, message TTL, delayed messaging, and request-reply patterns with correlation IDs. Prefer RabbitMQ over Kafka when you need smart routing at the broker level, true message deletion after consumption (reducing storage costs), lower operational complexity for moderate throughput workloads, and when you do not need message replay or log-based persistence.

## Code Examples

### Exchange and Queue Configuration with Spring AMQP

```java
@Configuration
public class RabbitMQConfig {

    // Direct exchange for point-to-point routing
    @Bean
    public DirectExchange orderExchange() {
        return ExchangeBuilder.directExchange("order.direct")
            .durable(true)
            .build();
    }

    // Topic exchange for pattern-based routing
    @Bean
    public TopicExchange eventExchange() {
        return ExchangeBuilder.topicExchange("event.topic")
            .durable(true)
            .build();
    }

    // Fanout exchange for broadcast
    @Bean
    public FanoutExchange notificationExchange() {
        return ExchangeBuilder.fanoutExchange("notification.fanout")
            .durable(true)
            .build();
    }

    // Quorum queue with dead-letter configuration
    @Bean
    public Queue orderQueue() {
        return QueueBuilder.durable("order.processing")
            .withArgument("x-queue-type", "quorum")
            .withArgument("x-delivery-limit", 5)
            .withArgument("x-dead-letter-exchange", "order.dlx")
            .withArgument("x-dead-letter-routing-key", "order.dead")
            .build();
    }

    // Queue with TTL and max length
    @Bean
    public Queue notificationQueue() {
        return QueueBuilder.durable("notification.email")
            .withArgument("x-message-ttl", 86400000)       // 24h TTL
            .withArgument("x-max-length", 100000)          // Max 100k messages
            .withArgument("x-overflow", "reject-publish")  // Backpressure
            .build();
    }

    // Bindings
    @Bean
    public Binding orderBinding(Queue orderQueue, DirectExchange orderExchange) {
        return BindingBuilder.bind(orderQueue).to(orderExchange).with("order.process");
    }

    @Bean
    public Binding eventBinding(Queue orderQueue, TopicExchange eventExchange) {
        return BindingBuilder.bind(orderQueue).to(eventExchange).with("order.#");
    }
}
```

### Consumer with Manual Acknowledgment and Error Handling

```java
@Component
@RequiredArgsConstructor
@Slf4j
public class OrderConsumer {

    private static final int MAX_RETRIES = 3;
    private final OrderService orderService;

    @RabbitListener(queues = "order.processing", ackMode = "MANUAL", concurrency = "3-10")
    public void processOrder(Message message, Channel channel,
                             @Header(AmqpHeaders.DELIVERY_TAG) long deliveryTag) {
        String correlationId = message.getMessageProperties().getCorrelationId();
        int retryCount = getRetryCount(message);

        try {
            OrderEvent order = deserialize(message);
            log.info("Processing order: correlationId={}, attempt={}", correlationId, retryCount + 1);

            orderService.process(order);

            // Acknowledge successful processing
            channel.basicAck(deliveryTag, false);
            log.info("Order processed successfully: {}", order.getOrderId());

        } catch (TransientException e) {
            if (retryCount < MAX_RETRIES) {
                // Reject without requeue - DLX routes to retry queue with TTL
                channel.basicNack(deliveryTag, false, false);
                log.warn("Transient failure, routing to retry queue (attempt {})", retryCount + 1, e);
            } else {
                // Max retries exceeded - send to parking lot DLQ
                channel.basicReject(deliveryTag, false);
                log.error("Max retries exceeded, sending to DLQ", e);
            }
        } catch (PoisonMessageException e) {
            // Permanent failure - reject immediately to DLQ
            channel.basicReject(deliveryTag, false);
            log.error("Poison message rejected: correlationId={}", correlationId, e);
        }
    }

    private int getRetryCount(Message message) {
        List<Map<String, ?>> deaths = message.getMessageProperties().getXDeathHeader();
        if (deaths == null || deaths.isEmpty()) return 0;
        return deaths.stream()
            .mapToInt(d -> ((Number) d.get("count")).intValue())
            .sum();
    }
}
```

### Publisher Confirms and Retry Configuration

```java
@Configuration
public class PublisherConfig {

    @Bean
    public CachingConnectionFactory connectionFactory() {
        CachingConnectionFactory factory = new CachingConnectionFactory("localhost");
        factory.setPublisherConfirmType(CachingConnectionFactory.ConfirmType.CORRELATED);
        factory.setPublisherReturns(true);
        factory.setChannelCacheSize(25);
        factory.setConnectionCacheSize(5);
        return factory;
    }

    @Bean
    public RabbitTemplate rabbitTemplate(CachingConnectionFactory connectionFactory) {
        RabbitTemplate template = new RabbitTemplate(connectionFactory);
        template.setMandatory(true);

        // Confirm callback: broker acknowledged message persistence
        template.setConfirmCallback((correlationData, ack, cause) -> {
            if (!ack) {
                log.error("Message not confirmed: correlationId={}, cause={}",
                    correlationData != null ? correlationData.getId() : "unknown", cause);
                retryOrAlert(correlationData);
            }
        });

        // Return callback: message could not be routed to any queue
        template.setReturnsCallback(returned -> {
            log.warn("Message returned: exchange={}, routingKey={}, replyCode={}, replyText={}",
                returned.getExchange(), returned.getRoutingKey(),
                returned.getReplyCode(), returned.getReplyText());
        });

        return template;
    }
}

// Dead-letter queue with retry backoff topology
@Configuration
public class RetryTopologyConfig {

    @Bean
    public Queue retryQueue5s() {
        return QueueBuilder.durable("order.retry.5s")
            .withArgument("x-message-ttl", 5000)
            .withArgument("x-dead-letter-exchange", "order.direct")
            .withArgument("x-dead-letter-routing-key", "order.process")
            .build();
    }

    @Bean
    public Queue retryQueue30s() {
        return QueueBuilder.durable("order.retry.30s")
            .withArgument("x-message-ttl", 30000)
            .withArgument("x-dead-letter-exchange", "order.direct")
            .withArgument("x-dead-letter-routing-key", "order.process")
            .build();
    }

    @Bean
    public Queue retryQueue300s() {
        return QueueBuilder.durable("order.retry.300s")
            .withArgument("x-message-ttl", 300000)
            .withArgument("x-dead-letter-exchange", "order.direct")
            .withArgument("x-dead-letter-routing-key", "order.process")
            .build();
    }

    @Bean
    public Queue parkingLotQueue() {
        return QueueBuilder.durable("order.parking-lot").build();
    }
}
```

### Clustering and High Availability

```yaml
# rabbitmq.conf for production cluster
cluster_formation.peer_discovery_backend = rabbit_peer_discovery_k8s
cluster_formation.k8s.host = kubernetes.default.svc.cluster.local
cluster_formation.k8s.address_type = hostname
cluster_partition_handling = pause_minority

# Default to quorum queues for new declarations
default_queue_type = quorum

# Resource limits
vm_memory_high_watermark.relative = 0.7
disk_free_limit.absolute = 2GB

# Connection limits
channel_max = 2047
connection_max = 5000

# Heartbeat for dead connection detection
heartbeat = 60
```

```bash
# Cluster management commands
rabbitmqctl cluster_status
rabbitmqctl set_policy ha-quorum "^order\." \
  '{"queue-type": "quorum", "x-quorum-initial-group-size": 3}' \
  --apply-to queues

# Monitor queue depths and consumer counts
rabbitmqctl list_queues name messages consumers state

# Check for network partition status
rabbitmq-diagnostics check_if_node_is_quorum_critical
```

## Common Pitfalls

- **Unbounded queue growth without consumers**: Without consumers or with slow consumers, queues grow indefinitely, consuming all available memory until the broker triggers flow control or crashes. Always set `x-max-length` or `x-max-length-bytes` on queues, and configure `x-overflow` to either `reject-publish` (backpressure) or `drop-head` (discard oldest). Monitor queue depth and alert before memory pressure triggers flow control.

- **Auto-ack with expensive processing**: Using auto-acknowledge mode means the broker removes the message immediately upon delivery. If the consumer crashes mid-processing, the message is permanently lost. Use manual acknowledgment for any processing that takes more than trivial time, has side effects, or where message loss is unacceptable.

- **Connection per operation anti-pattern**: Creating a new connection for each publish or consume operation is extremely expensive (TCP + AMQP + TLS handshake per operation). Use connection pooling and channel multiplexing. A single connection supports thousands of channels, each acting as a lightweight virtual connection. Spring AMQP's `CachingConnectionFactory` handles this automatically.

- **Missing publisher confirms for critical messages**: Publishing without confirms means the producer has no way to know if messages were persisted or routed. If the broker crashes between receiving and persisting, messages are lost silently. Always enable publisher confirms for messages that must not be lost, and handle negative acknowledgments with retry logic.

- **Not setting message TTL for time-sensitive data**: Messages without TTL sit in queues indefinitely if consumers are down. For time-sensitive messages (notifications, OTPs, session tokens), always set per-message TTL or queue-level `x-message-ttl` to prevent stale message processing when consumers recover after an outage.

- **Ignoring flow control signals**: When RabbitMQ hits memory or disk thresholds, it blocks all publishers via flow control. Producers that do not handle blocked connection callbacks will timeout and retry aggressively, worsening the situation. Design producers to detect flow control and implement backpressure (slow down or buffer locally).

## Real-World Use Cases

- **Order processing pipeline**: E-commerce platforms use RabbitMQ to decouple order placement from fulfillment. The order service publishes to a topic exchange with routing keys like `order.created.electronics`, allowing inventory, shipping, and notification services to each bind with patterns matching their domain. Each service processes orders independently at its own pace, with dead-letter queues capturing failures for retry.

- **Distributed task scheduling**: Background job systems use RabbitMQ work queues with `prefetch=1` to distribute CPU-intensive tasks (image processing, report generation, PDF creation) across a pool of workers. Dead-letter queues capture failed jobs for retry or manual intervention, priority queues ensure urgent tasks are processed first, and TTL prevents stale jobs from consuming resources.

- **Microservice saga orchestration**: In distributed transactions spanning multiple services, RabbitMQ facilitates the saga pattern. A saga orchestrator publishes commands to service-specific queues and listens for completion or compensation events on reply queues with correlation IDs, coordinating multi-step business processes with eventual consistency and automatic rollback on failure.

- **Email and notification dispatch**: A notification service consumes from a fanout exchange, receiving all system events. It applies filtering logic to determine which events warrant user notifications, then publishes to priority queues (high for security alerts, low for marketing) with appropriate TTLs. Rate limiting per user prevents notification fatigue while ensuring critical alerts are never delayed.

- **IoT command and control**: Industrial systems use RabbitMQ's request-reply pattern with temporary exclusive queues for device commands. The control plane publishes commands with reply-to headers, and devices respond on the specified reply queue. Message TTL ensures stale commands are not executed on devices that were temporarily offline.

## Interview Questions

**Q: What is the difference between a direct exchange and a topic exchange?**

A: A direct exchange routes messages only when the routing key exactly matches the binding key — one-to-one mapping between routing key and queue. A topic exchange supports wildcard pattern matching with `*` (exactly one word) and `#` (zero or more words) in binding keys against dot-delimited routing keys. Topic exchanges enable flexible content-based routing where a single binding like `order.*.us` matches `order.created.us` and `order.cancelled.us` without requiring individual bindings for each event type.

**Q: How does RabbitMQ ensure messages are not lost?**

A: Three mechanisms work together for end-to-end durability. Publisher confirms: the broker acknowledges each message after persisting it to disk (for persistent messages) or routing it to at least one queue. Durable queues and exchanges: survive broker restarts, preserving topology. Persistent messages (delivery_mode=2): written to disk before acknowledgment. On the consumer side, manual acknowledgments ensure messages are only removed from the queue after successful processing. All three must be enabled together for complete durability.

**Q: What are quorum queues and when should you use them?**

A: Quorum queues use the Raft consensus algorithm to replicate queue data across multiple nodes (typically 3 or 5). They provide stronger durability guarantees than classic mirrored queues with automatic leader election, consistent replication, and poison message handling via delivery count tracking. Use them for any queue where message loss is unacceptable in production. Trade-offs: no priority support, no non-durable mode, slightly higher per-message latency due to consensus overhead, but significantly better data safety and simpler operational model.

**Q: How does RabbitMQ handle network partitions in a cluster?**

A: RabbitMQ offers three partition handling strategies. `pause-minority`: nodes in the smaller partition pause until connectivity is restored, preventing split-brain where both sides accept writes independently (recommended for most production deployments). `autoheal`: the losing partition automatically restarts after connectivity is restored, with potential message loss on the restarted side. `ignore`: both sides continue independently, requiring manual intervention to reconcile state (dangerous, rarely appropriate).

## Production Tips

- **Connection and channel management**: Use a single long-lived connection per application instance with multiple channels for concurrency. Set heartbeat interval to 60 seconds to detect dead connections without excessive network overhead. Spring AMQP's `CachingConnectionFactory` with `channelCacheSize=25` handles this efficiently for most workloads.

- **Monitoring essentials**: Track queue depth (`rabbitmq_queue_messages`), consumer utilization (`rabbitmq_queue_consumer_utilisation` — below 70% indicates consumers are idle waiting for messages), message rates (published/delivered/acknowledged per second), and node memory usage. Alert when queue depth exceeds normal operating range sustained for more than 5 minutes.

- **Quorum queue sizing**: Use an odd replication factor (3 or 5). Three replicas tolerate one node failure; five tolerate two. More replicas increase write latency due to Raft consensus overhead. Place replicas across availability zones for maximum resilience against zone failures. Monitor `rabbitmq_raft_log_commit_index` for replication lag.

- **Virtual host isolation**: Use separate virtual hosts for different applications or environments sharing the same cluster. Virtual hosts provide namespace isolation for exchanges, queues, and bindings, plus independent permission controls. Set per-vhost resource limits (max connections, max queues) to prevent one application from exhausting cluster resources.

## Related Topics

- [Apache Kafka](./apache-kafka.md) — Event streaming platform with log-based persistence, complementing RabbitMQ's queue-based model
- [Messaging Patterns and Architecture](./messaging-patterns.md) — Architectural patterns and decision frameworks for choosing messaging platforms
- [Spring Cloud and Microservices](../spring-framework/spring-microservices.md) — Spring Cloud Stream provides declarative RabbitMQ integration
