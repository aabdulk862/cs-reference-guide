# AWS Services

Amazon Web Services provides the cloud infrastructure foundation for modern applications, offering 200+ services spanning compute, storage, networking, security, and observability. For software engineers building production systems, mastering core AWS services is essential — not just understanding what each service does, but knowing how to architect them together securely, cost-effectively, and at scale. This section covers the services most critical to backend and platform engineering: identity and access management, networking, storage, compute orchestration, and customer engagement.

Each subtopic provides production-oriented guidance with real-world patterns, security best practices, and operational considerations that go beyond basic tutorials. The focus is on services you will encounter daily when building and operating distributed systems on AWS.

## Learning Path

1. [IAM and Security](./iam-and-security.md) — Identity management, policy evaluation, roles, and least-privilege access patterns
2. [VPC and Networking](./vpc-and-networking.md) — Network architecture, subnets, security groups, endpoints, and multi-account connectivity
3. [S3 and Storage](./s3-and-storage.md) — Object storage, lifecycle policies, encryption, and data lake patterns
4. [Compute and Containers](./compute-and-containers.md) — ECS, EKS, Lambda, and compute selection strategies
5. [AWS Core Services](./aws-core-services.md) — EC2, S3, Lambda, DynamoDB, SQS, SNS, CloudFront, and RDS in production
6. [Serverless Patterns](./serverless-patterns.md) — Lambda architecture, Step Functions, EventBridge, and event-driven design
7. [Cloud Architecture Patterns](./cloud-architecture-patterns.md) — Multi-region, disaster recovery, cost optimization, and Well-Architected Framework

## Related Topics

- [Kubernetes & EKS](../kubernetes/index.md) — Container orchestration on AWS managed Kubernetes
- [Observability](../observability/index.md) — CloudWatch and monitoring for AWS workloads
- [Docker & Containerization](../docker/index.md) — Container images stored in ECR and deployed on AWS compute
