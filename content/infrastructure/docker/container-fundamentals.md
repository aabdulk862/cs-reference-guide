# Container Fundamentals

## Quick Reference

- Docker images are read-only layered filesystems built from Dockerfiles; containers are running instances with a writable layer on top
- Container isolation uses Linux namespaces (PID, NET, MNT, UTS, IPC) and cgroups for resource limits (CPU, memory, I/O)
- Image naming convention: `registry/repository:tag` (e.g., `docker.io/library/nginx:1.25-alpine`)
- Image digests (`sha256:abc123...`) provide immutable references guaranteeing exact content regardless of tag mutations
- Container lifecycle: `docker run` → running → `docker stop` (SIGTERM) → stopped → `docker rm` → removed
- Union filesystem (overlay2) enables layer sharing between images, reducing disk usage and pull times
- Base image options: `alpine` (5MB), `debian-slim` (80MB), `distroless` (2-20MB), `scratch` (0MB for static binaries)
- Each Dockerfile instruction creates a new cached layer; layers are content-addressable and deduplicated

## When to Use

Container fundamentals apply whenever you need to package, distribute, or run applications in isolated environments. Understanding images and containers is essential when building CI/CD pipelines that produce deployable artifacts, when debugging container startup failures or resource exhaustion issues, when optimizing image sizes for faster deployments, and when troubleshooting networking or filesystem issues inside running containers. These concepts form the foundation for all container orchestration platforms including Kubernetes, ECS, and Docker Swarm.

You need deep knowledge of container internals when diagnosing performance issues related to overlay filesystem overhead, when understanding why a container is being OOM-killed, when debugging PID 1 signal handling problems, or when implementing custom health checks that accurately reflect application readiness. Senior engineers are expected to understand not just how to use containers but how they work at the kernel level.

## Code Examples

### Building and Running a Container

```bash
# Build an image from a Dockerfile in the current directory
docker build -t myapp:1.0.0 --no-cache .

# Run a container with resource limits and health check
docker run -d \
  --name order-service \
  --memory=512m \
  --cpus=1.0 \
  --restart=unless-stopped \
  --health-cmd="wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1" \
  --health-interval=30s \
  --health-timeout=3s \
  --health-start-period=40s \
  -p 8080:8080 \
  -e SPRING_PROFILES_ACTIVE=production \
  -e DB_URL=jdbc:postgresql://db:5432/orders \
  myapp:1.0.0

# Inspect container resource usage in real-time
docker stats order-service

# Execute a command inside a running container for debugging
docker exec -it order-service /bin/sh

# View container logs with timestamps
docker logs --timestamps --since=1h order-service

# Copy files from container filesystem for inspection
docker cp order-service:/app/config/application.yml ./local-config.yml
```

### Inspecting Image Layers and History

```bash
# View the layer history of an image
docker history myapp:1.0.0 --no-trunc

# Inspect image metadata including environment variables and entrypoint
docker inspect myapp:1.0.0 --format='{{json .Config}}' | jq .

# List all images with size information
docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedSince}}"

# Export and analyze image filesystem
docker save myapp:1.0.0 | tar -xf - -C /tmp/image-layers/
ls /tmp/image-layers/

# Scan image for vulnerabilities using Trivy
trivy image --severity HIGH,CRITICAL myapp:1.0.0

# Pull by digest for immutable reference
docker pull myapp@sha256:a3ed95caeb02ffe68cdd9fd84406680ae93d633cb16422d00e8a7c22955b46d4
```

### Container Lifecycle Management with the Docker SDK

```python
import docker
from docker.types import Resources, HealthCheck

client = docker.from_env()

# Create and start a container with full configuration
container = client.containers.run(
    image="order-service:2.1.0",
    name="order-service-prod",
    detach=True,
    ports={"8080/tcp": 8080},
    environment={
        "SPRING_PROFILES_ACTIVE": "production",
        "JAVA_OPTS": "-XX:MaxRAMPercentage=75.0 -XX:+UseG1GC",
    },
    mem_limit="1g",
    cpu_quota=100000,  # 1 CPU
    restart_policy={"Name": "on-failure", "MaximumRetryCount": 5},
    healthcheck=HealthCheck(
        test=["CMD", "wget", "--spider", "http://localhost:8080/health"],
        interval=30_000_000_000,  # 30s in nanoseconds
        timeout=3_000_000_000,
        retries=3,
        start_period=40_000_000_000,
    ),
)

# Monitor container health status
container.reload()
print(f"Status: {container.status}")
print(f"Health: {container.attrs['State']['Health']['Status']}")

# Stream container logs
for line in container.logs(stream=True, follow=True, since=3600):
    print(line.decode("utf-8").strip())
```

## Common Pitfalls

- **Confusing images with containers**: An image is a static template; a container is a running process. Multiple containers can run from the same image simultaneously, each with independent state. Deleting a container does not affect the image, and rebuilding an image does not affect running containers until they are recreated.

- **Relying on the `latest` tag**: The `latest` tag is a mutable pointer that can reference different image content over time. In production, always use specific version tags or SHA256 digests to ensure deterministic deployments. A deployment that worked yesterday can break today if `latest` was updated overnight.

- **Ignoring PID 1 responsibilities**: The container's entrypoint process runs as PID 1, which has special signal handling behavior in Linux. If your application does not handle SIGTERM properly, `docker stop` will wait for the timeout period and then send SIGKILL, causing ungraceful shutdowns. Use `tini` or `dumb-init` as an init process if your application cannot handle PID 1 responsibilities.

- **Writing data to the container layer**: Any files written inside a container are stored in the writable layer and lost when the container is removed. Applications that write logs, uploads, or database files to local paths without volume mounts will lose data on container restart. Always use volumes for persistent state.

- **Not setting resource limits**: Containers without memory limits can consume all host memory, triggering the OOM killer on other containers or the host itself. Without CPU limits, a single container can starve others of compute time. Always set both `--memory` and `--cpus` in production environments.

- **Running containers as root**: By default, processes inside containers run as root (UID 0). If an attacker exploits a vulnerability and escapes the container namespace, they gain root access on the host. Always create a non-root user in your Dockerfile and switch to it with the `USER` instruction.

## Real-World Use Cases

In microservice architectures, each service is packaged as an independent container image with its own dependency tree. A payment service running Java 21 coexists with a notification service running Python 3.12 on the same host without dependency conflicts. Teams build images in CI pipelines, push them to private registries like ECR or Harbor, and deploy specific image versions to production. Rollbacks are instantaneous because the previous image version is still available in the registry.

Database migration testing uses ephemeral containers to validate schema changes before production deployment. The CI pipeline spins up a PostgreSQL container with the current production schema, applies pending migrations, runs integration tests against the migrated database, and tears down the container. This catches migration issues without requiring a dedicated staging database and runs in seconds rather than minutes.

Legacy application modernization wraps applications with complex dependency requirements into containers. A legacy Java 8 application with specific OS library versions runs alongside modern Java 21 services without conflicts. The container encapsulates the legacy runtime environment while exposing standard HTTP interfaces that integrate with the modern service mesh.

Local development environments use containers to provide consistent tooling across team members. A new developer clones the repository, runs `docker compose up`, and has a fully functional environment with databases, message brokers, and dependent services running locally within minutes, regardless of their host operating system or installed software.

## Interview Questions

**Q: What is the difference between a Docker image and a container?**

A: An image is a read-only template composed of layered filesystems containing application code, runtime, libraries, and configuration. It is built from a Dockerfile and stored in registries. A container is a running instance of an image with an additional writable layer on top. Multiple containers can be created from the same image, each with isolated processes, networking, and filesystem views. Images are immutable build artifacts; containers are ephemeral runtime instances.

**Q: How does Docker achieve process isolation without a hypervisor?**

A: Docker uses Linux kernel features rather than hardware virtualization. Namespaces provide isolation of system resources: PID namespace gives each container its own process tree, NET namespace provides isolated network stacks, MNT namespace creates independent filesystem views, UTS namespace allows separate hostnames, and IPC namespace isolates inter-process communication. Cgroups limit and account for resource usage (CPU, memory, I/O, network bandwidth). The union filesystem (overlay2) provides copy-on-write layering. This approach shares the host kernel, making containers far lighter than VMs.

**Q: Explain Docker image layer caching and how it affects build performance.**

A: Each Dockerfile instruction creates a new layer. Docker caches layers and reuses them if the instruction and its context have not changed. Cache invalidation cascades: if layer N changes, all subsequent layers N+1, N+2, etc. must be rebuilt. This means instruction ordering matters critically. Place stable instructions (installing OS packages) before frequently changing ones (copying application source). A well-ordered Dockerfile rebuilds only the final layers on code changes, reducing build times from minutes to seconds.

**Q: What happens when a container exceeds its memory limit?**

A: When a container's memory usage exceeds the configured limit, the Linux OOM (Out of Memory) killer terminates the container's main process. Docker reports this as an OOMKilled exit status. The container's restart policy determines what happens next: `on-failure` restarts it, `always` restarts it, `no` leaves it stopped. To prevent OOM kills, set memory limits above your application's peak usage, configure JVM heap sizes relative to container memory using `-XX:MaxRAMPercentage`, and monitor memory usage trends to right-size limits over time.

## Production Tips

- **Use image scanning in CI pipelines**: Integrate Trivy, Snyk, or Docker Scout into your build pipeline to scan every image for known CVEs before pushing to the registry. Block deployments when critical vulnerabilities are detected. Rebuild base images weekly to incorporate upstream security patches, and use `docker scout recommendations` to identify safer base image alternatives.

- **Implement proper signal handling for graceful shutdown**: Ensure your application handles SIGTERM to complete in-flight requests, close database connections, and flush buffers before exiting. Set `STOPSIGNAL SIGTERM` in the Dockerfile and configure an appropriate stop timeout (default 10 seconds). For JVM applications, register a shutdown hook that drains the connection pool and completes pending transactions.

- **Tag images with both semantic versions and git SHAs**: Use tags like `2.1.0` for release tracking and `sha-a1b2c3d` for exact commit traceability. This enables both human-readable version identification and precise debugging when you need to know exactly which code is running in production. Never deploy untagged images or images tagged only with `latest`.

## Related Topics

- [Dockerfile Best Practices](./dockerfile-best-practices.md) — Writing optimized, secure Dockerfiles for production
- [Networking and Storage](./networking-and-storage.md) — Container networking modes and persistent data strategies
- [Kubernetes & EKS](../kubernetes/index.md) — Orchestrating containers at scale across clusters
