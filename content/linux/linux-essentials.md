# Linux Essentials

Linux is the dominant operating system for servers, containers, cloud infrastructure, and embedded systems. Understanding Linux fundamentals — the filesystem hierarchy, process management, permissions model, networking stack, and shell scripting — is essential for any engineer who deploys, debugs, or operates production systems. Whether you are SSHing into a production server to diagnose an outage, writing Dockerfiles, configuring CI pipelines, or optimizing application performance, Linux knowledge is the foundation that makes everything else possible.

---

## Quick Reference

- **File permissions** — `rwxr-xr-x` (owner/group/others); change with `chmod`, ownership with `chown`
- **Process management** — `ps aux` lists processes, `top`/`htop` for real-time monitoring, `kill -SIGTERM <pid>` for graceful shutdown
- **Package management** — `apt` (Debian/Ubuntu), `yum`/`dnf` (RHEL/CentOS), `apk` (Alpine)
- **File search** — `find / -name "*.log" -mtime -1` finds recently modified logs; `grep -r "pattern" /path` searches file contents
- **Disk usage** — `df -h` shows filesystem usage, `du -sh *` shows directory sizes, `ncdu` for interactive exploration
- **Network diagnostics** — `ss -tlnp` shows listening ports, `curl -v` for HTTP debugging, `dig` for DNS resolution
- **System logs** — `journalctl -u service-name -f` follows service logs, `/var/log/` for traditional log files
- **Text processing** — `awk`, `sed`, `cut`, `sort`, `uniq` form the Unix text processing pipeline
- **Background jobs** — `&` runs in background, `nohup` survives terminal close, `screen`/`tmux` for persistent sessions
- **Redirections** — `>` overwrites, `>>` appends, `2>&1` merges stderr into stdout, `|` pipes stdout to next command's stdin

---

## When to Use

Linux knowledge applies across the entire software development lifecycle, from local development through production operations.

**Essential Linux skills for:**

- **Container development** — Dockerfiles are Linux commands. Understanding package managers, filesystem layout, user permissions, and process signals is required to build secure, minimal container images
- **Production debugging** — When an application is slow or unresponsive, you need to check CPU usage, memory pressure, disk I/O, network connections, and open file descriptors directly on the host
- **CI/CD pipelines** — Pipeline runners execute on Linux. Shell scripts orchestrate builds, tests, and deployments. Understanding exit codes, signal handling, and environment variables is mandatory
- **Infrastructure as Code** — Terraform, Ansible, and cloud-init scripts configure Linux systems. You must understand what the configuration is doing to debug failures
- **Performance tuning** — Kernel parameters (`sysctl`), filesystem choices (ext4 vs XFS), I/O schedulers, and network buffer sizes directly impact application performance
- **Security hardening** — Firewall rules (`iptables`/`nftables`), SELinux/AppArmor policies, SSH configuration, and audit logging protect production systems from compromise

**Linux is less relevant when:**

- Building purely client-side applications that never touch a server (though even then, your CI runs on Linux)
- Working exclusively in managed serverless environments where the platform abstracts the OS entirely (though understanding the underlying Linux helps debug cold starts and resource limits)

---

## Code Examples

### Example 1: Shell Script for Application Deployment

```bash
#!/usr/bin/env bash
# deploy.sh — Zero-downtime deployment script
# Usage: ./deploy.sh <version-tag>

set -euo pipefail  # Exit on error, undefined vars, pipe failures

VERSION="${1:?Usage: $0 <version-tag>}"
APP_NAME="myapp"
DEPLOY_DIR="/opt/${APP_NAME}"
HEALTH_ENDPOINT="http://localhost:8080/health"
MAX_RETRIES=30
RETRY_INTERVAL=2

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

check_health() {
  local retries=0
  while [[ $retries -lt $MAX_RETRIES ]]; do
    if curl -sf "${HEALTH_ENDPOINT}" > /dev/null 2>&1; then
      log "Health check passed"
      return 0
    fi
    retries=$((retries + 1))
    log "Health check attempt ${retries}/${MAX_RETRIES}..."
    sleep "${RETRY_INTERVAL}"
  done
  log "ERROR: Health check failed after ${MAX_RETRIES} attempts"
  return 1
}

rollback() {
  log "Rolling back to previous version..."
  if [[ -L "${DEPLOY_DIR}/current" ]]; then
    local previous
    previous=$(readlink -f "${DEPLOY_DIR}/previous")
    ln -sfn "${previous}" "${DEPLOY_DIR}/current"
    systemctl restart "${APP_NAME}"
    log "Rollback complete"
  else
    log "ERROR: No previous version to rollback to"
    exit 1
  fi
}

# Trap errors and rollback
trap rollback ERR

log "Deploying ${APP_NAME} version ${VERSION}"

# Download and extract artifact
RELEASE_DIR="${DEPLOY_DIR}/releases/${VERSION}"
mkdir -p "${RELEASE_DIR}"
curl -sL "https://artifacts.example.com/${APP_NAME}/${VERSION}.tar.gz" \
  | tar -xz -C "${RELEASE_DIR}"

# Update symlinks atomically
ln -sfn "${DEPLOY_DIR}/current" "${DEPLOY_DIR}/previous" 2>/dev/null || true
ln -sfn "${RELEASE_DIR}" "${DEPLOY_DIR}/current"

# Restart service and verify health
systemctl restart "${APP_NAME}"
check_health

log "Deployment of ${VERSION} successful"
```

This script demonstrates production shell scripting patterns: `set -euo pipefail` for strict error handling, trap-based rollback on failure, health check polling with timeout, atomic symlink switching for zero-downtime updates, and structured logging with timestamps.

### Example 2: Process and Resource Investigation

```bash
# Find which process is consuming the most CPU
ps aux --sort=-%cpu | head -20

# Find which process is consuming the most memory
ps aux --sort=-%mem | head -20

# Check system resource summary
free -h                    # Memory usage
df -h                      # Disk usage
uptime                     # Load averages (1, 5, 15 min)
cat /proc/loadavg          # Load average with process counts

# Investigate a specific process
PID=12345
ls -la /proc/${PID}/fd | wc -l          # Open file descriptor count
cat /proc/${PID}/status | grep -i vm     # Virtual memory details
cat /proc/${PID}/limits                  # Resource limits (ulimits)
strace -p ${PID} -c -t 2>&1 | head -50  # System call summary

# Network connections for a process
ss -tlnp | grep ${PID}                  # Listening sockets
ss -tnp | grep ${PID}                   # Established connections

# Find processes using a specific port
ss -tlnp 'sport = :8080'
# Or with lsof
lsof -i :8080

# Check disk I/O per process
iotop -oP                               # Interactive I/O monitor
pidstat -d 1 5                           # I/O stats per process, 1s interval, 5 samples

# Check for zombie processes
ps aux | awk '$8 ~ /Z/ { print }'

# Trace why a process is slow
perf top -p ${PID}                       # CPU profiling
perf record -p ${PID} -g -- sleep 30     # Record 30s profile
perf report                              # Analyze recording
```

```bash
# System-wide resource investigation during an incident
# Step 1: Quick overview
vmstat 1 5          # CPU, memory, I/O, system activity (1s interval, 5 samples)
iostat -xz 1 5     # Disk I/O statistics with extended info

# Step 2: Memory pressure
cat /proc/meminfo | grep -E "MemTotal|MemFree|MemAvailable|Buffers|Cached|SwapTotal|SwapFree"
slabtop -o | head -20    # Kernel slab allocator (memory leaks in kernel space)

# Step 3: Network issues
netstat -s | grep -i error    # Network error counters
cat /proc/net/sockstat         # Socket allocation summary
dmesg | grep -i "out of memory\|oom\|dropped"  # Kernel messages
```

These commands form the standard investigation toolkit for production incidents. The `/proc` filesystem exposes kernel data structures as files, enabling deep process inspection without specialized tools. Understanding these commands is the difference between resolving an incident in minutes versus hours.

### Example 3: File Permissions and Security

```bash
# Understanding permission notation
# -rwxr-xr-- 1 appuser appgroup 4096 Jan 15 10:00 deploy.sh
# │├─┤├─┤├─┤
# │ │   │  └── Others: read only (4)
# │ │   └───── Group: read + execute (5)
# │ └───────── Owner: read + write + execute (7)
# └──────────── File type: - (regular), d (directory), l (symlink)

# Numeric permissions: owner(7) group(5) others(4) = 754
chmod 754 deploy.sh        # rwxr-xr--
chmod 600 secrets.env      # rw------- (owner only, no group/others)
chmod 755 /opt/app/bin/    # Directories need execute for traversal

# Set ownership
chown appuser:appgroup /opt/app -R    # Recursive ownership change

# Special permissions
chmod u+s /usr/bin/passwd   # SetUID: runs as file owner (root)
chmod g+s /shared/team/     # SetGID: new files inherit group
chmod +t /tmp               # Sticky bit: only owner can delete files

# Find security issues
find / -perm -4000 -type f 2>/dev/null    # Find all SetUID binaries
find /home -perm -o+w -type f             # World-writable files in /home
find /etc -newer /etc/passwd -type f      # Files modified after passwd

# SSH key permissions (strict requirements)
chmod 700 ~/.ssh
chmod 600 ~/.ssh/id_rsa          # Private key: owner read/write only
chmod 644 ~/.ssh/id_rsa.pub      # Public key: readable by all
chmod 600 ~/.ssh/authorized_keys # Authorized keys: owner only

# Firewall rules (iptables)
iptables -L -n -v                         # List current rules
iptables -A INPUT -p tcp --dport 443 -j ACCEPT    # Allow HTTPS
iptables -A INPUT -p tcp --dport 22 -s 10.0.0.0/8 -j ACCEPT  # SSH from internal only
iptables -A INPUT -j DROP                 # Default deny
iptables-save > /etc/iptables/rules.v4   # Persist rules
```

Linux permissions are the first line of defense in production security. The principle of least privilege means applications run as non-root users with minimal permissions. SetUID binaries are a common attack vector and should be audited regularly. SSH key permissions are enforced by the SSH daemon — incorrect permissions cause silent authentication failures.

---

## Common Pitfalls

**1. Running applications as root in production.** If an application running as root is compromised, the attacker has full system access. Always create dedicated service accounts with minimal permissions. Use `systemd` unit files with `User=` and `Group=` directives, or Docker's `USER` instruction to drop privileges.

**2. Not understanding the difference between SIGTERM and SIGKILL.** `kill <pid>` sends SIGTERM, which applications can catch and handle gracefully (close connections, flush buffers, release locks). `kill -9 <pid>` sends SIGKILL, which the kernel terminates immediately with no cleanup. Always try SIGTERM first and only use SIGKILL as a last resort. Kubernetes sends SIGTERM and waits `terminationGracePeriodSeconds` before SIGKILL.

**3. Ignoring file descriptor limits.** The default `ulimit -n` (open files) is often 1024, which is insufficient for applications handling many concurrent connections. A Java application with 500 HTTP connections, database pools, and file handles can easily exhaust this limit, causing cryptic "Too many open files" errors. Set appropriate limits in systemd unit files or `/etc/security/limits.conf`.

**4. Using `rm -rf` without double-checking the path.** A variable expansion failure in a script (`rm -rf ${DEPLOY_DIR}/`) where `DEPLOY_DIR` is unset becomes `rm -rf /`, destroying the entire filesystem. Always use `set -u` in scripts (fail on undefined variables), quote variable expansions, and consider using `trash` commands or moving to a staging directory before deletion.

**5. Not monitoring disk space proactively.** Applications that write logs without rotation will eventually fill the disk, causing cascading failures (databases crash, services cannot write temp files, systemd cannot create new processes). Implement log rotation with `logrotate`, set up disk space alerts at 80% and 90% thresholds, and use `journald` with size limits for service logs.

**6. Editing configuration files without backups.** Modifying `/etc/nginx/nginx.conf` or `/etc/sysctl.conf` without a backup means you cannot quickly revert if the change causes problems. Always `cp file file.bak.$(date +%s)` before editing, or better yet, manage configuration through version-controlled automation (Ansible, Puppet, Chef).

---

## Real-World Use Cases

**Container image optimization:** Production Docker images start from minimal base images (Alpine Linux at 5MB vs Ubuntu at 72MB) and install only required packages. Understanding Linux package managers, shared libraries (`ldd` to check dependencies), and filesystem layout enables building images that are small (faster pulls), secure (smaller attack surface), and efficient (fewer layers, proper caching).

**Production incident response:** When a service becomes unresponsive, the investigation follows a systematic pattern: check if the process is running (`systemctl status`), examine resource consumption (`top`, `free`, `df`), review recent logs (`journalctl -u service --since "5 minutes ago"`), check network connectivity (`ss`, `curl`), and inspect the process state (`strace`, `/proc`). Each step narrows the problem space until the root cause is identified.

**Kernel parameter tuning for high-traffic services:** Applications handling 100,000+ concurrent connections require kernel tuning: increasing `net.core.somaxconn` (connection backlog), `net.ipv4.tcp_max_syn_backlog` (SYN queue), `fs.file-max` (system-wide file descriptors), and adjusting TCP keepalive timers. These parameters are set via `sysctl` and persisted in `/etc/sysctl.d/` configuration files.

**Automated server provisioning:** Cloud-init scripts and Ansible playbooks configure Linux servers from bare metal to production-ready state: installing packages, creating users, setting up SSH keys, configuring firewalls, mounting storage volumes, installing monitoring agents, and starting application services. Understanding the underlying Linux operations makes debugging provisioning failures straightforward.

---

## Interview Questions

**Q: Explain the Linux process lifecycle. What happens when you run a command, and how do zombie processes occur?**

A: When you execute a command, the shell calls `fork()` to create a child process (exact copy of the parent), then the child calls `exec()` to replace its memory image with the new program. The parent process can call `wait()` or `waitpid()` to collect the child's exit status. A zombie process occurs when a child terminates but the parent has not yet called `wait()` — the process entry remains in the process table (showing state `Z`) holding only the exit status and PID. Zombies consume no CPU or memory but occupy a PID slot. They are cleaned up when the parent reads the exit status or when the parent itself terminates (at which point `init`/`systemd` adopts and reaps the orphaned zombies). Excessive zombies indicate a bug in the parent process (not handling SIGCHLD or not calling `wait()`). The fix is to either install a SIGCHLD handler that calls `waitpid(-1, &status, WNOHANG)` in a loop, or to double-fork (grandchild is immediately adopted by init).

**Q: How does the Linux virtual memory system work? What is the difference between RSS, VSZ, and shared memory?**

A: Linux uses virtual memory to give each process its own address space, mapped to physical memory (RAM) or swap via page tables. VSZ (Virtual Size) is the total virtual address space allocated to a process, including memory-mapped files, shared libraries, and allocated-but-untouched pages. RSS (Resident Set Size) is the portion of VSZ currently in physical RAM. Shared memory (SHR) is the portion of RSS shared with other processes (shared libraries like libc, memory-mapped files). The key insight is that VSZ can be much larger than physical RAM (a process can map terabytes of virtual space), RSS tells you actual RAM consumption, but RSS double-counts shared pages across processes. PSS (Proportional Set Size) divides shared pages equally among sharing processes, giving the most accurate per-process memory cost. When the system is under memory pressure, the kernel's OOM killer selects processes to terminate based on an `oom_score` that considers RSS, process age, and the `oom_score_adj` tunable.

**Q: Describe the Linux permission model. How do SetUID, SetGID, and sticky bit work, and what are their security implications?**

A: Linux permissions use a three-tier model: owner, group, and others, each with read (4), write (2), and execute (1) bits. SetUID (4000) on an executable means it runs with the file owner's privileges regardless of who executes it — `/usr/bin/passwd` is SetUID root so regular users can modify `/etc/shadow`. SetGID (2000) on a directory means new files inherit the directory's group rather than the creator's primary group, useful for shared team directories. The sticky bit (1000) on a directory means only the file owner (or root) can delete files within it, even if others have write permission — `/tmp` uses this to prevent users from deleting each other's temporary files. Security implications: SetUID binaries are high-value attack targets because exploiting a vulnerability in a SetUID-root binary gives the attacker root access. Security audits should enumerate all SetUID binaries (`find / -perm -4000`) and verify each is necessary and up-to-date. Modern alternatives include Linux capabilities (`cap_net_bind_service` instead of SetUID for binding port 80) which grant specific privileges without full root access.

**Q: How would you diagnose a Linux server that is running slowly? Walk through your investigation process.**

A: Start with the USE method (Utilization, Saturation, Errors) for each resource. First, `uptime` shows load averages — if load exceeds CPU count, the system is saturated. Then `vmstat 1` shows CPU breakdown (user, system, iowait, idle): high iowait indicates disk bottleneck, high system indicates kernel overhead. `free -h` checks memory: if available memory is low and swap is active, the system is thrashing. `iostat -xz 1` shows disk utilization and queue depth: `%util` near 100% means the disk is saturated. `ss -s` shows socket statistics: many TIME_WAIT connections indicate connection churn. `dmesg | tail` checks for kernel errors (OOM kills, hardware failures). Once the bottleneck resource is identified, drill down: for CPU, use `perf top` or `pidstat`; for memory, check `/proc/meminfo` and process RSS; for disk, use `iotop` to find the offending process; for network, use `iftop` or `nethogs`. The investigation should take under 60 seconds to identify the bottleneck category, then focused tools narrow to the specific cause.

---

## Production Tips

**Implement proper signal handling in your applications.** Production applications must handle SIGTERM gracefully: stop accepting new requests, finish in-flight work, close database connections, flush buffers, and exit cleanly. Kubernetes, systemd, and container orchestrators all send SIGTERM before SIGKILL. An application that ignores SIGTERM will be forcefully killed after the grace period, potentially corrupting data or leaving distributed locks held. Test signal handling explicitly in your integration tests.

**Use systemd for service management with proper resource limits.** Define services with `systemd` unit files that specify `Restart=on-failure`, `RestartSec=5s`, memory limits (`MemoryMax=2G`), CPU limits (`CPUQuota=200%` for 2 cores), and file descriptor limits (`LimitNOFILE=65536`). These cgroup-based limits prevent a single misbehaving service from consuming all system resources and affecting other services on the same host. Monitor resource usage against these limits to detect services approaching their boundaries before they hit hard failures.

**Automate log rotation and retention policies.** Configure `logrotate` for application logs with appropriate rotation frequency (daily for high-volume services), compression (gzip saves 90%+ space), and retention period (keep 30 days for debugging, archive to object storage for compliance). For systemd services, configure `journald` with `SystemMaxUse=500M` to prevent journal files from consuming disk. Set up alerts for log volume anomalies — a sudden 10x increase in log output often indicates an error loop.

---

## Related Topics

- [Docker Fundamentals](../infrastructure/docker/index.md) — Container technology built on Linux kernel features (namespaces, cgroups, overlay filesystems) that isolates applications
- [CI/CD Fundamentals](../ci-cd/ci-cd-fundamentals.md) — Pipeline automation that executes on Linux runners, using shell scripts for build, test, and deployment orchestration
