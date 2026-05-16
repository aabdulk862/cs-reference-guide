# Log Aggregation and Analysis

## Quick Reference

- Structured logging (JSON format) enables efficient parsing, filtering, and aggregation without custom regex extraction rules
- Splunk uses Search Processing Language (SPL) for searching, filtering, transforming, and visualizing machine data at scale
- CloudWatch Logs Insights provides interactive query language for analyzing log groups with filtering, aggregation, and pattern detection
- Log correlation across microservices requires a shared trace ID propagated through HTTP headers and message metadata
- Splunk architecture: forwarders (collect) → indexers (parse, store) → search heads (query, visualize)
- Log levels (TRACE, DEBUG, INFO, WARN, ERROR, FATAL) should be configurable per service without redeployment
- Retention policies balance investigation needs against storage costs: 7 days for debug, 30 days for application, 1-7 years for compliance
- Sampling verbose logs at a percentage in production reduces volume while maintaining statistical representativeness

## When to Use

Log aggregation is essential for any distributed system where debugging requires correlating events across multiple services, hosts, and time windows. Use centralized log aggregation when your application spans more than a single container or instance, when you need to investigate incidents by reconstructing request flows across service boundaries, when compliance requirements mandate log retention and audit trails, and when you need real-time alerting on log patterns (error spikes, security events, business anomalies).

Choose Splunk when you need enterprise-scale log analysis across heterogeneous systems (not just AWS), complex correlation across millions of events per second, and advanced analytics with machine learning capabilities. Choose CloudWatch Logs Insights when your infrastructure is primarily AWS-based, you want zero-infrastructure log analysis, and your query patterns are straightforward filtering and aggregation. Many organizations use both: CloudWatch for operational monitoring and Splunk for security analytics and cross-platform correlation.

## Code Examples

### Structured Logging Implementation (Java/Spring Boot)

```java
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.UUID;

/**
 * Filter that establishes correlation context for all log entries within a request.
 * Propagates trace ID from incoming headers or generates a new one.
 */
public class CorrelationFilter extends OncePerRequestFilter {
    private static final String TRACE_HEADER = "X-Trace-Id";
    private static final String SPAN_HEADER = "X-Span-Id";

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                     HttpServletResponse response,
                                     FilterChain chain) {
        String traceId = request.getHeader(TRACE_HEADER);
        if (traceId == null || traceId.isBlank()) {
            traceId = UUID.randomUUID().toString();
        }
        String spanId = UUID.randomUUID().toString().substring(0, 8);

        // Set MDC context - appears in every log entry within this request
        MDC.put("traceId", traceId);
        MDC.put("spanId", spanId);
        MDC.put("service", "order-service");
        MDC.put("method", request.getMethod());
        MDC.put("path", request.getRequestURI());
        MDC.put("clientIp", request.getRemoteAddr());

        // Propagate trace ID in response for client correlation
        response.setHeader(TRACE_HEADER, traceId);
        response.setHeader(SPAN_HEADER, spanId);

        try {
            chain.doFilter(request, response);
        } finally {
            MDC.clear();
        }
    }
}
```

```json
// logback-spring.xml JSON format configuration
// Produces single-line JSON log entries like:
{
  "timestamp": "2024-03-15T14:23:45.123Z",
  "level": "INFO",
  "service": "order-service",
  "traceId": "abc-123-def-456",
  "spanId": "7f8a9b2c",
  "logger": "com.example.OrderService",
  "message": "Order processed successfully",
  "orderId": "ord-789",
  "customerId": "cust-456",
  "processingTimeMs": 145,
  "thread": "http-nio-8080-exec-3"
}
```

### Splunk SPL Queries for Production Investigation

```spl
// Find all errors for a specific trace across all services
index=microservices traceid="abc-123-def-456" level=ERROR
| table _time, service, spanId, message, exception.type, exception.message
| sort _time

// Aggregate error rates by service over the last hour
index=microservices level=ERROR earliest=-1h
| stats count as errors by service
| join type=left service [
    search index=microservices earliest=-1h
    | stats count as total by service
]
| eval error_rate = round((errors / total) * 100, 2)
| sort -error_rate
| head 10

// Detect anomalous response times using percentile analysis
index=microservices sourcetype=access_log earliest=-4h
| timechart span=5m
    perc50(response_time_ms) as p50,
    perc95(response_time_ms) as p95,
    perc99(response_time_ms) as p99
| where p99 > 3 * p50

// Correlate deployment events with error spikes
index=microservices level=ERROR earliest=-24h
| timechart span=15m count as error_count
| appendcols [
    search index=deployments earliest=-24h
    | timechart span=15m count as deploy_count
]
| where deploy_count > 0 OR error_count > 100
| eval annotation = if(deploy_count > 0, "DEPLOYMENT", null())

// Transaction analysis: reconstruct full request lifecycle
index=microservices traceid="abc-123-def-456"
| sort _time
| transaction traceid maxspan=30s
| eval total_services = mvcount(service)
| eval total_duration_ms = duration * 1000
| table traceid, total_services, total_duration_ms, service, message

// Find slow database queries across all services
index=microservices "query_time_ms" earliest=-1h
| where query_time_ms > 1000
| stats count, avg(query_time_ms) as avg_ms, max(query_time_ms) as max_ms by service, query_template
| sort -avg_ms
| head 20

// Security: detect brute force login attempts
index=auth_logs action=login_failed earliest=-15m
| stats count as failures by src_ip, username
| where failures > 10
| lookup geo_ip src_ip OUTPUT country, city
| table src_ip, username, failures, country, city
```

### CloudWatch Logs Insights Queries

```
# Find the top 10 slowest requests in the last hour
fields @timestamp, traceId, path, processingTimeMs, service
| filter processingTimeMs > 1000
| sort processingTimeMs desc
| limit 10

# Calculate error rate per service over 5-minute windows
filter level = "ERROR"
| stats count() as errors by bin(5m) as time_window, service
| sort time_window desc

# Identify the most common error messages
filter level = "ERROR"
| stats count() as occurrences by message
| sort occurrences desc
| limit 20

# Trace a specific request across all services
filter traceId = "abc-123-def-456"
| sort @timestamp asc
| display @timestamp, service, spanId, level, message

# Find memory-related issues
filter @message like /OutOfMemory|heap|GC pause/
| stats count() by service, bin(1h)
| sort count() desc

# Parse and analyze JSON log fields
parse @message '{"*":"*","processingTimeMs":*,' as field1, value1, latency
| filter latency > 500
| stats avg(latency) as avg_latency, count() as request_count by service
| sort avg_latency desc
```

## Common Pitfalls

1. **Logging sensitive data in production**: PII (names, emails, SSNs), authentication tokens, credit card numbers, and passwords accidentally logged in request/response bodies create compliance violations and security risks. Implement log sanitization at the framework level — redact sensitive fields before they reach the logger. Use allowlists (log only known-safe fields) rather than denylists (try to catch all sensitive patterns). Audit log output regularly with automated scanning tools that detect patterns matching credit card numbers, SSNs, and API keys.

2. **Missing correlation IDs across service boundaries**: Without a consistent trace ID propagated through HTTP headers, message queues, and async processing, correlating logs during an incident becomes a manual timestamp-matching exercise across dozens of services. Ensure every service propagates the trace ID from incoming requests to all outbound calls (HTTP, gRPC, message publishing). Include the trace ID in async message metadata so consumers can continue the correlation chain. Use OpenTelemetry context propagation for standardized trace context.

3. **Unbounded log volume causing cost explosion**: Verbose DEBUG logging accidentally left enabled in production generates massive data volumes. A single service logging every database query at DEBUG level can produce terabytes per day. Implement configurable log levels that can be changed at runtime without redeployment (via feature flags or configuration service). Sample verbose logs at a percentage (log 1% of successful requests at DEBUG, 100% of errors). Set hard retention limits and lifecycle policies that automatically delete old logs.

4. **Unstructured log formats that resist automated analysis**: Free-text log messages like `"Processing order 123 for customer 456 took 145ms"` require custom regex patterns for every query. Structured JSON logs with consistent field names (`{"orderId": "123", "customerId": "456", "processingTimeMs": 145}`) enable immediate filtering, aggregation, and visualization without per-message parsing rules. Migrate to structured logging before scaling — retrofitting is exponentially harder as services multiply.

5. **Not implementing log sampling for high-volume services**: A service handling 100,000 requests per second generates 8.6 billion log entries per day if every request is logged. This overwhelms storage, increases costs, and makes searching slow. Implement head-based sampling: log 100% of errors and slow requests, 10% of successful requests at INFO level, and 1% at DEBUG level. Use deterministic sampling based on trace ID so all logs for a sampled request are captured together, enabling full request reconstruction for sampled traces.

6. **Creating Splunk alerts without proper throttling and deduplication**: Alerts that fire on every matching event generate hundreds of notifications during an incident, causing alert fatigue and burying the initial signal. Configure alert throttling (suppress duplicate alerts for 15 minutes after the first), use `| dedup` in alert searches to group related events, and implement tiered severity that escalates only when conditions persist beyond the initial detection window.

## Real-World Use Cases

- **Incident root cause analysis across microservices**: During a payment processing outage, the on-call engineer searches Splunk for the affected trace IDs from customer reports. The trace shows the request successfully passed through the API gateway and order service but timed out calling the payment provider. Correlating with infrastructure logs reveals a DNS resolution failure that started 3 minutes before the first customer impact. The DNS TTL was set to 5 minutes, and the payment provider rotated their IP addresses without updating DNS records within the TTL window. Resolution: reduce DNS TTL to 60 seconds and implement DNS caching with background refresh.

- **Compliance audit trail for financial transactions**: A banking application logs every state transition of financial transactions to a dedicated Splunk index with 7-year retention. Each log entry includes the transaction ID, actor (user or system), action performed, previous state, new state, timestamp, and source IP. Auditors query this index to verify that all transactions follow the required approval workflow, that no single actor can both initiate and approve a transaction, and that all modifications are traceable to an authenticated identity.

- **Proactive error detection with log-based alerting**: A Splunk scheduled search runs every 5 minutes, calculating the error rate per service compared to the same time window in the previous week. If any service's error rate exceeds 3x its historical baseline, an alert fires with context: the top error messages, affected endpoints, and a link to the pre-built investigation dashboard filtered to that service and time window. This catches gradual degradation that absolute threshold alerts miss.

- **Cost optimization through log volume analysis**: A platform team uses Splunk's license usage reports to identify services generating disproportionate log volume. Analysis reveals that a single service accounts for 40% of total log ingestion due to verbose request/response body logging at INFO level. After implementing structured logging with body content at DEBUG level only (sampled at 1%), total log volume drops by 35%, saving $200,000 annually in Splunk licensing costs.

## Interview Questions

**Q: How would you design a logging strategy for a microservices architecture with 50+ services?**

A: Establish organization-wide logging standards: JSON format with mandatory fields (timestamp, level, service, traceId, spanId, message), configurable log levels per service via centralized configuration, and consistent field naming conventions. Implement correlation ID propagation using OpenTelemetry context — every service extracts the trace ID from incoming requests and propagates it to all outbound calls. Deploy log collection agents (Fluent Bit for Kubernetes, CloudWatch agent for ECS) that forward to a centralized platform. Implement tiered retention: 7 days for DEBUG, 30 days for INFO, 90 days for ERROR, 7 years for audit logs. Use sampling for high-volume services (100% errors, 10% success). Create service-specific dashboards and shared investigation dashboards that accept trace ID as input.

**Q: Explain how you would investigate a latency spike using Splunk.**

A: Start by identifying the time window from metrics dashboards. In Splunk, search for requests exceeding the latency threshold during that window: `index=microservices processingTimeMs>2000 earliest=-1h | stats count, avg(processingTimeMs) by service`. This identifies which service is slow. Drill into that service: `index=microservices service="payment-service" earliest=-1h | timechart span=1m avg(processingTimeMs) by downstream_service`. This shows which downstream dependency introduced latency. Check for correlated events: `index=deployments OR index=infrastructure service="payment-service" earliest=-2h | sort _time`. Look for deployments, scaling events, or infrastructure changes. Finally, pick a specific slow trace and reconstruct it end-to-end: `index=microservices traceid="abc-123" | sort _time | table _time, service, message, processingTimeMs`.

**Q: What is the difference between CloudWatch Logs Insights and Splunk? When would you use each?**

A: CloudWatch Logs Insights is a serverless query engine built into AWS — zero infrastructure to manage, pay-per-query pricing, and native integration with CloudWatch metrics and alarms. It excels at quick operational queries on AWS-generated logs and application logs already in CloudWatch. Limitations: no real-time streaming, limited query language compared to SPL, no cross-account correlation without explicit setup. Splunk is an enterprise platform supporting any data source, offering real-time search, complex correlation across millions of events, machine learning analytics, and extensive visualization. Use CloudWatch Logs Insights for day-to-day operational queries, quick debugging, and AWS-native log analysis. Use Splunk for security analytics (SIEM), cross-platform correlation, compliance reporting, and complex investigations requiring SPL's full power (transactions, lookups, subsearches, statistical analysis).

**Q: How do you handle log volume and cost at scale?**

A: Implement a multi-layered approach. First, structured logging with appropriate levels — never log at DEBUG in production by default. Second, sampling: log 100% of errors and anomalies, sample successful requests at 1-10% depending on volume. Third, tiered storage: hot storage (7-30 days) for active investigation, warm storage (30-90 days) for historical queries, cold/frozen storage (1-7 years) for compliance. Fourth, log routing: send security-relevant logs to Splunk, operational logs to CloudWatch, and audit logs to immutable S3 storage. Fifth, field extraction optimization: use structured JSON to avoid expensive regex parsing at index time. Sixth, index design: separate indexes by retention requirement and access pattern. Monitor ingestion volume daily and alert when any service exceeds its expected baseline by 2x.

## Production Tips

- **Implement dynamic log level adjustment without redeployment**: Use a configuration service (AWS AppConfig, LaunchDarkly, or a custom solution) that services poll every 30 seconds for log level changes. During incidents, engineers can increase a specific service's log level to DEBUG for detailed investigation, then revert to INFO after resolution. This eliminates the deployment cycle for debugging and provides immediate visibility without the risk of forgetting to revert verbose logging.

- **Create pre-built investigation runbooks as saved Splunk searches**: For each service, create a set of saved searches that on-call engineers can execute immediately during incidents: "Show all errors in the last 15 minutes grouped by type", "Trace a specific request end-to-end", "Compare current error rate to same time last week", "Show recent deployments and configuration changes". Link these from PagerDuty alert descriptions so engineers start investigating within seconds of being paged rather than constructing queries from scratch under pressure.

- **Use log-based metrics for business observability without code changes**: Configure CloudWatch metric filters or Splunk scheduled searches to extract business metrics from existing log entries. Count log entries matching `"event": "order_completed"` to track order volume, extract `orderValueCents` fields to track revenue, and count `"event": "cart_abandoned"` for conversion analysis. This provides business dashboards without requiring application code changes or separate analytics instrumentation.

## Related Topics

- [CloudWatch and Metrics](./cloudwatch-and-metrics.md) — Metrics extracted from logs via Embedded Metric Format
- [Distributed Tracing](./distributed-tracing.md) — Trace context propagation that enables log correlation
- [Alerting and Incident Response](./alerting-and-incident-response.md) — Log-based alerting patterns and investigation workflows
- [Docker & Containerization](../docker/index.md) — Container logging drivers and log routing configuration
