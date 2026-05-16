# gRPC

## Quick Reference

- gRPC uses Protocol Buffers (protobuf) for serialization — 3-10x smaller and 20-100x faster than JSON
- Four communication patterns: unary (request-response), server streaming, client streaming, bidirectional streaming
- HTTP/2 transport enables multiplexing (multiple RPCs on one connection), header compression, and flow control
- Service definitions in `.proto` files generate strongly-typed client/server code for 10+ languages
- Deadlines propagate across service boundaries — if a client sets a 5s deadline, downstream services see remaining time
- gRPC status codes (16 total): OK, CANCELLED, DEADLINE_EXCEEDED, NOT_FOUND, ALREADY_EXISTS, PERMISSION_DENIED, RESOURCE_EXHAUSTED, UNIMPLEMENTED, INTERNAL, UNAVAILABLE
- Interceptors (middleware) handle cross-cutting concerns: auth, logging, metrics, retry, rate limiting
- gRPC-Web enables browser clients via a proxy (Envoy) since browsers cannot use HTTP/2 trailers directly

## When to Use

gRPC excels in internal microservice communication where performance, type safety, and streaming capabilities matter more than human readability. Choose gRPC when services are polyglot (Java, Go, Python, C++ teams sharing contracts via proto files), when you need bidirectional streaming (real-time feeds, chat, telemetry), when payload size and serialization speed are critical (high-throughput data pipelines processing millions of messages/second), or when you want compile-time contract enforcement that catches breaking changes before deployment. gRPC is less suitable for public-facing APIs consumed by web browsers (limited browser support without gRPC-Web proxy), when human-readable payloads aid debugging (REST with JSON is easier to inspect with curl), when you need HTTP caching at CDN/proxy layers (gRPC uses POST for everything), or for simple CRUD APIs where REST's simplicity outweighs gRPC's performance benefits. The operational overhead of managing proto file distribution, code generation pipelines, and load balancer compatibility (not all L7 load balancers support HTTP/2 gRPC) should factor into the decision.

## Code Examples

### Protocol Buffer Service Definition

```protobuf
syntax = "proto3";

package ecommerce.orders.v1;

option java_package = "com.example.ecommerce.orders.v1";
option java_multiple_files = true;
option go_package = "github.com/example/ecommerce/orders/v1;ordersv1";

import "google/protobuf/timestamp.proto";
import "google/protobuf/field_mask.proto";

// Order service with all four RPC patterns
service OrderService {
  // Unary: create a single order
  rpc CreateOrder(CreateOrderRequest) returns (Order);

  // Unary: get order by ID
  rpc GetOrder(GetOrderRequest) returns (Order);

  // Server streaming: watch order status changes in real-time
  rpc WatchOrderStatus(WatchOrderStatusRequest) returns (stream OrderStatusEvent);

  // Client streaming: batch upload order items
  rpc BatchAddItems(stream AddItemRequest) returns (BatchAddItemsResponse);

  // Bidirectional streaming: real-time order negotiation
  rpc NegotiateOrder(stream NegotiationMessage) returns (stream NegotiationMessage);
}

message Order {
  string order_id = 1;
  string customer_id = 2;
  repeated OrderItem items = 3;
  OrderStatus status = 4;
  Money total = 5;
  google.protobuf.Timestamp created_at = 6;
  google.protobuf.Timestamp updated_at = 7;
  map<string, string> metadata = 8;
}

message OrderItem {
  string sku = 1;
  string name = 2;
  int32 quantity = 3;
  Money unit_price = 4;
}

message Money {
  string currency_code = 1;  // ISO 4217
  int64 units = 2;           // Whole units (e.g., dollars)
  int32 nanos = 3;           // Nano units (10^-9)
}

enum OrderStatus {
  ORDER_STATUS_UNSPECIFIED = 0;
  ORDER_STATUS_PENDING = 1;
  ORDER_STATUS_CONFIRMED = 2;
  ORDER_STATUS_SHIPPED = 3;
  ORDER_STATUS_DELIVERED = 4;
  ORDER_STATUS_CANCELLED = 5;
}

message CreateOrderRequest {
  string customer_id = 1;
  repeated OrderItem items = 2;
  map<string, string> metadata = 3;
  string idempotency_key = 4;  // Client-generated for safe retries
}

message GetOrderRequest {
  string order_id = 1;
  google.protobuf.FieldMask field_mask = 2;  // Partial response
}

message WatchOrderStatusRequest {
  string order_id = 1;
}

message OrderStatusEvent {
  string order_id = 1;
  OrderStatus previous_status = 2;
  OrderStatus new_status = 3;
  google.protobuf.Timestamp timestamp = 4;
  string reason = 5;
}
```

### Go gRPC Server with Interceptors

```go
package main

import (
    "context"
    "log"
    "net"
    "time"

    "google.golang.org/grpc"
    "google.golang.org/grpc/codes"
    "google.golang.org/grpc/metadata"
    "google.golang.org/grpc/status"
    "google.golang.org/grpc/keepalive"

    pb "github.com/example/ecommerce/orders/v1"
)

type orderServer struct {
    pb.UnimplementedOrderServiceServer
    store OrderStore
}

func (s *orderServer) CreateOrder(ctx context.Context, req *pb.CreateOrderRequest) (*pb.Order, error) {
    // Check deadline propagation
    if deadline, ok := ctx.Deadline(); ok {
        remaining := time.Until(deadline)
        if remaining < 100*time.Millisecond {
            return nil, status.Error(codes.DeadlineExceeded, "insufficient time remaining")
        }
    }

    // Idempotency check
    if req.IdempotencyKey != "" {
        if existing, err := s.store.GetByIdempotencyKey(ctx, req.IdempotencyKey); err == nil {
            return existing, nil
        }
    }

    order, err := s.store.Create(ctx, req)
    if err != nil {
        return nil, status.Errorf(codes.Internal, "failed to create order: %v", err)
    }

    // Set response metadata
    header := metadata.Pairs("x-request-id", extractRequestID(ctx))
    grpc.SetHeader(ctx, header)

    return order, nil
}

func (s *orderServer) WatchOrderStatus(req *pb.WatchOrderStatusRequest, stream pb.OrderService_WatchOrderStatusServer) error {
    ctx := stream.Context()
    events := s.store.Subscribe(req.OrderId)
    defer s.store.Unsubscribe(req.OrderId, events)

    for {
        select {
        case <-ctx.Done():
            return status.Error(codes.Cancelled, "client disconnected")
        case event, ok := <-events:
            if !ok {
                return nil // Channel closed, order finalized
            }
            if err := stream.Send(event); err != nil {
                return status.Errorf(codes.Internal, "failed to send event: %v", err)
            }
        }
    }
}

// Unary interceptor for logging and metrics
func loggingInterceptor(ctx context.Context, req interface{}, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (interface{}, error) {
    start := time.Now()
    resp, err := handler(ctx, req)
    duration := time.Since(start)

    code := codes.OK
    if err != nil {
        code = status.Code(err)
    }

    log.Printf("method=%s duration=%v code=%s", info.FullMethod, duration, code)
    recordMetrics(info.FullMethod, code, duration)

    return resp, err
}

// Auth interceptor
func authInterceptor(ctx context.Context, req interface{}, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (interface{}, error) {
    md, ok := metadata.FromIncomingContext(ctx)
    if !ok {
        return nil, status.Error(codes.Unauthenticated, "missing metadata")
    }

    tokens := md.Get("authorization")
    if len(tokens) == 0 {
        return nil, status.Error(codes.Unauthenticated, "missing authorization token")
    }

    claims, err := validateToken(tokens[0])
    if err != nil {
        return nil, status.Errorf(codes.Unauthenticated, "invalid token: %v", err)
    }

    // Inject claims into context for downstream use
    ctx = context.WithValue(ctx, claimsKey{}, claims)
    return handler(ctx, req)
}

func main() {
    lis, err := net.Listen("tcp", ":50051")
    if err != nil {
        log.Fatalf("failed to listen: %v", err)
    }

    server := grpc.NewServer(
        grpc.ChainUnaryInterceptor(
            loggingInterceptor,
            authInterceptor,
        ),
        grpc.KeepaliveParams(keepalive.ServerParameters{
            MaxConnectionIdle: 5 * time.Minute,
            Time:             1 * time.Minute,
            Timeout:          20 * time.Second,
        }),
        grpc.MaxRecvMsgSize(4 * 1024 * 1024), // 4MB max message
    )

    pb.RegisterOrderServiceServer(server, &orderServer{store: NewOrderStore()})

    log.Printf("gRPC server listening on :50051")
    if err := server.Serve(lis); err != nil {
        log.Fatalf("failed to serve: %v", err)
    }
}
```

### Java gRPC Client with Retry and Load Balancing

```java
import io.grpc.*;
import io.grpc.stub.StreamObserver;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.CountDownLatch;

public class OrderClient {

    private final OrderServiceGrpc.OrderServiceBlockingStub blockingStub;
    private final OrderServiceGrpc.OrderServiceStub asyncStub;
    private final ManagedChannel channel;

    public OrderClient(String target) {
        // Client-side load balancing with round-robin
        this.channel = ManagedChannelBuilder.forTarget(target)
            .defaultLoadBalancingPolicy("round_robin")
            .enableRetry()
            .maxRetryAttempts(3)
            .keepAliveTime(30, TimeUnit.SECONDS)
            .keepAliveTimeout(10, TimeUnit.SECONDS)
            .build();

        this.blockingStub = OrderServiceGrpc.newBlockingStub(channel)
            .withDeadlineAfter(5, TimeUnit.SECONDS)
            .withCompression("gzip");

        this.asyncStub = OrderServiceGrpc.newStub(channel);
    }

    public Order createOrder(CreateOrderRequest request) {
        try {
            return blockingStub
                .withDeadlineAfter(3, TimeUnit.SECONDS)
                .createOrder(request);
        } catch (StatusRuntimeException e) {
            switch (e.getStatus().getCode()) {
                case DEADLINE_EXCEEDED:
                    throw new ServiceTimeoutException("Order creation timed out", e);
                case ALREADY_EXISTS:
                    // Idempotent retry hit existing order
                    return getOrder(request.getIdempotencyKey());
                case UNAVAILABLE:
                    throw new ServiceUnavailableException("Order service unavailable", e);
                default:
                    throw new ServiceException("Order creation failed: " + e.getStatus(), e);
            }
        }
    }

    public void watchOrderStatus(String orderId, OrderStatusListener listener) {
        WatchOrderStatusRequest request = WatchOrderStatusRequest.newBuilder()
            .setOrderId(orderId)
            .build();

        asyncStub.watchOrderStatus(request, new StreamObserver<OrderStatusEvent>() {
            @Override
            public void onNext(OrderStatusEvent event) {
                listener.onStatusChange(event);
            }

            @Override
            public void onError(Throwable t) {
                Status status = Status.fromThrowable(t);
                if (status.getCode() == Status.Code.UNAVAILABLE) {
                    // Reconnect with exponential backoff
                    scheduleReconnect(orderId, listener);
                } else {
                    listener.onError(t);
                }
            }

            @Override
            public void onCompleted() {
                listener.onComplete();
            }
        });
    }

    // Bidirectional streaming example
    public void negotiateOrder(List<NegotiationMessage> proposals) throws InterruptedException {
        CountDownLatch finishLatch = new CountDownLatch(1);

        StreamObserver<NegotiationMessage> requestObserver = asyncStub.negotiateOrder(
            new StreamObserver<NegotiationMessage>() {
                @Override
                public void onNext(NegotiationMessage response) {
                    System.out.println("Server response: " + response.getMessage());
                }

                @Override
                public void onError(Throwable t) {
                    finishLatch.countDown();
                }

                @Override
                public void onCompleted() {
                    finishLatch.countDown();
                }
            });

        for (NegotiationMessage proposal : proposals) {
            requestObserver.onNext(proposal);
            Thread.sleep(500); // Simulate thinking time
        }
        requestObserver.onCompleted();

        finishLatch.await(30, TimeUnit.SECONDS);
    }

    public void shutdown() throws InterruptedException {
        channel.shutdown().awaitTermination(5, TimeUnit.SECONDS);
    }
}
```

### gRPC Load Balancing Configuration

```yaml
# Kubernetes service for gRPC with headless service (client-side LB)
apiVersion: v1
kind: Service
metadata:
  name: order-service
  annotations:
    # For gRPC, use headless service so clients see individual pod IPs
    service.alpha.kubernetes.io/tolerate-unready-endpoints: "true"
spec:
  clusterIP: None  # Headless - DNS returns all pod IPs
  ports:
    - port: 50051
      targetPort: 50051
      protocol: TCP
      name: grpc
  selector:
    app: order-service
---
# Envoy sidecar config for gRPC load balancing
apiVersion: v1
kind: ConfigMap
metadata:
  name: envoy-config
data:
  envoy.yaml: |
    static_resources:
      listeners:
        - name: grpc_listener
          address:
            socket_address:
              address: 0.0.0.0
              port_value: 8080
          filter_chains:
            - filters:
                - name: envoy.filters.network.http_connection_manager
                  typed_config:
                    "@type": type.googleapis.com/envoy.extensions.filters.network.http_connection_manager.v3.HttpConnectionManager
                    codec_type: AUTO
                    stat_prefix: ingress_http
                    route_config:
                      name: local_route
                      virtual_hosts:
                        - name: grpc_service
                          domains: ["*"]
                          routes:
                            - match:
                                prefix: "/"
                                grpc: {}
                              route:
                                cluster: order_service
                                timeout: 5s
                                retry_policy:
                                  retry_on: "unavailable,resource-exhausted"
                                  num_retries: 3
                                  per_try_timeout: 2s
                    http_filters:
                      - name: envoy.filters.http.router
      clusters:
        - name: order_service
          type: STRICT_DNS
          lb_policy: ROUND_ROBIN
          typed_extension_protocol_options:
            envoy.extensions.upstreams.http.v3.HttpProtocolOptions:
              "@type": type.googleapis.com/envoy.extensions.upstreams.http.v3.HttpProtocolOptions
              explicit_http_config:
                http2_protocol_options: {}
          load_assignment:
            cluster_name: order_service
            endpoints:
              - lb_endpoints:
                  - endpoint:
                      address:
                        socket_address:
                          address: order-service.default.svc.cluster.local
                          port_value: 50051
          health_checks:
            - timeout: 1s
              interval: 5s
              unhealthy_threshold: 3
              healthy_threshold: 2
              grpc_health_check: {}
```

## Common Pitfalls

- **Not setting deadlines on every RPC call**: Without deadlines, a slow downstream service causes requests to hang indefinitely, consuming resources and eventually cascading failures. Always set deadlines on client calls and check remaining deadline in servers before starting expensive operations
- **Large messages without streaming**: gRPC has a default 4MB message size limit. Sending large payloads (file uploads, bulk data) as single messages fails silently or requires increasing limits globally. Use client streaming for large uploads and server streaming for large responses
- **Breaking proto compatibility**: Removing fields, changing field numbers, or changing field types in proto files breaks existing clients. Follow proto3 evolution rules: add new fields with new numbers, deprecate (don't remove) old fields, never reuse field numbers
- **Ignoring gRPC health checking**: Kubernetes liveness/readiness probes default to HTTP, but gRPC services need the gRPC Health Checking Protocol. Without it, load balancers route traffic to unhealthy instances. Implement `grpc.health.v1.Health` service on every gRPC server
- **Connection management in long-lived clients**: gRPC uses persistent HTTP/2 connections. If the server restarts or a load balancer drains connections, clients may hold stale connections. Configure keepalive parameters and implement connection backoff/retry logic
- **Not using interceptors for cross-cutting concerns**: Implementing auth, logging, and metrics inside each RPC handler leads to code duplication and inconsistency. Use interceptor chains (equivalent to HTTP middleware) for concerns that apply to all or most RPCs

## Real-World Use Cases

**Google's Internal Services**: gRPC originated at Google where it handles billions of RPCs per second across their infrastructure. Services like Spanner, Bigtable, and Pub/Sub expose gRPC APIs. The proto-first development workflow means teams define contracts before implementation, enabling parallel development across hundreds of teams speaking different languages.

**Netflix Microservices**: Netflix uses gRPC for inter-service communication where latency and throughput matter — recommendation engine calls, real-time personalization, and streaming metadata services. The binary protocol reduces payload sizes by 70% compared to their previous REST/JSON approach, directly reducing infrastructure costs at their scale (hundreds of millions of requests per second).

**Financial Trading Systems**: A trading platform uses bidirectional gRPC streaming for real-time market data feeds. Clients subscribe to price updates for specific instruments and receive sub-millisecond updates. The server-side streaming pattern pushes thousands of price ticks per second to each connected client, with flow control preventing slow consumers from causing backpressure on the feed.

## Interview Questions

**Q: Compare gRPC and REST. When would you choose each?**

A: Choose REST for public APIs (browser compatibility, curl-friendly, CDN caching), simple CRUD operations, and when human readability of payloads aids debugging. Choose gRPC for internal microservice communication (type safety, performance), streaming use cases (real-time feeds, file transfers), polyglot environments (proto generates clients for all languages from one definition), and when you need strict contract enforcement with backward compatibility rules. Performance comparison: gRPC is typically 5-10x faster for serialization/deserialization and produces 3-10x smaller payloads than JSON. However, gRPC's operational complexity (proto management, code generation pipelines, HTTP/2 load balancer requirements) means the performance benefit must justify the overhead. Many organizations use REST at the edge (public APIs, BFF layer) and gRPC internally between services.

**Q: How does gRPC handle failure scenarios and what retry strategies are appropriate?**

A: gRPC provides rich error handling through status codes and error details. Retryable codes: UNAVAILABLE (transient network issue), RESOURCE_EXHAUSTED (rate limited, retry with backoff), ABORTED (transaction conflict, retry immediately). Non-retryable: INVALID_ARGUMENT, NOT_FOUND, PERMISSION_DENIED, UNIMPLEMENTED. gRPC supports built-in retry policies configured in service config JSON — specifying max attempts, initial backoff, max backoff, backoff multiplier, and retryable status codes. For hedged requests (sending parallel RPCs and using the first response), configure hedging policy for latency-sensitive idempotent calls. Critical: only retry idempotent operations automatically. For non-idempotent RPCs (CreateOrder), use idempotency keys and let the client decide whether to retry. Deadline propagation ensures retries don't outlive the original deadline — if 4 of 5 seconds have elapsed, don't start a retry that will timeout immediately.

**Q: Explain gRPC streaming patterns and their use cases.**

A: Server streaming: server sends multiple responses to a single client request. Use for real-time feeds (stock prices, notifications), large result sets (database query results streamed in chunks), and long-running operations (progress updates). Client streaming: client sends multiple messages, server responds once. Use for file uploads (chunked transfer), telemetry/metrics collection (batch of measurements), and aggregation (client sends data points, server returns summary). Bidirectional streaming: both sides send messages independently. Use for chat applications, collaborative editing, real-time gaming, and interactive protocols where both sides need to send data at arbitrary times. Implementation consideration: streaming RPCs hold connections open, consuming server resources. Implement timeouts, maximum message counts, and flow control. Monitor stream duration and terminate long-lived streams that may indicate leaked connections.

**Q: How do you handle proto file versioning and backward compatibility across teams?**

A: Use a centralized proto registry (Buf Schema Registry, or a Git monorepo with CI validation). Enforce backward compatibility rules in CI: never remove or rename fields (deprecate instead), never change field numbers or types, never change the type of a repeated field. Use `reserved` keyword to prevent reuse of deleted field numbers. Version packages semantically (`orders.v1`, `orders.v2`) for breaking changes, maintaining both versions during migration. Generate client libraries in CI and publish to language-specific package registries (Maven, npm, PyPI). Use Buf's breaking change detection (`buf breaking`) in PR checks to catch incompatible changes before merge. For gradual migrations, servers should accept both v1 and v2 messages during the transition period using proto `oneof` or separate service definitions.

## Production Tips

- **Implement the gRPC Health Checking Protocol** on every service and configure Kubernetes probes to use `grpc_health_probe` binary. This ensures load balancers and orchestrators accurately detect unhealthy instances. Return NOT_SERVING during graceful shutdown to drain connections before termination
- **Use connection pooling with subchannel management**: A single gRPC channel multiplexes RPCs over one HTTP/2 connection, but a single connection to a single server doesn't distribute load. Use DNS-based service discovery with multiple addresses, or configure `dns:///service-name` with round-robin policy to spread RPCs across multiple backends
- **Enable gzip compression for large payloads**: gRPC supports per-call compression. Enable it for RPCs with payloads over 1KB — protobuf is already compact, but gzip adds 50-70% reduction for repetitive data structures. Set compression at the call level rather than globally to avoid overhead on small messages
- **Monitor with gRPC-specific metrics**: Track request rate, error rate, and latency percentiles per method (not just per service). Monitor stream duration for streaming RPCs, message count per stream, and connection count per client. Alert on DEADLINE_EXCEEDED spikes which indicate downstream latency issues

## Related Topics

- [REST API Design](./rest-api-design.md) — Comparison point and alternative for HTTP-based APIs
- [GraphQL](./graphql.md) — Another API paradigm solving different problems than gRPC
- [Messaging Patterns](../messaging/messaging-patterns.md) — Async communication patterns complementing synchronous gRPC
- [Spring Microservices](../spring-framework/spring-microservices.md) — Microservice patterns where gRPC fits as the transport layer
