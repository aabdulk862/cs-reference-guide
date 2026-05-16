# Apache Kafka

## Quick Reference

- Apache Kafka is a distributed event streaming platform for high-throughput, fault-tolerant messaging with log-based persistence
- Core abstractions: Topics (logical streams), Partitions (parallelism units), Offsets (message positions within a partition)
- Components: Producers (publish), Consumers (subscribe), Brokers (store), Consumer Groups (parallel consumption)
- APIs: Producer API, Consumer API, Streams API, Connect API, Admin API
- KRaft mode (Kafka 3.3+) replaces ZooKeeper with built-in Raft-based metadata management
- Retention: time-based (`retention.ms`) or size-based (`retention.bytes`); log compaction for key-based state topics
- Guarantees: at-least-once (default), exactly-once semantics (EOS) with idempotent producers and transactions
- Partitioning by key ensures ordering per key; round-robin distributes load when ordering is not required

## When to Use

Kafka is the right choice when you need a durable, high-throughput event backbone connecting multiple producers and consumers in a decoupled architecture. Use Kafka for real-time event streaming between microservices, log aggregation from distributed systems, change data capture (CDC) from databases, clickstream analytics, and IoT sensor data ingestion. Kafka excels when you need message replay (consumers can re-read from any offset), ordering guarantees within partitions, and horizontal scalability by adding partitions and brokers. Choose Kafka over traditional message queues when you need persistent event logs that multiple independent consumers can read at their own pace, when you need stream processing with Kafka Streams or ksqlDB, or when throughput requirements exceed what traditional brokers can handle (millions of messages per second). Kafka's append-only log architecture provides natural support for event sourcing, audit trails, and temporal queries that are difficult to implement with traditional message queues where messages are deleted after consumption.

## Code Examples

### Producer Configuration and Usage

```java
// High-throughput producer with exactly-once semantics
Properties props = new Properties();
props.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, "broker1:9092,broker2:9092,broker3:9092");
props.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class.getName());
props.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, JsonSerializer.class.getName());
props.put(ProducerConfig.ACKS_CONFIG, "all");              // Wait for all ISR replicas
props.put(ProducerConfig.RETRIES_CONFIG, Integer.MAX_VALUE); // Retry indefinitely
props.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, true);  // Exactly-once per partition
props.put(ProducerConfig.MAX_IN_FLIGHT_REQUESTS_PER_CONNECTION, 5); // Safe with idempotence
props.put(ProducerConfig.BATCH_SIZE_CONFIG, 65536);         // 64KB batch
props.put(ProducerConfig.LINGER_MS_CONFIG, 10);             // Wait 10ms to fill batch
props.put(ProducerConfig.COMPRESSION_TYPE_CONFIG, "lz4");   // Compress batches
props.put(ProducerConfig.BUFFER_MEMORY_CONFIG, 67108864);   // 64MB buffer

KafkaProducer<String, OrderEvent> producer = new KafkaProducer<>(props);

// Async send with callback for error handling
ProducerRecord<String, OrderEvent> record = new ProducerRecord<>(
    "order-events",              // topic
    order.getCustomerId(),       // key (determines partition for ordering)
    new OrderEvent(order)        // value
);

// Add headers for tracing and metadata
record.headers()
    .add("correlation-id", correlationId.getBytes())
    .add("source-service", "order-service".getBytes())
    .add("event-type", "OrderCreated".getBytes());

producer.send(record, (metadata, exception) -> {
    if (exception != null) {
        log.error("Failed to send to topic={}, key={}", record.topic(), record.key(), exception);
        deadLetterQueue.enqueue(record, exception);
    } else {
        log.debug("Sent to topic={}, partition={}, offset={}",
            metadata.topic(), metadata.partition(), metadata.offset());
    }
});

// Transactional producer for exactly-once across multiple topics
props.put(ProducerConfig.TRANSACTIONAL_ID_CONFIG, "order-processor-1");
KafkaProducer<String, Object> txProducer = new KafkaProducer<>(props);
txProducer.initTransactions();

try {
    txProducer.beginTransaction();
    txProducer.send(new ProducerRecord<>("orders", orderId, orderEvent));
    txProducer.send(new ProducerRecord<>("audit-log", orderId, auditEvent));
    txProducer.sendOffsetsToTransaction(offsets, consumerGroupId); // Commit consumer offsets
    txProducer.commitTransaction();
} catch (Exception e) {
    txProducer.abortTransaction();
    throw e;
}
```

### Consumer Group Processing

```java
// Consumer with manual offset management and error handling
Properties props = new Properties();
props.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, "broker1:9092,broker2:9092");
props.put(ConsumerConfig.GROUP_ID_CONFIG, "order-processing-group");
props.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class.getName());
props.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, JsonDeserializer.class.getName());
props.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
props.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, false);
props.put(ConsumerConfig.MAX_POLL_RECORDS_CONFIG, 500);
props.put(ConsumerConfig.MAX_POLL_INTERVAL_MS_CONFIG, 300000); // 5 min max processing time
props.put(ConsumerConfig.ISOLATION_LEVEL_CONFIG, "read_committed"); // For EOS

KafkaConsumer<String, OrderEvent> consumer = new KafkaConsumer<>(props);
consumer.subscribe(List.of("order-events"), new RebalanceListener());

try {
    while (running.get()) {
        ConsumerRecords<String, OrderEvent> records = consumer.poll(Duration.ofMillis(100));

        for (TopicPartition partition : records.partitions()) {
            List<ConsumerRecord<String, OrderEvent>> partitionRecords = records.records(partition);

            for (ConsumerRecord<String, OrderEvent> record : partitionRecords) {
                try {
                    processOrder(record.value());
                } catch (RetryableException e) {
                    // Pause partition and retry later
                    consumer.pause(List.of(partition));
                    scheduleRetry(partition, record.offset());
                    break;
                } catch (PoisonPillException e) {
                    // Send to dead-letter topic and continue
                    deadLetterProducer.send(new ProducerRecord<>("order-events.dlq",
                        record.key(), record.value()));
                    log.error("Poison pill at offset {}", record.offset(), e);
                }
            }

            // Commit offset for this partition
            long lastOffset = partitionRecords.get(partitionRecords.size() - 1).offset();
            consumer.commitSync(Map.of(partition, new OffsetAndMetadata(lastOffset + 1)));
        }
    }
} finally {
    consumer.close(Duration.ofSeconds(30));
}
```

### Kafka Streams Processing

```java
// Stream processing topology with state stores
StreamsBuilder builder = new StreamsBuilder();

// Source stream from order events
KStream<String, OrderEvent> orders = builder.stream("order-events",
    Consumed.with(Serdes.String(), orderEventSerde));

// Branch into different processing paths
Map<String, KStream<String, OrderEvent>> branches = orders
    .split(Named.as("order-"))
    .branch((key, event) -> event.getType() == EventType.CREATED, Branched.as("created"))
    .branch((key, event) -> event.getType() == EventType.CANCELLED, Branched.as("cancelled"))
    .defaultBranch(Branched.as("other"));

// Windowed aggregation: revenue per customer per hour
KTable<Windowed<String>, RevenueAggregate> hourlyRevenue = branches.get("order-created")
    .groupByKey()
    .windowedBy(TimeWindows.ofSizeAndGrace(Duration.ofHours(1), Duration.ofMinutes(5)))
    .aggregate(
        RevenueAggregate::new,
        (key, order, aggregate) -> aggregate.add(order.getAmount()),
        Materialized.<String, RevenueAggregate, WindowStore<Bytes, byte[]>>as("hourly-revenue-store")
            .withKeySerde(Serdes.String())
            .withValueSerde(revenueAggregateSerde)
    );

// Join streams with a KTable for enrichment
KTable<String, CustomerProfile> customers = builder.table("customer-profiles",
    Consumed.with(Serdes.String(), customerProfileSerde));

KStream<String, EnrichedOrder> enrichedOrders = branches.get("order-created")
    .join(customers,
        (order, customer) -> new EnrichedOrder(order, customer),
        Joined.with(Serdes.String(), orderEventSerde, customerProfileSerde));

enrichedOrders.to("enriched-orders", Produced.with(Serdes.String(), enrichedOrderSerde));

// Build and start the topology
KafkaStreams streams = new KafkaStreams(builder.build(), streamsConfig);
streams.setUncaughtExceptionHandler((thread, exception) -> {
    log.error("Uncaught exception in stream thread", exception);
    return StreamsUncaughtExceptionHandler.StreamThreadExceptionResponse.REPLACE_THREAD;
});
streams.start();
```

## Common Pitfalls

- **Consumer lag accumulation**: Consumers processing slower than producers causes growing lag, leading to increased end-to-end latency and potential data loss if retention expires before consumption. Monitor `records-lag-max` metric per partition and scale consumer instances (up to partition count). Consider increasing `max.poll.records` or optimizing processing logic before adding consumers.

- **Partition count too low**: Under-partitioned topics limit parallelism since each partition can only be consumed by one consumer in a group. Plan partition count based on target throughput (10-30 MB/s per partition typical). Note that partitions can be increased but never decreased, and increasing partitions breaks key-based ordering for existing keys.

- **Rebalancing storms**: Frequent consumer group rebalances cause processing pauses and duplicate processing. Tune `session.timeout.ms` (10-30s), `heartbeat.interval.ms` (session.timeout / 3), and `max.poll.interval.ms` (based on worst-case processing time). Use cooperative sticky assignor to minimize partition movement during rebalances.

- **Large messages exceeding broker limits**: Messages exceeding `message.max.bytes` (default 1MB) are rejected. For large payloads, store data in object storage (S3) and send only references through Kafka. If large messages are unavoidable, increase limits on broker, producer, and consumer configurations consistently.

- **Offset management errors**: Auto-commit with processing failures leads to message loss (committed before processed). Manual commit before processing leads to duplicates on failure (processed but not committed). Use idempotent processing with manual commit after successful processing, or enable exactly-once semantics with transactional producers.

- **Not handling poison pills**: A single malformed message can crash a consumer repeatedly, blocking all subsequent messages on that partition. Implement dead-letter topic routing for messages that fail deserialization or processing after a configurable number of retries.

## Real-World Use Cases

- **Event-driven microservices**: Kafka serves as the central nervous system connecting services through domain events (OrderCreated, PaymentProcessed, InventoryReserved), enabling loose coupling and eventual consistency across bounded contexts. Services can be deployed, scaled, and evolved independently while maintaining data consistency through event sourcing patterns. Companies like Netflix and LinkedIn process billions of events daily through Kafka.

- **Real-time fraud detection**: Financial institutions stream transaction events through Kafka, applying windowed aggregations and pattern matching via Kafka Streams to detect anomalous spending patterns within milliseconds. The ability to replay events enables model retraining and backtesting against historical transaction data without affecting production consumers.

- **Change data capture (CDC)**: Debezium connectors capture database changes (inserts, updates, deletes) as Kafka events, enabling real-time data synchronization between systems, cache invalidation, and search index updates without polling or dual-write problems. Downstream systems eventually converge with the source of truth through ordered event consumption.

- **Stream processing pipelines**: Organizations build real-time ETL pipelines using Kafka Connect for ingestion, Kafka Streams or Apache Flink for transformation, and Kafka Connect sinks for loading into data warehouses, enabling sub-minute data freshness for analytics dashboards that previously relied on nightly batch jobs.

- **Log aggregation and observability**: Applications publish structured logs to Kafka topics, which are consumed independently by Elasticsearch for search, Prometheus for metrics extraction, and S3 for long-term archival. Kafka's retention guarantees that no log data is lost even when downstream consumers experience temporary outages, and each consumer processes at its own pace.

## Interview Questions

**Q: How does Kafka guarantee message ordering?**

A: Kafka guarantees ordering only within a single partition. Messages with the same key are routed to the same partition via consistent hashing (murmur2 by default), ensuring ordered processing for that key. Cross-partition ordering is not guaranteed. For global ordering, use a single partition (sacrificing parallelism) or implement sequence numbers with consumer-side reordering. With idempotent producers enabled, ordering is maintained even during retries within a partition.

**Q: Explain the difference between at-least-once, at-most-once, and exactly-once delivery.**

A: At-most-once: commit offset before processing — if the consumer crashes mid-processing, the message is lost. At-least-once (default): commit after processing — if the consumer crashes after processing but before committing, the message is reprocessed. Exactly-once: uses idempotent producers (`enable.idempotence=true`) and transactional APIs to atomically write to multiple partitions and commit offsets, ensuring each message affects downstream state exactly once even across failures.

**Q: What happens when a consumer in a group fails?**

A: When a consumer stops sending heartbeats (exceeds `session.timeout.ms`), the group coordinator triggers a rebalance. The failed consumer's partitions are redistributed among remaining consumers in the group. During rebalance, consumption pauses briefly on affected partitions. The new consumer resumes from the last committed offset, potentially reprocessing some messages (at-least-once semantics). With cooperative rebalancing, only the affected partitions pause rather than all partitions.

**Q: How does Kafka achieve high throughput?**

A: Kafka achieves high throughput through: sequential disk I/O (append-only logs exploit disk sequential write speed), zero-copy transfer (sendfile syscall bypasses user-space copying), batching (producers batch messages, brokers write batches atomically), compression (snappy/lz4/zstd reduce network and disk I/O), page cache utilization (OS-level caching means hot data is served from memory), and partition-level parallelism allowing horizontal scaling of both producers and consumers independently.

## Production Tips

- **Partition count planning**: Target 10-30 MB/s per partition for throughput planning. For 300 MB/s aggregate throughput, provision 10-30 partitions. Over-partitioning increases metadata overhead, end-to-end latency, and rebalance time. Under-partitioning limits consumer parallelism. Start conservatively and increase based on observed throughput — partitions can be added but never removed.

- **Monitoring essentials**: Track `UnderReplicatedPartitions` (data loss risk if broker fails), `RequestHandlerAvgIdlePercent` (broker CPU saturation below 30%), consumer group lag per partition (processing delays), and `NetworkProcessorAvgIdlePercent` (network thread saturation). Alert on ISR shrinkage and consumer lag exceeding your SLA threshold.

- **Retention and compaction strategy**: Use time-based retention for event logs (7-30 days typical) and log compaction for state/snapshot topics (keeps latest value per key indefinitely). Set `min.compaction.lag.ms` to ensure consumers have time to read before compaction removes superseded values. For cost-effective long-term archival, use tiered storage to S3.

- **Disaster recovery**: Configure `min.insync.replicas=2` with `acks=all` to prevent data loss when a single broker fails. Use MirrorMaker 2 for cross-datacenter replication with configurable topic filtering and offset translation. Test failover procedures regularly and document the procedure for unclean leader election (trades potential data loss for availability when all replicas are down).

## Related Topics

- [RabbitMQ](./rabbitmq.md) — Traditional message broker with sophisticated routing, complementing Kafka's streaming model
- [Messaging Patterns and Architecture](./messaging-patterns.md) — When to choose Kafka vs. RabbitMQ and event-driven architecture patterns
- [Spring Cloud and Microservices](../spring-framework/spring-cloud.md) — Spring Cloud Stream provides declarative Kafka integration
