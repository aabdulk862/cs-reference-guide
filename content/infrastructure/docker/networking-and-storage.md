# Networking and Storage

## Quick Reference

- Docker networking modes: bridge (default, isolated), host (shared with host), none (disabled), overlay (multi-host)
- Custom bridge networks provide automatic DNS resolution between containers by service name
- Port mapping (`-p host:container`) exposes container ports through Docker's userland proxy or iptables rules
- Volumes are Docker-managed persistent storage at `/var/lib/docker/volumes/`, surviving container removal
- Bind mounts map specific host directories into containers, ideal for development hot-reload workflows
- tmpfs mounts create in-memory filesystems never written to disk, suitable for sensitive ephemeral data
- Volume drivers extend storage to NFS, cloud block storage (EBS, Azure Disk), and distributed filesystems
- Overlay networks use VXLAN tunneling for cross-host container communication in Swarm mode
- Named volumes can be shared between multiple containers simultaneously for data exchange

## When to Use

Docker networking configuration is critical whenever containers need to communicate with each other, with the host, or with external services. Use custom bridge networks for multi-container applications where services discover each other by name. Use host networking when NAT overhead is unacceptable for latency-sensitive applications like high-frequency trading systems or real-time media servers. Use overlay networks when containers span multiple Docker hosts and need a flat network topology.

Volume management becomes essential when containers handle persistent state: databases, file uploads, configuration data, or application logs that must survive container restarts. Use named volumes for production database containers, bind mounts for development environments where source code changes should be immediately visible inside containers, and tmpfs for processing sensitive data like encryption keys or temporary credentials that should never touch disk.

## Code Examples

### Network Configuration and Service Discovery

```yaml
# docker-compose.yml demonstrating network isolation

services:
  api:
    build: ./api
    ports:
      - "8080:8080"
    networks:
      - frontend
      - backend
    environment:
      - DATABASE_URL=postgresql://postgres:5432/app
      - REDIS_URL=redis://cache:6379

  worker:
    build: ./worker
    networks:
      - backend
      - messaging
    environment:
      - RABBITMQ_URL=amqp://rabbitmq:5672

  postgres:
    image: postgres:16-alpine
    networks:
      - backend
    volumes:
      - pgdata:/var/lib/postgresql/data

  cache:
    image: redis:7-alpine
    networks:
      - backend
    command: redis-server --maxmemory 256mb --maxmemory-policy allkeys-lru

  rabbitmq:
    image: rabbitmq:3.12-management
    networks:
      - messaging
    ports:
      - "15672:15672"  # Management UI only

  nginx:
    image: nginx:alpine
    ports:
      - "443:443"
      - "80:80"
    networks:
      - frontend
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - certs:/etc/nginx/certs:ro

networks:
  frontend:
    driver: bridge
  backend:
    driver: bridge
    internal: true  # No external access
  messaging:
    driver: bridge
    internal: true

volumes:
  pgdata:
  certs:
```

### Advanced Network Operations

```bash
# Create a custom bridge network with specific subnet
docker network create \
  --driver bridge \
  --subnet 172.20.0.0/16 \
  --gateway 172.20.0.1 \
  --opt com.docker.network.bridge.name=app-bridge \
  app-network

# Connect a running container to an additional network
docker network connect backend-network api-container

# Inspect network to see connected containers and their IPs
docker network inspect app-network --format '{{json .Containers}}' | jq .

# Run a container with a specific IP address
docker run -d --network app-network --ip 172.20.0.10 --name db postgres:16

# Test DNS resolution between containers
docker run --rm --network app-network alpine nslookup db

# Create an overlay network for multi-host communication (Swarm mode)
docker network create \
  --driver overlay \
  --attachable \
  --subnet 10.0.9.0/24 \
  multi-host-network

# Monitor network traffic for debugging
docker run --rm --net=container:api-container nicolaka/netshoot tcpdump -i eth0 port 8080
```

### Volume Management and Data Persistence

```bash
# Create a named volume with specific driver options
docker volume create \
  --driver local \
  --opt type=nfs \
  --opt o=addr=192.168.1.100,rw \
  --opt device=:/path/to/share \
  nfs-data

# Run PostgreSQL with named volume for data persistence
docker run -d \
  --name postgres \
  -e POSTGRES_PASSWORD=secret \
  -v pgdata:/var/lib/postgresql/data \
  -v ./init-scripts:/docker-entrypoint-initdb.d:ro \
  postgres:16-alpine

# Backup a volume by mounting it in a temporary container
docker run --rm \
  -v pgdata:/source:ro \
  -v $(pwd)/backups:/backup \
  alpine tar czf /backup/pgdata-$(date +%Y%m%d).tar.gz -C /source .

# Restore a volume from backup
docker run --rm \
  -v pgdata:/target \
  -v $(pwd)/backups:/backup:ro \
  alpine sh -c "rm -rf /target/* && tar xzf /backup/pgdata-20240115.tar.gz -C /target"

# Use tmpfs for sensitive data processing
docker run -d \
  --name crypto-worker \
  --tmpfs /tmp/keys:rw,noexec,nosuid,size=64m \
  --read-only \
  crypto-service:latest

# Inspect volume usage and metadata
docker volume inspect pgdata
docker system df -v  # Show disk usage by volumes
```

## Common Pitfalls

- **Using the default bridge network for multi-container apps**: The default bridge network does not provide automatic DNS resolution between containers. You must use `--link` (deprecated) or reference containers by IP address. Always create custom bridge networks where containers can discover each other by name, which is the default behavior in Docker Compose.

- **Port conflicts on the host**: Publishing the same host port from multiple containers fails silently or with cryptic errors. Use unique host ports or let Docker assign random ports with `-p 8080` (without host port specification). In production, use a reverse proxy (nginx, Traefik) that listens on standard ports and routes to containers by hostname.

- **Bind mount permission issues**: Files created inside a container with bind mounts are owned by the container's user (often root). This creates permission conflicts on the host where the developer cannot edit or delete files created by the container. Use `--user $(id -u):$(id -g)` or configure the container to match the host user's UID/GID.

- **Volume data loss during `docker-compose down -v`**: The `-v` flag removes named volumes along with containers. Developers accidentally destroy database data by running `docker-compose down -v` instead of `docker-compose down`. Educate teams about this distinction and implement backup scripts for development databases with important seed data.

- **Not using read-only mounts for configuration**: Mounting configuration files without `:ro` (read-only) allows containers to modify host files. A compromised container could alter nginx configuration or inject malicious content into shared config. Always use `:ro` for configuration bind mounts and volume mounts that should not be writable.

- **Overlay network performance overhead**: Overlay networks add VXLAN encapsulation overhead (approximately 50 bytes per packet) and require additional CPU for encryption when using `--opt encrypted`. For latency-sensitive east-west traffic between containers on the same host, use a standard bridge network. Reserve overlay networks for cross-host communication where the overhead is acceptable.

## Real-World Use Cases

Microservice architectures use network segmentation to enforce security boundaries between service tiers. Frontend services connect to both a public-facing network (for load balancer traffic) and an internal network (for backend API calls). Database containers exist only on the internal network with no external connectivity, preventing direct access from outside the application. Network policies combined with internal networks create defense-in-depth without requiring external firewalls.

Development environments use bind mounts to enable hot-reload workflows where source code changes on the host are immediately reflected inside running containers. A React development server watches for file changes through the bind mount, recompiles on save, and serves updated content without container rebuilds. This provides sub-second feedback loops while maintaining the consistency of containerized dependencies.

Stateful services like databases and message brokers use named volumes to persist data across container upgrades. When upgrading PostgreSQL from 16.1 to 16.2, the container is stopped, the image is updated, and a new container starts with the same named volume. The data directory persists unchanged, and the new container version picks up where the old one left off. Backup automation runs nightly, mounting the volume read-only in a temporary container that streams compressed archives to S3.

Multi-host deployments use overlay networks to create a flat network topology across a Docker Swarm cluster. Services running on different physical hosts communicate as if they were on the same local network, with Docker handling VXLAN tunneling transparently. Service mesh proxies (Envoy sidecars) add mTLS encryption, traffic shaping, and observability to this overlay communication without application code changes.

## Interview Questions

**Q: Explain Docker networking modes and when to use each.**

A: Bridge (default) creates an isolated network with NAT for external access, suitable for most applications needing inter-container communication. Custom bridge networks add automatic DNS resolution. Host removes network isolation entirely, giving containers direct access to host interfaces for maximum performance when NAT overhead is unacceptable. None disables all networking for security-sensitive batch processing. Overlay creates multi-host networks using VXLAN for Docker Swarm or cross-host communication. Macvlan assigns real MAC addresses to containers, making them appear as physical devices on the network for legacy application compatibility.

**Q: How do you handle persistent data in Docker, and what are the tradeoffs between volumes and bind mounts?**

A: Docker provides three storage options. Volumes are managed by Docker, stored in `/var/lib/docker/volumes/`, portable across hosts, support remote storage drivers, and are the recommended approach for production data. Bind mounts map specific host paths into containers, providing direct host filesystem access ideal for development but creating host-dependency and permission issues. Tmpfs mounts exist only in memory, never written to disk, suitable for sensitive ephemeral data. Volumes win for production because they are managed, backed up, and migrated independently of the host filesystem layout.

**Q: How does Docker DNS resolution work in custom bridge networks?**

A: Docker runs an embedded DNS server at 127.0.0.11 inside each container connected to a custom bridge network. When a container makes a DNS query for another container's name, the embedded DNS server resolves it to that container's IP address on the shared network. This enables service discovery by container name or service name (in Compose). The DNS server also forwards external queries to the host's configured DNS servers. This only works on user-defined networks; the default bridge network uses `/etc/hosts` file entries instead.

**Q: What happens to container networking when a container is stopped and restarted?**

A: When a container stops, its network namespace is destroyed and its IP address is released back to the network's IPAM pool. When restarted, it receives a new IP address (potentially different from before). This is why services should never hardcode container IP addresses and should always use DNS names for inter-container communication. Services (in Swarm) and service names (in Compose) provide stable DNS entries that resolve to whatever IP the current container instance has.

## Production Tips

- **Use internal networks for database containers**: Mark networks as `internal: true` in Docker Compose to prevent containers on that network from reaching the internet. Database and cache containers should never have outbound internet access. This limits the blast radius if a container is compromised, preventing data exfiltration to external endpoints.

- **Implement volume backup automation**: Named volumes are not automatically backed up. Implement a cron job or scheduled container that mounts production volumes read-only, creates compressed archives, and uploads them to object storage (S3, GCS). Test restore procedures monthly to verify backup integrity. For databases, prefer logical backups (pg_dump, mongodump) over filesystem-level volume snapshots for portability.

- **Monitor Docker network performance**: Use `docker network inspect` and tools like `netshoot` to diagnose connectivity issues. Monitor iptables rule counts on hosts running many containers, as excessive rules degrade network performance. Consider switching from iptables to IPVS mode for kube-proxy in Kubernetes environments with hundreds of services.

## Related Topics

- [Container Fundamentals](./container-fundamentals.md) — Core container concepts and lifecycle management
- [Docker Compose](./docker-compose.md) — Multi-container orchestration with network and volume configuration
- [Kubernetes & EKS](../kubernetes/index.md) — Advanced networking with CNI plugins and persistent volume claims
