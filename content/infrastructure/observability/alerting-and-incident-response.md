# Alerting and Incident Response

## Quick Reference

- Effective alerts are actionable (someone can do something about it), urgent (it needs attention now), and specific (the alert identifies the problem)
- Alert severity tiers: P1/Critical (customer-facing outage, page immediately), P2/High (degraded service, page during business hours), P3/Medium (potential issue, ticket), P4/Low (informational, dashboard only)
- On-call rotation best practices: 1-week rotations, maximum 2 pages per shift for sustainable operations, follow-the-sun for global teams
- Incident response phases: Detection → Triage → Mitigation → Resolution → Post-Incident Review
- Mean Time to Detect (MTTD) + Mean Time to Mitigate (MTTM) = Mean Time to Recovery (MTTR)
- Runbooks document step-by-step procedures for known failure modes, reducing MTTM by eliminating investigation time
- Post-incident reviews (blameless retrospectives) focus on systemic improvements, not individual fault
- Alert fatigue is the primary operational risk — teams that receive more than 5 actionable alerts per on-call shift begin ignoring them

## When to Use

Alerting and incident response practices apply to every production system that has users depending on its availability. You need structured alerting when your system has SLAs or SLOs that define acceptable performance levels, when multiple teams share on-call responsibility and need clear escalation paths, when incidents require coordinated response across teams (backend, infrastructure, database), and when regulatory requirements mandate documented incident response procedures and post-incident analysis.

Invest in incident response maturity when your organization experiences recurring incidents with the same root causes (indicating systemic issues not being addressed), when MTTR exceeds acceptable thresholds (indicating investigation and mitigation processes are inefficient), when on-call engineers report burnout from alert volume (indicating alert quality problems), and when post-incident reviews consistently identify the same categories of contributing factors (indicating organizational learning failures).

## Code Examples

### Alert Configuration with Tiered Severity (CDK)

```typescript
import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as chatbot from 'aws-cdk-lib/aws-chatbot';

export class AlertingStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Tiered notification channels
    const p1Topic = new sns.Topic(this, 'P1Critical', {
      topicName: 'alerts-p1-critical',
      displayName: 'Critical Alerts - Pages On-Call',
    });

    const p2Topic = new sns.Topic(this, 'P2High', {
      topicName: 'alerts-p2-high',
      displayName: 'High Alerts - Business Hours',
    });

    const p3Topic = new sns.Topic(this, 'P3Medium', {
      topicName: 'alerts-p3-medium',
      displayName: 'Medium Alerts - Ticket Creation',
    });

    // Slack integration for team visibility
    const slackChannel = new chatbot.SlackChannelConfiguration(this, 'AlertsSlack', {
      slackChannelConfigurationName: 'platform-alerts',
      slackWorkspaceId: 'T0123456789',
      slackChannelId: 'C0123456789',
      notificationTopics: [p1Topic, p2Topic],
    });

    // P1: Complete service outage - page immediately
    const serviceDownAlarm = new cloudwatch.Alarm(this, 'ServiceDown', {
      alarmName: 'P1-order-service-down',
      alarmDescription: 'Order service returning zero successful responses. RUNBOOK: https://wiki/runbooks/order-service-down',
      metric: new cloudwatch.Metric({
        namespace: 'OrderService/Production',
        metricName: 'SuccessfulResponses',
        statistic: 'Sum',
        period: cdk.Duration.minutes(1),
      }),
      threshold: 0,
      evaluationPeriods: 3,
      datapointsToAlarm: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.BREACHING,
    });
    serviceDownAlarm.addAlarmAction(new actions.SnsAction(p1Topic));

    // P2: High error rate - degraded but not down
    const highErrorRate = new cloudwatch.Alarm(this, 'HighErrorRate', {
      alarmName: 'P2-order-service-high-errors',
      alarmDescription: 'Error rate exceeds 5% for sustained period. RUNBOOK: https://wiki/runbooks/high-error-rate',
      metric: new cloudwatch.MathExpression({
        expression: '(errors / total) * 100',
        usingMetrics: {
          errors: new cloudwatch.Metric({
            namespace: 'OrderService/Production',
            metricName: 'Errors',
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
          total: new cloudwatch.Metric({
            namespace: 'OrderService/Production',
            metricName: 'TotalRequests',
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
        },
      }),
      threshold: 5,
      evaluationPeriods: 3,
      datapointsToAlarm: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    highErrorRate.addAlarmAction(new actions.SnsAction(p2Topic));

    // P3: Approaching capacity - needs attention but not urgent
    const highCpuAlarm = new cloudwatch.Alarm(this, 'HighCpu', {
      alarmName: 'P3-order-service-high-cpu',
      alarmDescription: 'CPU utilization approaching limits. Review scaling configuration.',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ECS',
        metricName: 'CPUUtilization',
        dimensionsMap: { ServiceName: 'order-service', ClusterName: 'production' },
        statistic: 'Average',
        period: cdk.Duration.minutes(10),
      }),
      threshold: 80,
      evaluationPeriods: 6, // 1 hour sustained
      datapointsToAlarm: 5,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    highCpuAlarm.addAlarmAction(new actions.SnsAction(p3Topic));

    // Composite alarm: only page for real outages, not transient issues
    const realOutage = new cloudwatch.CompositeAlarm(this, 'RealOutage', {
      compositeAlarmName: 'P1-order-service-confirmed-outage',
      alarmRule: cloudwatch.AlarmRule.allOf(
        cloudwatch.AlarmRule.fromAlarm(serviceDownAlarm, cloudwatch.AlarmState.ALARM),
        cloudwatch.AlarmRule.fromAlarm(highErrorRate, cloudwatch.AlarmState.ALARM)
      ),
    });
    realOutage.addAlarmAction(new actions.SnsAction(p1Topic));
  }
}
```

### Automated Incident Response with Systems Manager

```yaml
# SSM Automation Document for automated rollback
schemaVersion: '0.3'
description: 'Automated rollback of ECS service to previous task definition'
assumeRole: '{{AutomationAssumeRole}}'
parameters:
  ClusterName:
    type: String
    description: ECS cluster name
  ServiceName:
    type: String
    description: ECS service name
  AutomationAssumeRole:
    type: String
    description: IAM role for automation execution
  NotificationTopic:
    type: String
    description: SNS topic for notifications

mainSteps:
  - name: GetCurrentTaskDefinition
    action: aws:executeAwsApi
    inputs:
      Service: ecs
      Api: DescribeServices
      cluster: '{{ClusterName}}'
      services:
        - '{{ServiceName}}'
    outputs:
      - Name: CurrentTaskDef
        Selector: $.services[0].taskDefinition
        Type: String
      - Name: DesiredCount
        Selector: $.services[0].desiredCount
        Type: Integer

  - name: GetPreviousTaskDefinition
    action: aws:executeAwsApi
    inputs:
      Service: ecs
      Api: ListTaskDefinitions
      familyPrefix: '{{ServiceName}}'
      sort: DESC
      maxResults: 5
    outputs:
      - Name: PreviousTaskDef
        Selector: $.taskDefinitionArns[1]
        Type: String

  - name: NotifyRollbackStarting
    action: aws:executeAwsApi
    inputs:
      Service: sns
      Api: Publish
      TopicArn: '{{NotificationTopic}}'
      Subject: 'AUTOMATED ROLLBACK: {{ServiceName}}'
      Message: |
        Automated rollback initiated for {{ServiceName}} in {{ClusterName}}.
        Current task definition: {{GetCurrentTaskDefinition.CurrentTaskDef}}
        Rolling back to: {{GetPreviousTaskDefinition.PreviousTaskDef}}
        Reason: CloudWatch alarm triggered automated remediation.

  - name: UpdateService
    action: aws:executeAwsApi
    inputs:
      Service: ecs
      Api: UpdateService
      cluster: '{{ClusterName}}'
      service: '{{ServiceName}}'
      taskDefinition: '{{GetPreviousTaskDefinition.PreviousTaskDef}}'
      forceNewDeployment: true

  - name: WaitForStability
    action: aws:waitForAwsResourceProperty
    timeoutSeconds: 600
    inputs:
      Service: ecs
      Api: DescribeServices
      cluster: '{{ClusterName}}'
      services:
        - '{{ServiceName}}'
      PropertySelector: $.services[0].deployments[0].rolloutState
      DesiredValues:
        - COMPLETED

  - name: NotifyRollbackComplete
    action: aws:executeAwsApi
    inputs:
      Service: sns
      Api: Publish
      TopicArn: '{{NotificationTopic}}'
      Subject: 'ROLLBACK COMPLETE: {{ServiceName}}'
      Message: |
        Automated rollback completed successfully for {{ServiceName}}.
        Service is now running: {{GetPreviousTaskDefinition.PreviousTaskDef}}
        Please investigate the root cause and create a post-incident ticket.
```

### PagerDuty Integration for On-Call Management

```typescript
import { SNSEvent } from 'aws-lambda';

interface CloudWatchAlarmMessage {
  AlarmName: string;
  AlarmDescription?: string;
  NewStateValue: string;
  NewStateReason: string;
  StateChangeTime: string;
  Region?: string;
  AWSAccountId?: string;
  Trigger?: { MetricName?: string; Threshold?: number };
}

export const handler = async (event: SNSEvent): Promise<void> => {
  // Lambda function triggered by SNS from CloudWatch alarms.
  // Routes to PagerDuty with enriched context for faster incident response.
  for (const record of event.Records) {
    const message: CloudWatchAlarmMessage = JSON.parse(record.Sns.Message);
    const { AlarmName: alarmName, NewStateValue: newState, NewStateReason: reason } = message;
    const alarmDescription = message.AlarmDescription ?? '';
    const timestamp = message.StateChangeTime;

    // Determine severity from alarm name prefix
    let severity: string;
    let urgency: string;
    if (alarmName.startsWith('P1-')) {
      severity = 'critical'; urgency = 'high';
    } else if (alarmName.startsWith('P2-')) {
      severity = 'error'; urgency = 'high';
    } else if (alarmName.startsWith('P3-')) {
      severity = 'warning'; urgency = 'low';
    } else {
      severity = 'info'; urgency = 'low';
    }

    // Extract runbook URL from alarm description
    let runbookUrl: string | null = null;
    if (alarmDescription.includes('RUNBOOK:')) {
      runbookUrl = alarmDescription.split('RUNBOOK:')[1].trim();
    }

    // Build PagerDuty event
    const pdEvent: Record<string, any> = {
      routing_key: getRoutingKey(alarmName),
      event_action: newState === 'ALARM' ? 'trigger' : 'resolve',
      dedup_key: alarmName,
      payload: {
        summary: `[${severity.toUpperCase()}] ${alarmName}: ${reason.slice(0, 200)}`,
        severity,
        source: 'aws-cloudwatch',
        timestamp,
        component: extractServiceName(alarmName),
        group: 'production',
        custom_details: {
          alarm_name: alarmName,
          alarm_description: alarmDescription,
          state_reason: reason,
          region: message.Region ?? 'us-east-1',
          account_id: message.AWSAccountId ?? '',
          metric_name: message.Trigger?.MetricName ?? '',
          threshold: message.Trigger?.Threshold ?? '',
        },
      },
      links: [] as { href: string; text: string }[],
    };

    // Add runbook link if available
    if (runbookUrl) {
      pdEvent.links.push({
        href: runbookUrl,
        text: 'Runbook: Step-by-step remediation guide',
      });
    }

    // Add CloudWatch console link
    pdEvent.links.push({
      href: `https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#alarmsV2:alarm/${alarmName}`,
      text: 'CloudWatch Alarm Console',
    });

    // Send to PagerDuty Events API v2
    const response = await fetch('https://events.pagerduty.com/v2/enqueue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pdEvent),
    });

    console.log(JSON.stringify({
      level: 'INFO',
      message: 'PagerDuty event sent',
      alarm: alarmName,
      severity,
      action: pdEvent.event_action,
      pd_response_status: response.status,
    }));
  }
};
```

## Common Pitfalls

1. **Alert fatigue from excessive non-actionable alerts**: Teams receiving more than 5 actionable pages per on-call shift begin ignoring alerts, leading to missed real incidents. Every alert must have a clear action the on-call engineer can take. If the response to an alert is "wait and see if it resolves," it should not page — make it a dashboard metric or a low-priority ticket. Regularly audit alert volume: if an alert fires more than once per week without requiring action, either fix the underlying issue or reduce the alert to informational severity.

2. **Missing runbooks for known failure modes**: When an alert fires at 3 AM, the on-call engineer should not need to figure out the investigation and remediation steps from scratch. Every P1 and P2 alert should link to a runbook documenting: what the alert means, how to verify the issue, immediate mitigation steps, escalation criteria, and root cause investigation guidance. Runbooks reduce MTTM from hours to minutes for known failure modes and enable less experienced engineers to handle incidents confidently.

3. **Not implementing alert deduplication and correlation**: During a major incident, dozens of alarms fire simultaneously as cascading failures propagate through the system. Without deduplication, the on-call engineer receives 50 pages in 5 minutes, each requiring individual acknowledgment. Implement composite alarms that represent the actual failure (not symptoms), use PagerDuty's alert grouping to consolidate related alerts into a single incident, and suppress downstream alerts when an upstream dependency is known to be failing.

4. **Conducting blame-focused post-incident reviews**: Post-incident reviews that focus on "who made the mistake" create a culture where engineers hide errors, avoid taking risks, and do not report near-misses. Blameless retrospectives focus on systemic factors: what made the error possible, what safeguards failed to prevent it, and what changes to systems, processes, or tooling would prevent recurrence. The goal is organizational learning, not individual punishment. Document contributing factors, not root causes (complex systems rarely have a single root cause).

5. **Setting SLOs without error budgets or consequences**: Defining SLOs (99.9% availability) without tracking error budget consumption or defining what happens when the budget is exhausted makes SLOs meaningless aspirations rather than operational tools. Track error budget burn rate in real-time. When the budget is consumed: freeze feature deployments, redirect engineering effort to reliability improvements, and require additional review for any production changes. This creates organizational alignment between feature velocity and reliability investment.

6. **Not testing incident response procedures regularly**: Incident response plans that are never practiced fail when needed. Engineers forget procedures, runbooks become outdated, escalation contacts change, and automation scripts break silently. Conduct regular game days (chaos engineering exercises) that simulate realistic failures and require the team to follow incident response procedures. Identify gaps in runbooks, communication channels, and tooling during controlled exercises rather than during real incidents.

## Real-World Use Cases

- **Automated rollback preventing extended outage**: A deployment introduces a memory leak that causes gradual degradation over 20 minutes. CloudWatch detects memory utilization exceeding 90% sustained for 10 minutes and error rate climbing above 5%. The composite alarm triggers an SSM automation document that rolls back to the previous ECS task definition, notifies the team, and creates a Jira ticket. Total customer impact: 12 minutes of degraded performance instead of a potential 2-hour outage requiring manual intervention.

- **Tiered alerting reducing on-call burnout**: A platform team receiving 30+ pages per week implements tiered alerting. P1 alerts (complete outage) page immediately — these occur 1-2 times per month. P2 alerts (degraded service) page during business hours only — these occur 3-5 times per week. P3 alerts (approaching limits) create tickets — these occur daily. After implementation, on-call engineers receive 2-3 pages per shift instead of 30+, response quality improves because engineers are not fatigued, and MTTM decreases by 40% because engineers can focus on real issues.

- **Blameless post-incident review driving systemic improvement**: A database failover causes 45 minutes of downtime. The post-incident review identifies contributing factors: the failover procedure was documented but never tested, the monitoring did not detect the primary's degradation before failure, and the application did not handle read-replica promotion gracefully. Action items: quarterly failover drills, enhanced database health monitoring, and connection pool configuration that handles endpoint changes. No individual is blamed; the system is improved.

- **Error budget-driven development prioritization**: A team's SLO is 99.95% availability (21.9 minutes of downtime per month). After two incidents consuming 15 minutes of budget in the first week, the engineering manager pauses feature work and redirects the team to address the reliability issues identified in post-incident reviews. The team implements circuit breakers, improves health check accuracy, and adds integration tests for failure scenarios. The next month has zero incidents, and feature work resumes with confidence.

## Interview Questions

**Q: How would you design an alerting strategy for a microservices platform with 50+ services?**

A: Implement a layered approach. First, define SLOs for each service based on business criticality (payment service: 99.99%, recommendation service: 99.9%). Second, create symptom-based alerts that detect user-facing impact (error rate, latency percentiles) rather than cause-based alerts (CPU usage, memory). Third, implement tiered severity: P1 pages for complete outage of critical services, P2 for degraded performance, P3 for capacity warnings. Fourth, use composite alarms that combine multiple signals to reduce false positives (high errors AND sufficient traffic AND not during maintenance). Fifth, require every alert to link to a runbook. Sixth, implement alert routing based on service ownership — each team owns their service's alerts. Seventh, track alert quality metrics: pages per shift, false positive rate, time-to-acknowledge, and regularly retire noisy alerts.

**Q: Explain the incident response lifecycle and the role of each phase.**

A: Detection: automated monitoring identifies an anomaly (alert fires, customer reports issue, synthetic monitor fails). The goal is minimizing MTTD through comprehensive monitoring and appropriate alert thresholds. Triage: the on-call engineer assesses severity, determines customer impact, and decides whether to escalate. This should take under 5 minutes using pre-defined severity criteria. Mitigation: take immediate action to reduce customer impact — rollback, failover, scale up, enable feature flag, or redirect traffic. Mitigation prioritizes speed over elegance; the goal is stopping the bleeding, not fixing the root cause. Resolution: after mitigation stabilizes the system, investigate and fix the underlying issue. This may happen hours or days later. Post-Incident Review: within 48 hours, conduct a blameless retrospective documenting the timeline, contributing factors, what went well, what could improve, and action items with owners and deadlines. The review drives systemic improvements that prevent recurrence.

**Q: What makes a good runbook and how do you keep them maintained?**

A: A good runbook contains: trigger conditions (what alert or symptom leads here), verification steps (how to confirm the issue is real), immediate mitigation actions (step-by-step commands with expected output), escalation criteria (when to involve other teams), root cause investigation guidance (where to look, what queries to run), and recovery verification (how to confirm the issue is resolved). Keep runbooks maintained by: linking them directly from alert descriptions (engineers update them during incidents when steps are wrong), requiring runbook updates as post-incident review action items, conducting quarterly runbook reviews where the team walks through each one, and tracking runbook usage metrics (which runbooks are accessed during incidents, which are never used). Delete runbooks for alerts that no longer exist and create new ones for every new P1/P2 alert.

**Q: How do you measure and improve incident response effectiveness?**

A: Track key metrics: MTTD (time from issue start to detection), MTTA (time from alert to acknowledgment), MTTM (time from acknowledgment to mitigation), MTTR (total time from issue start to resolution), and incident frequency by severity. Improve MTTD by expanding monitoring coverage and reducing alert thresholds for critical paths. Improve MTTA by optimizing on-call routing and reducing alert noise (fewer false positives means faster response to real issues). Improve MTTM by maintaining current runbooks, implementing automated remediation for known failure modes, and conducting regular incident response drills. Track these metrics over time, set improvement targets, and review progress quarterly. Also measure leading indicators: alert noise ratio (actionable vs total alerts), runbook coverage (percentage of P1/P2 alerts with runbooks), and post-incident action item completion rate.

## Production Tips

- **Implement automated alert suppression during planned maintenance windows**: Create a maintenance mode mechanism that suppresses non-critical alerts during planned changes (deployments, database migrations, infrastructure updates). Use a CloudWatch metric or feature flag that composite alarms check before firing. This prevents alert storms during expected disruptions while keeping critical safety alerts (data loss, security breach) active. Automatically exit maintenance mode after a timeout to prevent accidental permanent suppression.

- **Track and publish on-call health metrics to leadership**: Measure pages per shift, false positive rate, time-to-acknowledge, and engineer satisfaction scores. Publish these monthly to engineering leadership. When metrics degrade (pages per shift increasing, satisfaction decreasing), it creates organizational pressure to invest in reliability improvements, alert quality, and automation. Without visibility, on-call burden is invisible to decision-makers and never gets prioritized against feature work.

- **Implement progressive alert escalation rather than immediate paging**: For non-critical alerts, implement a progressive escalation chain: first notify Slack (5-minute window for team response), then page the primary on-call (10-minute window), then page the secondary, then page the engineering manager. This gives the team opportunity to respond during working hours without paging, while ensuring critical issues always reach someone. Configure PagerDuty escalation policies to match this progression.

## Related Topics

- [CloudWatch and Metrics](./cloudwatch-and-metrics.md) — Metric-based alarms that trigger incident response
- [Log Aggregation and Analysis](./log-aggregation-and-analysis.md) — Log-based investigation during incidents
- [Distributed Tracing](./distributed-tracing.md) — Trace-driven root cause analysis
- [Kubernetes & EKS](../kubernetes/index.md) — Pod health monitoring and automated remediation in Kubernetes
