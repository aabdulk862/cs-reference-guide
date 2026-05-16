# IAM and Security

## Quick Reference

- IAM (Identity and Access Management) controls who can do what across all AWS services using policies, roles, users, and groups
- Policy evaluation order: explicit Deny → Organizations SCPs → Resource-based policies → Identity-based policies → Permissions boundaries → Session policies
- IAM roles provide temporary credentials via AWS STS (Security Token Service) and are preferred over long-lived access keys
- Least-privilege principle: grant only the minimum permissions required for a task, then expand based on access patterns
- Service-linked roles are predefined by AWS services and cannot be modified; they grant exactly the permissions the service needs
- Cross-account access uses IAM roles with trust policies specifying the trusted account's principal ARN
- IAM Access Analyzer identifies resources shared externally and validates policies against best practices before deployment
- MFA (Multi-Factor Authentication) should be enforced on all human users, especially those with administrative access

## When to Use

IAM is not optional — it is the foundation of every AWS deployment and the first service you configure when setting up any account. You need deep IAM knowledge when designing multi-account architectures where workloads in one account must access resources in another, when implementing service-to-service authentication for microservices running on ECS or EKS using task roles or IRSA (IAM Roles for Service Accounts), when building CI/CD pipelines that need deployment permissions without storing long-lived credentials, when implementing break-glass procedures for emergency access that bypass normal approval workflows, and when preparing for compliance audits that require demonstrating least-privilege access controls.

Understanding IAM policy evaluation logic is critical when debugging access denied errors in production, when designing permission boundaries that prevent privilege escalation even if a developer has IAM permissions, and when implementing attribute-based access control (ABAC) that scales across hundreds of services without requiring per-resource policy updates.

## Code Examples

### IAM Policy with Conditions and Resource Constraints

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowS3AccessToSpecificBucket",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::production-data-bucket",
        "arn:aws:s3:::production-data-bucket/*"
      ],
      "Condition": {
        "StringEquals": {
          "aws:RequestedRegion": "us-east-1",
          "s3:x-amz-server-side-encryption": "aws:kms"
        },
        "IpAddress": {
          "aws:SourceIp": ["10.0.0.0/8", "172.16.0.0/12"]
        },
        "Bool": {
          "aws:SecureTransport": "true"
        }
      }
    },
    {
      "Sid": "DenyUnencryptedUploads",
      "Effect": "Deny",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::production-data-bucket/*",
      "Condition": {
        "StringNotEquals": {
          "s3:x-amz-server-side-encryption": "aws:kms"
        }
      }
    },
    {
      "Sid": "DenyAccessOutsideBusinessHours",
      "Effect": "Deny",
      "Action": "*",
      "Resource": "*",
      "Condition": {
        "DateGreaterThan": {
          "aws:CurrentTime": "2024-01-01T22:00:00Z"
        },
        "DateLessThan": {
          "aws:CurrentTime": "2024-01-02T06:00:00Z"
        }
      }
    }
  ]
}
```

### Cross-Account Role Assumption with AWS CDK

```typescript
import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';

export class CrossAccountAccessStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Role in Account B that Account A can assume
    const crossAccountRole = new iam.Role(this, 'CrossAccountDeployRole', {
      roleName: 'production-deploy-role',
      assumedBy: new iam.CompositePrincipal(
        // Trust the CI/CD role in Account A
        new iam.ArnPrincipal('arn:aws:iam::111111111111:role/ci-cd-pipeline-role'),
        // Trust the platform team role in Account A
        new iam.ArnPrincipal('arn:aws:iam::111111111111:role/platform-team-role')
      ),
      // Require MFA for human users
      externalId: 'deploy-2024-secure',
      maxSessionDuration: cdk.Duration.hours(1),
    });

    // Permissions boundary prevents privilege escalation
    const boundary = new iam.ManagedPolicy(this, 'DeployBoundary', {
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.DENY,
          actions: [
            'iam:CreateUser',
            'iam:CreateRole',
            'iam:DeleteRole',
            'iam:AttachRolePolicy',
            'organizations:*',
          ],
          resources: ['*'],
        }),
      ],
    });
    iam.PermissionsBoundary.of(crossAccountRole).apply(boundary);

    // Grant specific deployment permissions
    crossAccountRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'ecs:UpdateService',
        'ecs:DescribeServices',
        'ecs:RegisterTaskDefinition',
        'ecr:GetAuthorizationToken',
        'ecr:BatchGetImage',
        'ecr:GetDownloadUrlForLayer',
      ],
      resources: ['*'],
      conditions: {
        StringEquals: {
          'aws:RequestedRegion': ['us-east-1', 'us-west-2'],
        },
      },
    }));

    // Assume role from Account A
    // In the CI/CD pipeline (Account A):
    // aws sts assume-role \
    //   --role-arn arn:aws:iam::222222222222:role/production-deploy-role \
    //   --role-session-name ci-deploy-$(date +%s) \
    //   --external-id deploy-2024-secure \
    //   --duration-seconds 3600
  }
}
```

### IRSA (IAM Roles for Service Accounts) for EKS

```yaml
# Kubernetes ServiceAccount with IAM role annotation
apiVersion: v1
kind: ServiceAccount
metadata:
  name: order-service
  namespace: production
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::123456789012:role/order-service-role
    eks.amazonaws.com/sts-regional-endpoints: "true"
---
# Pod using the annotated ServiceAccount
apiVersion: apps/v1
kind: Deployment
metadata:
  name: order-service
  namespace: production
spec:
  template:
    spec:
      serviceAccountName: order-service
      containers:
        - name: order-service
          image: 123456789012.dkr.ecr.us-east-1.amazonaws.com/order-service:2.1.0
          env:
            - name: AWS_REGION
              value: us-east-1
            # AWS SDK automatically uses IRSA credentials via projected token
            # No access keys needed in environment or config
```

```typescript
// IAM role trust policy for IRSA (CDK)
const orderServiceRole = new iam.Role(this, 'OrderServiceRole', {
  roleName: 'order-service-role',
  assumedBy: new iam.FederatedPrincipal(
    `arn:aws:iam::${this.account}:oidc-provider/${oidcProviderUrl}`,
    {
      StringEquals: {
        [`${oidcProviderUrl}:sub`]: 'system:serviceaccount:production:order-service',
        [`${oidcProviderUrl}:aud`]: 'sts.amazonaws.com',
      },
    },
    'sts:AssumeRoleWithWebIdentity'
  ),
});

// Grant only the permissions the service needs
orderServiceRole.addToPolicy(new iam.PolicyStatement({
  actions: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:Query'],
  resources: [`arn:aws:dynamodb:us-east-1:${this.account}:table/orders`],
}));

orderServiceRole.addToPolicy(new iam.PolicyStatement({
  actions: ['sqs:SendMessage', 'sqs:ReceiveMessage', 'sqs:DeleteMessage'],
  resources: [`arn:aws:sqs:us-east-1:${this.account}:order-events`],
}));
```

## Common Pitfalls

1. **Using wildcard resources in production policies**: Policies with `"Resource": "*"` grant access to all resources of that type across the entire account. A policy allowing `s3:GetObject` on `*` means the role can read every S3 bucket including those containing secrets, backups, and other teams' data. Always scope resources to specific ARNs or ARN patterns. Use resource tags with condition keys for dynamic scoping when exact ARNs are not known at policy creation time.

2. **Relying on access keys instead of IAM roles**: Long-lived access keys stored in environment variables, configuration files, or CI/CD secrets are the most common source of AWS credential leaks. Keys cannot be automatically rotated by AWS, do not expire unless manually configured, and provide persistent access if compromised. Use IAM roles everywhere: EC2 instance profiles, ECS task roles, Lambda execution roles, IRSA for EKS, and `aws sts assume-role` for cross-account access. The only acceptable use of access keys is for external systems that cannot assume roles.

3. **Granting IAM permissions without permissions boundaries**: If a developer role has `iam:CreateRole` and `iam:AttachRolePolicy` permissions, they can create a new role with `AdministratorAccess` and assume it, effectively escalating to full admin. Permissions boundaries set a maximum permission ceiling that no policy attached to the role can exceed. Always apply permissions boundaries to roles that have any IAM write permissions, and deny the ability to modify or remove the boundary itself.

4. **Not using condition keys to restrict policy scope**: Policies without conditions are overly broad. Condition keys like `aws:RequestedRegion`, `aws:SourceIp`, `aws:PrincipalOrgID`, and `aws:ResourceTag` dramatically reduce blast radius. For example, restricting EC2 actions to `aws:RequestedRegion: us-east-1` prevents accidental or malicious resource creation in other regions. Combine multiple conditions for defense-in-depth: region restriction plus VPC endpoint restriction plus tag-based scoping.

5. **Ignoring the policy evaluation order during debugging**: When troubleshooting access denied errors, engineers often add more Allow statements without understanding that an explicit Deny anywhere in the evaluation chain (SCPs, resource policies, identity policies, boundaries) overrides all Allows. Use IAM Policy Simulator and CloudTrail logs to identify which policy is denying access. Check SCPs first in multi-account setups, then resource-based policies, then identity policies, then boundaries.

6. **Sharing IAM users across team members or services**: IAM users should map one-to-one with human identities or service identities. Shared credentials make audit trails meaningless (you cannot determine who performed an action), prevent individual access revocation, and violate compliance requirements. Use IAM Identity Center (SSO) for human access with individual accounts federated from your identity provider, and IAM roles for service-to-service authentication.

## Real-World Use Cases

- **Multi-account deployment pipeline**: A platform team manages 50+ AWS accounts organized by environment and team. The CI/CD pipeline in the tooling account assumes deployment roles in target accounts using cross-account role assumption with external IDs. Each target account's deployment role has a permissions boundary preventing IAM modifications, and SCPs at the organization level prevent disabling CloudTrail or modifying security configurations. Deployments are auditable through CloudTrail with the pipeline's session name identifying the specific build.

- **Emergency break-glass access**: A critical production incident requires database-level access that no engineer normally has. The break-glass procedure involves assuming a specially configured role that requires MFA, has a 1-hour maximum session duration, triggers an immediate PagerDuty alert to the security team, and logs all actions to a tamper-proof CloudTrail trail in a separate security account. The role's trust policy requires the engineer to be a member of a specific IAM group that is normally empty — adding themselves requires approval from two other engineers.

- **Attribute-based access control for microservices**: A platform with 200+ microservices uses ABAC instead of maintaining per-service policies. Each service's IAM role is tagged with `team`, `environment`, and `data-classification`. Resource policies on DynamoDB tables, SQS queues, and S3 buckets use condition keys matching these tags. When a new service is created, it automatically gets access to resources tagged with matching attributes without requiring policy updates to existing resources.

- **Compliance audit evidence generation**: Before a SOC 2 audit, the security team uses IAM Access Analyzer to generate findings for all resources shared externally, credential reports showing MFA status and key age for all users, and policy validation reports identifying overly permissive policies. Automated remediation scripts rotate keys older than 90 days, disable unused credentials, and generate evidence packages showing the current state of access controls across all accounts.

## Interview Questions

**Q: Explain the IAM policy evaluation logic. How does AWS determine whether a request is allowed or denied?**

A: AWS evaluates policies in a specific order with explicit Deny taking precedence at every level. First, if any applicable policy contains an explicit Deny matching the request, it is denied regardless of any Allow statements. For cross-account requests, both the identity-based policy in the source account and the resource-based policy in the target account must allow the action. Within a single account, the evaluation checks: Organizations SCPs (if applicable) → resource-based policies → identity-based policies → permissions boundaries → session policies. The request is allowed only if at least one policy grants Allow and no policy contains an explicit Deny. An implicit deny (absence of Allow) results in denial. Permissions boundaries do not grant access themselves but set the maximum permissions that identity-based policies can grant.

**Q: How would you implement least-privilege access for a microservice that needs to read from DynamoDB and write to SQS?**

A: Create a dedicated IAM role for the service with a trust policy allowing only the specific compute resource (ECS task, Lambda function, or EKS service account) to assume it. The role's policy should specify exact resource ARNs for the DynamoDB table and SQS queue, not wildcards. Limit DynamoDB actions to only what is needed (GetItem, Query — not Scan or DeleteItem). Add condition keys restricting the region and requiring encryption in transit. Apply a permissions boundary that prevents the role from modifying IAM resources or accessing services outside its scope. Use IAM Access Analyzer to verify the policy grants no unintended access, and enable CloudTrail data events to audit actual API calls for further refinement.

**Q: What is the difference between identity-based policies, resource-based policies, and permissions boundaries?**

A: Identity-based policies are attached to IAM users, groups, or roles and define what actions that identity can perform on which resources. Resource-based policies are attached to resources (S3 buckets, SQS queues, KMS keys) and define which principals can access that resource — they are the only way to grant cross-account access without role assumption. Permissions boundaries are advanced policies attached to roles or users that set the maximum permissions the identity can have — they do not grant access themselves but act as a ceiling. The effective permissions are the intersection of identity-based policies and permissions boundaries. A common pattern uses boundaries to prevent privilege escalation: even if a developer can create roles, the boundary ensures those roles cannot exceed the developer's own permission level.

**Q: How do you secure cross-account access in a multi-account AWS organization?**

A: Use IAM roles with trust policies rather than sharing credentials. The trust policy in the target account specifies the source account's role ARN as the trusted principal, optionally requiring an external ID to prevent confused deputy attacks. Apply SCPs at the organization level to enforce guardrails (prevent disabling CloudTrail, require encryption, restrict regions). Use AWS Organizations delegated administrator for services like Security Hub and GuardDuty. Implement a hub-and-spoke model where a central security account aggregates findings. For human access, use IAM Identity Center with permission sets that map to roles in target accounts, providing centralized access management with individual audit trails.

## Production Tips

- **Use IAM Access Analyzer continuously, not just during audits**: Enable Access Analyzer in every account and region. Configure it to alert on new external access findings via EventBridge rules that notify the security team. Review findings weekly and either remediate unintended external access or archive intentional sharing with documentation. Use the policy validation feature in CI/CD pipelines to catch overly permissive policies before they reach production.

- **Implement credential rotation automation for the few cases where access keys are unavoidable**: For external integrations that genuinely cannot use role assumption, automate key rotation using a Lambda function triggered by a CloudWatch Events rule on a schedule (every 90 days maximum). The function creates a new key, updates the external system via API, verifies the new key works, then deactivates and deletes the old key. Monitor for keys approaching the rotation deadline using IAM credential reports and alert if rotation fails.

- **Tag all IAM roles with ownership and purpose metadata**: Apply consistent tags (`team`, `service`, `environment`, `created-by`, `purpose`) to every IAM role. This enables automated cleanup of orphaned roles (roles not assumed in 90+ days), cost attribution for services using those roles, and rapid identification of role ownership during security incidents. Use tag-based SCPs to enforce tagging requirements — deny role creation without required tags.

## Related Topics

- [VPC and Networking](./vpc-and-networking.md) — Network-level security controls that complement IAM access policies
- [AWS Compute and Containers](./compute-and-containers.md) — Task roles and instance profiles for compute workloads
- [Kubernetes & EKS](../kubernetes/index.md) — IRSA integration for pod-level AWS access
- [Observability](../observability/index.md) — CloudTrail and access logging for IAM audit trails
