# Container Security

Container security encompasses the practices, tools, and architectures that protect containerized applications throughout their lifecycle — from image building and registry storage through runtime execution and orchestration. Containers introduce unique security challenges: shared kernel attack surface, immutable but potentially vulnerable images, ephemeral workloads that complicate forensics, and complex supply chains where a single compromised base image can affect thousands of deployments.

Modern container security operates on the principle of shifting security left (catching vulnerabilities during build) while maintaining runtime defenses (detecting and preventing exploitation in production). For engineers building and operating containerized systems, understanding image scanning, runtime security, secrets management, network policies, and supply chain security is essential for passing security-focused system design interviews and building production-grade infrastructure.

---

## Quick Reference

- **Image Scanning** — Static analysis of container images for known CVEs, misconfigurations, and embedded secrets; performed in CI/CD pipelines and registries
- **Runtime Security** — Monitoring container behavior at runtime for anomalous system calls, file access, network connections, and process execution
- **Secrets Management** — Secure injection of credentials, API keys, and certificates into containers without baking them into images or environment variables
- **Network Policies** — Kubernetes-native firewall rules controlling pod-to-pod communication; default-deny with explicit allow rules
- **Supply Chain Security** — Verifying the provenance and integrity of container images, base images, and dependencies from source to deployment
- **Pod Security Standards** — Kubernetes policies enforcing security contexts: non-root execution, read-only filesystems, dropped capabilities
- **Image Signing** — Cryptographic signatures (cosign/Sigstore) proving image authenticity and integrity from build to deployment
- **Admission Controllers** — Kubernetes gatekeepers that validate or mutate pod specifications before scheduling, enforcing security policies
- **Seccomp/AppArmor** — Linux kernel security modules restricting which system calls containers can make, reducing attack surface
- **SBOM (Software Bill of Materials)** — Machine-readable inventory of all components in a container image, enabling vulnerability tracking and license compliance

---

## When to Use

**Image Scanning:**
- Every CI/CD pipeline before pushing images to registries
- Registry-level scanning for continuous monitoring of stored images
- Before deploying to production (admission controller validation)
- Periodic rescanning of running images when new CVEs are published

**Runtime Security:**
- Production environments where containers handle sensitive data
- Multi-tenant clusters where workload isolation is critical
- Compliance environments requiring continuous monitoring (PCI DSS, SOC 2)
- Detecting cryptomining, reverse shells, and container escape attempts

**Secrets Management:**
- Any container that needs database credentials, API keys, or TLS certificates
- Multi-environment deployments (dev/staging/prod) with different credentials
- Automated secret rotation without container restarts
- Compliance requirements mandating encrypted secret storage and audit logging

**Network Policies:**
- Any Kubernetes cluster running multiple services (even in development)
- Multi-tenant clusters where namespace isolation is required
- Microservices architectures where blast radius must be limited
- Compliance environments requiring documented network segmentation

**Supply Chain Security:**
- Organizations with regulatory requirements (FedRAMP, SOC 2)
- Open-source dependent projects where dependency integrity matters
- Any production system where a compromised image could cause data breach
- CI/CD pipelines that build and distribute container images

**Pod Security Standards:**
- All Kubernetes deployments (baseline security should be non-negotiable)
- Workloads processing sensitive data (restricted profile)
- Clusters shared between teams with different trust levels
- Compliance environments requiring documented security controls

---

## Code Examples

### Example 1: Secure Dockerfile with Multi-Stage Build

```dockerfile
# Stage 1: Build (includes build tools, not shipped to production)
FROM node:20-alpine AS builder

# Don't run as root during build
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
WORKDIR /app

# Copy dependency files first (layer caching optimization)
COPY package.json package-lock.json ./

# Install dependencies with integrity verification
RUN npm ci --ignore-scripts && \
    npm audit --audit-level=high

# Copy source and build
COPY --chown=appuser:appgroup src/ ./src/
COPY --chown=appuser:appgroup tsconfig.json ./
RUN npm run build

# Remove dev dependencies
RUN npm prune --production

# Stage 2: Production (minimal attack surface)
FROM node:20-alpine AS production

# Security: Add non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Security: Remove unnecessary packages
RUN apk --no-cache add dumb-init && \
    rm -rf /var/cache/apk/* /tmp/* /var/tmp/*

# Security: Set filesystem permissions
WORKDIR /app
RUN chown -R appuser:appgroup /app

# Copy only production artifacts
COPY --from=builder --chown=appuser:appgroup /app/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/package.json ./

# Security: Switch to non-root user
USER appuser

# Security: Read-only filesystem (app writes to mounted volumes only)
# This is enforced at runtime via securityContext, but signal intent here
VOLUME ["/app/logs", "/app/tmp"]

# Security: Use dumb-init to handle signals properly (PID 1 problem)
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server.js"]

# Security: Declare the port (documentation, not enforcement)
EXPOSE 3000

# Security: Health check for orchestrator
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Metadata labels for tracking
LABEL org.opencontainers.image.source="https://github.com/org/repo"
LABEL org.opencontainers.image.revision="${GIT_SHA}"
LABEL org.opencontainers.image.created="${BUILD_DATE}"
```

### Example 2: Kubernetes Pod Security with Comprehensive Security Context

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-server
  namespace: production
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api-server
  template:
    metadata:
      labels:
        app: api-server
      annotations:
        # Seccomp profile restricting system calls
        seccomp.security.alpha.kubernetes.io/pod: runtime/default
    spec:
      # Security: Don't use the default service account
      serviceAccountName: api-server-sa
      automountServiceAccountToken: false

      # Security: Pod-level security context
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        runAsGroup: 1000
        fsGroup: 1000
        seccompProfile:
          type: RuntimeDefault

      containers:
        - name: api-server
          image: registry.example.com/api-server:v1.2.3@sha256:abc123...
          # Security: Always use image digest, not just tag

          securityContext:
            # Security: Container-level restrictions
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            runAsNonRoot: true
            runAsUser: 1000
            capabilities:
              drop:
                - ALL
              # Only add specific capabilities if absolutely needed
              # add: ["NET_BIND_SERVICE"]  # Only if binding to port < 1024

          resources:
            # Security: Resource limits prevent DoS via resource exhaustion
            requests:
              memory: "256Mi"
              cpu: "250m"
            limits:
              memory: "512Mi"
              cpu: "1000m"

          # Writable directories (since root filesystem is read-only)
          volumeMounts:
            - name: tmp
              mountPath: /tmp
            - name: app-logs
              mountPath: /app/logs
            - name: secrets
              mountPath: /app/secrets
              readOnly: true

          ports:
            - containerPort: 3000
              protocol: TCP

          livenessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 30

          readinessProbe:
            httpGet:
              path: /ready
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 10

      volumes:
        - name: tmp
          emptyDir:
            medium: Memory
            sizeLimit: "64Mi"
        - name: app-logs
          emptyDir:
            sizeLimit: "256Mi"
        - name: secrets
          csi:
            driver: secrets-store.csi.k8s.io
            readOnly: true
            volumeAttributes:
              secretProviderClass: api-server-secrets

      # Security: Topology spread for availability
      topologySpreadConstraints:
        - maxSkew: 1
          topologyKey: topology.kubernetes.io/zone
          whenUnsatisfiable: DoNotSchedule
          labelSelector:
            matchLabels:
              app: api-server
```

### Example 3: Secrets Management with External Secrets Operator

```yaml
# SecretProviderClass for AWS Secrets Manager integration
apiVersion: secrets-store.csi.x-k8s.io/v1
kind: SecretProviderClass
metadata:
  name: api-server-secrets
  namespace: production
spec:
  provider: aws
  parameters:
    objects: |
      - objectName: "production/api-server/database"
        objectType: "secretsmanager"
        objectVersionLabel: "AWSCURRENT"
        jmesPath:
          - path: host
            objectAlias: db-host
          - path: port
            objectAlias: db-port
          - path: username
            objectAlias: db-username
          - path: password
            objectAlias: db-password
      - objectName: "production/api-server/jwt-signing-key"
        objectType: "secretsmanager"
        objectVersionLabel: "AWSCURRENT"
  # Sync to Kubernetes Secret for env var injection
  secretObjects:
    - secretName: api-server-db-credentials
      type: Opaque
      data:
        - objectName: db-host
          key: DB_HOST
        - objectName: db-port
          key: DB_PORT
        - objectName: db-username
          key: DB_USERNAME
        - objectName: db-password
          key: DB_PASSWORD

---
# ExternalSecret for HashiCorp Vault integration
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: api-server-secrets
  namespace: production
spec:
  refreshInterval: 1h  # Auto-rotation check interval
  secretStoreRef:
    name: vault-backend
    kind: ClusterSecretStore
  target:
    name: api-server-credentials
    creationPolicy: Owner
    deletionPolicy: Retain
  data:
    - secretKey: DATABASE_URL
      remoteRef:
        key: secret/data/production/api-server
        property: database_url
    - secretKey: JWT_PRIVATE_KEY
      remoteRef:
        key: secret/data/production/api-server
        property: jwt_private_key
    - secretKey: ENCRYPTION_KEY
      remoteRef:
        key: secret/data/production/api-server
        property: encryption_key
```

```typescript
// Application-level secrets handling (never log, never expose)
class SecretManager {
  private secrets: Map<string, string> = new Map();

  async loadSecrets(): Promise<void> {
    // Read from mounted volume (CSI driver) or environment
    const secretsPath = process.env.SECRETS_PATH || '/app/secrets';

    try {
      const files = await fs.readdir(secretsPath);
      for (const file of files) {
        const value = await fs.readFile(path.join(secretsPath, file), 'utf8');
        this.secrets.set(file, value.trim());
      }
    } catch (error) {
      // Fallback to environment variables (less secure but works in dev)
      this.secrets.set('db-password', process.env.DB_PASSWORD || '');
      this.secrets.set('jwt-key', process.env.JWT_PRIVATE_KEY || '');
    }
  }

  getSecret(key: string): string {
    const value = this.secrets.get(key);
    if (!value) {
      throw new Error(`Secret '${key}' not found`);
    }
    return value;
  }

  // Override toString/toJSON to prevent accidental logging
  toString(): string {
    return '[SecretManager: secrets redacted]';
  }

  toJSON(): object {
    return { type: 'SecretManager', secretCount: this.secrets.size };
  }
}
```

### Example 4: Image Signing and Verification with Cosign

```yaml
# CI/CD pipeline: Build, scan, sign, and push container image
# GitHub Actions example
name: Build and Sign Container Image
on:
  push:
    branches: [main]

jobs:
  build-sign-push:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write  # Required for keyless signing (Sigstore)
      packages: write

    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and Push Image
        id: build
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ghcr.io/${{ github.repository }}:${{ github.sha }}
          sbom: true  # Generate SBOM attestation
          provenance: true  # Generate SLSA provenance

      - name: Scan Image for Vulnerabilities
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: ghcr.io/${{ github.repository }}:${{ github.sha }}
          format: 'sarif'
          output: 'trivy-results.sarif'
          severity: 'CRITICAL,HIGH'
          exit-code: '1'  # Fail pipeline on critical/high CVEs

      - name: Install Cosign
        uses: sigstore/cosign-installer@v3

      - name: Sign Image (Keyless - uses OIDC identity)
        run: |
          cosign sign --yes \
            ghcr.io/${{ github.repository }}@${{ steps.build.outputs.digest }}

      - name: Attach SBOM to Image
        run: |
          cosign attach sbom \
            --sbom trivy-sbom.json \
            ghcr.io/${{ github.repository }}@${{ steps.build.outputs.digest }}

      - name: Verify Signature
        run: |
          cosign verify \
            --certificate-identity-regexp=".*@example.com" \
            --certificate-oidc-issuer="https://token.actions.githubusercontent.com" \
            ghcr.io/${{ github.repository }}@${{ steps.build.outputs.digest }}
```

```yaml
# Kubernetes admission controller: Only allow signed images
# Using Kyverno policy engine
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: verify-image-signatures
spec:
  validationFailureAction: Enforce
  background: false
  rules:
    - name: verify-cosign-signature
      match:
        any:
          - resources:
              kinds:
                - Pod
      verifyImages:
        - imageReferences:
            - "ghcr.io/myorg/*"
          attestors:
            - entries:
                - keyless:
                    subject: "*@myorg.com"
                    issuer: "https://token.actions.githubusercontent.com"
                    rekor:
                      url: https://rekor.sigstore.dev
          mutateDigest: true  # Replace tags with digests
          verifyDigest: true
```

### Example 5: Runtime Security with Falco Rules

```yaml
# Falco rules for container runtime security monitoring
# Detect suspicious container behavior

# Rule: Detect shell spawned in container
- rule: Shell Spawned in Container
  desc: Detect shell execution inside a container (potential reverse shell)
  condition: >
    spawned_process and
    container and
    proc.name in (bash, sh, zsh, dash, ksh) and
    not proc.pname in (cron, supervisord, entrypoint.sh)
  output: >
    Shell spawned in container
    (user=%user.name container=%container.name image=%container.image.repository
     shell=%proc.name parent=%proc.pname cmdline=%proc.cmdline)
  priority: WARNING
  tags: [container, shell, mitre_execution]

# Rule: Detect sensitive file access
- rule: Read Sensitive File in Container
  desc: Detect reading of sensitive files (credential theft)
  condition: >
    open_read and
    container and
    fd.name in (/etc/shadow, /etc/passwd, /proc/self/environ,
                /var/run/secrets/kubernetes.io/serviceaccount/token)
  output: >
    Sensitive file read in container
    (user=%user.name file=%fd.name container=%container.name
     image=%container.image.repository command=%proc.cmdline)
  priority: CRITICAL
  tags: [container, filesystem, mitre_credential_access]

# Rule: Detect crypto mining
- rule: Detect Crypto Mining
  desc: Detect cryptocurrency mining processes
  condition: >
    spawned_process and
    container and
    (proc.name in (xmrig, minerd, minergate, cpuminer) or
     proc.cmdline contains "stratum+tcp" or
     proc.cmdline contains "pool.minergate")
  output: >
    Crypto mining detected in container
    (user=%user.name container=%container.name image=%container.image.repository
     process=%proc.name cmdline=%proc.cmdline)
  priority: CRITICAL
  tags: [container, cryptomining, mitre_resource_hijacking]

# Rule: Detect container escape attempts
- rule: Container Escape via Mount
  desc: Detect attempts to mount host filesystem from container
  condition: >
    spawned_process and
    container and
    proc.name = mount and
    proc.cmdline contains "/host"
  output: >
    Container escape attempt via mount
    (user=%user.name container=%container.name cmdline=%proc.cmdline)
  priority: CRITICAL
  tags: [container, escape, mitre_privilege_escalation]

# Rule: Unexpected network connection
- rule: Unexpected Outbound Connection
  desc: Detect outbound connections to non-allowlisted destinations
  condition: >
    outbound and
    container and
    not fd.sip in (allowed_outbound_ips) and
    not fd.sport in (53, 443, 80)
  output: >
    Unexpected outbound connection from container
    (container=%container.name image=%container.image.repository
     connection=%fd.name dest_ip=%fd.sip dest_port=%fd.sport)
  priority: HIGH
  tags: [container, network, mitre_exfiltration]
```

---

## Common Pitfalls

**1. Running containers as root.** By default, many container images run as root (UID 0). If an attacker exploits a vulnerability in the application, they have root access inside the container, which can be leveraged for container escape via kernel exploits. Always specify `USER` in Dockerfiles and enforce `runAsNonRoot: true` in Kubernetes security contexts.

**2. Using `latest` tag instead of image digests.** The `latest` tag is mutable — it can point to different images over time. An attacker who compromises your registry can replace `latest` with a malicious image. Always use immutable references: either specific version tags with digest verification (`image:v1.2.3@sha256:...`) or digests alone. Admission controllers should enforce digest-based references.

**3. Baking secrets into container images.** Secrets embedded in Dockerfiles (via `ENV`, `COPY`, or build args) persist in image layers even if "deleted" in later layers. Anyone with image pull access can extract them. Use runtime secret injection via mounted volumes (CSI driver), environment variables from Kubernetes Secrets, or external secret managers.

**4. Not scanning images in CI/CD pipelines.** Without automated scanning, vulnerable base images and dependencies ship to production. A single unpatched CVE in a base image can affect every service built on it. Integrate Trivy, Snyk Container, or Grype into every pipeline and fail builds on critical/high severity findings.

**5. Overly permissive security contexts.** Allowing `privileged: true`, `hostNetwork: true`, or `hostPID: true` gives containers nearly unrestricted access to the host. These settings should be banned in production via admission controllers (OPA Gatekeeper, Kyverno). Even `allowPrivilegeEscalation: true` (the default) enables exploits that escalate from container to host.

**6. Ignoring base image updates.** Base images (alpine, ubuntu, node) receive security patches regularly. If you build once and never rebuild, your images accumulate vulnerabilities over time. Implement automated rebuilds triggered by base image updates, and use tools like Dependabot or Renovate to track base image versions.

**7. Not implementing network policies.** By default, all pods in a Kubernetes cluster can communicate with all other pods. Without network policies, a compromised pod can reach databases, internal APIs, and the Kubernetes API server. Implement default-deny policies and explicitly allow only required communication paths.

**8. Mounting the Docker socket into containers.** Mounting `/var/run/docker.sock` gives a container full control over the Docker daemon, equivalent to root access on the host. This is commonly done for CI/CD runners but creates a critical escape vector. Use alternatives like Kaniko (rootless image building) or dedicated build clusters with restricted access.

---

## Real-World Use Cases

**Financial services container platform:** A major bank runs their trading platform on Kubernetes with strict security controls: all images are built in air-gapped CI/CD pipelines, signed with cosign, and verified by admission controllers before deployment. Runtime security (Falco + Sysdig) monitors every system call, alerting on any deviation from learned behavioral profiles. Secrets are injected via HashiCorp Vault with automatic rotation every 24 hours. Network policies enforce strict microsegmentation — the trading engine can only communicate with the market data feed and the order management system.

**Healthcare SaaS on Kubernetes:** A HIPAA-compliant healthcare platform implements defense in depth: images are scanned for CVEs and PHI (protected health information) leakage in CI/CD, pods run with read-only filesystems and dropped capabilities, all inter-service communication uses mTLS via Istio service mesh, and audit logs capture every container lifecycle event. Patient data encryption keys are stored in AWS CloudHSM and injected via the Secrets Store CSI driver. Pod security admission enforces the "restricted" profile across all namespaces.

**Multi-tenant CI/CD platform:** A CI/CD platform (similar to GitHub Actions) runs untrusted user code in containers. Security is paramount: each build runs in a fresh, ephemeral container with no network access by default, gVisor provides kernel-level isolation (containers don't share the host kernel), resource limits prevent cryptomining, and Seccomp profiles restrict system calls to a minimal allowlist. Images are pulled from a curated, pre-scanned registry. After each build, the container and its storage are cryptographically wiped.

**E-commerce platform supply chain security:** An e-commerce company implements SLSA Level 3 supply chain security: source code is protected by branch protection rules and code review requirements, builds run on hardened, ephemeral build infrastructure, every artifact is signed and has provenance attestation, SBOMs are generated and stored for every image, and admission controllers verify the complete chain of trust before allowing deployment. When Log4Shell (CVE-2021-44228) was disclosed, they used SBOMs to identify all affected images within minutes rather than days.

---

## Interview Questions

**Q: How would you design a secure container image pipeline from source code to production deployment?**

A: A secure pipeline implements security at every stage: (1) Source: Branch protection, signed commits, dependency pinning with lock files, and automated dependency updates (Renovate/Dependabot). (2) Build: Multi-stage Dockerfiles minimizing attack surface, non-root users, hardened base images from a curated internal registry. Build on ephemeral, attested infrastructure (SLSA). (3) Scan: Static analysis (Trivy/Snyk) for CVEs in OS packages and application dependencies, secret scanning (detect accidentally embedded credentials), and Dockerfile linting (hadolint). Fail on critical/high findings. (4) Sign: Keyless signing with cosign/Sigstore, generating provenance attestation and SBOM. (5) Store: Private registry with vulnerability scanning enabled, image retention policies, and access controls. (6) Deploy: Admission controllers verify signatures and scan results before allowing pods. Only digest-referenced images are permitted. (7) Runtime: Behavioral monitoring (Falco), network policies, and automated response to detected threats.

**Q: Explain the difference between container isolation and VM isolation. When is container isolation insufficient?**

A: VMs provide hardware-level isolation — each VM has its own kernel, and the hypervisor enforces boundaries at the CPU instruction level. Containers share the host kernel and rely on Linux namespaces (PID, network, mount, user) and cgroups for isolation. Container isolation is weaker because: kernel vulnerabilities affect all containers on the host, namespace escapes are possible (though rare), and the shared kernel provides a larger attack surface. Container isolation is insufficient when: running untrusted code (use gVisor or Kata Containers for kernel-level isolation), strict regulatory requirements mandate VM-level separation, different security classification levels share infrastructure, or when kernel exploits are in your threat model. Solutions include: gVisor (user-space kernel), Kata Containers (lightweight VMs with container UX), Firecracker (microVMs), or dedicated node pools with single-tenant scheduling.

**Q: How do you manage secrets in a Kubernetes environment? Compare different approaches and their trade-offs.**

A: Approaches from least to most secure: (1) Kubernetes Secrets (base64 encoded, stored in etcd): Simple but not encrypted by default, visible to anyone with RBAC access to the namespace. Enable etcd encryption at rest as minimum. (2) Sealed Secrets (Bitnami): Encrypted secrets that can be safely stored in Git. Decrypted only by the cluster's sealed-secrets controller. Good for GitOps but no rotation support. (3) External Secrets Operator: Syncs secrets from external stores (Vault, AWS SM, GCP SM) into Kubernetes Secrets. Supports rotation via refresh intervals. Secrets still exist as Kubernetes Secrets in memory. (4) Secrets Store CSI Driver: Mounts secrets directly from external stores as files in pod volumes. Secrets never exist as Kubernetes Secret objects. Supports auto-rotation. Most secure but requires CSI driver support. (5) Vault Agent Sidecar: Vault agent runs alongside the application, handling authentication, secret retrieval, and rotation. Most flexible but adds sidecar overhead. For production, I recommend CSI driver for static secrets and Vault agent for dynamic secrets (database credentials with TTL).

**Q: What is SLSA and how does it protect against supply chain attacks?**

A: SLSA (Supply-chain Levels for Software Artifacts) is a framework defining increasing levels of supply chain security guarantees. Level 1: Build process is documented and produces provenance (metadata about how the artifact was built). Level 2: Build service is hosted (not on developer laptops), and provenance is signed. Level 3: Build platform is hardened — builds run on ephemeral, isolated infrastructure, source is verified, and provenance is non-falsifiable. Level 4: All dependencies are also SLSA-compliant (hermetic builds). SLSA protects against: compromised build systems (SolarWinds-style attacks), unauthorized source changes, dependency confusion attacks, and build reproducibility issues. Implementation involves: using GitHub Actions or Cloud Build with provenance generation, signing artifacts with Sigstore, verifying provenance at deployment time via admission controllers, and generating SBOMs for vulnerability tracking. The key insight is that knowing what's in your software (SBOM) and how it was built (provenance) enables rapid response when vulnerabilities are discovered.

---

## Production Tips

**Implement image garbage collection and retention policies.** Container registries accumulate images rapidly — each CI build produces a new image. Without cleanup, storage costs grow unbounded and old vulnerable images remain pullable. Implement retention policies: keep the last N tags per repository, delete untagged images after 7 days, and never delete images currently deployed (cross-reference with cluster state). Tools like registry-gc, Harbor's built-in GC, or ECR lifecycle policies automate this.

**Use distroless or scratch base images for production.** Alpine-based images are smaller than Ubuntu but still contain a shell, package manager, and utilities that attackers can leverage post-exploitation. Distroless images (gcr.io/distroless) contain only the application runtime — no shell, no package manager, no utilities. This dramatically reduces attack surface and makes post-exploitation difficult. For Go applications, build from `scratch` (empty image) with a statically linked binary. The trade-off is debugging difficulty — you can't exec into a distroless container, so implement proper logging and observability instead.

**Automate vulnerability response with SLA-based patching.** Define patching SLAs based on severity: Critical CVEs patched within 24 hours, High within 7 days, Medium within 30 days. Automate the workflow: scanner detects CVE → creates ticket → triggers rebuild with patched base image → runs tests → deploys to staging → promotes to production. For critical CVEs affecting base images, maintain a "fast lane" pipeline that can rebuild and redeploy all affected services within hours. Track mean-time-to-remediate (MTTR) as a key security metric.

---

## Related Topics

- [Network Security](./network-security.md) — Kubernetes network policies, service mesh mTLS, and cluster networking that container security depends on
- [Cryptography Fundamentals](./cryptography-fundamentals.md) — Image signing, secrets encryption, and TLS certificates used throughout the container lifecycle
- [Authentication Patterns](./authentication-patterns.md) — Service account tokens, workload identity, and service-to-service authentication in containerized environments
