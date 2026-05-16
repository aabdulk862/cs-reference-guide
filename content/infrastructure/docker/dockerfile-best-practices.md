# Dockerfile Best Practices

## Quick Reference

- Multi-stage builds separate build dependencies from runtime, reducing final image size by 60-90%
- Order instructions from least to most frequently changing to maximize layer cache hits
- Use `.dockerignore` to exclude `node_modules`, `.git`, build artifacts, and test data from build context
- Always create a non-root user with `RUN adduser` and switch with `USER` instruction
- Combine `RUN` commands with `&&` to reduce layer count and clean package caches in the same layer
- Use `ENTRYPOINT` for the main executable and `CMD` for default arguments that can be overridden
- Pin base image versions with specific tags or digests; never use `latest` in production Dockerfiles
- Use `HEALTHCHECK` instruction to enable container orchestrators to detect unhealthy instances
- Build arguments (`ARG`) parameterize builds without baking values into image layers

## When to Use

Dockerfile optimization matters whenever you are building container images for production deployment, CI/CD pipelines, or team-shared development environments. Apply multi-stage builds when your application requires compilation tools (Go, Java, Rust, TypeScript) that are unnecessary at runtime. Focus on layer caching when build times exceed 2-3 minutes and developers are waiting on feedback loops. Security hardening is mandatory for any image deployed to production or accessible from the internet. Image size optimization becomes critical when deploying to bandwidth-constrained environments, running on edge nodes, or paying per-GB for registry storage and network transfer.

These practices are especially important in microservice architectures where dozens of images are built and deployed daily. A 50MB image pulls in 2 seconds; a 1.5GB image takes over a minute. Multiply that by 30 services across 10 nodes during a rolling deployment, and the difference between optimized and unoptimized images is the difference between a 5-minute and 45-minute deployment window.

## Code Examples

### Production-Ready Multi-Stage Build for Java

```dockerfile
# Stage 1: Build with full JDK and Maven
FROM maven:3.9-eclipse-temurin-21 AS builder
WORKDIR /app

# Cache dependencies separately from source code
COPY pom.xml .
COPY .mvn .mvn
RUN mvn dependency:go-offline -B

# Copy source and build
COPY src ./src
RUN mvn package -DskipTests -B -Dmaven.javadoc.skip=true

# Stage 2: Minimal runtime image
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app

# Install security updates and create non-root user
RUN apk update && apk upgrade --no-cache \
    && addgroup -S appgroup && adduser -S appuser -G appgroup \
    && rm -rf /var/cache/apk/*

# Copy only the built artifact from builder stage
COPY --from=builder /app/target/*.jar app.jar

# JVM configuration for containers
ENV JAVA_OPTS="-XX:MaxRAMPercentage=75.0 \
  -XX:+UseG1GC \
  -XX:+ExitOnOutOfMemoryError \
  -Djava.security.egd=file:/dev/./urandom"

# Health check for orchestration platforms
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/actuator/health || exit 1

# Run as non-root user
USER appuser
EXPOSE 8080

ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
```

### Multi-Stage Build for Node.js with TypeScript

```dockerfile
# Stage 1: Install dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --only=production && cp -R node_modules /prod_modules
RUN npm ci

# Stage 2: Build TypeScript
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Stage 3: Production runtime
FROM node:20-alpine AS runner
WORKDIR /app

# Security: non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001 -G nodejs

# Copy only production dependencies and compiled output
COPY --from=deps /prod_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

USER nextjs
EXPOSE 3000

ENTRYPOINT ["node", "dist/server.js"]
```

### Multi-Stage Build for Go with Scratch Base

```dockerfile
# Stage 1: Build static binary
FROM golang:1.22-alpine AS builder
WORKDIR /app

# Cache module downloads
COPY go.mod go.sum ./
RUN go mod download && go mod verify

# Build with security flags
COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags="-w -s -X main.version=1.2.0" \
    -o /app/server ./cmd/server

# Stage 2: Minimal runtime (scratch = empty image)
FROM scratch

# Import CA certificates for HTTPS calls
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

# Copy the static binary
COPY --from=builder /app/server /server

# Run as non-root (numeric UID since scratch has no /etc/passwd)
USER 65534:65534

EXPOSE 8080
ENTRYPOINT ["/server"]
```

## Common Pitfalls

- **Invalidating cache with early COPY instructions**: Placing `COPY . .` before `RUN apt-get install` or `RUN npm install` means every source code change invalidates the dependency installation cache. Always copy dependency manifests first (`package.json`, `pom.xml`, `go.mod`), install dependencies, then copy source code. This ensures dependency layers are cached across builds.

- **Leaving build tools in the final image**: Including compilers, package managers, and development headers in production images increases attack surface and image size. A Java image with the full JDK is 400MB larger than one with just the JRE. Multi-stage builds solve this by copying only compiled artifacts to a minimal runtime base.

- **Storing secrets in Dockerfile instructions**: `ENV` values and files added with `COPY` are permanently baked into image layers visible to anyone with image access. Never put passwords, API keys, or certificates in Dockerfiles. Use Docker BuildKit secrets (`--mount=type=secret`) for build-time secrets and runtime environment variables or secret managers for runtime secrets.

- **Not cleaning package manager caches**: Running `apt-get install` without `rm -rf /var/lib/apt/lists/*` in the same `RUN` instruction leaves cached package lists in the layer. Similarly, `npm install` without `npm cache clean --force` retains the npm cache. Always clean caches in the same `RUN` command to keep them out of the committed layer.

- **Using ADD when COPY suffices**: `ADD` has implicit behaviors (auto-extracting archives, fetching URLs) that make builds less predictable. Use `COPY` for straightforward file copying and reserve `ADD` only when you specifically need tar extraction. This makes Dockerfiles more readable and avoids unexpected behavior.

- **Ignoring .dockerignore**: Without a `.dockerignore` file, Docker sends the entire build context (including `node_modules`, `.git`, test fixtures, and IDE files) to the daemon. A 500MB build context takes 10+ seconds to transfer before the build even starts. Maintain a comprehensive `.dockerignore` that mirrors your `.gitignore` plus build artifacts.

## Real-World Use Cases

In enterprise CI/CD pipelines, multi-stage builds produce deployment-ready images in a single Dockerfile without requiring separate build scripts. The CI system runs `docker build` which handles compilation, testing, and packaging in isolated stages. The final image contains only the runtime artifact, reducing registry storage costs and deployment times across hundreds of daily builds.

Platform engineering teams maintain base images that standardize security configurations, logging agents, and health check patterns across all microservices. Application teams extend these base images with their specific dependencies, inheriting security hardening and operational tooling without duplicating configuration. Base images are rebuilt weekly with security patches and distributed through an internal registry.

Development teams use multi-stage Dockerfiles with a development target stage that includes debugging tools, hot-reload capabilities, and test frameworks. Running `docker build --target=dev` produces a development image, while the default build produces the production image. This single Dockerfile serves both purposes without maintaining separate files.

Compliance-driven organizations use Dockerfile linting tools (Hadolint, Dockle) in CI gates to enforce security policies. Rules prevent running as root, require specific base images from an approved list, mandate health checks, and flag deprecated instructions. Failed lint checks block the merge, ensuring all production images meet security standards.

## Interview Questions

**Q: How do multi-stage builds reduce image size, and what are the tradeoffs?**

A: Multi-stage builds use multiple `FROM` instructions to separate build-time dependencies from runtime requirements. The build stage includes compilers, package managers, and source code (often 500MB-1GB), while the final stage copies only compiled artifacts into a minimal base image. A Go application built in a `golang:1.22` stage (800MB) can produce a final image using `scratch` (0MB base) containing only the static binary, resulting in images under 20MB. The tradeoff is increased Dockerfile complexity and the inability to debug production containers with standard tools when using minimal bases like `scratch` or `distroless`.

**Q: Explain Docker layer caching and how you would optimize a slow build.**

A: Docker caches each layer by instruction content and build context. If an instruction and its inputs have not changed, the cached layer is reused. Cache invalidation cascades downward: changing layer N forces rebuild of all subsequent layers. To optimize: order instructions from stable to volatile (OS packages → dependency install → source copy → build), use multi-stage builds to parallelize independent stages, leverage BuildKit's cache mounts for package manager caches (`--mount=type=cache,target=/root/.m2`), and minimize build context with `.dockerignore`. A well-optimized build rebuilds only the final 1-2 layers on code changes.

**Q: What security measures should every production Dockerfile include?**

A: Run as non-root user (create with `adduser`, switch with `USER`), use minimal base images to reduce attack surface (alpine, distroless), pin base image versions with digests for reproducibility, scan for CVEs in CI, never store secrets in layers (use BuildKit `--mount=type=secret`), set `--read-only` filesystem where possible, drop all Linux capabilities and add back only required ones, and set resource limits. Additionally, use `COPY --chown` instead of `RUN chown` to avoid creating extra layers with root-owned files.

**Q: What is the difference between ENTRYPOINT and CMD?**

A: `ENTRYPOINT` defines the executable that always runs when the container starts. `CMD` provides default arguments to the entrypoint that can be overridden at runtime with `docker run <image> <args>`. When both are specified, `CMD` arguments are appended to `ENTRYPOINT`. Use `ENTRYPOINT` for the main application binary and `CMD` for default flags. The exec form (`["executable", "arg"]`) is preferred over shell form (`executable arg`) because it runs the process directly as PID 1 without a shell wrapper, enabling proper signal handling.

## Production Tips

- **Use BuildKit cache mounts for package managers**: BuildKit's `--mount=type=cache` persists package manager caches across builds without including them in the final image. For Maven: `RUN --mount=type=cache,target=/root/.m2 mvn package`. For npm: `RUN --mount=type=cache,target=/root/.npm npm ci`. This dramatically speeds up dependency resolution on cache misses without bloating image size.

- **Pin base images with digest references in production**: While tags like `eclipse-temurin:21-jre-alpine` are readable, they are mutable. A registry push can change what a tag points to. For production Dockerfiles, use digest references (`FROM eclipse-temurin@sha256:abc123...`) to guarantee bit-for-bit reproducibility. Maintain a separate automation that updates digests when security patches are available.

- **Implement multi-platform builds for ARM and x86**: With Apple Silicon and AWS Graviton instances, multi-platform images are increasingly important. Use `docker buildx build --platform linux/amd64,linux/arm64` to produce manifests that serve the correct architecture automatically. This enables cost savings on ARM instances without maintaining separate Dockerfiles.

## Related Topics

- [Container Fundamentals](./container-fundamentals.md) — Core concepts of images, containers, and the runtime
- [Security and Production](./security-and-production.md) — Runtime security hardening and operational patterns
- [CI/CD Pipelines](../ci-cd-pipelines.md) — Automated image building and deployment workflows
