# Security and Production

## Quick Reference

- Run containers as non-root users by default using `USER` directive in Dockerfiles; never run production containers as root
- Use read-only root filesystems (`--read-only`) combined with tmpfs mounts for directories that need write access
- Scan images for CVEs using Trivy, Snyk, or Docker Scout before deploying to production registries
- Set explicit resource limits (memory, CPU) on every production container to prevent noisy-neighbor effects and OOM cascading
- Use distroless or scratch base images to minimize attack surface; fewer packages mean fewer vulnerabilities
- Enable Docker Content Trust (`DOCKER_CONTENT_TRUST=1`) to verify image signatures before pulling
- Implement seccomp profiles and AppArmor/SELinux policies to restrict system calls available to containers
- Drop all Linux capabilities and add back only what the application requires (`--cap-drop=ALL --cap-add=NET_BIND_SERVICE`)

## When to Use

Container security practices apply to every production deployment regardless of orchestration platform. You need these patterns when building images that will run in shared infrastructure where a compromised container could affect neighboring workloads, when operating in regulated environments requiring compliance with SOC 2, PCI-DSS, or HIPAA controls, when running internet-facing services where container escape vulnerabilities pose direct risk, and when implementing defense-in-depth strategies that assume any single layer may be compromised.

Production container patterns become critical when you need predictable resource consumption for capacity planning, when containers must survive host failures gracefully, when you need structured logging that integrates with centralized observability platforms, when implementing graceful shutdown sequences that drain connections before termination, and when managing secrets that must never appear in image layers or environment variable listings.

## Code Examples

### Hardened Dockerfile with Security Best Practices

```dockerfile
# Multi-stage build: build stage with full toolchain
FROM eclipse-temurin:21-jdk-alpine AS builder
WORKDIR /build

# Copy dependency manifests first for layer caching
COPY pom.xml mvnw ./
COPY .mvn .mvn
RUN ./mvnw dependency:go-offline -B

# Copy source and build
COPY src ./src
RUN ./mvnw package -DskipTests -B && \
    java -Djarmode=layertools -jar target/*.jar extract --destination /extracted

# Production stage: minimal runtime image
FROM eclipse-temurin:21-jre-alpine AS production

# Security: create non-root user
RUN addgroup -g 1001 appgroup && \
    adduser -u 1001 -G appgroup -D -s /bin/false appuser

# Security: remove unnecessary packages and shells
RUN apk --no-cache add curl && \
    rm -rf /var/cache/apk/* /tmp/* /usr/bin/wget

WORKDIR /app

# Copy application layers (ordered by change frequency)
COPY --from=builder --chown=appuser:appgroup /extracted/dependencies/ ./
COPY --from=builder --chown=appuser:appgroup /extracted/spring-boot-loader/ ./
COPY --from=builder --chown=appuser:appgroup /extracted/snapshot-dependencies/ ./
COPY --from=builder --chown=appuser:appgroup /extracted/application/ ./

# Security: switch to non-root user
USER appuser:appgroup

# Security: expose only necessary port
EXPOSE 8080

# Health check for orchestrator integration
HEALTHCHECK --interval=30s --timeout=3s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8080/actuator/health/liveness || exit 1

# JVM tuning for containers
ENV JAVA_OPTS="-XX:+UseContainerSupport \
    -XX:MaxRAMPercentage=75.0 \
    -XX:+UseG1GC \
    -XX:+ExitOnOutOfMemoryError \
    -Djava.security.egd=file:/dev/./urandom"

ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS org.springframework.boot.loader.launch.JarLauncher"]
```

### Runtime Security Configuration

```bash
# Run container with comprehensive security options
docker run -d \
  --name payment-service \
  --user 1001:1001 \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=100m \
  --tmpfs /app/logs:rw,noexec,nosuid,size=200m \
  --memory=1g \
  --memory-swap=1g \
  --cpus=2.0 \
  --pids-limit=256 \
  --cap-drop=ALL \
  --cap-add=NET_BIND_SERVICE \
  --security-opt=no-new-privileges:true \
  --security-opt=seccomp=./seccomp-profile.json \
  --network=app-network \
  --restart=on-failure:5 \
  -e SPRING_PROFILES_ACTIVE=production \
  -p 8443:8443 \
  payment-service:2.1.0

# Verify container is running with restricted capabilities
docker inspect payment-service --format='{{.HostConfig.CapDrop}}'
docker inspect payment-service --format='{{.HostConfig.ReadonlyRootfs}}'

# Check for secrets accidentally baked into image layers
docker history payment-service:2.1.0 --no-trunc | grep -i "password\|secret\|key\|token"

# Scan running container for runtime vulnerabilities
docker exec payment-service cat /etc/os-release
trivy image --severity CRITICAL payment-service:2.1.0
```

### Structured Logging and Graceful Shutdown

```java
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.ContextClosedEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

@Component
public class GracefulShutdownHandler {
    private static final Logger log = LoggerFactory.getLogger(GracefulShutdownHandler.class);
    private final AtomicBoolean shuttingDown = new AtomicBoolean(false);

    @EventListener(ContextClosedEvent.class)
    public void onShutdown(ContextClosedEvent event) {
        log.info("Shutdown signal received, beginning graceful termination");
        shuttingDown.set(true);

        // Phase 1: Stop accepting new requests (health check fails)
        log.info("Phase 1: Marked unhealthy, draining in-flight requests");

        // Phase 2: Wait for in-flight requests to complete
        try {
            TimeUnit.SECONDS.sleep(15); // Match k8s terminationGracePeriodSeconds
            log.info("Phase 2: Drain period complete, closing connections");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.warn("Drain period interrupted, forcing shutdown");
        }

        // Phase 3: Close database connections and flush buffers
        log.info("Phase 3: Releasing resources and flushing buffers");
    }

    public boolean isShuttingDown() {
        return shuttingDown.get();
    }
}
```

### Docker Secrets Management

```yaml
# docker-compose.yml with external secrets

services:
  api-gateway:
    image: api-gateway:3.0.0
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '1.0'
        reservations:
          memory: 256M
          cpus: '0.5'
    secrets:
      - db_password
      - jwt_signing_key
      - tls_cert
    environment:
      - DB_PASSWORD_FILE=/run/secrets/db_password
      - JWT_KEY_FILE=/run/secrets/jwt_signing_key
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 45s
    logging:
      driver: json-file
      options:
        max-size: "50m"
        max-file: "5"
        labels: "service,environment"
        tag: "{{.Name}}/{{.ID}}"

secrets:
  db_password:
    external: true
  jwt_signing_key:
    external: true
  tls_cert:
    file: ./certs/server.crt
```

## Common Pitfalls

1. **Running containers as root in production**: The default Docker behavior runs processes as root inside the container. If an attacker exploits a vulnerability in your application, they gain root access within the container and potentially escape to the host through kernel vulnerabilities. Always specify a non-root `USER` in your Dockerfile and verify with `docker exec <container> whoami`. Many base images now ship with non-root users, but you must explicitly switch to them.

2. **Storing secrets in image layers or environment variables**: Secrets passed via `docker build --build-arg` or `ENV` directives are permanently stored in image layers and visible to anyone who can pull the image. Even if you delete the secret in a later layer, it remains in the layer history. Use Docker secrets, mount secrets as files at runtime, or use external secret managers like HashiCorp Vault or AWS Secrets Manager. Never use `docker inspect` output as proof that secrets are hidden.

3. **Ignoring resource limits and allowing unbounded consumption**: Containers without memory limits can consume all available host memory, triggering the OOM killer on other containers or the host itself. Without CPU limits, a single container can starve others of CPU time. Always set both `--memory` and `--cpus` limits in production. Set memory swap equal to memory limit to prevent swap usage, which causes unpredictable latency spikes.

4. **Using `latest` tag in production deployments**: The `latest` tag is mutable and can point to different image content at different times. A deployment that worked yesterday may pull a different image today. Always use immutable references: specific version tags (`myapp:2.1.0`) or digests (`myapp@sha256:abc123`). Pin base image versions in Dockerfiles and update them deliberately through tested CI pipelines.

5. **Neglecting image scanning and base image updates**: Images built months ago accumulate known vulnerabilities as new CVEs are discovered in their OS packages and dependencies. Without regular scanning and rebuilding, production containers run with exploitable vulnerabilities. Integrate image scanning into CI pipelines (fail builds on critical CVEs), schedule weekly base image rebuilds, and monitor vulnerability databases for newly disclosed issues affecting your stack.

6. **Improper signal handling causing data loss on shutdown**: When Docker stops a container, it sends SIGTERM followed by SIGKILL after a grace period (default 10 seconds). If your application does not handle SIGTERM properly, in-flight requests are dropped, database transactions are left incomplete, and message acknowledgments are lost. Implement graceful shutdown handlers that stop accepting new work, drain in-flight operations, flush buffers, and close connections before exiting.

## Real-World Use Cases

- **Zero-downtime deployment with health checks**: A payment processing service uses Docker health checks integrated with a load balancer. During deployment, new containers must pass health checks for 60 seconds before receiving traffic. Old containers are drained (stop receiving new requests, complete in-flight ones) before removal. The health check endpoint verifies database connectivity, cache availability, and downstream service reachability, ensuring traffic only routes to fully operational instances.

- **Multi-tenant isolation with resource constraints**: A SaaS platform runs customer workloads in isolated containers with strict resource limits. Each tenant container gets a maximum of 2 CPU cores and 4GB memory, with PID limits preventing fork bombs. Read-only filesystems prevent persistent modifications, and network policies restrict inter-tenant communication. Resource usage metrics feed into billing calculations and capacity planning dashboards.

- **Compliance-driven image pipeline**: A healthcare application requires HIPAA compliance for all container images. The CI pipeline builds images from approved base images only, scans with Trivy and Snyk (failing on any HIGH or CRITICAL CVE), signs images with Docker Content Trust, and stores them in a private registry with access logging. Production clusters only pull signed images, and weekly automated rebuilds ensure base image patches are applied within the 30-day compliance window.

- **Incident response with container forensics**: When a security incident is detected, the operations team captures the container state before termination: `docker export` preserves the filesystem, `docker logs` captures recent output, and `docker inspect` records the runtime configuration. The container is then stopped and replaced with a known-good image while the forensic artifacts are analyzed in an isolated environment to determine the attack vector and blast radius.

## Interview Questions

**Q: How would you secure a Docker container for production deployment?**

A: Start with a minimal base image (distroless or alpine) to reduce attack surface. Run as a non-root user with `USER` directive. Drop all Linux capabilities and add back only required ones. Use read-only root filesystem with tmpfs for write-needed directories. Set explicit memory and CPU limits. Scan images for CVEs in CI and fail builds on critical findings. Never store secrets in image layers — use runtime secret injection. Enable seccomp profiles to restrict available system calls. Use Docker Content Trust to verify image signatures. Implement network policies to restrict container-to-container communication to only necessary paths.

**Q: Explain the difference between ENTRYPOINT and CMD, and when you would use each.**

A: ENTRYPOINT defines the executable that always runs when the container starts — it cannot be overridden by command-line arguments (unless using `--entrypoint`). CMD provides default arguments to ENTRYPOINT or acts as the default command if no ENTRYPOINT is set. In production, use ENTRYPOINT for the main application binary (ensuring the container always runs your app) and CMD for default flags that operators might want to override. For example, `ENTRYPOINT ["java", "-jar", "app.jar"]` with `CMD ["--spring.profiles.active=production"]` lets operators override the profile without changing the base command. The exec form (`["binary", "arg"]`) is preferred over shell form (`binary arg`) because it runs the process directly as PID 1, receiving signals correctly for graceful shutdown.

**Q: How do you handle secrets in Docker containers without exposing them in image layers?**

A: Never use build arguments or ENV directives for secrets — they persist in layer history. Instead, use Docker secrets (Swarm mode) which mount secrets as files at `/run/secrets/`. In Kubernetes, use Secrets mounted as volumes or injected via CSI drivers from external stores. For development, use `.env` files excluded from version control. For CI/CD, inject secrets at runtime through the orchestrator's secret management. Applications should read secrets from files (not environment variables, which appear in `docker inspect` and `/proc/*/environ`). Use multi-stage builds where secrets needed during build (like private registry credentials) exist only in discarded builder stages.

**Q: What happens when Docker sends SIGTERM to a container, and how do you ensure graceful shutdown?**

A: Docker sends SIGTERM to PID 1 in the container when `docker stop` is called. If PID 1 does not exit within the grace period (default 10 seconds, configurable with `--stop-timeout`), Docker sends SIGKILL which cannot be caught. For graceful shutdown: ensure your application is PID 1 (use exec form ENTRYPOINT, not shell form which wraps in `/bin/sh`), implement a SIGTERM handler that stops accepting new connections, drains in-flight requests with a timeout, flushes write buffers, closes database connections, and exits with code 0. In Kubernetes, set `terminationGracePeriodSeconds` to match your drain time. Use `preStop` hooks for additional cleanup before SIGTERM is sent.

## Production Tips

- **Implement multi-layer health checks that distinguish liveness from readiness**: Liveness checks should verify the process is not deadlocked (simple endpoint that returns 200 if the event loop or main thread is responsive). Readiness checks should verify the application can serve traffic (database connection pool has available connections, required caches are warm, downstream dependencies are reachable). Separating these prevents unnecessary container restarts when a dependency is temporarily unavailable — the container stays alive but stops receiving traffic until it recovers.

- **Use JSON logging format with consistent field names across all services**: Configure your application to emit logs as single-line JSON objects with standardized fields: `timestamp`, `level`, `service`, `traceId`, `spanId`, `message`, `error`. This enables efficient parsing by log aggregators (Splunk, ELK, CloudWatch Logs) without custom regex extraction rules. Include the container ID and pod name as fields for correlation. Set log rotation on the Docker daemon (`max-size: 50m`, `max-file: 5`) to prevent disk exhaustion from verbose logging.

- **Pin base image versions and automate weekly rebuilds**: Use specific version tags for base images (`eclipse-temurin:21.0.2-jre-alpine`) rather than floating tags (`eclipse-temurin:21-jre-alpine`). Schedule weekly CI jobs that rebuild all production images with the latest base image patches, run the full test suite, scan for vulnerabilities, and promote to staging. This ensures security patches are applied within days of release without requiring manual intervention or emergency rebuilds.

- **Set memory-swap equal to memory limit to prevent swap usage**: Container swap causes unpredictable latency spikes that are extremely difficult to diagnose. When `--memory-swap` equals `--memory`, the container is killed immediately when it exceeds its memory limit rather than silently degrading performance through swap. This makes memory issues visible and actionable through OOM events rather than hidden behind mysterious latency increases that only appear under load.

## Related Topics

- [Container Fundamentals](./container-fundamentals.md) — Core image and container concepts that security practices build upon
- [Dockerfile Best Practices](./dockerfile-best-practices.md) — Build-time optimizations and multi-stage patterns for secure images
- [Kubernetes & EKS](../kubernetes/index.md) — Orchestration-level security policies, pod security standards, and network policies
- [Observability](../observability/index.md) — Container logging, metrics collection, and runtime monitoring
