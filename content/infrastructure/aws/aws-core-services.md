# AWS Core Services

## Quick Reference

- EC2 instance types follow a naming convention: `[family][generation].[size]` (e.g., `m5.xlarge` = general purpose, 5th gen, extra large)
- S3 offers 99.999999999% (11 nines) durability and 99.99% availability for Standard tier
- Lambda supports up to 10GB memory, 15-minute timeout, 1000 concurrent executions (default soft limit)
- RDS supports automated backups with point-in-time recovery up to 35 days retention
- DynamoDB single-digit millisecond latency at any scale with on-demand or provisioned capacity modes
- SQS standard queues offer at-least-once delivery; FIFO queues guarantee exactly-once processing with 300 TPS (3000 with batching)
- CloudFront has 450+ edge locations globally with sub-millisecond latency for cached content
- SNS supports fan-out to millions of subscribers across SQS, Lambda, HTTP, email, and SMS

## When to Use

AWS core services form the foundation of virtually every cloud architecture on the platform. EC2 is appropriate when you need full control over the operating system, require specific hardware configurations (GPU instances for ML, high-memory for in-memory databases), or are running legacy applications that cannot be containerized. S3 is the default choice for any object storage need — static assets, data lake storage, backup targets, and log archives. Lambda fits event-driven workloads with unpredictable traffic patterns where you want zero operational overhead. RDS is ideal when you need relational database capabilities with managed backups, patching, and replication without the operational burden of self-managed databases. DynamoDB excels at high-throughput, low-latency key-value and document workloads where horizontal scaling is critical. SQS and SNS provide the messaging backbone for decoupled microservice architectures, enabling asynchronous processing and fan-out patterns. CloudFront accelerates content delivery globally and provides DDoS protection at the edge.

## Code Examples

### EC2 Instance Launch with User Data

```python
import boto3

ec2 = boto3.client('ec2', region_name='us-east-1')

user_data_script = """#!/bin/bash
yum update -y
yum install -y docker
systemctl start docker
systemctl enable docker
docker pull nginx:latest
docker run -d -p 80:80 nginx:latest
"""

response = ec2.run_instances(
    ImageId='ami-0c02fb55956c7d316',  # Amazon Linux 2
    InstanceType='t3.medium',
    MinCount=1,
    MaxCount=1,
    KeyName='my-key-pair',
    UserData=user_data_script,
    SecurityGroupIds=['sg-0123456789abcdef0'],
    SubnetId='subnet-0123456789abcdef0',
    IamInstanceProfile={'Name': 'EC2-SSM-Role'},
    TagSpecifications=[{
        'ResourceType': 'instance',
        'Tags': [
            {'Key': 'Name', 'Value': 'web-server-prod'},
            {'Key': 'Environment', 'Value': 'production'}
        ]
    }],
    MetadataOptions={
        'HttpTokens': 'required',  # IMDSv2 only
        'HttpEndpoint': 'enabled'
    }
)

instance_id = response['Instances'][0]['InstanceId']
print(f"Launched instance: {instance_id}")
```

### S3 Operations with Lifecycle Policies

```python
import boto3
import json

s3 = boto3.client('s3')

# Create bucket with versioning and encryption
s3.create_bucket(
    Bucket='my-app-data-prod',
    CreateBucketConfiguration={'LocationConstraint': 'us-west-2'}
)

s3.put_bucket_versioning(
    Bucket='my-app-data-prod',
    VersioningConfiguration={'Status': 'Enabled'}
)

s3.put_bucket_encryption(
    Bucket='my-app-data-prod',
    ServerSideEncryptionConfiguration={
        'Rules': [{
            'ApplyServerSideEncryptionByDefault': {
                'SSEAlgorithm': 'aws:kms',
                'KMSMasterKeyID': 'alias/my-app-key'
            },
            'BucketKeyEnabled': True
        }]
    }
)

# Lifecycle policy: transition to IA after 30 days, Glacier after 90
lifecycle_policy = {
    'Rules': [{
        'ID': 'archive-old-data',
        'Status': 'Enabled',
        'Filter': {'Prefix': 'logs/'},
        'Transitions': [
            {'Days': 30, 'StorageClass': 'STANDARD_IA'},
            {'Days': 90, 'StorageClass': 'GLACIER'},
            {'Days': 365, 'StorageClass': 'DEEP_ARCHIVE'}
        ],
        'NoncurrentVersionExpiration': {'NoncurrentDays': 30}
    }]
}

s3.put_bucket_lifecycle_configuration(
    Bucket='my-app-data-prod',
    LifecycleConfiguration=lifecycle_policy
)
```

### Lambda Function with SQS Trigger

```python
import json
import boto3
import logging
from typing import Any

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('orders')

def handler(event: dict, context: Any) -> dict:
    """Process order messages from SQS queue."""
    batch_item_failures = []

    for record in event['Records']:
        try:
            body = json.loads(record['body'])
            order_id = body['orderId']
            
            # Idempotency check
            existing = table.get_item(
                Key={'orderId': order_id},
                ProjectionExpression='orderId, #s',
                ExpressionAttributeNames={'#s': 'status'}
            )
            
            if 'Item' in existing and existing['Item']['status'] == 'processed':
                logger.info(f"Order {order_id} already processed, skipping")
                continue

            # Process the order
            table.put_item(Item={
                'orderId': order_id,
                'customerId': body['customerId'],
                'amount': body['amount'],
                'status': 'processed',
                'processedAt': context.get_remaining_time_in_millis()
            })

            logger.info(f"Successfully processed order {order_id}")

        except Exception as e:
            logger.error(f"Failed to process record: {e}")
            batch_item_failures.append({
                'itemIdentifier': record['messageId']
            })

    return {'batchItemFailures': batch_item_failures}
```

### DynamoDB Single-Table Design

```python
import boto3
from boto3.dynamodb.conditions import Key, Attr
from decimal import Decimal

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('ecommerce')

# Write: Create customer with orders using single-table design
def create_order(customer_id: str, order_id: str, items: list, total: float):
    """Single-table design: PK=CUSTOMER#id, SK varies by entity type."""
    table.put_item(Item={
        'PK': f'CUSTOMER#{customer_id}',
        'SK': f'ORDER#{order_id}',
        'GSI1PK': f'ORDER#{order_id}',
        'GSI1SK': f'CUSTOMER#{customer_id}',
        'type': 'Order',
        'items': items,
        'total': Decimal(str(total)),
        'status': 'pending',
        'createdAt': '2024-01-15T10:30:00Z'
    })

# Query: Get all orders for a customer
def get_customer_orders(customer_id: str):
    response = table.query(
        KeyConditionExpression=Key('PK').eq(f'CUSTOMER#{customer_id}')
            & Key('SK').begins_with('ORDER#'),
        ScanIndexForward=False,  # Most recent first
        Limit=20
    )
    return response['Items']

# Query: Get order details using GSI
def get_order_details(order_id: str):
    response = table.query(
        IndexName='GSI1',
        KeyConditionExpression=Key('GSI1PK').eq(f'ORDER#{order_id}')
    )
    return response['Items']
```

### CloudFront Distribution with S3 Origin

```yaml
# CloudFormation template for CloudFront + S3 static site
AWSTemplateFormatVersion: '2010-09-09'
Resources:
  WebBucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: my-app-static-assets
      PublicAccessBlockConfiguration:
        BlockPublicAcls: true
        BlockPublicPolicy: true
        IgnorePublicAcls: true
        RestrictPublicBuckets: true

  CloudFrontOAC:
    Type: AWS::CloudFront::OriginAccessControl
    Properties:
      OriginAccessControlConfig:
        Name: S3OAC
        OriginAccessControlOriginType: s3
        SigningBehavior: always
        SigningProtocol: sigv4

  Distribution:
    Type: AWS::CloudFront::Distribution
    Properties:
      DistributionConfig:
        Origins:
          - Id: S3Origin
            DomainName: !GetAtt WebBucket.RegionalDomainName
            OriginAccessControlId: !Ref CloudFrontOAC
            S3OriginConfig:
              OriginAccessIdentity: ''
        DefaultCacheBehavior:
          TargetOriginId: S3Origin
          ViewerProtocolPolicy: redirect-to-https
          CachePolicyId: 658327ea-f89d-4fab-a63d-7e88639e58f6  # CachingOptimized
          Compress: true
        DefaultRootObject: index.html
        HttpVersion: http2and3
        PriceClass: PriceClass_100
        ViewerCertificate:
          CloudFrontDefaultCertificate: true
        CustomErrorResponses:
          - ErrorCode: 403
            ResponseCode: 200
            ResponsePagePath: /index.html
            ErrorCachingMinTTL: 10
```

### SNS + SQS Fan-Out Pattern

```python
import boto3
import json

sns = boto3.client('sns')
sqs = boto3.client('sqs')

# Create SNS topic for order events
topic_response = sns.create_topic(Name='order-events')
topic_arn = topic_response['TopicArn']

# Subscribe multiple SQS queues for different consumers
queues = {
    'inventory-queue': 'arn:aws:sqs:us-east-1:123456789:inventory-updates',
    'analytics-queue': 'arn:aws:sqs:us-east-1:123456789:analytics-events',
    'notification-queue': 'arn:aws:sqs:us-east-1:123456789:customer-notifications'
}

for queue_name, queue_arn in queues.items():
    sns.subscribe(
        TopicArn=topic_arn,
        Protocol='sqs',
        Endpoint=queue_arn,
        Attributes={
            'FilterPolicy': json.dumps({
                'eventType': ['order.created', 'order.shipped']
            }),
            'RawMessageDelivery': 'true'
        }
    )

# Publish order event
sns.publish(
    TopicArn=topic_arn,
    Message=json.dumps({
        'orderId': 'ORD-12345',
        'customerId': 'CUST-789',
        'total': 99.99,
        'items': [{'sku': 'WIDGET-A', 'qty': 2}]
    }),
    MessageAttributes={
        'eventType': {
            'DataType': 'String',
            'StringValue': 'order.created'
        }
    }
)
```

## Common Pitfalls

- **EC2 instance metadata vulnerability**: Not enforcing IMDSv2 (`HttpTokens: required`) leaves instances vulnerable to SSRF attacks that can steal IAM credentials from the metadata service at `169.254.169.254`
- **S3 bucket naming collisions**: S3 bucket names are globally unique across all AWS accounts. Using predictable names allows attackers to pre-register buckets and intercept data (bucket squatting)
- **Lambda cold start amplification**: Placing Lambda functions inside a VPC historically added 5-10 seconds of cold start time. Since the 2019 Hyperplane improvement, VPC cold starts add only ~100-200ms additional latency. Use VPC only when the function needs access to private resources (RDS, ElastiCache, internal services)
- **DynamoDB hot partitions**: Designing partition keys with low cardinality (e.g., using status values as PK) creates hot partitions that throttle even with sufficient provisioned capacity. Use high-cardinality keys with write sharding if needed
- **SQS visibility timeout mismatch**: Setting visibility timeout shorter than function processing time causes duplicate processing. Set visibility timeout to 6x the Lambda timeout when using SQS triggers
- **CloudFront cache invalidation costs**: Invalidating paths costs $0.005 per path after the first 1000/month. Use versioned file names (e.g., `app.abc123.js`) instead of invalidations for deployable assets
- **RDS storage autoscaling surprises**: Enabling storage autoscaling without alerts can lead to unexpected costs. Storage can only grow, never shrink — once allocated, you pay for it permanently

## Real-World Use Cases

**E-commerce Platform Architecture**: A mid-size retailer uses EC2 Auto Scaling groups behind an ALB for their web tier, RDS Multi-AZ for transactional data, DynamoDB for session storage and shopping carts (sub-millisecond reads), S3 for product images served through CloudFront, and SQS to decouple order processing from payment confirmation. During Black Friday, the architecture scales from 4 to 40 EC2 instances automatically while DynamoDB on-demand handles 10x normal write throughput without pre-provisioning.

**Real-Time Analytics Pipeline**: A SaaS company ingests clickstream data through API Gateway to Lambda, which writes to Kinesis Data Streams. A Lambda consumer processes events in micro-batches, enriches them with DynamoDB lookups, and writes aggregated results to S3 in Parquet format. CloudFront serves a dashboard SPA that queries Athena over the S3 data lake, providing near-real-time analytics with a 95th percentile query time under 3 seconds.

**Multi-Tenant SaaS Platform**: Each tenant's data is isolated using DynamoDB's partition key strategy (tenant ID as PK prefix), with per-tenant encryption keys in KMS. Lambda functions handle API requests with tenant context extracted from JWT tokens. SNS topics with filter policies route tenant-specific events to dedicated processing queues, enabling per-tenant rate limiting and priority processing for premium tiers.

## Interview Questions

**Q: How would you design a system to handle 100,000 concurrent file uploads to S3?**

A: Use S3 multipart upload for files over 100MB, with presigned URLs generated by a Lambda function behind API Gateway to avoid routing upload traffic through your servers. Implement client-side chunking with parallel part uploads (5-10 concurrent parts). Use S3 Transfer Acceleration for global users, which routes through CloudFront edge locations. For tracking, each upload generates an S3 event notification to an SQS queue, processed by a Lambda that updates upload status in DynamoDB. Key considerations: set appropriate part sizes (minimum 5MB), implement retry logic with exponential backoff for failed parts, and use the `CompleteMultipartUpload` API only after all parts succeed. For cost optimization, configure a lifecycle rule to abort incomplete multipart uploads after 7 days.

**Q: Explain DynamoDB's consistency model and when you'd choose eventual vs. strong consistency.**

A: DynamoDB offers eventual consistency (default) and strong consistency for reads. Eventually consistent reads return data from any replica and may be stale by up to one second — they cost half the RCU of strongly consistent reads. Strongly consistent reads always return the most recent write but only work against the leader node in a single region. In practice, I use eventual consistency for read-heavy workloads like product catalogs, user profiles, and analytics dashboards where sub-second staleness is acceptable. Strong consistency is necessary for operations requiring read-after-write guarantees: checking inventory before confirming an order, verifying idempotency keys, or reading a record immediately after creation in a synchronous flow. Global tables only support eventual consistency across regions, so cross-region strong consistency requires application-level coordination.

**Q: What happens when a Lambda function connected to an SQS queue fails repeatedly?**

A: When Lambda fails to process an SQS message, the message becomes visible again after the visibility timeout expires. Lambda's SQS integration retries the message based on the queue's `maxReceiveCount` setting. After exceeding `maxReceiveCount` (typically 3-5 attempts), the message moves to a configured Dead Letter Queue (DLQ). Key operational concerns: set the source queue's visibility timeout to at least 6x the Lambda function timeout to prevent duplicate processing during retries. Monitor the DLQ depth with CloudWatch alarms. For partial batch failures, return `batchItemFailures` in the response to retry only failed messages rather than the entire batch. Implement idempotent processing since at-least-once delivery means messages may be processed more than once even without explicit failures.

**Q: How does CloudFront handle cache invalidation and what are the alternatives?**

A: CloudFront cache invalidation removes objects from edge caches before their TTL expires. You can invalidate specific paths (`/images/logo.png`) or use wildcards (`/api/*`). Invalidations propagate globally within 60-120 seconds but cost $0.005 per path after 1000 free per month. Better alternatives: use versioned URLs (`/assets/app.v2.3.1.js`) so new deployments reference new paths without invalidation. For dynamic content, use short TTLs (1-5 seconds) with `stale-while-revalidate` behavior. For API responses, use cache policies with appropriate `max-age` and `s-maxage` headers. Origin Shield adds a centralized cache layer that reduces origin load during invalidation storms.

## Production Tips

- **Enable S3 Intelligent-Tiering** for data with unpredictable access patterns — it automatically moves objects between frequent and infrequent access tiers with no retrieval fees, saving 40-70% on storage costs for data accessed less than once per month
- **Use EC2 Spot Instances** for fault-tolerant workloads (batch processing, CI/CD, stateless web servers behind ASGs) to save 60-90% compared to On-Demand pricing. Implement graceful shutdown handling using the 2-minute Spot interruption notice via instance metadata
- **Configure DynamoDB auto-scaling** with target utilization at 70% for provisioned mode, or use on-demand mode for unpredictable workloads. Monitor `ConsumedReadCapacityUnits` and `ThrottledRequests` metrics — throttling indicates hot partitions or insufficient capacity
- **Set Lambda reserved concurrency** for critical functions to prevent a noisy neighbor function from consuming your account's concurrency pool. Use provisioned concurrency for latency-sensitive functions to eliminate cold starts entirely (costs ~$0.015/GB-hour)
- **Implement CloudWatch composite alarms** that combine multiple metrics (CPU > 80% AND request errors > 5%) to reduce alert fatigue. Use CloudWatch Anomaly Detection for metrics without obvious static thresholds

## Related Topics

- [Serverless Patterns](./serverless-patterns.md) — Deep dive into Lambda architecture and event-driven design patterns
- [Infrastructure as Code](../ci-cd/infrastructure-as-code.md) — Automating AWS resource provisioning with Terraform and CloudFormation
- [Cloud Architecture Patterns](./cloud-architecture-patterns.md) — Multi-region, disaster recovery, and cost optimization strategies
- [Messaging Patterns](../../backend/messaging/messaging-patterns.md) — Event-driven architecture patterns applicable to SQS/SNS designs
