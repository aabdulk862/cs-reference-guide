# Cloud Architecture Patterns

## Quick Reference

- AWS Well-Architected Framework has 6 pillars: Operational Excellence, Security, Reliability, Performance Efficiency, Cost Optimization, Sustainability
- RTO (Recovery Time Objective) defines maximum acceptable downtime; RPO (Recovery Point Objective) defines maximum acceptable data loss
- Multi-region active-active adds 2-3x infrastructure cost but provides sub-minute failover with near-zero data loss
- Reserved Instances save 30-72% over On-Demand; Savings Plans offer similar discounts with more flexibility across instance families
- The "blast radius" principle: isolate failure domains so a single component failure cannot cascade to the entire system
- Auto Scaling responds to demand in 1-3 minutes; predictive scaling uses ML to pre-provision capacity 5 minutes before anticipated load
- S3 Cross-Region Replication provides 15-minute RPO for object storage; DynamoDB Global Tables offer sub-second replication
- Cost allocation tags enable per-team, per-service, and per-environment cost attribution — enforce via SCP tag policies

## When to Use

Cloud architecture patterns apply whenever you are designing systems that must operate reliably at scale in production. Multi-region architecture is necessary when your SLA requires 99.99%+ availability (single-region AWS provides 99.99% for most services, but correlated failures during regional outages can violate this), when regulatory requirements mandate data residency with failover capabilities, or when you serve a global user base requiring sub-100ms latency. Disaster recovery planning is essential for any system where data loss or extended downtime has material business impact — financial transactions, healthcare records, e-commerce during peak seasons. Cost optimization patterns matter from day one but become critical as cloud spend exceeds $50K/month, where even 10% savings represents meaningful budget recovery. The Well-Architected Framework review should be conducted quarterly for production workloads and before any major architectural change, using it as a structured checklist rather than aspirational guidance.

## Code Examples

### Multi-Region Active-Passive with Route 53 Failover

```hcl
# Terraform: Multi-region infrastructure with automated failover
provider "aws" {
  alias  = "primary"
  region = "us-east-1"
}

provider "aws" {
  alias  = "secondary"
  region = "us-west-2"
}

# Primary region ALB
resource "aws_lb" "primary" {
  provider           = aws.primary
  name               = "api-primary"
  internal           = false
  load_balancer_type = "application"
  subnets            = module.vpc_primary.public_subnet_ids
}

# Secondary region ALB (warm standby)
resource "aws_lb" "secondary" {
  provider           = aws.secondary
  name               = "api-secondary"
  internal           = false
  load_balancer_type = "application"
  subnets            = module.vpc_secondary.public_subnet_ids
}

# Route 53 health check on primary
resource "aws_route53_health_check" "primary" {
  fqdn              = aws_lb.primary.dns_name
  port              = 443
  type              = "HTTPS"
  resource_path     = "/health"
  failure_threshold = 3
  request_interval  = 10

  tags = {
    Name = "primary-health-check"
  }
}

# DNS failover routing
resource "aws_route53_record" "api_primary" {
  zone_id = var.hosted_zone_id
  name    = "api.example.com"
  type    = "A"

  alias {
    name                   = aws_lb.primary.dns_name
    zone_id                = aws_lb.primary.zone_id
    evaluate_target_health = true
  }

  failover_routing_policy {
    type = "PRIMARY"
  }

  health_check_id = aws_route53_health_check.primary.id
  set_identifier  = "primary"
}

resource "aws_route53_record" "api_secondary" {
  zone_id = var.hosted_zone_id
  name    = "api.example.com"
  type    = "A"

  alias {
    name                   = aws_lb.secondary.dns_name
    zone_id                = aws_lb.secondary.zone_id
    evaluate_target_health = true
  }

  failover_routing_policy {
    type = "SECONDARY"
  }

  set_identifier = "secondary"
}

# RDS Cross-Region Read Replica for DR
resource "aws_db_instance" "replica" {
  provider               = aws.secondary
  replicate_source_db    = aws_db_instance.primary.arn
  instance_class         = "db.r6g.large"
  storage_encrypted      = true
  multi_az               = true
  backup_retention_period = 7

  tags = {
    Name = "api-db-dr-replica"
    Role = "disaster-recovery"
  }
}
```

### Cost Optimization: Spot Fleet with Fallback

```typescript
import {
  EC2Client,
  RequestSpotFleetCommand,
  RequestSpotFleetCommandInput
} from '@aws-sdk/client-ec2';
import {
  CostExplorerClient,
  GetAnomaliesCommand
} from '@aws-sdk/client-cost-explorer';

const ec2 = new EC2Client({ region: 'us-east-1' });

async function createCostOptimizedFleet(
  desiredCapacity: number,
  instanceTypes: string[],
  subnetIds: string[]
): Promise<void> {
  // Create a Spot Fleet with On-Demand fallback for cost optimization
  const launchTemplateConfigs = instanceTypes.flatMap(instanceType =>
    subnetIds.map(subnetId => ({
      LaunchTemplateSpecification: {
        LaunchTemplateId: 'lt-0123456789abcdef0',
        Version: '$Latest'
      },
      Overrides: [{
        InstanceType: instanceType,
        SubnetId: subnetId,
        WeightedCapacity: 1.0
      }]
    }))
  );

  await ec2.send(new RequestSpotFleetCommand({
    SpotFleetRequestConfig: {
      IamFleetRole: 'arn:aws:iam::123456789:role/spot-fleet-role',
      TargetCapacity: desiredCapacity,
      OnDemandTargetCapacity: Math.max(2, Math.floor(desiredCapacity / 5)), // 20% On-Demand baseline
      SpotPrice: '0.50',
      AllocationStrategy: 'capacityOptimized', // Lowest interruption probability
      LaunchTemplateConfigs: launchTemplateConfigs,
      InstanceInterruptionBehavior: 'terminate',
      ReplaceUnhealthyInstances: true,
      TerminateInstancesWithExpiration: true,
      Type: 'maintain',
      ExcessCapacityTerminationPolicy: 'default',
      OnDemandAllocationStrategy: 'lowestPrice',
      TagSpecifications: [{
        ResourceType: 'instance',
        Tags: [
          { Key: 'Fleet', Value: 'cost-optimized' },
          { Key: 'CostCenter', Value: 'engineering' }
        ]
      }]
    }
  }));
}

async function getCostAnomalies(daysBack: number = 7) {
  // Detect cost anomalies using Cost Explorer
  const ce = new CostExplorerClient({ region: 'us-east-1' });

  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - daysBack * 86400000).toISOString().split('T')[0];

  const response = await ce.send(new GetAnomaliesCommand({
    DateInterval: { StartDate: startDate, EndDate: endDate },
    TotalImpact: { NumericOperator: 'GREATER_THAN_OR_EQUAL', StartValue: 100 },
    MaxResults: 20
  }));

  return (response.Anomalies ?? []).map(anomaly => ({
    service: anomaly.RootCauses?.[0]?.Service ?? 'Unknown',
    impact: anomaly.Impact?.TotalImpact,
    start: anomaly.AnomalyStartDate,
    status: anomaly.AnomalyStatus
  }));
}
```

### Disaster Recovery: Automated Failover with Lambda

```typescript
import { RDSClient, PromoteReadReplicaDBClusterCommand, DescribeDBInstancesCommand } from '@aws-sdk/client-rds';
import { Route53Client, ChangeResourceRecordSetsCommand } from '@aws-sdk/client-route-53';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { ECSClient, UpdateServiceCommand, DescribeServicesCommand } from '@aws-sdk/client-ecs';

const DR_CONFIG = {
  primaryRegion: 'us-east-1',
  secondaryRegion: 'us-west-2',
  dbClusterId: 'api-database',
  replicaClusterId: 'api-database-replica',
  hostedZoneId: 'Z1234567890',
  domain: 'api.example.com',
  ecsCluster: 'api-cluster',
  ecsService: 'api-service',
  notificationTopic: 'arn:aws:sns:us-east-1:123456789:dr-notifications'
};

export const handler = async (event: { action?: string }) => {
  // Automated DR failover triggered by CloudWatch alarm.
  // Steps: Promote replica → Scale ECS → Update DNS → Notify
  const action = event.action ?? 'failover';

  if (action === 'failover') await executeFailover();
  else if (action === 'failback') await executeFailback();
  else if (action === 'validate') return await validateDrReadiness();
};

async function executeFailover(): Promise<void> {
  console.log('Starting DR failover procedure');

  // Step 1: Promote RDS read replica to standalone
  const rdsSecondary = new RDSClient({ region: DR_CONFIG.secondaryRegion });
  await rdsSecondary.send(new PromoteReadReplicaDBClusterCommand({
    DBClusterIdentifier: DR_CONFIG.replicaClusterId
  }));

  // Step 2: Scale up ECS service in secondary region
  const ecsSecondary = new ECSClient({ region: DR_CONFIG.secondaryRegion });
  await ecsSecondary.send(new UpdateServiceCommand({
    cluster: DR_CONFIG.ecsCluster,
    service: DR_CONFIG.ecsService,
    desiredCount: 10  // Match production capacity
  }));

  // Step 3: Update Route 53 to point to secondary
  const route53 = new Route53Client({});
  await route53.send(new ChangeResourceRecordSetsCommand({
    HostedZoneId: DR_CONFIG.hostedZoneId,
    ChangeBatch: {
      Comment: 'DR failover - routing to secondary region',
      Changes: [{
        Action: 'UPSERT',
        ResourceRecordSet: {
          Name: DR_CONFIG.domain,
          Type: 'A',
          AliasTarget: {
            HostedZoneId: 'Z35SXDOTRQ7X7K',  // us-west-2 ALB zone
            DNSName: 'api-secondary-alb.us-west-2.elb.amazonaws.com',
            EvaluateTargetHealth: true
          }
        }
      }]
    }
  }));

  // Step 4: Notify operations team
  const sns = new SNSClient({ region: DR_CONFIG.primaryRegion });
  await sns.send(new PublishCommand({
    TopicArn: DR_CONFIG.notificationTopic,
    Subject: 'DR FAILOVER EXECUTED',
    Message: JSON.stringify({
      event: 'failover_complete',
      primaryRegion: DR_CONFIG.primaryRegion,
      activeRegion: DR_CONFIG.secondaryRegion,
      timestamp: new Date().toISOString()
    })
  }));

  console.log('Failover complete - traffic now routing to secondary region');
}

async function executeFailback(): Promise<void> {
  // Failback logic (reverse of failover)
}

async function validateDrReadiness() {
  // Validate DR infrastructure is ready for failover
  const checks: { check: string; value: number; healthy: boolean }[] = [];

  // Check replica lag
  const rdsSecondary = new RDSClient({ region: DR_CONFIG.secondaryRegion });
  const instances = await rdsSecondary.send(new DescribeDBInstancesCommand({
    DBInstanceIdentifier: DR_CONFIG.replicaClusterId
  }));
  const replicaLag = instances.DBInstances?.[0]?.ReplicaLag ?? 999;
  checks.push({ check: 'replica_lag_seconds', value: replicaLag, healthy: replicaLag < 60 });

  // Check ECS task health in DR region
  const ecsSecondary = new ECSClient({ region: DR_CONFIG.secondaryRegion });
  const services = await ecsSecondary.send(new DescribeServicesCommand({
    cluster: DR_CONFIG.ecsCluster,
    services: [DR_CONFIG.ecsService]
  }));
  const runningCount = services.services?.[0]?.runningCount ?? 0;
  checks.push({ check: 'dr_ecs_running_tasks', value: runningCount, healthy: runningCount >= 2 });

  const allHealthy = checks.every(c => c.healthy);
  console.log(`DR readiness: ${allHealthy ? 'READY' : 'NOT READY'}`, { checks });

  return { ready: allHealthy, checks };
}
```

### Well-Architected Review: Automated Compliance Checks

```typescript
import { RDSClient, DescribeDBInstancesCommand, ListTagsForResourceCommand } from '@aws-sdk/client-rds';
import {
  ElasticLoadBalancingV2Client,
  DescribeLoadBalancersCommand
} from '@aws-sdk/client-elastic-load-balancing-v2';
import { AutoScalingClient, DescribeAutoScalingGroupsCommand } from '@aws-sdk/client-auto-scaling';
import { EC2Client, DescribeVolumesCommand, DescribeInstancesCommand } from '@aws-sdk/client-ec2';
import { CloudWatchClient, GetMetricStatisticsCommand } from '@aws-sdk/client-cloudwatch';

type Severity = 'critical' | 'high' | 'medium' | 'low';

interface Finding {
  pillar: string;
  check: string;
  severity: Severity;
  resource: string;
  recommendation: string;
}

async function runReliabilityChecks(): Promise<Finding[]> {
  // Automated Well-Architected reliability pillar checks
  const findings: Finding[] = [];
  const rds = new RDSClient({});
  const elbv2 = new ElasticLoadBalancingV2Client({});

  // Check: RDS Multi-AZ enabled for production databases
  const dbInstances = await rds.send(new DescribeDBInstancesCommand({}));
  for (const db of dbInstances.DBInstances ?? []) {
    const tagsResponse = await rds.send(new ListTagsForResourceCommand({
      ResourceName: db.DBInstanceArn
    }));
    const tags = Object.fromEntries(
      (tagsResponse.TagList ?? []).map(t => [t.Key, t.Value])
    );

    if (tags['Environment'] === 'production' && !db.MultiAZ) {
      findings.push({
        pillar: 'Reliability',
        check: 'RDS Multi-AZ',
        severity: 'critical',
        resource: db.DBInstanceIdentifier!,
        recommendation: 'Enable Multi-AZ for production databases to survive AZ failures'
      });
    }
  }

  // Check: ALB spans multiple AZs
  const loadBalancers = await elbv2.send(new DescribeLoadBalancersCommand({}));
  for (const lb of loadBalancers.LoadBalancers ?? []) {
    const azCount = lb.AvailabilityZones?.length ?? 0;
    if (azCount < 2) {
      findings.push({
        pillar: 'Reliability',
        check: 'ALB Multi-AZ',
        severity: 'high',
        resource: lb.LoadBalancerName!,
        recommendation: `ALB only spans ${azCount} AZ(s). Deploy across 3+ AZs for resilience`
      });
    }
  }

  // Check: Auto Scaling groups have appropriate min capacity
  const asg = new AutoScalingClient({});
  const groups = await asg.send(new DescribeAutoScalingGroupsCommand({}));
  for (const group of groups.AutoScalingGroups ?? []) {
    if ((group.MinSize ?? 0) < 2) {
      findings.push({
        pillar: 'Reliability',
        check: 'ASG Minimum Capacity',
        severity: 'medium',
        resource: group.AutoScalingGroupName!,
        recommendation: 'Set minimum capacity >= 2 for production ASGs to survive instance failures'
      });
    }
  }

  return findings;
}

async function runCostOptimizationChecks(): Promise<Finding[]> {
  // Automated Well-Architected cost optimization checks
  const findings: Finding[] = [];
  const ec2 = new EC2Client({});
  const cloudwatch = new CloudWatchClient({});

  // Check: Unattached EBS volumes
  const volumes = await ec2.send(new DescribeVolumesCommand({
    Filters: [{ Name: 'status', Values: ['available'] }]
  }));
  for (const vol of volumes.Volumes ?? []) {
    const sizeGb = vol.Size ?? 0;
    const monthlyCost = sizeGb * 0.10; // gp3 pricing
    if (monthlyCost > 5) {
      findings.push({
        pillar: 'Cost Optimization',
        check: 'Unattached EBS Volumes',
        severity: 'medium',
        resource: vol.VolumeId!,
        recommendation: `${sizeGb}GB unattached volume costing ~$${monthlyCost.toFixed(2)}/month. Delete or snapshot and remove.`
      });
    }
  }

  // Check: Idle EC2 instances (CPU < 5% for 7 days)
  const instances = await ec2.send(new DescribeInstancesCommand({
    Filters: [{ Name: 'instance-state-name', Values: ['running'] }]
  }));

  for (const reservation of instances.Reservations ?? []) {
    for (const instance of reservation.Instances ?? []) {
      const metrics = await cloudwatch.send(new GetMetricStatisticsCommand({
        Namespace: 'AWS/EC2',
        MetricName: 'CPUUtilization',
        Dimensions: [{ Name: 'InstanceId', Value: instance.InstanceId }],
        StartTime: new Date(Date.now() - 7 * 86400000),
        EndTime: new Date(),
        Period: 604800,
        Statistics: ['Average']
      }));
      if (metrics.Datapoints?.length && metrics.Datapoints[0].Average! < 5.0) {
        findings.push({
          pillar: 'Cost Optimization',
          check: 'Idle EC2 Instances',
          severity: 'high',
          resource: instance.InstanceId!,
          recommendation: 'Instance averaging <5% CPU over 7 days. Consider rightsizing or terminating.'
        });
      }
    }
  }

  return findings;
}
```

## Common Pitfalls

- **Single-region "high availability"**: Multi-AZ within a single region protects against hardware and AZ failures but not against regional outages, service-level incidents, or configuration errors that affect all AZs simultaneously. True disaster recovery requires cross-region replication
- **Untested disaster recovery**: DR plans that exist only in documentation fail when needed. Without regular failover drills (monthly or quarterly), teams discover issues during actual incidents — stale AMIs, expired credentials, missing DNS configurations, or services that cannot start without dependencies in the primary region
- **Over-engineering for availability**: Not every service needs 99.99% availability. A batch reporting system running once daily does not need multi-region active-active architecture. Match your architecture investment to actual business requirements and SLA commitments
- **Reserved Instance commitment without usage analysis**: Purchasing 3-year Reserved Instances based on current usage without accounting for planned migrations, instance type changes, or workload reduction leads to stranded commitments. Start with 1-year terms and Savings Plans for flexibility
- **Ignoring data transfer costs**: Inter-region data transfer ($0.02/GB), NAT Gateway processing ($0.045/GB), and cross-AZ traffic ($0.01/GB) often exceed compute costs for data-intensive applications. Architect to minimize cross-boundary data movement — use VPC endpoints, keep compute near data, and compress before transfer
- **Failover without failback planning**: Teams focus on failing over to DR but neglect the failback process, which is often more complex. Failback requires re-synchronizing data that accumulated in the DR region back to primary, validating data integrity, and coordinating the DNS switch back — all without a second outage
- **Cost optimization as an afterthought**: Waiting until the monthly bill arrives to optimize costs means months of waste. Implement cost controls from day one: budgets with alerts, tagging enforcement, automated shutdown of non-production resources outside business hours, and right-sizing recommendations reviewed weekly

## Real-World Use Cases

**Global E-Commerce Platform**: A retailer serves customers across North America, Europe, and Asia-Pacific using active-active multi-region architecture. Each region runs a full application stack with DynamoDB Global Tables providing sub-second replication of product catalog and inventory data. Route 53 latency-based routing directs users to the nearest region. During the 2023 us-east-1 incident, traffic automatically shifted to us-west-2 and eu-west-1 within 45 seconds, with zero customer-visible impact. The architecture costs 2.5x a single-region deployment but generates $2M/hour during peak sales — even 5 minutes of downtime exceeds the annual multi-region premium.

**Financial Services Compliance**: A bank operates under regulatory requirements mandating 4-hour RTO and 1-hour RPO for core banking systems. They implement a pilot light DR strategy: RDS cross-region read replicas with 15-minute replication lag, pre-built AMIs in the DR region, and CloudFormation templates that can launch the full application stack in 45 minutes. Quarterly DR drills validate the process end-to-end, with results reported to regulators. Cost optimization uses Reserved Instances for the primary region's steady-state workload (70% savings) and On-Demand for the DR region that only runs during drills and actual failovers.

**SaaS Cost Optimization Journey**: A B2B SaaS company reduced their $180K/month AWS bill to $95K through systematic optimization. Phase 1: right-sizing (identified 40% of EC2 instances were over-provisioned using CloudWatch CPU/memory metrics). Phase 2: purchasing (Savings Plans for baseline compute, Spot for batch processing). Phase 3: architectural (replaced always-on ECS services with Lambda for low-traffic APIs, implemented S3 Intelligent-Tiering for 2PB data lake, scheduled non-production environments to run only during business hours). Phase 4: governance (implemented cost allocation tags, per-team budgets with automated alerts, and weekly cost review meetings with engineering leads).

## Interview Questions

**Q: Design a disaster recovery strategy for a system requiring 15-minute RTO and 5-minute RPO.**

A: This requires a warm standby or hot standby approach. For 5-minute RPO: use RDS with synchronous cross-region replication (Aurora Global Database provides <1 second replication lag) or DynamoDB Global Tables for NoSQL data. For 15-minute RTO: maintain pre-provisioned infrastructure in the DR region — ECS tasks running at minimum scale (2 tasks), pre-warmed ALB, and Route 53 health checks with 10-second intervals and 3-failure threshold (triggers failover in 30 seconds). The failover sequence: Route 53 detects primary unhealthy → DNS failover to secondary ALB → ECS auto-scaling increases task count from 2 to production level (takes 2-3 minutes for container startup). Total failover time: ~3-4 minutes. Key design decisions: Aurora Global Database over standard RDS replication for the RPO requirement, pre-provisioned (not just pre-configured) compute in DR for the RTO requirement, and automated failover via Route 53 rather than manual runbook execution.

**Q: How would you reduce a $500K/month AWS bill by 40% without impacting performance?**

A: Systematic approach across four dimensions. First, right-sizing (typically 15-25% savings): analyze CloudWatch metrics for CPU, memory, network, and disk I/O across all EC2 and RDS instances. Instances consistently below 40% utilization get downsized. Use AWS Compute Optimizer recommendations. Second, purchasing commitments (20-30% savings): buy 1-year Savings Plans covering 70% of steady-state compute (the predictable baseline), use Spot for fault-tolerant workloads (batch, CI/CD, dev environments). Third, architectural optimization (10-20% savings): implement auto-scaling with aggressive scale-in policies, schedule non-production environments (dev/staging) to shut down outside business hours (saves 65% on those environments), move infrequently accessed S3 data to Intelligent-Tiering or Glacier, replace NAT Gateways with VPC endpoints for AWS service traffic. Fourth, waste elimination: delete unattached EBS volumes, remove unused Elastic IPs, clean up old snapshots, terminate zombie instances. Track progress with weekly cost reports broken down by service and team using cost allocation tags.

**Q: Explain the trade-offs between active-active and active-passive multi-region architectures.**

A: Active-active: both regions serve production traffic simultaneously. Advantages — near-zero RTO (traffic shifts instantly), better latency for geographically distributed users, full capacity always available. Disadvantages — 2x+ infrastructure cost, data consistency challenges (conflict resolution for concurrent writes), complex deployment coordination (must deploy to all regions atomically or handle version skew), and testing complexity (must validate cross-region interactions). Active-passive: primary region handles all traffic, secondary is standby. Advantages — simpler data model (single writer), lower cost (DR region runs at minimum capacity), simpler deployments. Disadvantages — non-zero RTO (must detect failure, promote replica, scale up compute, update DNS), potential data loss during failover (RPO depends on replication lag), and DR infrastructure may have undiscovered issues since it rarely handles real traffic. Choose active-active when: RTO must be <1 minute, you serve global users needing low latency, or the cost of downtime exceeds the infrastructure premium. Choose active-passive when: RTO of 5-30 minutes is acceptable, your data model doesn't support multi-writer, or cost constraints prevent running full capacity in two regions.

## Production Tips

- **Implement automated cost anomaly detection** using AWS Cost Anomaly Detection or custom CloudWatch metrics. Alert when daily spend exceeds 120% of the trailing 7-day average. This catches runaway resources (forgotten load tests, infinite loops creating resources, compromised credentials spinning up crypto miners) within hours rather than waiting for the monthly bill
- **Run chaos engineering experiments** using AWS Fault Injection Simulator to validate resilience assumptions. Start with controlled experiments: terminate a single instance, inject latency on a dependency, or simulate an AZ failure. Graduate to more aggressive tests: regional failover, database failover, and network partition between services. Document findings and fix gaps before they become incidents
- **Use AWS Organizations SCPs** to enforce architectural guardrails: prevent launching instances in unapproved regions, require encryption on all storage resources, block public S3 bucket creation, and restrict instance types to approved families. This prevents well-intentioned developers from accidentally creating non-compliant or expensive resources
- **Implement progressive deployment across regions** — never deploy to all regions simultaneously. Use a canary region (lowest traffic) first, monitor for 30 minutes, then roll to the next region. This limits blast radius for bad deployments and gives time to detect issues before they affect your highest-traffic regions

## Related Topics

- [AWS Core Services](./aws-core-services.md) — Individual service capabilities that these patterns compose
- [Infrastructure as Code](../ci-cd/infrastructure-as-code.md) — Implementing multi-region and DR infrastructure reproducibly
- [Serverless Patterns](./serverless-patterns.md) — Serverless architectures within cloud patterns
- [Security](../../security/security/security.md) — Security pillar of the Well-Architected Framework in depth
