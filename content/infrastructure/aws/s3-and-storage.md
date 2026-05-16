# S3 and Storage

## Quick Reference

- S3 (Simple Storage Service) provides object storage with 99.999999999% (11 nines) durability and 99.99% availability for Standard class
- Storage classes: Standard, Intelligent-Tiering, Standard-IA, One Zone-IA, Glacier Instant Retrieval, Glacier Flexible, Glacier Deep Archive
- S3 provides strong read-after-write consistency for all operations (PUT, GET, DELETE, list) since December 2020 — no eventual consistency for any operation
- Maximum object size is 5TB; multipart upload required for objects over 5GB, recommended for objects over 100MB
- Bucket policies and ACLs control access; Block Public Access settings override all other policies to prevent accidental exposure
- S3 Event Notifications trigger Lambda, SQS, or SNS on object creation, deletion, or restoration events
- Versioning preserves all versions of objects, enabling recovery from accidental deletions and overwrites
- Server-side encryption options: SSE-S3 (AWS managed), SSE-KMS (customer managed keys), SSE-C (customer provided keys)

## When to Use

S3 is the default storage choice for any unstructured data in AWS. Use S3 Standard for frequently accessed data like application assets, user uploads, and API response caches. Use Intelligent-Tiering for data with unpredictable access patterns where you want automatic cost optimization without lifecycle policy management. Choose Glacier tiers for compliance archives, audit logs, and backups that are rarely accessed but must be retained for regulatory periods.

S3 becomes the foundation of data architectures when building data lakes that store raw, processed, and curated datasets in Parquet or ORC formats for analytics engines like Athena and Redshift Spectrum. Use S3 for static website hosting when combined with CloudFront, for storing Terraform state files with versioning and locking via DynamoDB, for CI/CD artifact storage, and for cross-region disaster recovery replication. Understanding S3 deeply is critical for cost optimization since storage costs often represent 30-50% of total AWS bills for data-intensive applications.

## Code Examples

### S3 Bucket with Security Best Practices (CDK)

```typescript
import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as iam from 'aws-cdk-lib/aws-iam';

export class SecureStorageStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Customer-managed KMS key for encryption
    const encryptionKey = new kms.Key(this, 'DataEncryptionKey', {
      alias: 'production-data-key',
      enableKeyRotation: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      description: 'Encrypts production data in S3',
    });

    // Production data bucket with comprehensive security
    const dataBucket = new s3.Bucket(this, 'ProductionDataBucket', {
      bucketName: `production-data-${this.account}-${this.region}`,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: encryptionKey,
      bucketKeyEnabled: true, // Reduces KMS API calls by 99%
      versioned: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true, // Deny non-HTTPS requests

      // Lifecycle rules for cost optimization
      lifecycleRules: [
        {
          id: 'transition-to-ia',
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(30),
            },
            {
              storageClass: s3.StorageClass.GLACIER_INSTANT_RETRIEVAL,
              transitionAfter: cdk.Duration.days(90),
            },
            {
              storageClass: s3.StorageClass.DEEP_ARCHIVE,
              transitionAfter: cdk.Duration.days(365),
            },
          ],
        },
        {
          id: 'cleanup-incomplete-uploads',
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(7),
        },
        {
          id: 'expire-old-versions',
          noncurrentVersionExpiration: cdk.Duration.days(90),
          noncurrentVersionsToRetain: 3,
        },
      ],

      // Access logging for audit trail
      serverAccessLogsBucket: accessLogBucket,
      serverAccessLogsPrefix: 'production-data/',

      // Prevent accidental deletion
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
    });

    // Bucket policy enforcing encryption and organization access
    dataBucket.addToResourcePolicy(new iam.PolicyStatement({
      sid: 'DenyUnencryptedUploads',
      effect: iam.Effect.DENY,
      principals: [new iam.AnyPrincipal()],
      actions: ['s3:PutObject'],
      resources: [dataBucket.arnForObjects('*')],
      conditions: {
        StringNotEquals: {
          's3:x-amz-server-side-encryption': 'aws:kms',
        },
      },
    }));

    dataBucket.addToResourcePolicy(new iam.PolicyStatement({
      sid: 'RestrictToOrganization',
      effect: iam.Effect.DENY,
      principals: [new iam.AnyPrincipal()],
      actions: ['s3:*'],
      resources: [dataBucket.bucketArn, dataBucket.arnForObjects('*')],
      conditions: {
        StringNotEquals: {
          'aws:PrincipalOrgID': 'o-abc123def4',
        },
      },
    }));
  }
}
```

### Multipart Upload with Retry Logic

```java
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.*;
import software.amazon.awssdk.core.sync.RequestBody;

import java.io.File;
import java.io.RandomAccessFile;
import java.util.ArrayList;
import java.util.List;

public class MultipartUploader {
    private static final long PART_SIZE = 100 * 1024 * 1024; // 100MB parts
    private static final int MAX_RETRIES = 3;
    private final S3Client s3Client;

    public MultipartUploader(S3Client s3Client) {
        this.s3Client = s3Client;
    }

    public String uploadLargeFile(String bucket, String key, File file) {
        // Initiate multipart upload
        CreateMultipartUploadResponse initResponse = s3Client.createMultipartUpload(
            CreateMultipartUploadRequest.builder()
                .bucket(bucket)
                .key(key)
                .serverSideEncryption(ServerSideEncryption.AWS_KMS)
                .storageClass(StorageClass.INTELLIGENT_TIERING)
                .metadata(Map.of(
                    "upload-timestamp", Instant.now().toString(),
                    "content-hash", computeSha256(file)
                ))
                .build()
        );

        String uploadId = initResponse.uploadId();
        List<CompletedPart> completedParts = new ArrayList<>();

        try {
            long fileSize = file.length();
            long position = 0;
            int partNumber = 1;

            while (position < fileSize) {
                long partSize = Math.min(PART_SIZE, fileSize - position);
                byte[] partData = readFilePart(file, position, partSize);

                CompletedPart part = uploadPartWithRetry(
                    bucket, key, uploadId, partNumber, partData
                );
                completedParts.add(part);

                position += partSize;
                partNumber++;
            }

            // Complete the multipart upload
            CompleteMultipartUploadResponse response = s3Client.completeMultipartUpload(
                CompleteMultipartUploadRequest.builder()
                    .bucket(bucket)
                    .key(key)
                    .uploadId(uploadId)
                    .multipartUpload(CompletedMultipartUpload.builder()
                        .parts(completedParts)
                        .build())
                    .build()
            );

            return response.eTag();
        } catch (Exception e) {
            // Abort upload on failure to avoid incomplete upload charges
            s3Client.abortMultipartUpload(AbortMultipartUploadRequest.builder()
                .bucket(bucket).key(key).uploadId(uploadId).build());
            throw new RuntimeException("Multipart upload failed", e);
        }
    }

    private CompletedPart uploadPartWithRetry(
            String bucket, String key, String uploadId, int partNumber, byte[] data) {
        for (int attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                UploadPartResponse response = s3Client.uploadPart(
                    UploadPartRequest.builder()
                        .bucket(bucket)
                        .key(key)
                        .uploadId(uploadId)
                        .partNumber(partNumber)
                        .build(),
                    RequestBody.fromBytes(data)
                );
                return CompletedPart.builder()
                    .partNumber(partNumber)
                    .eTag(response.eTag())
                    .build();
            } catch (S3Exception e) {
                if (attempt == MAX_RETRIES) throw e;
                Thread.sleep((long) Math.pow(2, attempt) * 1000); // Exponential backoff
            }
        }
        throw new RuntimeException("Unreachable");
    }
}
```

### S3 Event-Driven Processing Pipeline

```typescript
import { S3Event, Context } from 'aws-lambda';
import { S3Client, GetObjectCommand, CopyObjectCommand } from '@aws-sdk/client-s3';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

const s3 = new S3Client({});
const sqs = new SQSClient({});

export async function handler(event: S3Event, context: Context): Promise<void> {
  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
    const size = record.s3.object.size;

    console.log(JSON.stringify({
      level: 'INFO',
      message: 'Processing S3 event',
      bucket,
      key,
      size,
      eventType: record.eventName,
      requestId: context.awsRequestId,
    }));

    // Validate file before processing
    if (!key.startsWith('uploads/') || size > 500 * 1024 * 1024) {
      console.log(JSON.stringify({ level: 'WARN', message: 'Skipping invalid file', key, size }));
      continue;
    }

    // Move to processing prefix and trigger downstream
    const processingKey = key.replace('uploads/', 'processing/');
    await s3.send(new CopyObjectCommand({
      Bucket: bucket,
      CopySource: `${bucket}/${key}`,
      Key: processingKey,
      ServerSideEncryption: 'aws:kms',
      MetadataDirective: 'COPY',
    }));

    // Send processing message to downstream queue
    await sqs.send(new SendMessageCommand({
      QueueUrl: process.env.PROCESSING_QUEUE_URL,
      MessageBody: JSON.stringify({
        bucket,
        key: processingKey,
        originalKey: key,
        size,
        timestamp: record.eventTime,
      }),
      MessageGroupId: key.split('/')[1], // FIFO ordering by upload prefix
    }));
  }
}
```

## Common Pitfalls

1. **Not enabling versioning before it is needed**: Once an object is overwritten or deleted without versioning enabled, the previous version is permanently lost. Enable versioning on all production buckets from creation. The cost of storing previous versions is minimal compared to the cost of data loss. Combine versioning with lifecycle rules that expire old versions after a retention period (e.g., keep 3 previous versions or expire after 90 days) to control storage costs.

2. **Ignoring S3 request costs for high-throughput workloads**: S3 charges per request ($0.0004 per 1,000 GET requests for Standard). An application making millions of small object reads daily can accumulate significant request costs. Batch small objects into larger ones, use S3 Select to retrieve only needed data from large objects, implement application-level caching with ElastiCache or CloudFront, and consider DynamoDB for high-frequency key-value access patterns where per-request pricing is more predictable.

3. **Using bucket ACLs instead of bucket policies**: ACLs are a legacy access control mechanism that is difficult to audit and reason about. AWS recommends disabling ACLs entirely (Object Ownership: Bucket owner enforced) and using bucket policies exclusively. Bucket policies provide centralized, readable access control with condition keys, are visible in a single document, and integrate with IAM Access Analyzer for automated review.

4. **Not implementing lifecycle rules for incomplete multipart uploads**: Incomplete multipart uploads (started but never completed or aborted) accumulate invisible storage charges. A single failed upload of a 5TB object costs $115/month in Standard storage if not cleaned up. Always configure a lifecycle rule to abort incomplete multipart uploads after 7 days. Monitor the `s3:ObjectCreated:CompleteMultipartUpload` vs `s3:ObjectCreated:Put` ratio to detect upload failures.

5. **Storing sensitive data without encryption enforcement**: Even with default encryption enabled on a bucket, clients can explicitly upload unencrypted objects unless a bucket policy denies `PutObject` requests missing the `x-amz-server-side-encryption` header. Always add a deny policy for unencrypted uploads. Use KMS encryption with customer-managed keys for data requiring key rotation, access logging, and the ability to revoke access by disabling the key.

## Real-World Use Cases

- **Data lake with tiered storage and analytics**: A fintech company stores 500TB of transaction data in S3 organized by date partitions (`s3://data-lake/transactions/year=2024/month=01/day=15/`). Recent data (30 days) stays in Standard for Athena queries, older data transitions to Intelligent-Tiering, and data beyond 1 year moves to Glacier Instant Retrieval for compliance queries. Athena queries scan only relevant partitions using Hive-style paths, reducing costs by 90% compared to full-table scans.

- **Cross-region disaster recovery with replication**: A healthcare platform replicates all patient data from us-east-1 to us-west-2 using S3 Cross-Region Replication with encryption. Replication rules filter by prefix (only `/patient-records/` and `/medical-images/`) and replicate to a different storage class (Standard-IA in the DR region). RTO is under 15 minutes since the DR region always has current data. Replication metrics in CloudWatch alert if replication lag exceeds 5 minutes.

- **Immutable audit log storage for compliance**: A banking application writes audit logs to an S3 bucket with Object Lock in Compliance mode (cannot be deleted by anyone, including root account, until retention expires). Logs are written with a 7-year retention period satisfying SOX requirements. The bucket has versioning enabled, MFA Delete configured, and a bucket policy preventing any principal from modifying Object Lock settings. CloudTrail data events log every access to the audit bucket.

- **Static asset delivery with CloudFront origin**: A media platform serves 10TB of static assets (images, videos, documents) through CloudFront with S3 as the origin. Origin Access Control restricts direct S3 access — only CloudFront can read objects. Assets are uploaded to a staging prefix, validated by a Lambda function, then copied to the production prefix. Cache invalidation is triggered only for updated assets, and S3 Transfer Acceleration handles uploads from global content creators.

## Interview Questions

**Q: Explain S3 storage classes and how you would design a lifecycle policy for a data lake.**

A: S3 offers storage classes optimized for different access patterns: Standard for frequent access (highest cost, lowest latency), Intelligent-Tiering for unpredictable patterns (automatic tiering with monitoring fee), Standard-IA for infrequent access (lower storage cost, retrieval fee), One Zone-IA for reproducible data, Glacier Instant Retrieval for quarterly access, Glacier Flexible for hours-to-retrieve archives, and Deep Archive for 12-hour retrieval compliance data. For a data lake, I would keep the last 30 days in Standard for active analytics, transition to Standard-IA at 30 days for ad-hoc queries, move to Glacier Instant Retrieval at 90 days for monthly reporting, and Deep Archive at 365 days for compliance retention. Lifecycle rules handle transitions automatically, and I would use Intelligent-Tiering for datasets with unpredictable access patterns rather than guessing transition timings.

**Q: How would you secure an S3 bucket containing sensitive customer data?**

A: Layer multiple security controls: Enable Block Public Access at the account level. Use a bucket policy that denies access from outside the AWS Organization (`aws:PrincipalOrgID`), denies unencrypted uploads, and requires TLS (`aws:SecureTransport`). Enable KMS encryption with a customer-managed key that has a restrictive key policy. Enable versioning and configure Object Lock for compliance-critical data. Enable server access logging to a separate audit bucket. Use VPC Endpoints with endpoint policies to restrict which VPCs can access the bucket. Enable CloudTrail data events for object-level access logging. Use IAM Access Analyzer to continuously monitor for unintended external access. Implement S3 Inventory for regular audits of encryption status and access patterns.

**Q: What is S3 consistency model and how does it affect application design?**

A: Since December 2020, S3 provides strong read-after-write consistency for all operations. A successful PUT returns only after the object is fully replicated, and subsequent GET requests immediately return the new version. DELETE operations are also strongly consistent — after a successful DELETE, GET returns 404 immediately. This eliminated the previous eventual consistency issues where list operations could miss recently created objects or GET could return stale data after overwrite. However, applications should still handle the case where S3 returns 500/503 errors during high-throughput operations and implement retry logic with exponential backoff. Cross-region replication remains eventually consistent with typical lag of seconds to minutes.

**Q: How do you optimize S3 costs for a high-volume application?**

A: Start with S3 Storage Lens for visibility into access patterns and cost drivers. Implement lifecycle rules to transition infrequently accessed data to cheaper storage classes. Use Intelligent-Tiering for unpredictable workloads to avoid manual optimization. Abort incomplete multipart uploads with lifecycle rules. Batch small objects to reduce per-request costs. Use S3 Select or Glacier Select to retrieve partial objects instead of downloading entire files. Implement CloudFront caching for frequently accessed objects to reduce S3 GET requests. Use VPC Gateway Endpoints to eliminate NAT Gateway data transfer charges for S3 access. Monitor and right-size request patterns — consider DynamoDB for high-frequency small-object access patterns where S3 request pricing becomes expensive.

## Production Tips

- **Enable S3 Inventory for continuous auditing of encryption and replication status**: S3 Inventory generates daily or weekly CSV/ORC/Parquet reports listing all objects with metadata including encryption status, storage class, replication status, and last modified date. Use Athena to query inventory reports for compliance checks: find unencrypted objects, identify objects that failed replication, or detect objects in expensive storage classes that should have transitioned. This is far more efficient than listing objects via the API for large buckets.

- **Use S3 Batch Operations for large-scale remediation tasks**: When you need to re-encrypt millions of objects with a new KMS key, change storage class for an entire prefix, or restore objects from Glacier, S3 Batch Operations processes objects in parallel at scale. Create a manifest from S3 Inventory, define the operation (copy, invoke Lambda, change ACL), and S3 handles retry logic, progress tracking, and completion reporting. This is orders of magnitude faster and more reliable than scripting object-by-object operations.

- **Implement request rate partitioning for high-throughput prefixes**: S3 automatically partitions based on key prefix for high request rates (3,500 PUT/POST/DELETE and 5,500 GET per second per prefix). For workloads exceeding these limits, distribute objects across multiple prefixes using a hash or date-based partitioning scheme. Avoid sequential key names (timestamps, auto-incrementing IDs) that concentrate requests on a single partition. Use random prefixes or reverse the timestamp for write-heavy workloads.

## Related Topics

- [IAM and Security](./iam-and-security.md) — Bucket policies and access control for S3 resources
- [VPC and Networking](./vpc-and-networking.md) — S3 Gateway Endpoints for private access without NAT costs
- [Observability](../observability/index.md) — S3 access logging and CloudWatch metrics for storage monitoring
- [Kubernetes & EKS](../kubernetes/index.md) — Persistent storage patterns using S3 CSI drivers
