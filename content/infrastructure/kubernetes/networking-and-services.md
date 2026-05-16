# Kubernetes Networking and Services

## Quick Reference

- Every pod gets a unique cluster-wide IP address; containers within a pod share the network namespace and communicate via localhost
- Services provide stable virtual IPs (ClusterIP) and DNS names that abstract away ephemeral pod IPs
- Four Service types: ClusterIP (internal), NodePort (static port on every node), LoadBalancer (cloud LB), ExternalName (DNS CNAME)
- Ingress manages L7 HTTP/HTTPS routing with host-based and path-based rules, TLS termination, and rate limiting
- Network Policies implement firewall rules at the pod level, controlling ingress and egress traffic by label selectors, namespaces, and CIDR blocks
- CoreDNS provides cluster DNS: services resolve as `<service>.<namespace>.svc.cluster.local`
- kube-proxy maintains iptables or IPVS rules on each node to route ClusterIP traffic to backend pods

## When to Use

Kubernetes networking primitives address different communication patterns in distributed systems. Use ClusterIP Services for internal service-to-service communication where only pods within the cluster need access. Use LoadBalancer Services when you need to expose a single service directly to external traffic with cloud-provider load balancing. Use Ingress when multiple services share a single external endpoint with HTTP routing rules, reducing the number of load balancers and enabling centralized TLS management. Implement Network Policies in any multi-tenant cluster or environment with compliance requirements that mandate network segmentation between services. Use headless Services (ClusterIP: None) when clients need to discover individual pod IPs directly, common for StatefulSet workloads like databases and message brokers that require direct peer-to-peer communication.

## Code Examples

### Service Types and DNS Resolution

```yaml
# ClusterIP Service - internal communication
apiVersion: v1
kind: Service
metadata:
  name: order-service
  namespace: production
spec:
  type: ClusterIP
  selector:
    app: order-service
  ports:
    - name: http
      port: 80
      targetPort: 8080
      protocol: TCP
    - name: grpc
      port: 9090
      targetPort: 9090
      protocol: TCP
---
# Headless Service for StatefulSet peer discovery
apiVersion: v1
kind: Service
metadata:
  name: kafka-headless
  namespace: production
spec:
  type: ClusterIP
  clusterIP: None
  selector:
    app: kafka
  ports:
    - name: broker
      port: 9092
      targetPort: 9092
    - name: controller
      port: 9093
      targetPort: 9093
---
# LoadBalancer Service with AWS NLB annotations
apiVersion: v1
kind: Service
metadata:
  name: api-gateway-external
  namespace: production
  annotations:
    service.beta.kubernetes.io/aws-load-balancer-type: "nlb"
    service.beta.kubernetes.io/aws-load-balancer-scheme: "internet-facing"
    service.beta.kubernetes.io/aws-load-balancer-cross-zone-load-balancing-enabled: "true"
    service.beta.kubernetes.io/aws-load-balancer-target-group-attributes: "deregistration_delay.timeout_seconds=30"
spec:
  type: LoadBalancer
  selector:
    app: api-gateway
  ports:
    - name: https
      port: 443
      targetPort: 8080
      protocol: TCP
  externalTrafficPolicy: Local
```

### Ingress with AWS ALB Controller

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: api-ingress
  namespace: production
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/certificate-arn: arn:aws:acm:us-east-1:123456789:certificate/abc-123
    alb.ingress.kubernetes.io/listen-ports: '[{"HTTPS":443}]'
    alb.ingress.kubernetes.io/ssl-redirect: "443"
    alb.ingress.kubernetes.io/healthcheck-path: /actuator/health
    alb.ingress.kubernetes.io/healthcheck-interval-seconds: "15"
    alb.ingress.kubernetes.io/healthy-threshold-count: "2"
    alb.ingress.kubernetes.io/group.name: production-api
    alb.ingress.kubernetes.io/group.order: "10"
    alb.ingress.kubernetes.io/wafv2-acl-arn: arn:aws:wafv2:us-east-1:123456789:regional/webacl/production/abc
spec:
  rules:
    - host: api.example.com
      http:
        paths:
          - path: /orders
            pathType: Prefix
            backend:
              service:
                name: order-service
                port:
                  number: 80
          - path: /users
            pathType: Prefix
            backend:
              service:
                name: user-service
                port:
                  number: 80
          - path: /payments
            pathType: Prefix
            backend:
              service:
                name: payment-service
                port:
                  number: 80
  tls:
    - hosts:
        - api.example.com
      secretName: api-tls-cert
---
# Network Policy - restrict order-service ingress
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: order-service-ingress
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: order-service
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: api-gateway
        - podSelector:
            matchLabels:
              app: payment-service
      ports:
        - protocol: TCP
          port: 8080
  egress:
    - to:
        - podSelector:
            matchLabels:
              app: postgres
      ports:
        - protocol: TCP
          port: 5432
    - to:
        - podSelector:
            matchLabels:
              app: kafka
      ports:
        - protocol: TCP
          port: 9092
    - to:  # Allow DNS resolution
        - namespaceSelector: {}
          podSelector:
            matchLabels:
              k8s-app: kube-dns
      ports:
        - protocol: UDP
          port: 53
```

## Common Pitfalls

- **Forgetting to allow DNS egress in Network Policies**: When you apply an egress Network Policy, all outbound traffic is denied by default, including DNS resolution. Pods cannot resolve service names without an explicit egress rule allowing UDP port 53 to CoreDNS pods. This is the most common cause of mysterious connectivity failures after applying Network Policies.

- **Using NodePort in production without understanding security implications**: NodePort opens a port on every node in the cluster, including nodes that do not run the target pods. This expands the attack surface and bypasses cloud load balancer security features. Use LoadBalancer or Ingress for external access in production, reserving NodePort for development or specific on-premises scenarios.

- **Not setting externalTrafficPolicy on LoadBalancer Services**: The default `externalTrafficPolicy: Cluster` causes an extra network hop and loses the client's source IP because kube-proxy performs SNAT. Setting `externalTrafficPolicy: Local` preserves the client IP and eliminates the extra hop, but requires that load balancer health checks target only nodes running the service pods to avoid blackholing traffic.

- **Ignoring Ingress path type semantics**: The `Prefix` path type matches URL prefixes, so `/api` matches both `/api` and `/api/v2/users`. The `Exact` type requires an exact match. Misconfiguring path types leads to unexpected routing where requests reach the wrong backend service. Always test routing rules with actual request paths before deploying to production.

- **Creating one LoadBalancer per service**: Each LoadBalancer Service provisions a separate cloud load balancer, which is expensive ($15-20/month each on AWS) and creates management overhead. Consolidate external services behind a single Ingress resource that routes based on host and path rules, reducing costs and centralizing TLS certificate management.

## Real-World Use Cases

A microservices platform serving 50,000 requests per second uses a single AWS Application Load Balancer provisioned by the ALB Ingress Controller. Path-based routing directs traffic to 15 different backend services, each running as a ClusterIP Service. Weighted target groups enable canary deployments where 5% of traffic routes to the new version while 95% continues to the stable release. The ALB integrates with AWS WAF for DDoS protection and rate limiting at the edge.

A financial services company implements zero-trust networking using Kubernetes Network Policies. Every namespace has a default-deny policy that blocks all ingress and egress traffic. Service teams must explicitly declare which other services can communicate with their pods, creating a documented and auditable network topology. The security team reviews Network Policy changes as part of the deployment pipeline, ensuring compliance with regulatory requirements for network segmentation.

A multi-tenant SaaS platform uses headless Services with StatefulSets for its distributed database layer. Each database replica has a stable DNS name (db-0.db-headless.production.svc.cluster.local) that clients use for direct connections. Read replicas register with a standard ClusterIP Service for load-balanced read traffic, while writes always target the primary replica by its stable hostname. This architecture supports automatic failover without client-side configuration changes.

## Interview Questions

**Q: What is the difference between a Service and an Ingress in Kubernetes?**

A: A Service provides L4 (TCP/UDP) load balancing to a set of pods using a stable ClusterIP and DNS name. It operates at the transport layer and routes based on IP and port. An Ingress provides L7 (HTTP/HTTPS) routing with host-based and path-based rules, TLS termination, and consolidates multiple services behind a single external endpoint. Services are the building blocks that Ingress routes traffic to. You need a Service for every backend, but a single Ingress can route to many Services based on URL patterns.

**Q: How does kube-proxy implement Service routing?**

A: kube-proxy runs on every node and watches the API server for Service and Endpoint changes. In iptables mode (default), it programs iptables rules that intercept traffic destined for ClusterIP addresses and DNAT it to a randomly selected backend pod IP. In IPVS mode, it uses Linux IPVS (IP Virtual Server) for more efficient load balancing with support for round-robin, least-connections, and other algorithms. IPVS mode performs better at scale because rule lookup is O(1) versus O(n) for iptables chains.

**Q: How do Network Policies work and what are their limitations?**

A: Network Policies are namespace-scoped resources that define allowed ingress and egress traffic for pods matching a selector. They are additive — multiple policies combine with OR logic for the same pod. Policies are enforced by the CNI plugin (Calico, Cilium, etc.), not by Kubernetes itself. Limitations include: no deny rules (only allow), no logging of blocked traffic by default, no application-layer filtering (L7), and the default CNI (kubenet) does not support them. You must use a CNI that implements the NetworkPolicy API.

**Q: Explain the DNS resolution hierarchy in a Kubernetes cluster.**

A: CoreDNS serves as the cluster DNS. Pods resolve names in this order: `<service>.<namespace>.svc.cluster.local` for services in any namespace, `<pod-ip-dashed>.<namespace>.pod.cluster.local` for individual pods, and external DNS for non-cluster names. The pod's `/etc/resolv.conf` is configured with the cluster DNS IP and search domains based on the pod's namespace. This allows short names like `order-service` to resolve within the same namespace without specifying the full FQDN.

## Production Tips

- **Use Ingress group annotations to share ALBs across namespaces**: The AWS Load Balancer Controller supports `alb.ingress.kubernetes.io/group.name` to consolidate multiple Ingress resources into a single ALB. This reduces costs (one ALB instead of many) while allowing each team to manage their own Ingress rules independently. Use `group.order` to control rule evaluation priority.

- **Implement graduated Network Policies**: Start with a default-deny policy in each namespace, then add allow rules incrementally. Use labels consistently across all workloads so policies can target logical groups rather than individual pods. Test policies in a staging environment using tools like `kubectl-np-viewer` or Cilium's policy verdict logs before applying to production.

- **Monitor Service endpoint health proactively**: A Service with zero ready endpoints silently drops all traffic. Set up alerts on the `kube_endpoint_address_available` metric to detect services with no healthy backends before users report failures. This catches scenarios where all pods fail readiness checks simultaneously due to a shared dependency outage.

## Related Topics

- [Core Concepts and Architecture](./core-concepts.md) — Pod networking fundamentals and cluster architecture
- [Workload Management](./workload-management.md) — Deployments and StatefulSets that Services route traffic to
- [EKS and AWS Integration](./eks-aws-integration.md) — VPC CNI, ALB Controller, and AWS-specific networking
