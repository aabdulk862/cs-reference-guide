# Infrastructure as Code

## Quick Reference

- Terraform uses HCL (HashiCorp Configuration Language) with a plan-apply workflow; state stored in backends (S3, Terraform Cloud, Consul)
- CloudFormation is AWS-native, supports drift detection natively, and processes changes as changesets before execution
- Pulumi uses general-purpose languages (TypeScript, Python, Go, C#) instead of DSLs, enabling loops, conditionals, and unit testing
- Terraform state file contains sensitive data (passwords, keys) — always encrypt at rest and restrict access to the state backend
- `terraform plan` is not a guarantee — concurrent changes between plan and apply can cause drift or conflicts
- CloudFormation stack updates can cause resource replacement (destructive) — always review changeset before executing
- Terraform modules should be versioned and sourced from a registry (public or private) for reusability across teams
- IaC drift occurs when manual changes are made outside the tool — detect with `terraform plan`, CloudFormation drift detection, or scheduled CI checks

## When to Use

Infrastructure as Code is mandatory for any production environment beyond a single developer's sandbox. Use Terraform when managing multi-cloud infrastructure, when you need a mature ecosystem of providers (AWS, GCP, Azure, Kubernetes, Datadog, PagerDuty), or when your team values the explicit plan-apply workflow. Choose CloudFormation when operating exclusively in AWS and you want native integration with AWS services (Service Catalog, Control Tower, StackSets for multi-account), or when you need drift detection without third-party tooling. Select Pulumi when your team prefers writing infrastructure in familiar programming languages, needs complex logic (dynamic resource generation, conditional deployments), or wants to leverage existing testing frameworks (Jest, pytest) for infrastructure tests. For small teams or startups, Terraform with an S3 backend is the pragmatic default. For enterprises with AWS-only footprints and governance requirements, CloudFormation with StackSets provides centralized control. Pulumi fits teams that find HCL limiting and want IDE support, type checking, and code reuse patterns from their application development workflow.

## Code Examples

### Terraform: Production VPC with Multi-AZ Subnets

```hcl
# modules/vpc/main.tf
terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

variable "environment" {
  type        = string
  description = "Environment name (dev, staging, prod)"
}

variable "vpc_cidr" {
  type    = string
  default = "10.0.0.0/16"
}

variable "availability_zones" {
  type    = list(string)
  default = ["us-east-1a", "us-east-1b", "us-east-1c"]
}

locals {
  public_subnets  = [for i, az in var.availability_zones : cidrsubnet(var.vpc_cidr, 8, i)]
  private_subnets = [for i, az in var.availability_zones : cidrsubnet(var.vpc_cidr, 8, i + 10)]
  db_subnets      = [for i, az in var.availability_zones : cidrsubnet(var.vpc_cidr, 8, i + 20)]
}

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name        = "${var.environment}-vpc"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_subnet" "public" {
  count                   = length(var.availability_zones)
  vpc_id                  = aws_vpc.main.id
  cidr_block              = local.public_subnets[count.index]
  availability_zone       = var.availability_zones[count.index]
  map_public_ip_on_launch = true

  tags = {
    Name = "${var.environment}-public-${var.availability_zones[count.index]}"
    Tier = "public"
  }
}

resource "aws_subnet" "private" {
  count             = length(var.availability_zones)
  vpc_id            = aws_vpc.main.id
  cidr_block        = local.private_subnets[count.index]
  availability_zone = var.availability_zones[count.index]

  tags = {
    Name = "${var.environment}-private-${var.availability_zones[count.index]}"
    Tier = "private"
  }
}

resource "aws_nat_gateway" "main" {
  count         = length(var.availability_zones)
  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id

  tags = {
    Name = "${var.environment}-nat-${var.availability_zones[count.index]}"
  }
}

resource "aws_eip" "nat" {
  count  = length(var.availability_zones)
  domain = "vpc"
}

output "vpc_id" {
  value = aws_vpc.main.id
}

output "private_subnet_ids" {
  value = aws_subnet.private[*].id
}

output "public_subnet_ids" {
  value = aws_subnet.public[*].id
}
```

### Terraform: Remote State with Locking

```hcl
# backend.tf — S3 backend with DynamoDB locking
terraform {
  backend "s3" {
    bucket         = "mycompany-terraform-state"
    key            = "prod/networking/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    kms_key_id     = "alias/terraform-state-key"
    dynamodb_table = "terraform-state-locks"
  }
}

# State locking table (bootstrap separately or use CloudFormation)
resource "aws_dynamodb_table" "terraform_locks" {
  name         = "terraform-state-locks"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  tags = {
    Purpose = "Terraform state locking"
  }
}

# Data source: reference another state file
data "terraform_remote_state" "networking" {
  backend = "s3"
  config = {
    bucket = "mycompany-terraform-state"
    key    = "prod/networking/terraform.tfstate"
    region = "us-east-1"
  }
}

# Use outputs from networking state
resource "aws_instance" "app" {
  ami           = "ami-0c02fb55956c7d316"
  instance_type = "t3.medium"
  subnet_id     = data.terraform_remote_state.networking.outputs.private_subnet_ids[0]
}
```

### CloudFormation: ECS Fargate Service with Auto Scaling

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Description: ECS Fargate service with auto-scaling and ALB

Parameters:
  Environment:
    Type: String
    AllowedValues: [dev, staging, prod]
  ImageUri:
    Type: String
    Description: Container image URI from ECR
  DesiredCount:
    Type: Number
    Default: 2

Resources:
  TaskDefinition:
    Type: AWS::ECS::TaskDefinition
    Properties:
      Family: !Sub '${Environment}-api'
      Cpu: '512'
      Memory: '1024'
      NetworkMode: awsvpc
      RequiresCompatibilities: [FARGATE]
      ExecutionRoleArn: !GetAtt ExecutionRole.Arn
      TaskRoleArn: !GetAtt TaskRole.Arn
      ContainerDefinitions:
        - Name: api
          Image: !Ref ImageUri
          PortMappings:
            - ContainerPort: 8080
              Protocol: tcp
          LogConfiguration:
            LogDriver: awslogs
            Options:
              awslogs-group: !Ref LogGroup
              awslogs-region: !Ref AWS::Region
              awslogs-stream-prefix: api
          Environment:
            - Name: ENVIRONMENT
              Value: !Ref Environment
          Secrets:
            - Name: DATABASE_URL
              ValueFrom: !Sub 'arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/${Environment}/database-url'
          HealthCheck:
            Command: ['CMD-SHELL', 'curl -f http://localhost:8080/health || exit 1']
            Interval: 30
            Timeout: 5
            Retries: 3

  Service:
    Type: AWS::ECS::Service
    DependsOn: ALBListener
    Properties:
      Cluster: !Ref ECSCluster
      TaskDefinition: !Ref TaskDefinition
      DesiredCount: !Ref DesiredCount
      LaunchType: FARGATE
      NetworkConfiguration:
        AwsvpcConfiguration:
          Subnets: !Ref PrivateSubnets
          SecurityGroups: [!Ref ServiceSG]
      LoadBalancers:
        - ContainerName: api
          ContainerPort: 8080
          TargetGroupArn: !Ref TargetGroup
      DeploymentConfiguration:
        MaximumPercent: 200
        MinimumHealthyPercent: 100
        DeploymentCircuitBreaker:
          Enable: true
          Rollback: true

  AutoScaling:
    Type: AWS::ApplicationAutoScaling::ScalableTarget
    Properties:
      MaxCapacity: 20
      MinCapacity: !Ref DesiredCount
      ResourceId: !Sub 'service/${ECSCluster}/${Service.Name}'
      ScalableDimension: ecs:service:DesiredCount
      ServiceNamespace: ecs

  ScalingPolicy:
    Type: AWS::ApplicationAutoScaling::ScalingPolicy
    Properties:
      PolicyName: cpu-target-tracking
      PolicyType: TargetTrackingScaling
      ScalingTargetId: !Ref AutoScaling
      TargetTrackingScalingPolicyConfiguration:
        PredefinedMetricSpecification:
          PredefinedMetricType: ECSServiceAverageCPUUtilization
        TargetValue: 70
        ScaleInCooldown: 300
        ScaleOutCooldown: 60
```

### Pulumi: Kubernetes Deployment with TypeScript

```typescript
import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import * as k8s from '@pulumi/kubernetes';

const config = new pulumi.Config();
const environment = config.require('environment');
const replicas = config.getNumber('replicas') || 3;

// Create EKS cluster
const cluster = new aws.eks.Cluster('app-cluster', {
  name: `${environment}-cluster`,
  roleArn: clusterRole.arn,
  vpcConfig: {
    subnetIds: privateSubnetIds,
    securityGroupIds: [clusterSg.id],
    endpointPrivateAccess: true,
    endpointPublicAccess: environment !== 'prod',
  },
  version: '1.28',
  enabledClusterLogTypes: ['api', 'audit', 'authenticator'],
});

// Kubernetes provider using EKS cluster credentials
const k8sProvider = new k8s.Provider('k8s', {
  kubeconfig: cluster.kubeconfig,
});

// Deploy application with health checks and resource limits
const appDeployment = new k8s.apps.v1.Deployment('api-deployment', {
  metadata: {
    name: 'api',
    namespace: 'default',
    labels: { app: 'api', environment },
  },
  spec: {
    replicas,
    selector: { matchLabels: { app: 'api' } },
    strategy: {
      type: 'RollingUpdate',
      rollingUpdate: { maxSurge: '25%', maxUnavailable: 0 },
    },
    template: {
      metadata: { labels: { app: 'api', environment } },
      spec: {
        containers: [{
          name: 'api',
          image: `${ecrRepo.repositoryUrl}:${config.require('imageTag')}`,
          ports: [{ containerPort: 8080 }],
          resources: {
            requests: { cpu: '250m', memory: '512Mi' },
            limits: { cpu: '1000m', memory: '1Gi' },
          },
          livenessProbe: {
            httpGet: { path: '/health', port: 8080 },
            initialDelaySeconds: 15,
            periodSeconds: 10,
          },
          readinessProbe: {
            httpGet: { path: '/ready', port: 8080 },
            initialDelaySeconds: 5,
            periodSeconds: 5,
          },
          env: [
            { name: 'ENVIRONMENT', value: environment },
            { name: 'DB_HOST', valueFrom: { secretKeyRef: { name: 'db-credentials', key: 'host' } } },
          ],
        }],
        topologySpreadConstraints: [{
          maxSkew: 1,
          topologyKey: 'topology.kubernetes.io/zone',
          whenUnsatisfiable: 'DoNotSchedule',
          labelSelector: { matchLabels: { app: 'api' } },
        }],
      },
    },
  },
}, { provider: k8sProvider });

export const clusterEndpoint = cluster.endpoint;
export const deploymentName = appDeployment.metadata.name;
```

### Terraform: Module Composition Pattern

```hcl
# environments/prod/main.tf — composing reusable modules
module "networking" {
  source  = "git::https://github.com/myorg/terraform-modules.git//networking?ref=v2.3.1"
  
  environment        = "prod"
  vpc_cidr           = "10.0.0.0/16"
  availability_zones = ["us-east-1a", "us-east-1b", "us-east-1c"]
  enable_nat_gateway = true
  single_nat_gateway = false  # One per AZ for HA in prod
}

module "database" {
  source = "git::https://github.com/myorg/terraform-modules.git//rds?ref=v1.8.0"

  environment        = "prod"
  engine             = "postgres"
  engine_version     = "15.4"
  instance_class     = "db.r6g.xlarge"
  allocated_storage  = 100
  multi_az           = true
  subnet_ids         = module.networking.db_subnet_ids
  vpc_id             = module.networking.vpc_id
  
  backup_retention_period = 35
  deletion_protection     = true
  
  performance_insights_enabled = true
  monitoring_interval         = 60
}

module "ecs_service" {
  source = "git::https://github.com/myorg/terraform-modules.git//ecs-fargate?ref=v3.1.0"

  environment    = "prod"
  service_name   = "api"
  image_uri      = "${aws_ecr_repository.api.repository_url}:${var.image_tag}"
  desired_count  = 4
  cpu            = 1024
  memory         = 2048
  
  vpc_id             = module.networking.vpc_id
  private_subnet_ids = module.networking.private_subnet_ids
  public_subnet_ids  = module.networking.public_subnet_ids
  
  environment_variables = {
    DATABASE_HOST = module.database.endpoint
    REDIS_HOST    = module.cache.endpoint
  }
  
  secrets = {
    DATABASE_PASSWORD = module.database.password_secret_arn
    API_KEY           = aws_secretsmanager_secret.api_key.arn
  }

  auto_scaling = {
    min_capacity = 4
    max_capacity = 40
    cpu_target   = 70
  }
}
```

## Common Pitfalls

- **Storing secrets in Terraform state**: State files contain all resource attributes including passwords, API keys, and certificates in plaintext. Always use an encrypted backend (S3 with KMS, Terraform Cloud) and restrict state access via IAM policies. Never commit state files to version control
- **Monolithic state files**: Putting all infrastructure in a single state file creates blast radius problems — a typo in a dev resource change can accidentally destroy production databases. Split state by environment and by service boundary (networking, compute, data)
- **CloudFormation circular dependencies**: Resources that reference each other create circular dependencies that CloudFormation cannot resolve. Break cycles by using `DependsOn`, splitting into nested stacks, or using `Fn::ImportValue` across stacks
- **Terraform provider version drift**: Not pinning provider versions causes different team members to get different plan outputs. Always use version constraints (`~> 5.0`) and commit the `.terraform.lock.hcl` file to ensure reproducible builds
- **Ignoring `prevent_destroy` lifecycle rules**: Critical resources (databases, S3 buckets with data, encryption keys) should have `lifecycle { prevent_destroy = true }` to prevent accidental deletion via `terraform destroy` or resource replacement
- **Manual changes causing drift**: Any change made through the AWS console or CLI outside of IaC creates drift that causes future applies to fail or produce unexpected results. Implement SCPs that restrict console access to read-only for production accounts, and run drift detection in CI on a schedule
- **Not using `terraform import` for existing resources**: Teams often recreate resources that already exist instead of importing them, causing downtime. Use `terraform import` to bring existing infrastructure under management, then run `terraform plan` to verify no changes are detected

## Real-World Use Cases

**Multi-Account AWS Landing Zone**: An enterprise uses Terraform with AWS Organizations to manage 50+ accounts. A root module defines the organizational structure, SCPs, and shared networking (Transit Gateway). Account-level modules deploy standardized VPCs, IAM roles, GuardDuty, and Config rules. Each team gets a dedicated account with pre-configured Terraform backends and CI/CD pipelines. Changes to shared infrastructure require approval from the platform team via Atlantis pull request automation, while team-level changes are self-service within guardrails defined by SCPs.

**GitOps Deployment Pipeline**: A SaaS company uses Terraform Cloud workspaces connected to GitHub repositories. Infrastructure changes follow the same PR workflow as application code: branch, commit, plan (auto-triggered), review plan output, approve, apply. Sentinel policies enforce compliance rules (no public S3 buckets, all RDS instances must be encrypted, EC2 instances must use approved AMIs). Cost estimation runs on every plan, blocking merges that exceed budget thresholds. State is versioned with automatic rollback capability.

**Disaster Recovery Infrastructure**: A financial services company maintains active-passive multi-region infrastructure using CloudFormation StackSets. The primary region runs full production workloads while the DR region maintains warm standby (RDS read replicas, pre-provisioned ECS capacity at minimum scale, replicated S3 buckets). A single CloudFormation parameter change (`ActiveRegion: us-west-2`) triggers failover by scaling up the DR region and updating Route 53 health checks. Monthly DR drills validate the failover process completes within the 15-minute RTO target.

## Interview Questions

**Q: How do you manage Terraform state safely in a team environment?**

A: Use a remote backend (S3 + DynamoDB for locking, or Terraform Cloud) that provides encryption at rest, access control, and state locking to prevent concurrent modifications. Structure state files by environment and service boundary — never put dev and prod in the same state. Enable state file versioning in S3 for rollback capability. Restrict state access via IAM policies so developers can plan against production state but only CI/CD pipelines can apply. Use `terraform_remote_state` data sources to share outputs between state files without coupling them. For sensitive values, use `sensitive = true` on outputs and variables to prevent them from appearing in CLI output, but remember they still exist in state — the real protection is backend encryption and access control.

**Q: Explain the difference between Terraform's declarative approach and Pulumi's imperative approach.**

A: Terraform is declarative — you describe the desired end state in HCL and Terraform figures out the operations needed to reach it. This makes plans predictable and auditable but limits expressiveness (no arbitrary loops until recently, limited conditionals). Pulumi is imperative in syntax but declarative in execution — you write TypeScript/Python that constructs a desired state graph, and Pulumi's engine diffs it against current state just like Terraform. The practical difference is developer experience: Pulumi gives you IDE autocomplete, type checking, unit testing with standard frameworks, and the full power of a programming language for dynamic resource generation. The trade-off is that Pulumi code can be harder to review in PRs because the infrastructure intent is mixed with programming logic, whereas HCL's limited syntax makes the infrastructure declaration immediately visible.

**Q: How do you handle infrastructure drift in production?**

A: Prevention first: restrict production console access to read-only via SCPs, require all changes through IaC pipelines, and use AWS Config rules to detect non-compliant resources. Detection: run `terraform plan` on a schedule (every 4 hours via CI) against production state — any planned changes indicate drift. CloudFormation has native drift detection that compares actual resource properties against the template. Response: for minor drift (tag changes, description updates), import the current state and update the code to match. For critical drift (security group rules opened, encryption disabled), immediately remediate through the IaC pipeline and investigate the root cause. Implement alerting on drift detection results so the team is notified within minutes of unauthorized changes.

**Q: When would you choose CloudFormation over Terraform for an AWS-only environment?**

A: CloudFormation advantages: native AWS integration means zero-day support for new services (Terraform providers lag by days/weeks), StackSets for multi-account deployments, Service Catalog integration for self-service provisioning, native drift detection, and no external state management (AWS manages it). Choose CloudFormation when you need AWS Control Tower integration, when compliance requires using only AWS-native tools, when you want automatic rollback on deployment failures (CloudFormation rolls back the entire stack), or when using AWS-specific features like custom resources backed by Lambda. Choose Terraform when you need multi-cloud support, when the HCL ecosystem provides better abstractions for your use case, when you want more granular control over the apply process (targeted applies, resource tainting), or when your team already has Terraform expertise.

## Production Tips

- **Implement policy-as-code** using OPA/Conftest for Terraform plans or CloudFormation Guard for templates. Enforce rules like "no public S3 buckets," "all EBS volumes encrypted," and "RDS instances must have deletion protection" before changes reach production. This catches misconfigurations at PR time rather than after deployment
- **Use Terraform workspaces or directory-based separation** for environment isolation. Directory-based (`environments/dev/`, `environments/prod/`) with separate state files is preferred over workspaces because it provides clearer separation and allows different module versions per environment
- **Pin module versions explicitly** — never use `ref=main` for module sources in production. Tag releases (`ref=v2.3.1`) and upgrade deliberately with changelog review. A broken module update applied across all environments simultaneously is a common cause of widespread outages
- **Implement blast radius controls**: use `-target` flags in CI for high-risk changes, require manual approval for changes affecting more than N resources, and separate stateless compute (safe to recreate) from stateful data (dangerous to modify) into different state files
- **Run `terraform plan` in CI on every PR** and post the plan output as a PR comment (tools like Atlantis, Spacelift, or env0 automate this). Require human review of plan output before merge. This catches unintended resource replacements that would cause downtime

## Related Topics

- [AWS Core Services](../aws/aws-core-services.md) — The services you provision and manage with IaC tools
- [Cloud Architecture Patterns](../aws/cloud-architecture-patterns.md) — Architectural patterns that IaC enables at scale
- [Serverless Patterns](../aws/serverless-patterns.md) — Serverless infrastructure commonly deployed via SAM, CDK, or Terraform
- [CI/CD Fundamentals](./ci-cd-fundamentals.md) — Pipeline integration for automated infrastructure deployment
