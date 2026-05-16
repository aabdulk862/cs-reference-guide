# Kubernetes Core Concepts and Architecture

## Quick Reference

- Kubernetes (K8s) is a container orchestration platform that automates deployment, scaling, and management of containerized applications across clusters
- Control plane components: kube-apiserver (API gateway), etcd (distributed key-value store), kube-scheduler (pod placement), kube-controller-manager (reconciliation loops), cloud-controller-manager (cloud provider integration)
- Node components: kubelet (pod lifecycle agent), kube-proxy (network rules), container runtime (containerd or CRI-O)
- Pods are the smallest deployable unit — one or more containers sharing network namespace, storage, and lifecycle
- The declarative model means you specify desired state in YAML manifests and controllers continuously reconcile actual state to match
- Labels and selectors provide the primary mechanism for grouping, filtering, and targeting resources
- Namespaces provide logical isolation for multi-tenant clusters with resource quotas and RBAC boundaries

## When to Use

Kubernetes is the right choice when you need to orchestrate containerized workloads at scale across multiple nodes with automated self-healing, rolling deployments, and service discovery. Use Kubernetes when your application consists of multiple microservices that need independent scaling, when you require zero-downtime deployments, or when you need consistent environments across development, staging, and production. Kubernetes provides value when teams need declarative infrastructure management, automated bin-packing of workloads across heterogeneous hardware, and a standardized API for deploying applications regardless of the underlying cloud provider. The platform excels in environments where multiple teams share cluster resources and need isolation through namespaces, resource quotas, and network policies. Kubernetes is overkill for simple single-container applications, small teams without dedicated platform engineering resources, or workloads that can run effectively on simpler platforms like AWS ECS Fargate or Google Cloud Run.

## Code Examples

### Pod Specification with Resource Management

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: order-service
  namespace: production
  labels:
    app: order-service
    version: v2
    team: commerce
  annotations:
    prometheus.io/scrape: "true"
    prometheus.io/port: "8080"
spec:
  serviceAccountName: order-service-sa
  terminationGracePeriodSeconds: 60
  initContainers:
    - name: db-migration
      image: order-service:v2.1.0
      command: ["./migrate", "--target", "latest"]
      resources:
        requests:
          cpu: "100m"
          memory: "256Mi"
        limits:
          cpu: "500m"
          memory: "512Mi"
  containers:
    - name: app
      image: 123456789.dkr.ecr.us-east-1.amazonaws.com/order-service:v2.1.0
      ports:
        - containerPort: 8080
          name: http
          protocol: TCP
      resources:
        requests:
          cpu: "250m"
          memory: "512Mi"
        limits:
          cpu: "1000m"
          memory: "1Gi"
      livenessProbe:
        httpGet:
          path: /actuator/health/liveness
          port: 8080
        initialDelaySeconds: 30
        periodSeconds: 10
        failureThreshold: 3
      readinessProbe:
        httpGet:
          path: /actuator/health/readiness
          port: 8080
        initialDelaySeconds: 5
        periodSeconds: 5
        successThreshold: 1
      startupProbe:
        httpGet:
          path: /actuator/health/liveness
          port: 8080
        initialDelaySeconds: 10
        periodSeconds: 5
        failureThreshold: 30
      env:
        - name: SPRING_PROFILES_ACTIVE
          value: "production"
        - name: DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: db-credentials
              key: password
      volumeMounts:
        - name: config-volume
          mountPath: /app/config
          readOnly: true
    - name: envoy-sidecar
      image: envoyproxy/envoy:v1.28
      ports:
        - containerPort: 9901
          name: admin
      resources:
        requests:
          cpu: "100m"
          memory: "128Mi"
        limits:
          cpu: "500m"
          memory: "256Mi"
  volumes:
    - name: config-volume
      configMap:
        name: order-service-config
```

### Namespace with Resource Quotas and Limit Ranges

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: production
  labels:
    environment: production
    team: platform
---
apiVersion: v1
kind: ResourceQuota
metadata:
  name: production-quota
  namespace: production
spec:
  hard:
    requests.cpu: "50"
    requests.memory: "100Gi"
    limits.cpu: "100"
    limits.memory: "200Gi"
    pods: "200"
    services: "50"
    persistentvolumeclaims: "30"
---
apiVersion: v1
kind: LimitRange
metadata:
  name: default-limits
  namespace: production
spec:
  limits:
    - type: Container
      default:
        cpu: "500m"
        memory: "512Mi"
      defaultRequest:
        cpu: "100m"
        memory: "128Mi"
      max:
        cpu: "4"
        memory: "8Gi"
      min:
        cpu: "50m"
        memory: "64Mi"
```

## Common Pitfalls

- **Not setting resource requests and limits**: Pods without resource constraints can starve other workloads or get OOMKilled unpredictably. The scheduler uses requests for placement decisions, so pods without requests may be scheduled on nodes that cannot support their actual resource consumption. Always set both requests for scheduling guarantees and limits for protection against runaway processes.

- **Confusing liveness and readiness probes**: Liveness probes detect deadlocked containers and trigger restarts, while readiness probes control traffic routing. A common mistake is using the same endpoint for both with identical timing, which can cause cascading restarts during temporary load spikes. Readiness probes should be more sensitive (shorter intervals, lower thresholds) while liveness probes should be conservative to avoid unnecessary restarts.

- **Running everything in the default namespace**: The default namespace provides no isolation, makes RBAC policies impossible to scope correctly, and prevents resource quota enforcement. Production workloads should always run in dedicated namespaces with appropriate quotas, limit ranges, and network policies applied at the namespace level.

- **Ignoring pod topology spread constraints**: Without topology constraints, the scheduler may place all replicas on the same node or in the same availability zone. A single node failure or AZ outage then takes down the entire service. Use `topologySpreadConstraints` to distribute pods across failure domains.

- **Using imperative commands in production**: Running `kubectl run` or `kubectl create` directly bypasses version control, audit trails, and reproducibility. All production resources should be defined in declarative YAML manifests stored in Git and applied through CI/CD pipelines or GitOps controllers like ArgoCD.

## Real-World Use Cases

A large e-commerce platform runs 200+ microservices on Kubernetes across three availability zones. Each service team owns their namespace with resource quotas preventing any single team from consuming more than their allocated share of cluster resources. Init containers run database migrations before application containers start, ensuring schema compatibility on every deployment. Sidecar containers running Envoy proxies handle mTLS, circuit breaking, and observability without application code changes.

A financial services company uses Kubernetes for real-time transaction processing with strict compliance requirements. Pod security standards enforce non-root execution, read-only filesystems, and dropped capabilities across all workloads. Network policies implement zero-trust networking where pods can only communicate with explicitly allowed destinations. Resource quotas and limit ranges prevent any single service from impacting platform stability during traffic spikes.

A machine learning platform uses Kubernetes to orchestrate training jobs and model serving. GPU-equipped nodes are tainted to ensure only ML workloads schedule on expensive hardware. Init containers download model artifacts from S3 before the serving container starts. Horizontal Pod Autoscaler scales inference pods based on custom metrics like request queue depth, while Karpenter provisions GPU nodes on-demand to minimize idle compute costs.

## Interview Questions

**Q: What is the difference between a Pod and a container in Kubernetes?**

A: A Pod is the smallest deployable unit in Kubernetes and represents one or more containers that share the same network namespace (same IP address and port space), storage volumes, and lifecycle. Containers within a pod communicate via localhost and are always co-scheduled on the same node. The pod abstraction exists because many real-world applications require tightly coupled helper processes (sidecars for logging, proxies for networking, init containers for setup) that must share resources and be managed as a single unit.

**Q: How does the Kubernetes scheduler decide where to place a pod?**

A: The scheduler uses a two-phase process: filtering and scoring. Filtering eliminates nodes that cannot run the pod (insufficient resources, incompatible taints, unsatisfied node selectors or affinity rules). Scoring ranks remaining nodes based on factors like resource balance, topology spread, affinity preferences, and custom scheduler plugins. The pod is placed on the highest-scoring node. Resource requests (not limits) drive scheduling decisions, which is why setting accurate requests is critical for efficient cluster utilization.

**Q: Explain the reconciliation loop pattern in Kubernetes controllers.**

A: Kubernetes controllers implement a continuous reconciliation loop that watches for changes to resources and drives actual state toward desired state. The controller reads the desired state from the API server (e.g., a Deployment specifying 3 replicas), observes the current state (e.g., only 2 pods running), and takes corrective action (creates 1 more pod). This pattern is level-triggered rather than edge-triggered, meaning controllers react to the current state difference rather than specific events, making them resilient to missed events or controller restarts.

**Q: What happens when a node becomes unreachable in a Kubernetes cluster?**

A: When the kubelet stops sending heartbeats, the node controller waits for the node-monitor-grace-period (default 40 seconds) before marking the node as NotReady. After the pod-eviction-timeout (default 5 minutes), the controller evicts pods from the unreachable node by creating deletion markers. The scheduler then places replacement pods on healthy nodes, respecting topology constraints and resource availability. Pods with local storage or those managed by StatefulSets require special handling to avoid data loss.

## Production Tips

- **Right-size resource requests using historical data**: Use tools like Vertical Pod Autoscaler (VPA) in recommendation mode or Kubecost to analyze actual resource consumption over time. Over-requesting wastes cluster capacity and increases costs, while under-requesting causes scheduling failures and performance degradation. Target requests at the 95th percentile of actual usage and limits at 2-3x requests for burst headroom.

- **Implement pod disruption budgets for all production workloads**: PDBs guarantee minimum availability during voluntary disruptions like node drains, cluster upgrades, and autoscaler scale-downs. Without PDBs, a node drain can terminate all replicas simultaneously. Set `minAvailable` to at least N-1 for N replicas, or use `maxUnavailable: 1` to ensure only one pod is disrupted at a time.

- **Use priority classes to protect critical workloads**: Define PriorityClasses for system-critical, production, and development workloads. During resource pressure, the scheduler preempts lower-priority pods to make room for higher-priority ones. This ensures that monitoring agents, ingress controllers, and critical business services are never evicted in favor of batch jobs or development workloads.

## Related Topics

- [Workload Management](./workload-management.md) — Deployments, StatefulSets, and scaling strategies built on pod primitives
- [Networking and Services](./networking-and-services.md) — How pods communicate within and outside the cluster
- [Docker & Containerization](../docker/index.md) — Container fundamentals that Kubernetes orchestrates
