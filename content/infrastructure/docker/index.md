# Docker & Containerization

Docker is the industry-standard platform for building, shipping, and running applications inside lightweight, portable containers. By packaging application code alongside its dependencies into isolated units that share the host kernel, Docker eliminates environment inconsistencies and enables reproducible deployments across development, testing, and production. Containers start in milliseconds, consume minimal overhead compared to virtual machines, and provide process-level isolation through Linux namespaces and cgroups.

Modern container workflows extend beyond single containers into orchestrated multi-service architectures. Docker Compose manages local multi-container environments, multi-stage builds optimize image size for production, and container registries distribute versioned images across teams and deployment targets. Understanding Docker deeply is essential for any engineer working with microservices, CI/CD pipelines, or cloud-native infrastructure.

## Learning Path

1. [Container Fundamentals](./container-fundamentals.md) — Core concepts of images, containers, layers, and the container runtime
2. [Dockerfile Best Practices](./dockerfile-best-practices.md) — Writing production-ready Dockerfiles with multi-stage builds and security hardening
3. [Networking and Storage](./networking-and-storage.md) — Docker networking modes, volume management, and data persistence strategies
4. [Docker Compose](./docker-compose.md) — Orchestrating multi-container applications for development and testing
5. [Security and Production](./security-and-production.md) — Container security, resource limits, logging, and production deployment patterns

## Related Topics

- [Kubernetes & EKS](../kubernetes/index.md) — Container orchestration at scale
- [CI/CD Pipelines](../ci-cd-pipelines.md) — Automated container build and deployment workflows
- [Linux Administration](../linux-administration.md) — Kernel features underpinning container isolation
