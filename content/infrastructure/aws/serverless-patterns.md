# Serverless Patterns

## Quick Reference

- Lambda cold starts: 100-500ms for Python/Node.js, 1-10s for Java/C# (JVM/CLR initialization)
- Provisioned concurrency eliminates cold starts at ~$0.015/GB-hour; use for latency-sensitive paths only
- Step Functions standard workflows cost $0.025 per 1000 state transitions; Express workflows cost $0.00001667 per GB-second
- Lambda@Edge runs at CloudFront edge locations with 5-second timeout; CloudFront Functions run at 218+ PoPs with 1ms max execution
- API Gateway WebSocket connections support up to 2 hours idle timeout and 500,000 concurrent connections per account
- Lambda Destinations route async invocation results (success/failure) to SQS, SNS, Lambda, or EventBridge without custom error handling code
- EventBridge processes events with sub-second latency and supports content-based filtering with 28+ AWS service integrations
- Lambda SnapStart reduces Java cold starts from 5-10s to under 200ms by pre-initializing and snapshotting the execution environment

## When to Use

Serverless patterns are ideal when you want to minimize operational overhead, pay only for actual compute consumption, and scale automatically from zero to thousands of concurrent executions. Choose serverless for event-driven workloads with variable traffic patterns — API backends that spike during business hours, file processing triggered by uploads, scheduled data transformations, and webhook handlers. Serverless excels at glue logic between managed services: transforming data between S3 and a database, processing messages from queues, responding to infrastructure events, and orchestrating multi-step workflows. Avoid serverless for long-running computations exceeding 15 minutes, workloads requiring persistent connections (WebSocket servers with complex state), applications needing sub-10ms latency guarantees (cold starts are unavoidable without provisioned concurrency), or high-throughput steady-state workloads where reserved EC2 capacity is more cost-effective. The break-even point typically occurs around 40-60% sustained utilization — above that, containers or EC2 become cheaper.

## Code Examples

### Event-Driven Lambda with Dead Letter Queue

```typescript
// AWS CDK infrastructure definition
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as eventsources from 'aws-cdk-lib/aws-lambda-event-sources';

export class OrderProcessingStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string) {
    super(scope, id);

    const dlq = new sqs.Queue(this, 'OrderDLQ', {
      queueName: 'order-processing-dlq',
      retentionPeriod: cdk.Duration.days(14),
    });

    const orderQueue = new sqs.Queue(this, 'OrderQueue', {
      queueName: 'order-processing',
      visibilityTimeout: cdk.Duration.seconds(900), // 6x Lambda timeout
      deadLetterQueue: {
        queue: dlq,
        maxReceiveCount: 3,
      },
    });

    const processor = new lambda.Function(this, 'OrderProcessor', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/order-processor'),
      timeout: cdk.Duration.seconds(150),
      memorySize: 1024,
      reservedConcurrentExecutions: 50,
      environment: {
        TABLE_NAME: 'orders',
        IDEMPOTENCY_TABLE: 'idempotency-store',
      },
      tracing: lambda.Tracing.ACTIVE,
    });

    processor.addEventSource(new eventsources.SqsEventSource(orderQueue, {
      batchSize: 10,
      maxBatchingWindow: cdk.Duration.seconds(5),
      reportBatchItemFailures: true,
    }));
  }
}
```

### Lambda Handler with Idempotency and Structured Logging

```typescript
import { Logger } from '@aws-lambda-powertools/logger';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { Idempotency } from '@aws-lambda-powertools/idempotency';
import { DynamoDBPersistenceLayer } from '@aws-lambda-powertools/idempotency/dynamodb';
import { SQSEvent, SQSBatchResponse } from 'aws-lambda';

const logger = new Logger({ serviceName: 'order-processor' });
const tracer = new Tracer({ serviceName: 'order-processor' });

const persistenceStore = new DynamoDBPersistenceLayer({
  tableName: process.env.IDEMPOTENCY_TABLE!,
});

interface OrderEvent {
  orderId: string;
  customerId: string;
  items: Array<{ sku: string; quantity: number; price: number }>;
  total: number;
}

export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  const batchItemFailures: Array<{ itemIdentifier: string }> = [];

  for (const record of event.Records) {
    const segment = tracer.getSegment();
    const subsegment = segment?.addNewSubsegment('processOrder');

    try {
      const order: OrderEvent = JSON.parse(record.body);
      logger.info('Processing order', { orderId: order.orderId });

      await processOrderIdempotent(order);

      logger.info('Order processed successfully', {
        orderId: order.orderId,
        itemCount: order.items.length,
      });
    } catch (error) {
      logger.error('Failed to process order', { error, messageId: record.messageId });
      batchItemFailures.push({ itemIdentifier: record.messageId });
    } finally {
      subsegment?.close();
    }
  }

  return { batchItemFailures };
};

const processOrderIdempotent = Idempotency.handler(
  async (order: OrderEvent) => {
    // Business logic: validate inventory, charge payment, update status
    await validateInventory(order.items);
    await chargePayment(order.customerId, order.total);
    await updateOrderStatus(order.orderId, 'confirmed');
  },
  { persistenceStore }
);
```

### Step Functions Workflow for Order Saga

```json
{
  "Comment": "Order processing saga with compensation",
  "StartAt": "ReserveInventory",
  "States": {
    "ReserveInventory": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:us-east-1:123456789:function:reserve-inventory",
      "ResultPath": "$.inventoryReservation",
      "Catch": [{
        "ErrorEquals": ["InsufficientInventoryError"],
        "Next": "NotifyOutOfStock",
        "ResultPath": "$.error"
      }],
      "Next": "ProcessPayment"
    },
    "ProcessPayment": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:us-east-1:123456789:function:process-payment",
      "ResultPath": "$.paymentResult",
      "Catch": [{
        "ErrorEquals": ["PaymentDeclinedError"],
        "Next": "ReleaseInventory",
        "ResultPath": "$.error"
      }],
      "Next": "ConfirmOrder"
    },
    "ConfirmOrder": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:us-east-1:123456789:function:confirm-order",
      "End": true
    },
    "ReleaseInventory": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:us-east-1:123456789:function:release-inventory",
      "Comment": "Compensation: release reserved inventory on payment failure",
      "Next": "NotifyPaymentFailed"
    },
    "NotifyPaymentFailed": {
      "Type": "Task",
      "Resource": "arn:aws:sns:us-east-1:123456789:order-failures",
      "End": true
    },
    "NotifyOutOfStock": {
      "Type": "Task",
      "Resource": "arn:aws:sns:us-east-1:123456789:inventory-alerts",
      "End": true
    }
  }
}
```

### EventBridge with Content-Based Routing

```typescript
import * as cdk from 'aws-cdk-lib';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as lambda from 'aws-cdk-lib/aws-lambda';

export class EventRoutingStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string) {
    super(scope, id);

    const bus = new events.EventBus(this, 'AppEventBus', {
      eventBusName: 'ecommerce-events',
    });

    // Route high-value orders to priority processing
    new events.Rule(this, 'HighValueOrderRule', {
      eventBus: bus,
      eventPattern: {
        source: ['ecommerce.orders'],
        detailType: ['OrderCreated'],
        detail: {
          total: [{ numeric: ['>=', 1000] }],
          customerTier: ['premium', 'enterprise'],
        },
      },
      targets: [new targets.LambdaFunction(priorityProcessor)],
    });

    // Route inventory events to warehouse system
    new events.Rule(this, 'InventoryRule', {
      eventBus: bus,
      eventPattern: {
        source: ['ecommerce.inventory'],
        detailType: ['StockLevelChanged'],
        detail: {
          currentStock: [{ numeric: ['<=', 10] }],
        },
      },
      targets: [
        new targets.LambdaFunction(reorderFunction),
        new targets.SqsQueue(warehouseAlertQueue),
      ],
    });

    // Archive all events for replay capability
    new events.Archive(this, 'EventArchive', {
      sourceEventBus: bus,
      eventPattern: { source: [{ prefix: 'ecommerce' }] },
      retention: cdk.Duration.days(90),
    });
  }
}
```

### Serverless API with Lambda Function URLs

```typescript
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from 'aws-lambda';

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? '*';

function addCorsHeaders(response: APIGatewayProxyResultV2): APIGatewayProxyResultV2 {
  const resp = response as { statusCode: number; headers?: Record<string, string>; body?: string };
  resp.headers = {
    ...resp.headers,
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  return resp;
}

type RouteHandler = (event: APIGatewayProxyEventV2, params: Record<string, string>) => APIGatewayProxyResultV2;

const routes: Map<string, RouteHandler> = new Map([
  ['GET /api/products', listProducts],
  ['GET /api/products/{id}', getProduct],
  ['POST /api/products', createProduct],
]);

export const handler = async (
  event: APIGatewayProxyEventV2,
  context: Context
): Promise<APIGatewayProxyResultV2> => {
  // Lambda Function URL handler with path-based routing
  const method = event.requestContext.http.method;
  const path = event.requestContext.http.path;

  if (method === 'OPTIONS') {
    return addCorsHeaders({ statusCode: 204, body: '' });
  }

  for (const [routeKey, handlerFunc] of routes) {
    const [routeMethod, routePath] = routeKey.split(' ');
    if (method === routeMethod && matchPath(path, routePath)) {
      const params = extractParams(path, routePath);
      return addCorsHeaders(handlerFunc(event, params));
    }
  }

  return addCorsHeaders({
    statusCode: 404,
    body: JSON.stringify({ error: 'Not found' }),
    headers: { 'Content-Type': 'application/json' }
  });
};

function matchPath(actual: string, template: string): boolean {
  const actualParts = actual.split('/');
  const templateParts = template.split('/');
  if (actualParts.length !== templateParts.length) return false;
  return templateParts.every((part, i) =>
    part.startsWith('{') || part === actualParts[i]
  );
}

function extractParams(actual: string, template: string): Record<string, string> {
  const params: Record<string, string> = {};
  const actualParts = actual.split('/');
  const templateParts = template.split('/');
  templateParts.forEach((part, i) => {
    if (part.startsWith('{') && part.endsWith('}')) {
      params[part.slice(1, -1)] = actualParts[i];
    }
  });
  return params;
}
```

## Common Pitfalls

- **Cold start death spiral in VPC Lambdas**: Placing Lambda functions inside a VPC historically added 5-10 seconds of cold start time due to ENI attachment. Since the 2019 Hyperplane improvement, VPC cold starts add only ~100-200ms additional latency. However, burst traffic with many concurrent cold starts can still exhaust subnet IP addresses. Use VPC endpoints for AWS services and only place functions in VPC when accessing private resources (RDS, ElastiCache, internal services)
- **Ignoring Lambda execution environment reuse**: Global variables persist between invocations in the same execution environment. Database connections initialized outside the handler are reused (good for performance), but mutable state can leak between requests if not carefully managed. Always reset request-specific state inside the handler
- **Step Functions state size limits**: Each state can pass a maximum of 256KB between transitions. Large payloads must be stored in S3 with only a reference passed through the workflow. Failing to account for this causes runtime failures on large orders or batch operations
- **EventBridge rule explosion**: Creating one rule per customer or per entity leads to thousands of rules that are hard to manage and slow to update. Use content-based filtering within a single rule with pattern matching instead of proliferating rules
- **Synchronous Lambda chains**: Calling Lambda from Lambda synchronously (invoke with `RequestResponse`) creates tight coupling, multiplies latency, and wastes money paying for the caller to wait. Use asynchronous patterns: SQS, SNS, EventBridge, or Step Functions for orchestration
- **Underestimating DynamoDB costs in serverless**: On-demand DynamoDB pricing ($1.25 per million writes, $0.25 per million reads) seems cheap until a Lambda bug creates a retry storm. A single misconfigured function processing 1000 messages/second with 3 DynamoDB writes each costs $324/day in writes alone
- **Not configuring Lambda Destinations**: Without destinations, async Lambda failures are silently lost unless you manually implement error handling. Configure failure destinations to SQS DLQ for every async function to capture and replay failed events

## Real-World Use Cases

**Image Processing Pipeline**: A media company processes user-uploaded images through a serverless pipeline. S3 upload triggers a Lambda that validates the image format and size, then publishes to EventBridge. Separate rules route to different processing functions: thumbnail generation (128x128, 256x256, 512x512), EXIF data extraction, content moderation via Rekognition, and metadata indexing to DynamoDB. Step Functions orchestrate the parallel processing and aggregate results, writing final processed assets back to S3 with CloudFront invalidation. The system handles 0 to 50,000 uploads per hour with zero provisioned infrastructure.

**Real-Time Fraud Detection**: A fintech startup uses Lambda to evaluate transactions in real-time. API Gateway receives payment requests, triggers a Lambda that queries DynamoDB for customer spending patterns (last 24 hours, 7 days, 30 days), runs rule-based checks, and calls a SageMaker endpoint for ML-based anomaly detection. Decisions are made within 200ms using provisioned concurrency on the evaluation Lambda. Suspicious transactions route through Step Functions for human review workflows with 15-minute SLA timers that auto-escalate.

**Multi-Tenant Webhook Processing**: A SaaS platform processes webhooks from 10,000+ customer integrations. Each webhook hits API Gateway, which routes to a Lambda that validates signatures, normalizes payloads across different provider formats (Stripe, GitHub, Twilio), and publishes to a per-tenant EventBridge bus partition. Downstream consumers process events at their own pace via SQS queues with per-tenant concurrency limits, preventing one noisy tenant from starving others.

## Interview Questions

**Q: How do you handle Lambda cold starts in a latency-sensitive production API?**

A: Multiple strategies layered together: First, use provisioned concurrency for the most latency-sensitive paths — this keeps pre-initialized execution environments warm and eliminates cold starts entirely, at a cost of ~$0.015/GB-hour. Second, choose lightweight runtimes (Node.js or Python over Java) for API-facing functions where cold start matters. Third, minimize deployment package size — use Lambda layers for shared dependencies and tree-shake unused code. Fourth, for Java specifically, use Lambda SnapStart which pre-initializes the JVM and creates a cached snapshot, reducing cold starts from 5-10s to under 200ms. Fifth, keep functions warm with scheduled CloudWatch Events pinging every 5 minutes as a cost-effective alternative to provisioned concurrency for low-traffic functions. The architectural answer is to design systems so cold starts don't matter — use async processing where possible so users never wait on a cold function.

**Q: Explain the saga pattern implementation using Step Functions.**

A: The saga pattern manages distributed transactions across microservices by defining a sequence of local transactions with compensating actions for each step. In Step Functions, each state represents a service call (reserve inventory, charge payment, ship order). If any step fails, the workflow executes compensating transactions in reverse order (refund payment, release inventory). Implementation details: use `Catch` blocks on each Task state to route to compensation states. Store intermediate results in the Step Functions execution context using `ResultPath`. For long-running sagas, use Standard Workflows (up to 1 year execution). Key considerations: compensating actions must be idempotent since they may execute multiple times due to retries. Use DynamoDB conditional writes to prevent double-compensation. Monitor saga completion rates and compensation frequency as business health metrics.

**Q: When would you choose EventBridge over SNS for event routing?**

A: EventBridge when you need content-based filtering on event payload fields (not just message attributes), schema registry and discovery, event replay from archives, cross-account event routing, or integration with SaaS providers (Shopify, Zendesk, Auth0). SNS when you need raw throughput (SNS handles millions of publishes/second vs EventBridge's soft limit of 10,000 events/second per region), mobile push notifications, SMS delivery, or simple topic-based fan-out without complex filtering. The architectural distinction: SNS is a notification service optimized for fan-out delivery, while EventBridge is an event bus optimized for routing and filtering. In practice, many architectures use both — SNS for high-throughput internal messaging and EventBridge for cross-service event routing with complex rules.

**Q: How do you debug and observe serverless applications in production?**

A: Structured logging with correlation IDs propagated through all service calls — use AWS Lambda Powertools which automatically captures Lambda context, adds tracing, and formats logs for CloudWatch Insights queries. Enable X-Ray tracing on all Lambda functions and API Gateway stages to visualize request flows across services. Create CloudWatch dashboards with key metrics: invocation count, error rate, duration percentiles (p50, p95, p99), concurrent executions, and throttles. Set up composite alarms that trigger on error rate AND invocation count (avoid alerting on a single failure in low-traffic functions). Use CloudWatch Logs Insights for ad-hoc investigation with queries like `filter @message like /ERROR/ | stats count(*) by bin(5m)`. For Step Functions, enable execution history and use the visual workflow inspector to identify which state failed and why.

## Production Tips

- **Set reserved concurrency on every Lambda function** to prevent a single function from consuming your account's 1000 concurrent execution limit. Critical functions get reserved concurrency; non-critical functions share the unreserved pool. This prevents a batch processing function from starving your API handlers
- **Use Lambda Powertools** (available for Python, TypeScript, Java, .NET) for structured logging, distributed tracing, idempotency, and feature flags. It adds minimal cold start overhead (~50ms) while providing production-grade observability out of the box
- **Implement circuit breakers for downstream calls** using a DynamoDB-backed state table. When a downstream service fails 5 consecutive times, open the circuit and return cached/default responses for 30 seconds before retrying. This prevents cascade failures in serverless architectures where retry storms can amplify outages
- **Configure EventBridge DLQ for every rule** — failed event deliveries are silently dropped by default. Attach an SQS DLQ to each rule target to capture delivery failures for investigation and replay
- **Monitor Lambda cost per invocation** using CloudWatch embedded metrics. Track `EstimatedCost = (memoryAllocated/1024) * billedDuration * $0.0000166667` per invocation. Alert when cost-per-invocation exceeds baseline by 3x, which often indicates infinite loops or retry storms

## Related Topics

- [AWS Core Services](./aws-core-services.md) — Foundation services that serverless patterns build upon
- [Infrastructure as Code](../ci-cd/infrastructure-as-code.md) — Deploying serverless infrastructure with CDK, SAM, and Terraform
- [Cloud Architecture Patterns](./cloud-architecture-patterns.md) — Broader architectural patterns including serverless in multi-region designs
- [Messaging Patterns](../../backend/messaging/messaging-patterns.md) — Event-driven architecture and async communication patterns
