# Compute and Containers

## Quick Reference

- ECS (Elastic Container Service) is AWS's native container orchestration service with deep integration into IAM, ALB, CloudWatch, and Service Connect
- EKS (Elastic Kubernetes Service) provides managed Kubernetes control plane with automatic upgrades, multi-AZ etcd, and AWS service integration
- Lambda provides serverless compute with per-invocation billing, automatic scaling to zero, and 15-minute maximum execution time
- Fargate is a serverless compute engine for ECS and EKS that eliminates node management — you define CPU/memory per task or pod
- EC2 provides full control over compute instances with instance types optimized for compute, memory, storage, or GPU workloads
- Karpenter is an open-source Kubernetes node provisioner that launches right-sized instances based on pending pod requirements
- Auto Scaling Groups manage EC2 fleet size based on CloudWatch metrics, target tracking, or scheduled scaling policies
- Graviton (ARM) instances provide up to 40% better price-performance compared to equivalent x86 instances for most workloads

## When to Use

Compute selection depends on workload characteristics, team expertise, and operational requirements. Choose ECS Fargate for teams that want container orchestration without managing infrastructure and do not need Kubernetes-specific features like custom controllers or CRDs. Choose EKS when your team has Kubernetes expertise, needs portability across cloud providers, or requires the Kubernetes ecosystem (Helm, Istio, ArgoCD, custom operators). Choose Lambda for event-driven workloads with unpredictable traffic patterns, short execution times, and where cold start latency is acceptable.

Use EC2 directly when you need specific instance types (GPU for ML training, high-memory for in-memory databases), when you need persistent local storage (instance store NVMe), or when licensing requires dedicated hosts. Fargate eliminates capacity planning but costs 20-30% more than equivalent self-managed EC2 — choose it when operational simplicity outweighs the cost premium. Karpenter on EKS provides the best of both worlds: automatic right-sizing of EC2 instances based on actual pod requirements without manual node group management.

## Code Examples

### ECS Service with Fargate and Auto Scaling (CDK)

```typescript
import * as cdk from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';

export class ComputeStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props: ComputeStackProps) {
    super(scope, id, props);

    // ECS Cluster with Container Insights
    const cluster = new ecs.Cluster(this, 'ProductionCluster', {
      vpc: props.vpc,
      clusterName: 'production',
      containerInsights: true,
      enableFargateCapacityProviders: true,
    });

    // Task Definition with appropriate resource allocation
    const taskDef = new ecs.FargateTaskDefinition(this, 'OrderServiceTask', {
      family: 'order-service',
      cpu: 1024,        // 1 vCPU
      memoryLimitMiB: 2048, // 2 GB
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.ARM64, // Graviton for cost savings
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
    });

    // Task role with least-privilege permissions
    taskDef.taskRole.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:Query'],
      resources: [`arn:aws:dynamodb:${this.region}:${this.account}:table/orders`],
    }));

    taskDef.taskRole.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: ['sqs:SendMessage'],
      resources: [`arn:aws:sqs:${this.region}:${this.account}:order-events`],
    }));

    // Container definition with health check and logging
    const container = taskDef.addContainer('order-service', {
      image: ecs.ContainerImage.fromEcrRepository(props.ecrRepo, 'latest'),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'order-service',
        logGroup: new logs.LogGroup(this, 'OrderServiceLogs', {
          logGroupName: '/ecs/order-service',
          retention: logs.RetentionDays.TWO_WEEKS,
          removalPolicy: cdk.RemovalPolicy.DESTROY,
        }),
      }),
      healthCheck: {
        command: ['CMD-SHELL', 'curl -f http://localhost:8080/actuator/health || exit 1'],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
        startPeriod: cdk.Duration.seconds(60),
      },
      environment: {
        SPRING_PROFILES_ACTIVE: 'production',
        AWS_REGION: this.region,
      },
      portMappings: [{ containerPort: 8080, protocol: ecs.Protocol.TCP }],
    });

    // ECS Service with deployment circuit breaker
    const service = new ecs.FargateService(this, 'OrderService', {
      cluster,
      taskDefinition: taskDef,
      desiredCount: 3,
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      circuitBreaker: { rollback: true }, // Auto-rollback failed deployments
      capacityProviderStrategies: [
        { capacityProvider: 'FARGATE', weight: 1, base: 2 },
        { capacityProvider: 'FARGATE_SPOT', weight: 3 }, // 75% Spot for cost savings
      ],
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [props.appSecurityGroup],
    });

    // Application Auto Scaling
    const scaling = service.autoScaleTaskCount({
      minCapacity: 3,
      maxCapacity: 50,
    });

    scaling.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 60,
      scaleInCooldown: cdk.Duration.seconds(300),
      scaleOutCooldown: cdk.Duration.seconds(60),
    });

    scaling.scaleOnRequestCount('RequestScaling', {
      requestsPerTarget: 1000,
      targetGroup: props.targetGroup,
      scaleInCooldown: cdk.Duration.seconds(300),
      scaleOutCooldown: cdk.Duration.seconds(60),
    });
  }
}
```

### Lambda Function with Provisioned Concurrency

```typescript
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as sqs from 'aws-cdk-lib/aws-sqs';

// Lambda function for event processing
const processorFn = new lambda.Function(this, 'EventProcessor', {
  functionName: 'order-event-processor',
  runtime: lambda.Runtime.NODEJS_20_X,
  architecture: lambda.Architecture.ARM_64, // Graviton Lambda
  handler: 'index.handler',
  code: lambda.Code.fromAsset('./lambda/event-processor'),
  memorySize: 1024, // Also scales CPU proportionally
  timeout: cdk.Duration.seconds(30),
  reservedConcurrentExecutions: 100, // Prevent runaway scaling
  environment: {
    TABLE_NAME: 'orders',
    POWERTOOLS_SERVICE_NAME: 'order-processor',
    LOG_LEVEL: 'INFO',
  },
  deadLetterQueue: new sqs.Queue(this, 'DLQ', {
    queueName: 'order-processor-dlq',
    retentionPeriod: cdk.Duration.days(14),
  }),
  tracing: lambda.Tracing.ACTIVE, // X-Ray tracing
  insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_229_0,
});

// Provisioned concurrency for latency-sensitive endpoints
const version = processorFn.currentVersion;
const alias = new lambda.Alias(this, 'ProdAlias', {
  aliasName: 'production',
  version,
  provisionedConcurrentExecutions: 10, // Always-warm instances
});

// Auto-scale provisioned concurrency based on utilization
const scalingTarget = alias.addAutoScaling({
  minCapacity: 5,
  maxCapacity: 50,
});
scalingTarget.scaleOnUtilization({
  utilizationTarget: 0.7,
  scaleInCooldown: cdk.Duration.minutes(5),
  scaleOutCooldown: cdk.Duration.minutes(1),
});

// SQS event source with batching
processorFn.addEventSource(new lambda.SqsEventSource(orderQueue, {
  batchSize: 10,
  maxBatchingWindow: cdk.Duration.seconds(5),
  reportBatchItemFailures: true, // Partial batch failure handling
  maxConcurrency: 50,
}));
```

### Karpenter Node Provisioner for EKS

```yaml
# Karpenter NodePool for general workloads
apiVersion: karpenter.sh/v1beta1
kind: NodePool
metadata:
  name: general-purpose
spec:
  template:
    metadata:
      labels:
        workload-type: general
    spec:
      requirements:
        - key: kubernetes.io/arch
          operator: In
          values: ["arm64"] # Graviton instances for cost savings
        - key: karpenter.sh/capacity-type
          operator: In
          values: ["on-demand", "spot"]
        - key: karpenter.k8s.aws/instance-category
          operator: In
          values: ["m", "r", "c"] # General, memory, compute optimized
        - key: karpenter.k8s.aws/instance-generation
          operator: Gt
          values: ["5"] # Only current-gen instances
        - key: karpenter.k8s.aws/instance-size
          operator: In
          values: ["large", "xlarge", "2xlarge", "4xlarge"]
      nodeClassRef:
        name: default
  limits:
    cpu: "1000"
    memory: 2000Gi
  disruption:
    consolidationPolicy: WhenUnderutilized
    consolidateAfter: 30s
    expireAfter: 720h # Replace nodes every 30 days for patching
  weight: 50 # Priority relative to other NodePools
---
# EC2NodeClass defining launch template parameters
apiVersion: karpenter.k8s.aws/v1beta1
kind: EC2NodeClass
metadata:
  name: default
spec:
  amiFamily: AL2023
  subnetSelectorTerms:
    - tags:
        karpenter.sh/discovery: production-cluster
        network-tier: private
  securityGroupSelectorTerms:
    - tags:
        karpenter.sh/discovery: production-cluster
  instanceProfile: KarpenterNodeInstanceProfile
  blockDeviceMappings:
    - deviceName: /dev/xvda
      ebs:
        volumeSize: 100Gi
        volumeType: gp3
        iops: 3000
        throughput: 125
        encrypted: true
        deleteOnTermination: true
  metadataOptions:
    httpEndpoint: enabled
    httpProtocolIPv6: disabled
    httpPutResponseHopLimit: 2
    httpTokens: required # IMDSv2 only
  tags:
    Environment: production
    ManagedBy: karpenter
```

## Common Pitfalls

1. **Choosing EKS when ECS would suffice for the team's needs**: EKS introduces significant operational complexity — cluster upgrades, add-on management, RBAC configuration, CNI tuning, and the Kubernetes learning curve. If your team does not need custom controllers, CRDs, service mesh, or multi-cloud portability, ECS with Fargate provides container orchestration with far less operational overhead. The decision should be based on team expertise and actual requirements, not industry hype.

2. **Not implementing deployment circuit breakers for ECS services**: Without circuit breakers, a bad deployment that passes health checks initially but fails under load will replace all healthy tasks before the problem is detected. ECS deployment circuit breaker monitors the deployment and automatically rolls back if new tasks fail to stabilize. Always enable `circuitBreaker: { rollback: true }` on production services to prevent bad deployments from causing full outages.

3. **Over-provisioning Lambda memory without measuring actual usage**: Lambda bills per GB-second, and memory allocation also determines CPU allocation (proportionally). Many teams set 1024MB or higher without measuring actual usage. Use Lambda Power Tuning (an open-source tool) to find the optimal memory setting that minimizes cost while meeting latency requirements. Often, 256MB or 512MB is sufficient for I/O-bound functions, while CPU-bound functions benefit from higher memory (and thus more CPU).

4. **Ignoring Fargate Spot interruption handling**: Fargate Spot tasks can be interrupted with 30 seconds notice when AWS needs capacity back. Applications must handle SIGTERM gracefully, drain connections, and checkpoint work within this window. Without proper signal handling, interrupted tasks lose in-flight work. Use ECS task placement constraints to ensure critical tasks run on regular Fargate while batch processing uses Spot. Monitor `CapacityProviderReservation` metrics to detect capacity pressure.

5. **Running all workloads on the same instance type in EKS**: Using a single instance type (e.g., m5.xlarge) for all workloads wastes resources. Memory-intensive services waste CPU on large-memory instances, while CPU-intensive services waste memory on compute-optimized instances. Use Karpenter or multiple managed node groups with different instance types. Karpenter automatically selects the optimal instance type based on pending pod resource requests, bin-packing efficiently across a diverse instance fleet.

6. **Not configuring ECS task placement strategies for high availability**: Default ECS task placement may concentrate all tasks in a single Availability Zone. If that AZ experiences issues, the entire service goes down. Configure placement strategies to spread tasks across AZs (`spread` on `attribute:ecs.availability-zone`) and optionally across instances (`spread` on `instanceId`). For critical services, set `minimumHealthyPercent: 100` to ensure capacity is never reduced during deployments.

## Real-World Use Cases

- **Cost-optimized ECS deployment with mixed capacity**: An e-commerce platform runs its order processing service on ECS with a capacity provider strategy: 2 base tasks on regular Fargate (guaranteed availability) and additional scaling tasks on Fargate Spot (75% cost reduction). During Black Friday, the service scales from 3 to 150 tasks in minutes. Spot interruptions are handled gracefully — the service maintains SLA because base capacity is always available and new Spot tasks launch within seconds of interruptions.

- **Event-driven architecture with Lambda and SQS**: A document processing pipeline uses Lambda triggered by SQS messages. Users upload documents to S3, which triggers an event to SQS. Lambda processes documents in parallel (up to 1000 concurrent executions), extracts text, runs classification ML models, and stores results in DynamoDB. The architecture handles 0 to 100,000 documents per hour with no infrastructure management. Dead letter queues capture failed processing for retry, and CloudWatch alarms alert when DLQ depth exceeds thresholds.

- **EKS with Karpenter for ML training workloads**: A machine learning platform runs training jobs on EKS with Karpenter provisioning GPU instances on-demand. When a training job is submitted, Karpenter launches p4d.24xlarge instances (8 A100 GPUs) within minutes, the job runs for hours to days, and Karpenter terminates the instances when the job completes. Spot instances are used for fault-tolerant training with checkpointing, reducing GPU costs by 60%. The same cluster runs inference workloads on Graviton instances for cost-efficient serving.

- **Blue-green deployment with ECS and ALB**: A payment service uses ECS blue-green deployments via CodeDeploy. The new version deploys as a separate target group, receives 10% of traffic for canary testing, and if CloudWatch alarms remain healthy for 10 minutes, traffic shifts 100% to the new version. If any alarm triggers during the canary period, CodeDeploy automatically rolls back to the previous version within 60 seconds. The entire deployment takes 15 minutes with zero downtime and automatic rollback on failure.

## Interview Questions

**Q: Compare ECS Fargate, EKS with managed node groups, and EKS with Karpenter. When would you choose each?**

A: ECS Fargate is best for teams wanting container orchestration without infrastructure management and without needing Kubernetes-specific features. You define tasks and services; AWS handles compute. The tradeoff is 20-30% cost premium and less flexibility. EKS with managed node groups suits teams with Kubernetes expertise who want AWS to handle node provisioning and updates but need control over instance types and node configurations. You manage node group scaling policies. EKS with Karpenter provides the most flexibility — it automatically provisions right-sized instances based on pending pod requirements, supports diverse instance types, handles Spot interruptions, and consolidates underutilized nodes. Choose Karpenter when you have varied workload sizes, want optimal bin-packing, or need GPU instances provisioned on-demand without pre-configured node groups.

**Q: How would you design auto-scaling for a service with unpredictable traffic spikes?**

A: Use multiple scaling dimensions rather than relying on a single metric. Configure target tracking on CPU utilization (60% target) as the baseline, add step scaling on request count per target for traffic-driven scaling, and implement scheduled scaling for known patterns (business hours, batch processing windows). Set aggressive scale-out cooldowns (60 seconds) but conservative scale-in cooldowns (300 seconds) to avoid flapping. For ECS, use Fargate Spot for burst capacity with regular Fargate as the base. For Lambda, use provisioned concurrency for the baseline with on-demand scaling for spikes. Monitor scaling events and adjust thresholds based on actual latency impact — scale before latency degrades, not after.

**Q: Explain how Karpenter differs from Cluster Autoscaler and why you might prefer it.**

A: Cluster Autoscaler works with pre-defined Auto Scaling Groups (node groups) — you must configure instance types, sizes, and scaling parameters in advance. It scales by adding nodes to existing groups when pods are pending. Karpenter takes a fundamentally different approach: it directly provisions EC2 instances based on pending pod requirements without pre-defined node groups. Karpenter evaluates pod resource requests, selects the optimal instance type from a configured set, launches it, and binds pods immediately. It also consolidates — if workload decreases, it migrates pods and terminates underutilized nodes. Prefer Karpenter when you have diverse workload sizes (some pods need 256MB, others need 32GB), when you want automatic instance type selection (Graviton vs x86, Spot vs On-Demand), or when you need fast scaling (Karpenter launches instances in seconds vs minutes for Cluster Autoscaler).

**Q: How do you handle Lambda cold starts for latency-sensitive applications?**

A: Cold starts occur when Lambda creates a new execution environment — downloading code, initializing the runtime, and running initialization code. Mitigation strategies: Use provisioned concurrency to keep a minimum number of environments warm (eliminates cold starts for that capacity). Minimize deployment package size (use layers for dependencies, exclude dev dependencies). Choose a fast-starting runtime (Node.js and Python start faster than Java). For Java, use GraalVM native compilation or SnapStart (which snapshots the initialized JVM). Move initialization logic outside the handler function so it runs once per environment, not per invocation. Use ARM64 architecture which starts faster than x86. For critical paths, implement a warming strategy with scheduled EventBridge rules that invoke the function every 5 minutes to keep environments alive.

## Production Tips

- **Use ECS Exec for production debugging without SSH access**: ECS Exec provides interactive shell access to running containers via AWS Systems Manager without requiring SSH, bastion hosts, or security group modifications. Enable it on the service with `enableExecuteCommand: true` and use `aws ecs execute-command --interactive --command "/bin/sh"` for troubleshooting. Access is controlled via IAM policies and all sessions are logged to CloudWatch for audit compliance. This eliminates the security risk of SSH keys on containers while providing equivalent debugging capability.

- **Implement capacity reservations for critical workloads that cannot tolerate launch failures**: During major AWS events or regional capacity constraints, on-demand instance launches can fail with `InsufficientInstanceCapacity` errors. For services that must maintain minimum capacity regardless of AWS availability, use On-Demand Capacity Reservations (ODCRs) that guarantee instance availability in specific AZs. Combine with Savings Plans for cost optimization — the reservation guarantees availability while the Savings Plan reduces the hourly rate.

- **Configure ECS service connect or App Mesh for service-to-service communication**: Direct service discovery via Cloud Map works but lacks traffic management, retries, and observability. ECS Service Connect provides built-in service mesh capabilities (timeouts, retries, circuit breaking) without sidecar management complexity. For EKS, use Istio or Linkerd for equivalent functionality. Service mesh observability provides per-service latency percentiles, error rates, and request volumes without application code changes.

## Related Topics

- [IAM and Security](./iam-and-security.md) — Task roles, execution roles, and IRSA for compute workload permissions
- [VPC and Networking](./vpc-and-networking.md) — Subnet placement and security groups for compute resources
- [Kubernetes & EKS](../kubernetes/index.md) — Deep dive into Kubernetes workload management on EKS
- [Docker & Containerization](../docker/index.md) — Container images and runtime configuration for ECS and EKS
