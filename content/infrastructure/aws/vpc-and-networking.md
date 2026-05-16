# VPC and Networking

## Quick Reference

- VPC (Virtual Private Cloud) is an isolated virtual network within an AWS region with its own IP address range (CIDR block)
- Subnets divide a VPC into segments across Availability Zones; public subnets have routes to an Internet Gateway, private subnets do not
- Security Groups are stateful firewalls at the ENI level; NACLs are stateless firewalls at the subnet level
- NAT Gateways allow private subnet resources to initiate outbound internet connections without being directly reachable
- VPC Endpoints (Gateway and Interface) provide private connectivity to AWS services without traversing the public internet
- Transit Gateway connects multiple VPCs and on-premises networks through a central hub with route table isolation
- VPC Flow Logs capture IP traffic metadata for security analysis, troubleshooting, and compliance auditing
- CIDR planning must account for non-overlapping ranges across all VPCs that may need peering or Transit Gateway connectivity

## When to Use

VPC networking knowledge is essential for every production AWS deployment. You need deep VPC understanding when designing multi-tier architectures that isolate databases from public-facing services, when implementing zero-trust networking where every service-to-service connection is explicitly authorized, when connecting on-premises data centers to AWS via Direct Connect or Site-to-Site VPN, when troubleshooting connectivity issues between services in different subnets or accounts, and when optimizing network costs by routing traffic through VPC endpoints instead of NAT Gateways.

Advanced VPC patterns become critical when building multi-account architectures with shared services VPCs, when implementing network segmentation for compliance requirements like PCI-DSS that mandate isolated cardholder data environments, when designing for high availability across multiple Availability Zones with automatic failover, and when optimizing data transfer costs that can dominate cloud bills for data-intensive workloads.

## Code Examples

### VPC with Multi-AZ Subnets Using AWS CDK

```typescript
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';

export class NetworkingStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;

  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Production VPC with carefully planned CIDR
    this.vpc = new ec2.Vpc(this, 'ProductionVpc', {
      vpcName: 'production-vpc',
      ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'), // 65,536 IPs
      maxAzs: 3,
      natGateways: 2, // Cost optimization: 2 NATs for 3 AZs

      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24, // 256 IPs per AZ for load balancers, NAT GWs
          mapPublicIpOnLaunch: false, // Explicit control over public IPs
        },
        {
          name: 'Application',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 20, // 4,096 IPs per AZ for application workloads
        },
        {
          name: 'Database',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 22, // 1,024 IPs per AZ for databases
        },
      ],

      flowLogs: {
        'vpc-flow-logs': {
          destination: ec2.FlowLogDestination.toCloudWatchLogs(),
          trafficType: ec2.FlowLogTrafficType.ALL,
        },
      },
    });

    // VPC Endpoints for AWS service access without NAT Gateway costs
    this.vpc.addGatewayEndpoint('S3Endpoint', {
      service: ec2.GatewayVpcEndpointAwsService.S3,
      subnets: [{ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }],
    });

    this.vpc.addGatewayEndpoint('DynamoDBEndpoint', {
      service: ec2.GatewayVpcEndpointAwsService.DYNAMODB,
    });

    this.vpc.addInterfaceEndpoint('EcrEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.ECR,
      privateDnsEnabled: true,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
    });

    this.vpc.addInterfaceEndpoint('EcrDockerEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER,
      privateDnsEnabled: true,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
    });

    this.vpc.addInterfaceEndpoint('CloudWatchLogsEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
      privateDnsEnabled: true,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
    });
  }
}
```

### Security Groups with Layered Access Control

```typescript
import * as ec2 from 'aws-cdk-lib/aws-ec2';

// ALB Security Group - accepts traffic from the internet
const albSecurityGroup = new ec2.SecurityGroup(this, 'AlbSg', {
  vpc,
  securityGroupName: 'alb-sg',
  description: 'Security group for Application Load Balancer',
  allowAllOutbound: false,
});
albSecurityGroup.addIngressRule(
  ec2.Peer.anyIpv4(),
  ec2.Port.tcp(443),
  'Allow HTTPS from internet'
);
albSecurityGroup.addEgressRule(
  ec2.Peer.anyIpv4(),
  ec2.Port.tcp(443),
  'Allow outbound HTTPS'
);

// Application Security Group - accepts traffic only from ALB
const appSecurityGroup = new ec2.SecurityGroup(this, 'AppSg', {
  vpc,
  securityGroupName: 'app-sg',
  description: 'Security group for application containers',
  allowAllOutbound: false,
});
appSecurityGroup.addIngressRule(
  albSecurityGroup,
  ec2.Port.tcp(8080),
  'Allow traffic from ALB only'
);
appSecurityGroup.addEgressRule(
  ec2.Peer.anyIpv4(),
  ec2.Port.tcp(443),
  'Allow outbound HTTPS for AWS API calls'
);

// Database Security Group - accepts traffic only from application tier
const dbSecurityGroup = new ec2.SecurityGroup(this, 'DbSg', {
  vpc,
  securityGroupName: 'db-sg',
  description: 'Security group for RDS instances',
  allowAllOutbound: false,
});
dbSecurityGroup.addIngressRule(
  appSecurityGroup,
  ec2.Port.tcp(5432),
  'Allow PostgreSQL from application tier only'
);
// No egress rules - database should not initiate outbound connections
```

### Network ACLs for Subnet-Level Protection

```typescript
// NACL for database subnets - defense in depth beyond security groups
const dbNacl = new ec2.NetworkAcl(this, 'DatabaseNacl', {
  vpc,
  networkAclName: 'database-nacl',
  subnetSelection: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
});

// Allow inbound PostgreSQL only from application subnets
dbNacl.addEntry('AllowPostgresInbound', {
  ruleNumber: 100,
  cidr: ec2.AclCidr.ipv4('10.0.16.0/20'), // Application subnet CIDR
  traffic: ec2.AclTraffic.tcpPort(5432),
  direction: ec2.TrafficDirection.INGRESS,
  ruleAction: ec2.Action.ALLOW,
});

// Allow ephemeral port responses back to application subnets
dbNacl.addEntry('AllowEphemeralOutbound', {
  ruleNumber: 100,
  cidr: ec2.AclCidr.ipv4('10.0.16.0/20'),
  traffic: ec2.AclTraffic.tcpPortRange(1024, 65535),
  direction: ec2.TrafficDirection.EGRESS,
  ruleAction: ec2.Action.ALLOW,
});

// Explicit deny all other traffic (NACLs have implicit deny, but explicit is clearer)
dbNacl.addEntry('DenyAllInbound', {
  ruleNumber: 200,
  cidr: ec2.AclCidr.anyIpv4(),
  traffic: ec2.AclTraffic.allTraffic(),
  direction: ec2.TrafficDirection.INGRESS,
  ruleAction: ec2.Action.DENY,
});
```

### Transit Gateway for Multi-VPC Connectivity

```yaml
# CloudFormation for Transit Gateway hub-and-spoke topology
AWSTemplateFormatVersion: '2010-09-09'
Description: Transit Gateway connecting production, staging, and shared services VPCs

Resources:
  TransitGateway:
    Type: AWS::EC2::TransitGateway
    Properties:
      Description: Central hub for inter-VPC routing
      DefaultRouteTableAssociation: disable
      DefaultRouteTablePropagation: disable
      DnsSupport: enable
      VpnEcmpSupport: enable
      Tags:
        - Key: Name
          Value: central-transit-gateway

  # Separate route tables for network segmentation
  ProductionRouteTable:
    Type: AWS::EC2::TransitGatewayRouteTable
    Properties:
      TransitGatewayId: !Ref TransitGateway
      Tags:
        - Key: Name
          Value: production-routes

  SharedServicesRouteTable:
    Type: AWS::EC2::TransitGatewayRouteTable
    Properties:
      TransitGatewayId: !Ref TransitGateway
      Tags:
        - Key: Name
          Value: shared-services-routes

  # Production VPC can reach shared services but not staging
  ProductionAttachment:
    Type: AWS::EC2::TransitGatewayAttachment
    Properties:
      TransitGatewayId: !Ref TransitGateway
      VpcId: !Ref ProductionVpcId
      SubnetIds:
        - !Ref ProductionSubnetAz1
        - !Ref ProductionSubnetAz2

  ProductionRouteAssociation:
    Type: AWS::EC2::TransitGatewayRouteTableAssociation
    Properties:
      TransitGatewayAttachmentId: !Ref ProductionAttachment
      TransitGatewayRouteTableId: !Ref ProductionRouteTable
```

## Common Pitfalls

1. **Overlapping CIDR blocks preventing future connectivity**: Choosing common CIDR ranges like `10.0.0.0/16` for every VPC makes it impossible to connect them via peering or Transit Gateway later, since overlapping ranges cannot be routed. Plan CIDR allocation centrally using an IPAM (IP Address Manager) tool, assign unique ranges per VPC from a master allocation, and reserve space for growth. A common pattern uses the second octet to encode environment and region: `10.1.0.0/16` for prod-us-east, `10.2.0.0/16` for staging-us-east.

2. **Relying solely on Security Groups without NACLs for compliance**: Security Groups are excellent for application-level access control, but compliance frameworks like PCI-DSS require network segmentation at the subnet level. NACLs provide this defense-in-depth layer. Without NACLs, a misconfigured Security Group rule could expose database ports to the entire VPC. Use NACLs on sensitive subnets (databases, secrets management) as a backstop that limits blast radius even if Security Groups are misconfigured.

3. **Routing all traffic through NAT Gateways instead of using VPC Endpoints**: NAT Gateway data processing charges ($0.045/GB) add up quickly for services making heavy AWS API calls. A service pulling container images from ECR, writing logs to CloudWatch, and reading from S3 can generate hundreds of gigabytes of NAT traffic monthly. VPC Gateway Endpoints (S3, DynamoDB) are free, and Interface Endpoints cost only $0.01/GB — both eliminate NAT Gateway charges for AWS service traffic.

4. **Not enabling VPC Flow Logs for security and troubleshooting**: Without Flow Logs, diagnosing connectivity issues requires guesswork. You cannot determine whether traffic is being blocked by Security Groups, NACLs, or route tables without visibility into actual packet flows. Enable Flow Logs on all production VPCs, send them to CloudWatch Logs or S3, and set up automated analysis for rejected traffic patterns that indicate misconfigurations or attack attempts.

5. **Using public subnets for application workloads**: Placing application containers or EC2 instances in public subnets exposes them directly to the internet, even if Security Groups restrict inbound access. A single Security Group misconfiguration or a vulnerability in the application becomes directly exploitable. Place all application workloads in private subnets behind a load balancer in the public subnet. Only load balancers, NAT Gateways, and bastion hosts (if absolutely necessary) belong in public subnets.

## Real-World Use Cases

- **Multi-account hub-and-spoke architecture**: A financial services company operates 200+ AWS accounts organized by business unit and environment. A central networking account hosts a Transit Gateway that connects all VPCs. Route table segmentation ensures production accounts cannot reach development accounts, shared services (DNS, artifact repositories, monitoring) are accessible from all accounts, and on-premises connectivity via Direct Connect is available only to accounts that require it. Network firewall inspection is applied to all inter-VPC traffic through a centralized inspection VPC.

- **PCI-DSS compliant cardholder data environment**: An e-commerce platform isolates payment processing in a dedicated VPC with no internet connectivity. The payment VPC connects to the application VPC via Transit Gateway with strict route table rules allowing only specific ports. NACLs enforce subnet-level segmentation, VPC Flow Logs provide audit trails, and all traffic between VPCs is encrypted via TLS. The isolated architecture satisfies PCI-DSS network segmentation requirements and limits the scope of annual compliance audits.

- **Cost optimization through endpoint routing**: A data analytics platform processing 50TB monthly through AWS services reduced networking costs by 60% by implementing VPC Endpoints. S3 Gateway Endpoints eliminated NAT charges for data lake access, Interface Endpoints for ECR reduced container image pull costs, and PrivateLink connections to third-party SaaS providers avoided internet egress charges. The total monthly savings exceeded $15,000 with no architectural changes to the applications themselves.

- **Zero-trust service mesh networking**: A microservices platform implements zero-trust networking where no service trusts any other by default. Each service runs in its own Security Group that allows inbound traffic only from explicitly authorized source Security Groups. Service-to-service communication uses mutual TLS through a service mesh (Istio), and network policies at the Kubernetes level provide an additional enforcement layer. VPC Flow Logs feed into a SIEM for anomaly detection on unexpected communication patterns.

## Interview Questions

**Q: Explain the difference between Security Groups and Network ACLs. When would you use each?**

A: Security Groups are stateful firewalls attached to ENIs (network interfaces) that evaluate rules based on the aggregate of all rules — if any rule allows traffic, it is permitted. They track connection state, so return traffic is automatically allowed. NACLs are stateless firewalls at the subnet level that evaluate rules in numbered order (first match wins) and require explicit rules for both inbound and outbound traffic including return traffic on ephemeral ports. Use Security Groups as the primary access control mechanism for application-level rules (which services can talk to which). Use NACLs as a defense-in-depth layer for subnet-level segmentation, particularly for compliance requirements that mandate network-level isolation. In practice, most traffic control is done via Security Groups, with NACLs providing a safety net on sensitive subnets.

**Q: How would you design a VPC for a three-tier web application that needs high availability?**

A: Design a VPC spanning three Availability Zones with three subnet tiers per AZ. Public subnets (small CIDR, /24) host only the Application Load Balancer and NAT Gateways. Private subnets with egress (larger CIDR, /20) host application containers in ECS or EKS with routes to NAT Gateways for outbound internet access. Isolated private subnets (medium CIDR, /22) host RDS instances in a Multi-AZ deployment with no internet route. Security Groups enforce tier-to-tier access: ALB accepts HTTPS from internet, application accepts traffic only from ALB, database accepts connections only from application tier. Deploy NAT Gateways in at least two AZs for redundancy. Add VPC Endpoints for S3, DynamoDB, ECR, and CloudWatch to reduce NAT costs and improve latency.

**Q: What is a VPC Endpoint and when would you choose a Gateway Endpoint versus an Interface Endpoint?**

A: VPC Endpoints provide private connectivity to AWS services without traffic leaving the AWS network. Gateway Endpoints are free, route-table-based entries that work only for S3 and DynamoDB — they add a route to the subnet's route table directing service traffic through the endpoint. Interface Endpoints use AWS PrivateLink, creating ENIs in your subnets with private IP addresses that DNS resolves to — they work for 100+ AWS services and third-party services. Choose Gateway Endpoints for S3 and DynamoDB (free, no bandwidth limits). Choose Interface Endpoints for all other services (ECR, CloudWatch, SQS, etc.) when you need private connectivity, when compliance requires traffic to stay within the VPC, or when you want to avoid NAT Gateway data processing charges for AWS API calls.

**Q: How do you troubleshoot connectivity issues between two services in different subnets?**

A: Follow a systematic approach: First, verify Security Group rules allow the traffic in both directions (inbound on destination, outbound on source). Second, check NACL rules on both subnets — remember NACLs are stateless, so you need rules for both the request and the ephemeral port response. Third, verify route tables have routes to the destination CIDR (especially for cross-VPC or cross-subnet traffic). Fourth, check VPC Flow Logs for REJECT entries matching the traffic pattern — the log shows which component rejected the traffic. Fifth, verify DNS resolution if using service names rather than IPs. Sixth, check if the target service is actually listening on the expected port. Use VPC Reachability Analyzer for automated path analysis that identifies the blocking component without sending actual traffic.

## Production Tips

- **Implement VPC Endpoint policies to restrict which resources can be accessed through endpoints**: By default, VPC Endpoints allow access to all resources within the service. For S3 Gateway Endpoints, add a policy restricting access to only your organization's buckets using `aws:PrincipalOrgID` condition. This prevents data exfiltration where a compromised workload uploads data to an attacker-controlled S3 bucket through your endpoint. Apply similar restrictions to Interface Endpoints for ECR, preventing pulls from unauthorized registries.

- **Use AWS Network Firewall or third-party appliances for east-west traffic inspection in regulated environments**: For compliance requirements that mandate inspection of inter-VPC traffic, deploy a centralized inspection VPC with Network Firewall. Route all Transit Gateway traffic through the inspection VPC using appliance mode. Configure stateful rules to detect and block known malicious patterns, log all allowed and denied flows, and alert on anomalous traffic volumes between services that should not communicate directly.

- **Plan subnet sizing for EKS pod networking with the VPC CNI plugin**: The AWS VPC CNI assigns real VPC IP addresses to every Kubernetes pod. A cluster running 500 pods needs 500 IPs from your subnet CIDR. Plan application subnets with /18 or larger CIDR blocks for EKS workloads. Use prefix delegation mode to assign /28 prefixes to nodes, increasing pod density per node from ~30 to ~110 pods. Monitor IP address utilization with the `aws-node` DaemonSet metrics and set alarms at 70% utilization to trigger subnet expansion before exhaustion.

## Related Topics

- [IAM and Security](./iam-and-security.md) — Identity policies that complement network-level access controls
- [S3 and Storage](./s3-and-storage.md) — S3 VPC Gateway Endpoints for private bucket access
- [Kubernetes & EKS](../kubernetes/index.md) — VPC CNI networking for pod IP assignment in EKS clusters
- [Observability](../observability/index.md) — VPC Flow Logs analysis for security monitoring
