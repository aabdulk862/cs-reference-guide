# EKS and AWS Integration

## Quick Reference

- Amazon EKS provides a managed Kubernetes control plane running across multiple Availability Zones with automatic upgrades and etcd management
- IAM Roles for Service Accounts (IRSA) maps Kubernetes service accounts to IAM roles for pod-level AWS permissions via OIDC federation
- VPC CNI assigns real VPC IP addresses to pods, enabling direct communication with AWS services without NAT
- Managed node groups automate EC2 provisioning, AMI updates, and graceful draining during upgrades
- Karpenter provides just-in-time node provisioning with sub-minute scaling and intelligent instance type selection
- Fargate profiles run pods on serverless compute without managing EC2 instances
- AWS Load Balancer Controller provisions ALBs and NLBs from Kubernetes Ingress and Service resources
- EKS Add-ons manage cluster components (VPC CNI, CoreDNS, kube-proxy, EBS CSI) with automatic version compatibility

## When to Use

Choose EKS when your infrastructure is AWS-native and you want to avoid managing the Kubernetes control plane yourself. EKS is appropriate when you need deep integration with AWS services like IAM for fine-grained pod permissions, VPC for native networking, ALB/NLB for load balancing, EBS/EFS for persistent storage, and CloudWatch for observability. Use managed node groups when you want AWS to handle node provisioning, OS patching, and graceful upgrades with minimal operational overhead. Choose Karpenter over Cluster Autoscaler when you need faster scaling (seconds versus minutes), diverse instance type selection for cost optimization, and consolidation of underutilized nodes. Use Fargate profiles for batch jobs, low-traffic services, or workloads where you want to eliminate node management entirely and pay only for actual pod resource consumption.

## Code Examples

### EKS Cluster Configuration with eksctl

```yaml
apiVersion: eksctl.io/v1alpha5
kind: ClusterConfig
metadata:
  name: production-cluster
  region: us-east-1
  version: "1.29"

vpc:
  cidr: "10.0.0.0/16"
  nat:
    gateway: HighlyAvailable
  clusterEndpoints:
    publicAccess: true
    privateAccess: true

iam:
  withOIDC: true
  serviceAccounts:
    - metadata:
        name: order-service
        namespace: production
      attachPolicyARNs:
        - "arn:aws:iam::123456789:policy/OrderServicePolicy"
    - metadata:
        name: aws-load-balancer-controller
        namespace: kube-system
      wellKnownPolicies:
        awsLoadBalancerController: true
    - metadata:
        name: external-dns
        namespace: kube-system
      wellKnownPolicies:
        externalDNS: true
    - metadata:
        name: ebs-csi-controller
        namespace: kube-system
      wellKnownPolicies:
        ebsCSIController: true

managedNodeGroups:
  - name: system
    instanceType: m5.large
    desiredCapacity: 3
    minSize: 3
    maxSize: 5
    labels:
      role: system
      lifecycle: on-demand
    taints:
      - key: CriticalAddonsOnly
        value: "true"
        effect: PreferNoSchedule
    iam:
      withAddonPolicies:
        albIngress: true
        cloudWatch: true
        ebs: true

  - name: application-spot
    instanceTypes:
      - m5.xlarge
      - m5a.xlarge
      - m5n.xlarge
      - c5.xlarge
      - c5a.xlarge
    desiredCapacity: 5
    minSize: 3
    maxSize: 30
    spot: true
    labels:
      role: application
      lifecycle: spot
    taints:
      - key: spot
        value: "true"
        effect: PreferNoSchedule
    privateNetworking: true

  - name: application-ondemand
    instanceType: m5.xlarge
    desiredCapacity: 3
    minSize: 3
    maxSize: 10
    labels:
      role: application
      lifecycle: on-demand
    privateNetworking: true

addons:
  - name: vpc-cni
    version: latest
    configurationValues: '{"env":{"ENABLE_PREFIX_DELEGATION":"true","WARM_PREFIX_TARGET":"1"}}'
  - name: coredns
    version: latest
  - name: kube-proxy
    version: latest
  - name: aws-ebs-csi-driver
    version: latest
    serviceAccountRoleARN: "arn:aws:iam::123456789:role/EBSCSIDriverRole"

fargateProfiles:
  - name: batch-jobs
    selectors:
      - namespace: batch
        labels:
          compute: fargate
  - name: ci-runners
    selectors:
      - namespace: ci
        labels:
          compute: fargate
```

### Karpenter NodePool and EC2NodeClass

```yaml
# Karpenter NodePool for dynamic node provisioning
apiVersion: karpenter.sh/v1beta1
kind: NodePool
metadata:
  name: default
spec:
  template:
    metadata:
      labels:
        managed-by: karpenter
    spec:
      requirements:
        - key: kubernetes.io/arch
          operator: In
          values: ["amd64"]
        - key: kubernetes.io/os
          operator: In
          values: ["linux"]
        - key: karpenter.sh/capacity-type
          operator: In
          values: ["on-demand", "spot"]
        - key: karpenter.k8s.aws/instance-category
          operator: In
          values: ["m", "c", "r"]
        - key: karpenter.k8s.aws/instance-generation
          operator: Gt
          values: ["4"]
        - key: karpenter.k8s.aws/instance-size
          operator: In
          values: ["large", "xlarge", "2xlarge"]
      nodeClassRef:
        name: default
  limits:
    cpu: "1000"
    memory: 2000Gi
  disruption:
    consolidationPolicy: WhenUnderutilized
    consolidateAfter: 30s
    expireAfter: 720h
  weight: 10
---
apiVersion: karpenter.k8s.aws/v1beta1
kind: EC2NodeClass
metadata:
  name: default
spec:
  amiFamily: AL2
  subnetSelectorTerms:
    - tags:
        karpenter.sh/discovery: production-cluster
        network: private
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
        kmsKeyID: "arn:aws:kms:us-east-1:123456789:key/abc-123"
  tags:
    Environment: production
    ManagedBy: karpenter
  metadataOptions:
    httpEndpoint: enabled
    httpProtocolIPv6: disabled
    httpPutResponseHopLimit: 2
    httpTokens: required
---
# IRSA - Pod-level AWS permissions
apiVersion: v1
kind: ServiceAccount
metadata:
  name: order-service
  namespace: production
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::123456789:role/OrderServiceRole
---
# IAM Policy for the service (referenced by role)
# {
#   "Version": "2012-10-17",
#   "Statement": [
#     {
#       "Effect": "Allow",
#       "Action": ["s3:GetObject", "s3:PutObject"],
#       "Resource": "arn:aws:s3:::order-documents/*"
#     },
#     {
#       "Effect": "Allow",
#       "Action": ["sqs:SendMessage", "sqs:ReceiveMessage"],
#       "Resource": "arn:aws:sqs:us-east-1:123456789:order-events"
#     }
#   ]
# }
```

## Common Pitfalls

- **Using node-level IAM roles instead of IRSA**: Attaching IAM policies to the node instance profile grants every pod on that node the same AWS permissions. This violates least-privilege and creates a massive blast radius if any pod is compromised. Always use IRSA to assign fine-grained permissions to individual service accounts, ensuring each microservice can only access the specific AWS resources it needs.

- **Not enabling prefix delegation for VPC CNI**: Without prefix delegation, each pod consumes one secondary IP from the node's ENI, limiting pod density to approximately 30 pods per m5.large. Enabling prefix delegation assigns /28 prefixes instead of individual IPs, increasing capacity to approximately 110 pods per node. This is critical for clusters running many small pods or using node types with limited ENI capacity.

- **Ignoring EKS version support windows**: EKS supports three Kubernetes minor versions simultaneously, with each version receiving approximately 14 months of standard support. Running an unsupported version means no security patches and eventual forced upgrades. Plan upgrades every 3-4 months, test in staging first, and use `kubectl convert` and `pluto` to detect deprecated API resources before upgrading.

- **Over-relying on Cluster Autoscaler instead of Karpenter**: Cluster Autoscaler scales node groups based on pending pods but is limited to pre-defined instance types and takes 3-5 minutes to provision nodes. Karpenter makes scheduling decisions in seconds, selects optimal instance types from a broad pool based on actual pod requirements, and consolidates underutilized nodes automatically. For most EKS workloads, Karpenter provides faster scaling and lower costs.

- **Not configuring pod identity webhook timeout**: The IRSA mutating webhook injects AWS credentials into pods at creation time. If the webhook is slow or unavailable, pod creation fails or times out. Configure appropriate failure policies (Ignore for non-critical workloads, Fail for security-sensitive ones) and ensure the webhook pods have sufficient resources and are spread across availability zones.

## Real-World Use Cases

A large SaaS platform runs 200+ microservices on EKS across three availability zones. Karpenter manages node provisioning with a mix of on-demand instances for baseline capacity and spot instances for burst workloads, achieving 40% cost savings compared to fixed-size on-demand node groups. Each service uses IRSA with narrowly scoped IAM policies — the order service can only access its specific S3 bucket and SQS queue, while the analytics service can only read from Kinesis streams. The AWS Load Balancer Controller provisions a shared ALB with path-based routing to all services, integrated with WAF for DDoS protection and ACM for automatic TLS certificate renewal.

A financial services company uses EKS with strict compliance controls. All nodes run in private subnets with no internet access; container images are pulled from a private ECR registry via VPC endpoints. Pod Security Standards enforce non-root execution and read-only filesystems. IRSA policies include condition keys that restrict access based on the source VPC and require MFA for sensitive operations. EKS audit logs stream to CloudWatch Logs and are retained for 7 years for regulatory compliance. Fargate profiles run compliance scanning jobs that need temporary compute without leaving persistent infrastructure.

A machine learning platform uses EKS with GPU-equipped nodes for model training and inference. Karpenter provisions p3.2xlarge instances on-demand when training jobs are submitted and terminates them when jobs complete, avoiding idle GPU costs. Inference workloads run on g4dn instances with HPA scaling based on prediction request queue depth. The EBS CSI driver provides high-performance gp3 volumes for model checkpointing, while EFS CSI provides shared storage for training datasets accessible by multiple pods simultaneously.

## Interview Questions

**Q: How does IAM Roles for Service Accounts (IRSA) work in EKS?**

A: IRSA uses an OIDC identity provider associated with the EKS cluster. When a pod with an annotated service account starts, the EKS pod identity webhook mutates the pod spec to inject a projected service account token volume and AWS environment variables. The AWS SDK in the pod exchanges this OIDC token with AWS STS for temporary IAM credentials scoped to the role specified in the service account annotation. Credentials are automatically refreshed before expiration. This eliminates the need for long-lived credentials or node-level IAM roles.

**Q: What is the difference between Cluster Autoscaler and Karpenter?**

A: Cluster Autoscaler scales pre-defined node groups up and down based on pending pods, taking 3-5 minutes to provision new nodes and limited to the instance types configured in each node group. Karpenter is a more flexible node provisioner that evaluates pending pod requirements directly, selects optimal instance types from a broad pool (considering CPU, memory, GPU, architecture), provisions nodes in under 60 seconds, and automatically consolidates underutilized nodes. Karpenter eliminates the need to pre-define node groups and provides better bin-packing and cost optimization.

**Q: How would you design an EKS cluster for high availability?**

A: Deploy the cluster across at least three availability zones with managed node groups or Karpenter configured to spread nodes across all AZs. Use topology spread constraints on critical workloads to ensure pods are distributed evenly across zones. Configure Pod Disruption Budgets to prevent voluntary disruptions from reducing availability below thresholds. Use the AWS Load Balancer Controller with cross-zone load balancing enabled. Store persistent data on multi-AZ services (RDS Multi-AZ, ElastiCache with replicas) rather than single-AZ EBS volumes. Ensure CoreDNS, the AWS Load Balancer Controller, and other critical add-ons have anti-affinity rules preventing co-location on a single node.

**Q: When would you use Fargate profiles versus managed node groups?**

A: Use Fargate for workloads where you want zero node management overhead: batch jobs, CI/CD runners, low-traffic services, or security-sensitive workloads that benefit from per-pod isolation (each Fargate pod runs in its own micro-VM). Use managed node groups for workloads requiring DaemonSets (Fargate does not support them), GPU access, high network throughput, local storage, or when you need fine-grained control over instance types and placement. Fargate has higher per-vCPU cost but eliminates node management overhead and idle capacity waste.

## Production Tips

- **Use EKS managed add-ons for critical cluster components**: Managed add-ons (VPC CNI, CoreDNS, kube-proxy, EBS CSI) are tested for compatibility with each EKS version and can be upgraded independently of the cluster. This prevents version skew issues and ensures security patches are applied promptly. Configure add-ons with `resolveConflicts: OVERWRITE` to prevent manual modifications from blocking upgrades.

- **Implement cost allocation with Kubernetes labels and AWS tags**: Tag all Karpenter-provisioned nodes and EKS resources with team, environment, and service labels. Use Kubecost or AWS Cost Explorer with EKS cost allocation tags to attribute cluster costs to individual teams and services. This visibility drives accountability and identifies optimization opportunities like oversized resource requests or idle workloads.

- **Plan subnet sizing for pod density**: With VPC CNI, each pod consumes a VPC IP address. A /24 subnet provides only 251 usable IPs, limiting the number of pods that can run in that subnet. Use /19 or larger subnets for production clusters, and enable prefix delegation to maximize pod density per node. Monitor `aws-node` metrics for IP address exhaustion warnings.

## Related Topics

- [Core Concepts and Architecture](./core-concepts.md) — Kubernetes fundamentals that EKS manages
- [Workload Management](./workload-management.md) — Deployments and autoscaling on EKS
- [AWS Services](../aws/index.md) — IAM, VPC, and other AWS services that integrate with EKS
