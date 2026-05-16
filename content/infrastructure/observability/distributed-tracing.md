# Distributed Tracing

## Quick Reference

- Distributed tracing follows a single request across service boundaries, showing latency breakdown and dependency relationships
- A trace consists of spans: each span represents a unit of work (HTTP call, database query, message processing) with start time, duration, and metadata
- Trace context propagation uses standardized headers (W3C Trace Context: `traceparent`, `tracestate`) passed between services
- OpenTelemetry is the vendor-neutral standard for instrumentation, providing SDKs for trace generation and export to any backend
- Sampling strategies: head-based (decide at entry point), tail-based (decide after trace completes based on characteristics), and always-on for errors
- AWS X-Ray provides managed tracing for AWS services with automatic instrumentation for Lambda, API Gateway, ECS, and EKS
- Trace backends: Jaeger (open-source), Zipkin (open-source), AWS X-Ray (managed), Datadog APM, Honeycomb, Grafana Tempo
- Span attributes (tags) provide searchable metadata: HTTP status, database statement, user ID, error details

## When to Use

Distributed tracing is essential when your application spans multiple services and you need to understand where time is spent during request processing. Use tracing when debugging latency issues that span service boundaries — metrics tell you a service is slow, but traces show you which downstream call within that service is the bottleneck. Tracing is critical for understanding dependency relationships in complex architectures, identifying which services are on the critical path for a given request type, and detecting cascading failures where one slow service causes timeouts in all upstream callers.

Implement tracing when you need to answer questions like: "Why did this specific request take 5 seconds when the p50 is 200ms?", "Which downstream service is causing our latency spike?", "What is the actual call graph for our checkout flow?", and "Are we making redundant calls to the same service within a single request?" Tracing becomes indispensable as architectures grow beyond 10 services, where mental models of request flow become unreliable and manual log correlation becomes impractical.

## Code Examples

### OpenTelemetry Instrumentation (Java Spring Boot)

```java
import io.opentelemetry.api.OpenTelemetry;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.SpanKind;
import io.opentelemetry.api.trace.StatusCode;
import io.opentelemetry.api.trace.Tracer;
import io.opentelemetry.context.Context;
import io.opentelemetry.context.Scope;
import io.opentelemetry.api.common.Attributes;
import io.opentelemetry.api.common.AttributeKey;

import org.springframework.stereotype.Service;

@Service
public class OrderService {
    private final Tracer tracer;
    private final PaymentClient paymentClient;
    private final InventoryClient inventoryClient;

    public OrderService(OpenTelemetry openTelemetry,
                        PaymentClient paymentClient,
                        InventoryClient inventoryClient) {
        this.tracer = openTelemetry.getTracer("order-service", "2.1.0");
        this.paymentClient = paymentClient;
        this.inventoryClient = inventoryClient;
    }

    public OrderResult processOrder(Order order) {
        // Create a span for the entire order processing operation
        Span span = tracer.spanBuilder("processOrder")
            .setSpanKind(SpanKind.INTERNAL)
            .setAttribute("order.id", order.getId())
            .setAttribute("order.item_count", order.getItems().size())
            .setAttribute("order.total_cents", order.getTotalCents())
            .setAttribute("customer.id", order.getCustomerId())
            .startSpan();

        try (Scope scope = span.makeCurrent()) {
            // Step 1: Validate inventory (creates child span automatically via HTTP instrumentation)
            InventoryResult inventory = validateInventory(order);
            span.addEvent("inventory_validated", Attributes.of(
                AttributeKey.booleanKey("all_available"), inventory.allAvailable()
            ));

            if (!inventory.allAvailable()) {
                span.setStatus(StatusCode.ERROR, "Insufficient inventory");
                span.setAttribute("order.failure_reason", "insufficient_inventory");
                return OrderResult.failed("Insufficient inventory");
            }

            // Step 2: Process payment (creates child span)
            PaymentResult payment = processPayment(order);
            span.addEvent("payment_processed", Attributes.of(
                AttributeKey.stringKey("payment.method"), payment.getMethod(),
                AttributeKey.stringKey("payment.transaction_id"), payment.getTransactionId()
            ));

            // Step 3: Reserve inventory (creates child span)
            reserveInventory(order, inventory);
            span.addEvent("inventory_reserved");

            span.setStatus(StatusCode.OK);
            span.setAttribute("order.status", "completed");
            return OrderResult.success(payment.getTransactionId());

        } catch (Exception e) {
            span.setStatus(StatusCode.ERROR, e.getMessage());
            span.recordException(e);
            span.setAttribute("order.failure_reason", e.getClass().getSimpleName());
            throw e;
        } finally {
            span.end();
        }
    }

    private InventoryResult validateInventory(Order order) {
        Span span = tracer.spanBuilder("validateInventory")
            .setSpanKind(SpanKind.CLIENT)
            .setAttribute("inventory.item_count", order.getItems().size())
            .startSpan();

        try (Scope scope = span.makeCurrent()) {
            // HTTP client automatically propagates trace context via W3C headers
            InventoryResult result = inventoryClient.checkAvailability(order.getItems());
            span.setAttribute("inventory.all_available", result.allAvailable());
            return result;
        } finally {
            span.end();
        }
    }

    private PaymentResult processPayment(Order order) {
        Span span = tracer.spanBuilder("processPayment")
            .setSpanKind(SpanKind.CLIENT)
            .setAttribute("payment.amount_cents", order.getTotalCents())
            .setAttribute("payment.currency", "USD")
            .startSpan();

        try (Scope scope = span.makeCurrent()) {
            PaymentResult result = paymentClient.charge(order);
            span.setAttribute("payment.success", result.isSuccess());
            return result;
        } catch (Exception e) {
            span.setStatus(StatusCode.ERROR, "Payment failed");
            span.recordException(e);
            throw e;
        } finally {
            span.end();
        }
    }
}
```

### OpenTelemetry Configuration and Export

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { RedisInstrumentation } from '@opentelemetry/instrumentation-redis-4';
import {
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
  AlwaysOnSampler,
} from '@opentelemetry/sdk-trace-base';

// Custom sampler: always trace errors, sample 10% of successful requests
class ProductionSampler {
  private ratioSampler = new TraceIdRatioBasedSampler(0.1); // 10% sampling
  private alwaysOn = new AlwaysOnSampler();

  shouldSample(context, traceId, spanName, spanKind, attributes) {
    // Always sample if parent was sampled (maintain trace completeness)
    // Always sample errors
    if (attributes?.['error'] === true || attributes?.['http.status_code'] >= 500) {
      return this.alwaysOn.shouldSample(context, traceId, spanName, spanKind, attributes);
    }
    // Sample 10% of normal traffic
    return this.ratioSampler.shouldSample(context, traceId, spanName, spanKind, attributes);
  }
}

const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'order-service',
    [SemanticResourceAttributes.SERVICE_VERSION]: '2.1.0',
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: 'production',
    'service.team': 'platform',
    'service.region': process.env.AWS_REGION,
  }),
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://otel-collector:4317',
    headers: { 'x-api-key': process.env.OTEL_API_KEY },
  }),
  spanProcessor: new BatchSpanProcessor(traceExporter, {
    maxQueueSize: 2048,
    maxExportBatchSize: 512,
    scheduledDelayMillis: 5000,
    exportTimeoutMillis: 30000,
  }),
  sampler: new ParentBasedSampler({ root: new ProductionSampler() }),
  instrumentations: [
    new HttpInstrumentation({
      ignoreIncomingPaths: ['/health', '/ready', '/metrics'], // Don't trace health checks
      requestHook: (span, request) => {
        span.setAttribute('http.request.id', request.headers['x-request-id']);
      },
    }),
    new ExpressInstrumentation(),
    new PgInstrumentation({
      enhancedDatabaseReporting: true, // Include query text in spans
    }),
    new RedisInstrumentation(),
  ],
});

sdk.start();

// Graceful shutdown
process.on('SIGTERM', () => {
  sdk.shutdown()
    .then(() => console.log('Tracing terminated'))
    .catch((error) => console.error('Error terminating tracing', error))
    .finally(() => process.exit(0));
});
```

### AWS X-Ray Integration with ECS

```yaml
# ECS Task Definition with X-Ray sidecar
{
  "family": "order-service",
  "networkMode": "awsvpc",
  "containerDefinitions": [
    {
      "name": "order-service",
      "image": "123456789012.dkr.ecr.us-east-1.amazonaws.com/order-service:2.1.0",
      "portMappings": [{ "containerPort": 8080 }],
      "environment": [
        { "name": "AWS_XRAY_DAEMON_ADDRESS", "value": "localhost:2000" },
        { "name": "OTEL_EXPORTER_OTLP_ENDPOINT", "value": "http://localhost:4317" }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/order-service",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "app"
        }
      }
    },
    {
      "name": "otel-collector",
      "image": "public.ecr.aws/aws-observability/aws-otel-collector:latest",
      "portMappings": [
        { "containerPort": 4317, "protocol": "tcp" },
        { "containerPort": 2000, "protocol": "udp" }
      ],
      "environment": [
        { "name": "AOT_CONFIG_CONTENT", "value": "receivers:\n  otlp:\n    protocols:\n      grpc:\n        endpoint: 0.0.0.0:4317\nexporters:\n  awsxray:\n    region: us-east-1\n  awsemf:\n    region: us-east-1\nservice:\n  pipelines:\n    traces:\n      receivers: [otlp]\n      exporters: [awsxray]\n    metrics:\n      receivers: [otlp]\n      exporters: [awsemf]" }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/otel-collector",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "collector"
        }
      }
    }
  ]
}
```

## Common Pitfalls

1. **Not propagating trace context across async boundaries**: HTTP instrumentation automatically propagates trace context for synchronous calls, but async operations (message queues, scheduled jobs, event-driven processing) require explicit context propagation. When publishing a message to SQS or Kafka, inject the trace context into message attributes. When consuming, extract the context and create a new span linked to the original trace. Without this, async processing appears as disconnected traces, making it impossible to follow a request through its complete lifecycle.

2. **Over-instrumenting with too many spans creating performance overhead**: Creating a span for every method call, loop iteration, or trivial operation generates enormous trace data and adds measurable latency (each span creation involves memory allocation, timestamp capture, and eventual export). Instrument at meaningful boundaries: service entry points, outbound HTTP/gRPC calls, database queries, cache operations, and significant business logic steps. A trace with 10-50 spans per request is informative; one with 500+ spans is noise that obscures the signal.

3. **Using 100% sampling in production without understanding the cost**: Full sampling generates trace data proportional to traffic volume. A service handling 10,000 requests per second produces 864 million spans per day, costing thousands of dollars in trace backend storage and processing. Implement head-based sampling (10% for normal traffic, 100% for errors) or tail-based sampling (collect all spans, decide which traces to keep based on characteristics like duration or error status). Always sample errors and slow requests at 100% since these are the traces you actually investigate.

4. **Ignoring trace context in error responses and retries**: When a downstream service returns an error, the trace should capture the error details (status code, error message, exception type) as span attributes. When retry logic re-attempts the call, each attempt should be a separate child span so the trace shows how many retries occurred and which attempt succeeded. Without this, traces show a single successful call with unexplained latency that is actually multiple failed attempts plus one success.

5. **Not setting meaningful span names and attributes**: Spans named `HTTP GET` or `database query` provide no useful information when investigating traces. Use descriptive names that identify the operation: `GET /api/orders/{orderId}`, `SELECT orders WHERE customer_id = ?`, `publish order.created event`. Add business-relevant attributes (order ID, customer ID, item count) that enable filtering traces by business context, not just technical properties.

## Real-World Use Cases

- **Identifying the critical path in a checkout flow**: A product team notices checkout takes 3.5 seconds on average but cannot determine why from service-level metrics alone. Distributed tracing reveals the critical path: API Gateway (50ms) → Order Service (100ms) → Inventory Service (200ms) → Payment Service (2800ms) → Notification Service (350ms, async). The Payment Service's 2.8-second latency dominates. Drilling into Payment Service traces shows it makes 3 sequential calls to the payment provider (authorization, fraud check, capture) that could be parallelized, reducing total payment time to 1.2 seconds.

- **Detecting N+1 query patterns across services**: Tracing reveals that a product listing endpoint makes 1 call to the catalog service, which then makes N individual calls to the pricing service (one per product). The trace waterfall clearly shows 50 sequential spans to the pricing service, each taking 20ms, totaling 1 second of serialized latency. The fix: implement a batch pricing endpoint that accepts multiple product IDs in a single call, reducing 50 spans to 1 span taking 30ms.

- **Debugging intermittent timeout failures**: A service experiences occasional 30-second timeouts that are impossible to reproduce locally. Tail-based sampling captures all traces exceeding 10 seconds. Analysis reveals these slow traces all share a common pattern: they hit a specific database replica that periodically falls behind on replication. The trace shows the database query span waiting 28 seconds for a response while other traces hitting different replicas complete in 5ms. The fix: implement read-replica health checking that removes lagging replicas from the connection pool.

- **Capacity planning with trace-based dependency mapping**: A platform team uses trace data to automatically generate a service dependency graph showing which services call which, at what frequency, and with what latency. This reveals that the recommendation service is called by 15 different services (more than expected), making it a critical shared dependency. The team provisions additional capacity and implements circuit breakers in all callers to prevent cascading failures if the recommendation service degrades.

## Interview Questions

**Q: Explain the difference between head-based and tail-based sampling. When would you use each?**

A: Head-based sampling makes the sampling decision at the trace entry point (first service) and propagates that decision to all downstream services. It is simple to implement, has low overhead, and ensures complete traces (all spans for a sampled trace are captured). The downside: you cannot sample based on trace characteristics (duration, error status) because those are unknown at the start. Tail-based sampling collects all spans from all services, assembles complete traces in a collector, then decides which traces to keep based on their characteristics (keep all traces with errors, keep traces exceeding 5 seconds, keep traces touching specific services). It captures interesting traces that head-based sampling might miss but requires a stateful collector that buffers spans and has higher infrastructure cost. Use head-based for most production workloads (simple, predictable cost). Use tail-based when you need guaranteed capture of error traces and slow traces regardless of sampling rate.

**Q: How does trace context propagation work in a microservices architecture?**

A: Trace context propagation passes trace identity (trace ID, span ID, sampling decision) between services so that spans from different services can be assembled into a single trace. The W3C Trace Context standard defines two headers: `traceparent` (contains trace ID, parent span ID, and trace flags) and `tracestate` (vendor-specific data). When Service A calls Service B via HTTP, the instrumentation library injects these headers into the outgoing request. Service B's instrumentation extracts the headers, creates a new span with the received trace ID and the received span ID as its parent, and continues propagation to any downstream calls. For non-HTTP communication (message queues, gRPC), the same context is injected into message metadata or gRPC headers. OpenTelemetry provides propagators for all common protocols and formats (W3C, B3, Jaeger, X-Ray).

**Q: How would you implement distributed tracing in an existing microservices architecture with minimal code changes?**

A: Use OpenTelemetry auto-instrumentation which hooks into common libraries (HTTP clients, database drivers, message queue clients) without code changes. For Java, use the OpenTelemetry Java agent (`-javaagent:opentelemetry-javaagent.jar`) which instruments Spring, JDBC, Redis, Kafka, and gRPC automatically. For Node.js, use `@opentelemetry/auto-instrumentations-node` which patches HTTP, Express, pg, and Redis modules. Deploy an OpenTelemetry Collector as a sidecar or DaemonSet that receives spans and exports to your chosen backend (X-Ray, Jaeger, Datadog). The only code change needed is adding the agent/SDK initialization and configuring the exporter endpoint. Add custom spans for business logic only after auto-instrumentation is working and you need more granular visibility into specific operations.

**Q: What attributes should you add to spans to make traces useful for debugging?**

A: Add attributes at multiple levels. For HTTP spans: method, URL path (parameterized, not with actual IDs), status code, request/response size, client IP. For database spans: database system, statement (parameterized), operation type, table name, rows affected. For business logic spans: entity IDs (order ID, customer ID), operation outcome, relevant counts (items processed, records updated). For error spans: exception type, message, stack trace (via `recordException`). Add resource attributes identifying the service: name, version, environment, region, instance ID. Avoid high-cardinality attributes that would explode storage (full request bodies, large arrays). The goal is enabling trace filtering by business context ("show me all traces for customer X") and quick identification of what went wrong without reading logs.

## Production Tips

- **Deploy OpenTelemetry Collector as infrastructure, not application responsibility**: Run the OTel Collector as a DaemonSet in Kubernetes or a sidecar in ECS rather than having applications export directly to trace backends. The collector handles batching, retry, sampling decisions, and backend routing. This decouples applications from the trace backend — you can switch from Jaeger to Tempo without changing any application code or configuration. It also provides a buffer during backend outages, preventing span loss.

- **Implement trace-based SLOs for critical user journeys**: Define Service Level Objectives based on trace data for end-to-end user journeys (not just individual service latency). For example: "99% of checkout traces complete in under 3 seconds." Monitor this SLO using trace backend queries that measure end-to-end duration for traces matching the checkout flow. This catches issues that per-service SLOs miss — each service might meet its individual SLO while the aggregate user experience degrades due to sequential call chains.

- **Use span links to connect related traces across async boundaries**: When a synchronous request triggers async processing (publishing to a queue, scheduling a job), use span links rather than parent-child relationships. The async processing creates a new trace linked to the original trace's span. This preserves the independence of async traces (they have their own sampling decisions and lifecycle) while maintaining the causal relationship. Trace backends display linked traces together during investigation.

## Related Topics

- [CloudWatch and Metrics](./cloudwatch-and-metrics.md) — Metrics that trigger trace-based investigation
- [Log Aggregation and Analysis](./log-aggregation-and-analysis.md) — Logs correlated with traces via shared trace IDs
- [Alerting and Incident Response](./alerting-and-incident-response.md) — Trace-driven debugging during incidents
- [Kubernetes & EKS](../kubernetes/index.md) — Service mesh tracing with Istio and Envoy sidecars
