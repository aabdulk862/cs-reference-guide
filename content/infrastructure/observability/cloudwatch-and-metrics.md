# CloudWatch and Metrics

## Quick Reference

- CloudWatch collects metrics from 70+ AWS services automatically at 1-minute resolution; custom metrics support 1-second high-resolution
- Metrics are identified by namespace, metric name, and dimensions (key-value pairs that segment data)
- Alarms evaluate metrics against thresholds over configurable evaluation periods and trigger SNS, Auto Scaling, or Systems Manager actions
- Composite alarms combine multiple alarm states with AND/OR logic to reduce false positives
- CloudWatch Anomaly Detection uses machine learning to establish baselines and alert on deviations from expected patterns
- Embedded Metric Format (EMF) allows applications to emit structured logs that CloudWatch automatically extracts as custom metrics
- Contributor Insights identifies top-N contributors to a metric pattern from log data without pre-defined dimensions
- Metric Math enables derived metrics (error rates, percentiles, ratios) calculated from existing metrics without additional data points

## When to Use

CloudWatch is the foundational monitoring service for any AWS workload. Use CloudWatch metrics and alarms when you need automated alerting on infrastructure health (CPU, memory, disk, network), application performance (latency percentiles, error rates, throughput), and business metrics (order counts, payment success rates, user signups). CloudWatch is the right choice when you want native integration with AWS services without deploying additional monitoring infrastructure, when you need alarms that trigger automated remediation (scaling, instance replacement, runbook execution), and when you want a single pane of glass for infrastructure and application metrics.

Use custom metrics when AWS-provided metrics do not capture application-specific behavior. Publish business metrics (revenue per minute, cart abandonment rate) alongside infrastructure metrics to correlate business impact with technical issues. Use Embedded Metric Format when you want metrics extracted from application logs without separate PutMetricData API calls, reducing code complexity and enabling high-cardinality dimensions that would be cost-prohibitive with standard custom metrics.

## Code Examples

### Custom Metrics with Embedded Metric Format

```typescript
import { MetricUnit, createMetricsLogger } from 'aws-embedded-metrics';

// Using aws-embedded-metrics library for structured metric emission
export async function processOrder(order: Order): Promise<OrderResult> {
  const metrics = createMetricsLogger();
  metrics.setNamespace('OrderService/Production');
  metrics.setDimensions(
    { ServiceName: 'order-processor', Environment: 'production' },
    { ServiceName: 'order-processor' } // Additional dimension set for aggregation
  );

  const startTime = Date.now();

  try {
    const result = await executeOrderProcessing(order);

    // Emit success metrics
    const duration = Date.now() - startTime;
    metrics.putMetric('ProcessingLatencyMs', duration, MetricUnit.Milliseconds);
    metrics.putMetric('OrdersProcessed', 1, MetricUnit.Count);
    metrics.putMetric('OrderValueCents', order.totalCents, MetricUnit.Count);

    // High-cardinality properties (not dimensions, no cost per unique value)
    metrics.setProperty('orderId', order.id);
    metrics.setProperty('customerId', order.customerId);
    metrics.setProperty('itemCount', order.items.length);

    await metrics.flush();
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    metrics.putMetric('ProcessingLatencyMs', duration, MetricUnit.Milliseconds);
    metrics.putMetric('ProcessingErrors', 1, MetricUnit.Count);
    metrics.setProperty('errorType', error.constructor.name);
    metrics.setProperty('errorMessage', error.message);

    await metrics.flush();
    throw error;
  }
}
```

### CloudWatch Alarms with Composite Logic (CDK)

```typescript
import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';

export class MonitoringStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const oncallTopic = new sns.Topic(this, 'OncallTopic', {
      topicName: 'oncall-alerts',
    });

    // High error rate alarm
    const errorRateAlarm = new cloudwatch.Alarm(this, 'HighErrorRate', {
      alarmName: 'order-service-high-error-rate',
      metric: new cloudwatch.MathExpression({
        expression: '(errors / requests) * 100',
        usingMetrics: {
          errors: new cloudwatch.Metric({
            namespace: 'OrderService/Production',
            metricName: 'ProcessingErrors',
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
          requests: new cloudwatch.Metric({
            namespace: 'OrderService/Production',
            metricName: 'OrdersProcessed',
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
        },
      }),
      threshold: 5, // 5% error rate
      evaluationPeriods: 3,
      datapointsToAlarm: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });

    // High latency alarm using anomaly detection
    const latencyAnomaly = new cloudwatch.CfnAnomalyDetector(this, 'LatencyAnomaly', {
      namespace: 'OrderService/Production',
      metricName: 'ProcessingLatencyMs',
      stat: 'p99',
    });

    // Minimum traffic alarm (ensures we only alert during active periods)
    const sufficientTraffic = new cloudwatch.Alarm(this, 'SufficientTraffic', {
      alarmName: 'order-service-sufficient-traffic',
      metric: new cloudwatch.Metric({
        namespace: 'OrderService/Production',
        metricName: 'OrdersProcessed',
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 10, // At least 10 requests per 5 minutes
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.BREACHING,
    });

    // Composite alarm: only page when error rate is high AND traffic is sufficient
    const compositeAlarm = new cloudwatch.CompositeAlarm(this, 'OrderServiceCritical', {
      compositeAlarmName: 'order-service-critical',
      alarmRule: cloudwatch.AlarmRule.allOf(
        cloudwatch.AlarmRule.fromAlarm(errorRateAlarm, cloudwatch.AlarmState.ALARM),
        cloudwatch.AlarmRule.fromAlarm(sufficientTraffic, cloudwatch.AlarmState.ALARM)
      ),
    });

    compositeAlarm.addAlarmAction(new actions.SnsAction(oncallTopic));
  }
}
```

### CloudWatch Dashboard with Metric Math

```typescript
// Operational dashboard combining infrastructure and business metrics
const dashboard = new cloudwatch.Dashboard(this, 'OrderServiceDashboard', {
  dashboardName: 'order-service-operations',
  periodOverride: cloudwatch.PeriodOverride.AUTO,
});

dashboard.addWidgets(
  // Row 1: Key business metrics
  new cloudwatch.GraphWidget({
    title: 'Orders Per Minute',
    left: [new cloudwatch.Metric({
      namespace: 'OrderService/Production',
      metricName: 'OrdersProcessed',
      statistic: 'Sum',
      period: cdk.Duration.minutes(1),
    })],
    width: 8,
  }),
  new cloudwatch.SingleValueWidget({
    title: 'Error Rate (5m)',
    metrics: [new cloudwatch.MathExpression({
      expression: '(errors / (errors + success)) * 100',
      usingMetrics: {
        errors: new cloudwatch.Metric({
          namespace: 'OrderService/Production',
          metricName: 'ProcessingErrors',
          statistic: 'Sum',
          period: cdk.Duration.minutes(5),
        }),
        success: new cloudwatch.Metric({
          namespace: 'OrderService/Production',
          metricName: 'OrdersProcessed',
          statistic: 'Sum',
          period: cdk.Duration.minutes(5),
        }),
      },
      label: 'Error %',
    })],
    width: 8,
  }),
  new cloudwatch.GraphWidget({
    title: 'Latency Percentiles',
    left: [
      new cloudwatch.Metric({
        namespace: 'OrderService/Production',
        metricName: 'ProcessingLatencyMs',
        statistic: 'p50',
        label: 'p50',
      }),
      new cloudwatch.Metric({
        namespace: 'OrderService/Production',
        metricName: 'ProcessingLatencyMs',
        statistic: 'p95',
        label: 'p95',
      }),
      new cloudwatch.Metric({
        namespace: 'OrderService/Production',
        metricName: 'ProcessingLatencyMs',
        statistic: 'p99',
        label: 'p99',
      }),
    ],
    width: 8,
  })
);
```

## Common Pitfalls

1. **Setting static thresholds on metrics with natural variability**: Traffic-dependent metrics like request count, latency, and error count vary by time of day and day of week. A static threshold that works during peak hours generates false alarms during off-peak, and one set for off-peak misses real issues during peak. Use CloudWatch Anomaly Detection which builds a model of expected behavior accounting for daily and weekly patterns, alerting only on statistically significant deviations from the learned baseline.

2. **Creating alarms without sufficient evaluation periods**: Single-period alarms trigger on transient spikes that resolve immediately — a single garbage collection pause, a brief network hiccup, or a momentary load spike. Require multiple consecutive breaching datapoints (e.g., 3 of 5 periods) before transitioning to ALARM state. This filters noise while still detecting sustained issues within minutes. Use `datapointsToAlarm` less than `evaluationPeriods` for M-of-N evaluation that tolerates intermittent recovery.

3. **Publishing high-cardinality dimensions as custom metrics**: Each unique dimension combination creates a separate metric stream billed at $0.30/month. Publishing a metric with dimensions like `customerId` or `requestId` creates millions of metric streams with astronomical costs. Use Embedded Metric Format properties (not dimensions) for high-cardinality data — properties are searchable in CloudWatch Logs Insights but do not create metric streams. Reserve dimensions for low-cardinality values like `environment`, `service`, and `region`.

4. **Ignoring the TreatMissingData configuration on alarms**: By default, missing data points are treated as `MISSING`, which can leave alarms in `INSUFFICIENT_DATA` state indefinitely. For most operational alarms, set `TreatMissingData.NOT_BREACHING` so the alarm returns to OK when data stops (indicating the service is not running or the metric is not being published). For availability alarms where missing data indicates a problem, use `TreatMissingData.BREACHING` to trigger the alarm when metrics stop arriving.

5. **Not using Metric Math for derived metrics**: Teams often publish separate custom metrics for values that could be calculated from existing metrics. Error rate (errors/total), availability (1 - error_rate), and cache hit ratio (hits/(hits+misses)) should be Metric Math expressions, not additional PutMetricData calls. Metric Math is free, reduces code complexity, and ensures derived metrics are always consistent with their source metrics.

## Real-World Use Cases

- **Auto-scaling based on business metrics**: An e-commerce platform publishes order queue depth as a custom CloudWatch metric. A target tracking scaling policy maintains queue depth below 100 by adding ECS tasks when the metric rises. During flash sales, the service scales from 5 to 200 tasks within 3 minutes based on queue depth, processes the surge, and scales back down as the queue drains. Business metrics drive scaling more accurately than CPU utilization because they directly reflect actual demand.

- **Proactive capacity planning with metric trends**: A platform team uses CloudWatch Metric Math to calculate week-over-week growth rates for CPU utilization, memory usage, and request volume across all services. Alarms trigger when any service's 7-day average exceeds 60% of its resource allocation, giving the team 2-3 weeks to scale before saturation. Monthly reports generated from CloudWatch metrics inform budget requests and capacity reservations.

- **Automated incident detection and remediation**: A composite alarm detects when error rate exceeds 5% AND latency p99 exceeds 2 seconds AND the deployment pipeline ran within the last 30 minutes. This combination strongly indicates a bad deployment. The alarm triggers a Systems Manager automation document that initiates an ECS service rollback to the previous task definition, sends a notification to the team, and creates a Jira ticket for post-incident review — all without human intervention.

- **Cost anomaly detection with custom metrics**: A fintech company publishes AWS cost metrics (from Cost Explorer API) as custom CloudWatch metrics broken down by service and team. Anomaly detection alarms trigger when daily spend deviates more than 2 standard deviations from the expected pattern. This caught a misconfigured auto-scaling policy that was launching expensive GPU instances unnecessarily, saving $50,000 before the monthly bill arrived.

## Interview Questions

**Q: How would you design a CloudWatch alarm to minimize false positives while still detecting real issues quickly?**

A: Use composite alarms that combine multiple signals. A single metric breaching a threshold is often noise, but multiple correlated metrics breaching simultaneously strongly indicates a real problem. For example, combine high error rate with high latency and sufficient traffic volume — this eliminates false alarms during low-traffic periods and transient single-request failures. Use M-of-N evaluation (e.g., 3 of 5 datapoints breaching) to filter transient spikes. Set `TreatMissingData` to `NOT_BREACHING` to avoid alarms during maintenance windows. For metrics with natural variability, use Anomaly Detection instead of static thresholds. Finally, implement alarm suppression during known maintenance windows using composite alarm rules that include a maintenance-mode metric.

**Q: Explain the difference between CloudWatch metrics dimensions and Embedded Metric Format properties. When would you use each?**

A: Dimensions are indexed attributes that create unique metric streams — each unique combination of dimension values is a separate billable metric ($0.30/month). They are ideal for low-cardinality segmentation: environment (prod/staging), service name, region, instance type. Properties in EMF are metadata attached to log entries that are searchable via CloudWatch Logs Insights but do not create metric streams. Use properties for high-cardinality data: customer IDs, request IDs, order numbers, IP addresses. This gives you the ability to filter and aggregate by these values during investigation without the cost of millions of metric streams. The rule of thumb: if the attribute has fewer than 100 unique values, it can be a dimension; if it has thousands or millions, make it a property.

**Q: How does CloudWatch Anomaly Detection work and when would you prefer it over static thresholds?**

A: Anomaly Detection uses machine learning to analyze 2 weeks of historical metric data and build a model of expected behavior, accounting for hourly, daily, and weekly patterns. It creates a band (configurable width via standard deviations) around the expected value, and alarms trigger when the metric falls outside this band. Prefer it over static thresholds for metrics with natural variability: request count (varies by time of day), latency (varies by traffic volume), and error count (proportional to traffic). Static thresholds work better for metrics with clear operational limits: disk utilization (alert at 80%), memory usage (alert at 90%), or queue age (alert if messages are older than 5 minutes). Anomaly Detection requires sufficient historical data and may produce false positives during unusual but legitimate events (product launches, marketing campaigns).

**Q: What is the Embedded Metric Format and how does it reduce operational complexity?**

A: EMF is a JSON specification that allows applications to emit structured log entries containing metric definitions. CloudWatch automatically extracts metrics from these log entries without requiring separate PutMetricData API calls. The application writes a single JSON log line containing both the metric values and contextual properties. Benefits: eliminates the need for a metrics SDK or separate metric publishing code path, enables high-cardinality properties without cost explosion, provides automatic correlation between metrics and the log entries that generated them, and reduces latency since metrics are extracted asynchronously from logs rather than requiring synchronous API calls. The tradeoff is slightly higher log ingestion costs and a small delay (typically under 1 minute) before metrics appear in CloudWatch compared to direct PutMetricData.

## Production Tips

- **Use CloudWatch Contributor Insights for high-cardinality debugging without pre-defined dimensions**: When you need to identify which specific customer, API endpoint, or error type is causing elevated metrics, Contributor Insights analyzes CloudWatch Logs to surface the top contributors to a pattern. Create a rule that identifies the top 10 customers by error count, or the top 5 API endpoints by latency. This provides the investigative power of high-cardinality dimensions without the cost of publishing them as metrics.

- **Implement metric-based canary deployments using CloudWatch alarms as deployment gates**: Configure CodeDeploy or your deployment pipeline to monitor CloudWatch alarms during canary phases. Publish deployment-specific metrics (tagged with deployment ID) and create alarms that compare the canary's error rate and latency against the baseline. If the canary alarm triggers within the evaluation window, automatically roll back. This provides data-driven deployment safety without manual monitoring during every release.

- **Set up cross-account CloudWatch observability for centralized monitoring**: Use CloudWatch cross-account observability to aggregate metrics from all AWS accounts into a central monitoring account. This enables a single dashboard showing the health of all environments, composite alarms that correlate issues across accounts, and centralized on-call alerting without requiring access to individual workload accounts. Configure source accounts to share specific metric namespaces with the monitoring account using organization-level sharing.

## Related Topics

- [Log Aggregation and Analysis](./log-aggregation-and-analysis.md) — Structured logging that feeds CloudWatch metrics via EMF
- [Alerting and Incident Response](./alerting-and-incident-response.md) — Alarm design patterns and on-call practices
- [AWS Services](../aws/index.md) — CloudWatch integration with compute, storage, and networking services
- [Kubernetes & EKS](../kubernetes/index.md) — Container Insights for EKS cluster monitoring
