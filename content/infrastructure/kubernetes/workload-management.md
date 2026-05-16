# Kubernetes Workload Management

## Quick Reference

- Deployments manage stateless applications with rolling updates, rollbacks, and declarative replica management
- StatefulSets manage stateful applications with stable network identities, ordered deployment, and persistent storage per replica
- DaemonSets ensure exactly one pod runs on every node (or a subset), used for logging agents, monitoring, and network plugins
- Jobs run tasks to completion with configurable parallelism and retry policies; CronJobs schedule recurring Jobs
- Horizontal Pod Autoscaler (HPA) scales replica count based on CPU, memory, or custom metrics
- Vertical Pod Autoscaler (VPA) adjusts resource requests and limits based on observed usage patterns
- ReplicaSets maintain a stable set of replica pods but are rarely managed directly — Deployments manage them

## When to Use

Use Deployments for the vast majority of production workloads: web servers, API services, background workers, and any application where replicas are interchangeable and can be replaced without data loss. Choose StatefulSets when your application requires stable persistent storage per replica (databases, message brokers, distributed caches), ordered startup and shutdown sequences, or stable network identities that survive pod rescheduling. DaemonSets are appropriate for cluster-wide infrastructure concerns like log collection (Fluentd, Fluent Bit), metrics agents (Prometheus node-exporter), storage drivers (CSI plugins), and network overlays (Calico, Cilium). Jobs handle batch processing, data migrations, report generation, and any task that should run to completion rather than continuously. CronJobs schedule periodic maintenance tasks, cleanup operations, and recurring data processing pipelines.

## Code Examples

### Production Deployment with Rolling Update Strategy

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: order-service
  namespace: production
  labels:
    app: order-service
    team: commerce
spec:
  replicas: 5
  revisionHistoryLimit: 10
  selector:
    matchLabels:
      app: order-service
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 1
      maxSurge: 2
  template:
    metadata:
      labels:
        app: order-service
        version: v2.3.0
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "8080"
        prometheus.io/path: "/actuator/prometheus"
    spec:
      serviceAccountName: order-service
      terminationGracePeriodSeconds: 60
      topologySpreadConstraints:
        - maxSkew: 1
          topologyKey: topology.kubernetes.io/zone
          whenUnsatisfiable: DoNotSchedule
          labelSelector:
            matchLabels:
              app: order-service
      containers:
        - name: app
          image: 123456789.dkr.ecr.us-east-1.amazonaws.com/order-service:v2.3.0
          ports:
            - containerPort: 8080
              name: http
          resources:
            requests:
              cpu: "500m"
              memory: "1Gi"
            limits:
              cpu: "2000m"
              memory: "2Gi"
          readinessProbe:
            httpGet:
              path: /actuator/health/readiness
              port: 8080
            initialDelaySeconds: 10
            periodSeconds: 5
            failureThreshold: 3
          livenessProbe:
            httpGet:
              path: /actuator/health/liveness
              port: 8080
            initialDelaySeconds: 30
            periodSeconds: 10
            failureThreshold: 3
          lifecycle:
            preStop:
              exec:
                command: ["sh", "-c", "sleep 10"]
---
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: order-service-pdb
  namespace: production
spec:
  minAvailable: 3
  selector:
    matchLabels:
      app: order-service
```

### Horizontal Pod Autoscaler with Custom Metrics

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: order-service-hpa
  namespace: production
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: order-service
  minReplicas: 3
  maxReplicas: 20
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
        - type: Pods
          value: 4
          periodSeconds: 60
        - type: Percent
          value: 50
          periodSeconds: 60
      selectPolicy: Max
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Pods
          value: 2
          periodSeconds: 120
      selectPolicy: Min
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
    - type: Pods
      pods:
        metric:
          name: http_requests_per_second
        target:
          type: AverageValue
          averageValue: "1000"
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: redis-cluster
  namespace: production
spec:
  serviceName: redis-cluster
  replicas: 6
  selector:
    matchLabels:
      app: redis-cluster
  template:
    metadata:
      labels:
        app: redis-cluster
    spec:
      containers:
        - name: redis
          image: redis:7-alpine
          ports:
            - containerPort: 6379
              name: client
            - containerPort: 16379
              name: gossip
          command: ["redis-server", "/conf/redis.conf"]
          resources:
            requests:
              cpu: "500m"
              memory: "2Gi"
            limits:
              cpu: "1000m"
              memory: "4Gi"
          volumeMounts:
            - name: data
              mountPath: /data
            - name: conf
              mountPath: /conf
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: ["ReadWriteOnce"]
        storageClassName: gp3-encrypted
        resources:
          requests:
            storage: 50Gi
```

## Common Pitfalls

- **Using Deployments for stateful workloads**: Deployments treat all replicas as interchangeable and can delete any pod during scaling or updates. Stateful applications like databases, message brokers, or distributed caches that require stable identities, ordered operations, or persistent storage per replica must use StatefulSets. Deploying PostgreSQL or Kafka with a Deployment leads to data corruption when pods are rescheduled.

- **Setting HPA target too aggressively**: Setting CPU target utilization at 50% means the cluster maintains double the capacity needed for current load, wasting resources. Setting it at 95% leaves no headroom for traffic spikes, causing latency degradation before new pods become ready. Target 70-80% CPU utilization with appropriate scale-up behavior to balance cost and responsiveness.

- **Ignoring the stabilization window in HPA**: Without stabilization windows, HPA oscillates rapidly between scaling up and down (thrashing) as metrics fluctuate around the threshold. Configure `scaleDown.stabilizationWindowSeconds` to at least 300 seconds to prevent premature scale-down after traffic spikes, and `scaleUp.stabilizationWindowSeconds` to 30-60 seconds to allow rapid response to load increases.

- **Not configuring preStop hooks for graceful shutdown**: When Kubernetes terminates a pod, it sends SIGTERM and simultaneously removes the pod from service endpoints. Without a preStop hook adding a brief delay, in-flight requests may be routed to the terminating pod during the propagation window. A `sleep 10` preStop hook gives load balancers time to stop sending traffic before the application begins shutdown.

- **Forgetting Pod Disruption Budgets**: Without PDBs, cluster operations like node upgrades, autoscaler scale-downs, or spot instance interruptions can terminate all replicas simultaneously. Every production Deployment should have a corresponding PDB that guarantees minimum availability during voluntary disruptions.

## Real-World Use Cases

A payment processing platform uses Deployments with strict rolling update constraints (`maxUnavailable: 0`, `maxSurge: 1`) to ensure zero-downtime releases. Each deployment triggers a canary analysis that monitors error rates and latency for 10 minutes before proceeding with the full rollout. If metrics degrade, an automated rollback reverts to the previous ReplicaSet within 30 seconds. Pod Disruption Budgets ensure that cluster maintenance never reduces payment processing capacity below the minimum required for SLA compliance.

A real-time analytics platform uses StatefulSets to manage a 12-node Apache Kafka cluster on Kubernetes. Each broker maintains a stable network identity (kafka-0, kafka-1, etc.) and persistent storage that survives pod rescheduling. Ordered deployment ensures brokers join the cluster sequentially, preventing split-brain scenarios during rolling updates. The platform team uses a custom controller that performs leader rebalancing after each broker restart to maintain even partition distribution.

A machine learning inference platform uses HPA with custom metrics from Prometheus to scale model-serving pods based on prediction request queue depth rather than CPU utilization. During peak hours, the system scales from 5 to 40 replicas within 2 minutes. Scale-down uses a 10-minute stabilization window to avoid thrashing during variable traffic patterns. GPU-intensive models run on dedicated node pools with Karpenter provisioning appropriate instance types on demand.

## Interview Questions

**Q: What is the difference between a Deployment and a StatefulSet?**

A: Deployments manage stateless applications where pods are interchangeable — any pod can be created, deleted, or replaced without affecting application correctness. StatefulSets manage stateful applications requiring stable, unique network identities (pod-0, pod-1), persistent storage that follows the pod across rescheduling, and ordered, graceful deployment and scaling. Deployments use a single ReplicaSet and can update all pods in parallel, while StatefulSets update pods sequentially by ordinal index to maintain quorum in distributed systems.

**Q: How does Horizontal Pod Autoscaler determine when to scale?**

A: HPA queries the metrics API at a configurable interval (default 15 seconds) and calculates the desired replica count using the formula: `desiredReplicas = ceil(currentReplicas * (currentMetricValue / targetMetricValue))`. For multiple metrics, it calculates desired replicas for each metric independently and takes the maximum. The stabilization window prevents rapid oscillation by requiring the metric to remain above/below threshold for a sustained period before acting. Scale-up and scale-down can have different policies controlling the rate of change.

**Q: When would you use a DaemonSet versus a Deployment?**

A: Use a DaemonSet when you need exactly one pod per node (or per matching node) for infrastructure concerns like log collection, metrics agents, storage drivers, or network plugins. DaemonSets automatically add pods to new nodes and remove them from deleted nodes. Use a Deployment when you need a specific number of replicas distributed across the cluster based on resource availability, regardless of node count. The key distinction is per-node versus per-cluster semantics.

**Q: How do you perform a canary deployment in Kubernetes?**

A: Several approaches exist. The simplest uses two Deployments (stable and canary) behind the same Service, with the canary having fewer replicas to receive proportional traffic. More sophisticated approaches use Istio VirtualService for percentage-based traffic splitting, Argo Rollouts for automated canary analysis with metric-driven promotion/rollback, or Flagger for progressive delivery with automatic rollback on SLO violations. The key requirement is observability: you need metrics comparing canary versus stable performance to make promotion decisions.

## Production Tips

- **Configure deployment strategy based on application characteristics**: Use `maxSurge: 25%, maxUnavailable: 0` for latency-sensitive services that cannot tolerate reduced capacity. Use `maxSurge: 50%, maxUnavailable: 25%` for throughput-oriented services where faster rollouts are more important than maintaining full capacity. The recreate strategy (terminate all, then create all) is appropriate only for applications that cannot run multiple versions simultaneously, such as those with incompatible database schemas.

- **Implement pod topology spread constraints for high availability**: Distribute pods across availability zones using `topologySpreadConstraints` with `whenUnsatisfiable: DoNotSchedule` for critical services. This ensures a single AZ failure never takes down more than one-third of your replicas. For less critical services, use `whenUnsatisfiable: ScheduleAnyway` to prefer spreading without blocking scheduling when zones are imbalanced.

- **Use lifecycle hooks and termination grace periods together**: Set `terminationGracePeriodSeconds` to accommodate your application's shutdown time plus the preStop hook delay. A Java application needing 30 seconds to drain connections should have a 10-second preStop sleep plus 45-second grace period. If the grace period expires before shutdown completes, Kubernetes sends SIGKILL, potentially corrupting in-flight operations.

## Related Topics

- [Core Concepts and Architecture](./core-concepts.md) — Pod primitives and cluster architecture that workloads build upon
- [Networking and Services](./networking-and-services.md) — How workloads expose endpoints and communicate
- [EKS and AWS Integration](./eks-aws-integration.md) — AWS-specific autoscaling with Karpenter and managed node groups
