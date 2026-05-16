# Kubernetes & EKS

Kubernetes is the dominant container orchestration platform for automating deployment, scaling, and management of containerized applications across clusters of machines. Originally developed by Google and now maintained by the Cloud Native Computing Foundation, Kubernetes provides a declarative API for defining desired state, self-healing capabilities that automatically replace failed containers, and a rich ecosystem of extensions for networking, storage, and security. Amazon Elastic Kubernetes Service (EKS) delivers a managed Kubernetes control plane on AWS, handling etcd persistence, API server availability, and version upgrades while integrating natively with IAM, VPC networking, and load balancing.

Understanding Kubernetes architecture, workload management, networking primitives, and operational patterns is essential for any engineer building or maintaining production microservice platforms. The topics below progress from core concepts through production-grade deployment strategies and AWS-specific integrations.

## Learning Path

1. [Core Concepts and Architecture](./core-concepts.md) — Pods, control plane components, node architecture, and the Kubernetes API model
2. [Workload Management](./workload-management.md) — Deployments, StatefulSets, DaemonSets, Jobs, and scaling strategies
3. [Networking and Services](./networking-and-services.md) — Service types, Ingress, DNS, network policies, and service mesh fundamentals
4. [Configuration and Secrets](./configuration-and-secrets.md) — ConfigMaps, Secrets, environment injection, and external secret management
5. [EKS and AWS Integration](./eks-aws-integration.md) — IRSA, VPC CNI, managed node groups, Karpenter, and Fargate profiles

## Related Topics

- [Docker & Containerization](../docker/index.md) — Container fundamentals that Kubernetes orchestrates
- [AWS Services](../aws/index.md) — Cloud services that integrate with EKS clusters
- [Observability](../observability/index.md) — Monitoring and logging for Kubernetes workloads
