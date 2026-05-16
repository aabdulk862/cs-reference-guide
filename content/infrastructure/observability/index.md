# Observability

Observability is the discipline of understanding a system's internal state from its external outputs — metrics, logs, and traces. For distributed systems composed of dozens or hundreds of microservices, observability is not optional but rather the foundation that enables teams to detect anomalies before they become outages, diagnose root causes during incidents, and make data-driven decisions about capacity and performance. The three pillars (metrics for alerting, logs for debugging, traces for understanding request flow) provide complementary views that together give complete visibility into system behavior.

This section covers the observability tools and practices most critical to production engineering: CloudWatch for AWS-native monitoring, Splunk for enterprise log analysis, distributed tracing for microservice architectures, and vulnerability scanning for security observability. Each subtopic provides production-oriented guidance with real-world patterns that go beyond basic setup tutorials.

## Learning Path

1. [CloudWatch and Metrics](./cloudwatch-and-metrics.md) — AWS-native monitoring, custom metrics, alarms, dashboards, and automated remediation
2. [Log Aggregation and Analysis](./log-aggregation-and-analysis.md) — Structured logging, Splunk SPL, CloudWatch Logs Insights, and incident investigation
3. [Distributed Tracing](./distributed-tracing.md) — Request flow visualization, trace propagation, sampling strategies, and performance analysis
4. [Alerting and Incident Response](./alerting-and-incident-response.md) — Alert design, on-call practices, runbooks, and post-incident review

## Related Topics

- [AWS Services](../aws/index.md) — CloudWatch integrates with all AWS services for native metric collection
- [Kubernetes & EKS](../kubernetes/index.md) — Container orchestration observability for pod health and cluster metrics
- [Docker & Containerization](../docker/index.md) — Container logging drivers and runtime monitoring
