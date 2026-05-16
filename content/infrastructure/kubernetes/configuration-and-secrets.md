# Kubernetes Configuration and Secrets

## Quick Reference

- ConfigMaps store non-sensitive configuration as key-value pairs, consumable as environment variables or mounted files
- Secrets store sensitive data (passwords, tokens, certificates) with base64 encoding and optional encryption at rest
- ConfigMaps and Secrets are namespace-scoped with a 1 MiB size limit per object
- Volume-mounted ConfigMaps support automatic updates (kubelet sync period ~60s); environment variables require pod restart
- Immutable ConfigMaps and Secrets improve cluster performance by eliminating watch overhead
- Secret types: Opaque (generic), kubernetes.io/tls (certificates), kubernetes.io/dockerconfigjson (registry credentials)
- External secret managers (AWS Secrets Manager, HashiCorp Vault) integrate via Secrets Store CSI Driver or External Secrets Operator

## When to Use

Use ConfigMaps for application configuration that varies between environments but is not sensitive: database connection URLs (without credentials), feature flags, logging levels, server ports, and configuration files like application.yml or nginx.conf. Use Kubernetes Secrets for credentials, API keys, TLS certificates, and any data that should not appear in plain text in version control or audit logs. For production environments with strict security requirements, use external secret managers (AWS Secrets Manager, HashiCorp Vault, Google Secret Manager) with the Secrets Store CSI Driver to inject secrets directly into pods without storing them in etcd. This approach provides automatic rotation, centralized audit logging, and eliminates the need to manage base64-encoded values in YAML manifests committed to Git repositories.

## Code Examples

### ConfigMap with Application Configuration

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: order-service-config
  namespace: production
  labels:
    app: order-service
data:
  application.yml: |
    server:
      port: 8080
      shutdown: graceful
      tomcat:
        max-threads: 200
        accept-count: 100
    spring:
      datasource:
        url: jdbc:postgresql://db-cluster.internal:5432/orders
        hikari:
          maximum-pool-size: 20
          minimum-idle: 5
          connection-timeout: 30000
          idle-timeout: 600000
          max-lifetime: 1800000
      jpa:
        open-in-view: false
        hibernate:
          ddl-auto: validate
    management:
      endpoints:
        web:
          exposure:
            include: health,metrics,prometheus,info
      health:
        readiness-state:
          enabled: true
        liveness-state:
          enabled: true
      metrics:
        tags:
          application: order-service
          environment: production
    kafka:
      bootstrap-servers: kafka-cluster.internal:9092
      consumer:
        group-id: order-processing
        auto-offset-reset: earliest
        max-poll-records: 500
      producer:
        acks: all
        retries: 3
  log4j2.xml: |
    <?xml version="1.0" encoding="UTF-8"?>
    <Configuration status="WARN">
      <Appenders>
        <Console name="Console" target="SYSTEM_OUT">
          <JsonLayout compact="true" eventEol="true">
            <KeyValuePair key="service" value="order-service"/>
            <KeyValuePair key="environment" value="production"/>
          </JsonLayout>
        </Console>
      </Appenders>
      <Loggers>
        <Logger name="com.example.orders" level="info"/>
        <Logger name="org.springframework" level="warn"/>
        <Root level="info">
          <AppenderRef ref="Console"/>
        </Root>
      </Loggers>
    </Configuration>
---
# Deployment consuming ConfigMap as volume and env vars
apiVersion: apps/v1
kind: Deployment
metadata:
  name: order-service
  namespace: production
spec:
  replicas: 3
  selector:
    matchLabels:
      app: order-service
  template:
    spec:
      containers:
        - name: app
          image: order-service:v2.3.0
          env:
            - name: SPRING_CONFIG_LOCATION
              value: "file:/app/config/application.yml"
            - name: LOG4J_CONFIGURATION_FILE
              value: "/app/config/log4j2.xml"
            - name: JAVA_OPTS
              valueFrom:
                configMapKeyRef:
                  name: jvm-settings
                  key: java-opts
          volumeMounts:
            - name: config-volume
              mountPath: /app/config
              readOnly: true
      volumes:
        - name: config-volume
          configMap:
            name: order-service-config
```

### Secrets with External Secret Manager Integration

```yaml
# Native Kubernetes Secret (base64 encoded)
apiVersion: v1
kind: Secret
metadata:
  name: db-credentials
  namespace: production
type: Opaque
data:
  username: b3JkZXItc2VydmljZQ==
  password: c3VwZXItc2VjcmV0LXBhc3N3b3Jk
  connection-string: amRiYzpwb3N0Z3Jlc3FsOi8vZGItY2x1c3Rlci5pbnRlcm5hbDo1NDMyL29yZGVycw==
---
# TLS Secret for Ingress
apiVersion: v1
kind: Secret
metadata:
  name: api-tls-cert
  namespace: production
type: kubernetes.io/tls
data:
  tls.crt: LS0tLS1CRUdJTi... # base64 encoded certificate
  tls.key: LS0tLS1CRUdJTi... # base64 encoded private key
---
# Secrets Store CSI Driver with AWS Secrets Manager
apiVersion: secrets-store.csi.x-k8s.io/v1
kind: SecretProviderClass
metadata:
  name: order-service-secrets
  namespace: production
spec:
  provider: aws
  parameters:
    objects: |
      - objectName: "production/order-service/db-credentials"
        objectType: "secretsmanager"
        jmesPath:
          - path: username
            objectAlias: db-username
          - path: password
            objectAlias: db-password
          - path: connection-string
            objectAlias: db-connection-string
      - objectName: "production/order-service/api-keys"
        objectType: "secretsmanager"
        jmesPath:
          - path: stripe-key
            objectAlias: stripe-api-key
          - path: sendgrid-key
            objectAlias: sendgrid-api-key
  secretObjects:
    - secretName: db-credentials-synced
      type: Opaque
      data:
        - objectName: db-username
          key: username
        - objectName: db-password
          key: password
        - objectName: db-connection-string
          key: connection-string
---
# Pod consuming CSI-mounted secrets
apiVersion: apps/v1
kind: Deployment
metadata:
  name: order-service
  namespace: production
spec:
  template:
    spec:
      serviceAccountName: order-service
      containers:
        - name: app
          image: order-service:v2.3.0
          env:
            - name: DB_USERNAME
              valueFrom:
                secretKeyRef:
                  name: db-credentials-synced
                  key: username
            - name: DB_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: db-credentials-synced
                  key: password
          volumeMounts:
            - name: secrets-store
              mountPath: /mnt/secrets
              readOnly: true
      volumes:
        - name: secrets-store
          csi:
            driver: secrets-store.csi.k8s.io
            readOnly: true
            volumeAttributes:
              secretProviderClass: order-service-secrets
```

## Common Pitfalls

- **Storing secrets in ConfigMaps**: ConfigMaps are not encrypted, appear in plain text in etcd, and are visible to anyone with read access to the namespace. Sensitive data like database passwords, API keys, and certificates must use Secrets (which support encryption at rest) or external secret managers. Even Secrets are only base64-encoded by default — enable envelope encryption with KMS for true protection.

- **Committing Secret manifests to Git**: Base64 encoding is not encryption. Committing Secret YAML files to version control exposes credentials in repository history permanently. Use sealed-secrets (Bitnami), External Secrets Operator, or SOPS to encrypt secrets before committing, or use GitOps workflows that reference external secret stores rather than embedding values.

- **Not handling ConfigMap update propagation delays**: Volume-mounted ConfigMaps update eventually (up to kubelet sync period + cache TTL, typically 60-90 seconds), but environment variables never update without a pod restart. Applications that read configuration files must either watch for changes or be restarted after ConfigMap updates. Design your update strategy explicitly rather than assuming immediate propagation.

- **Exceeding the 1 MiB size limit**: ConfigMaps and Secrets are limited to 1 MiB total size. Large configuration files, certificates with full chains, or binary data can exceed this limit. Split large configurations across multiple ConfigMaps, use init containers to download large files from S3, or mount persistent volumes for data exceeding the limit.

- **Using environment variables for complex configuration**: Environment variables work well for simple key-value settings but become unwieldy for structured configuration (nested YAML, XML files, multi-line values). Mount ConfigMaps as volumes for complex configuration files, reserving environment variables for simple overrides and feature flags.

## Real-World Use Cases

A microservices platform manages configuration across 50+ services using a layered approach. Base configuration lives in a shared ConfigMap per environment (connection strings, service discovery endpoints, logging levels). Service-specific overrides are applied through dedicated ConfigMaps that mount alongside the base configuration. Spring Boot's configuration precedence handles merging automatically. When the platform team needs to rotate a shared database endpoint, they update a single ConfigMap and perform rolling restarts across affected services using `kubectl rollout restart`.

A financial services company uses the External Secrets Operator to synchronize secrets from AWS Secrets Manager into Kubernetes Secrets. The security team manages credentials in Secrets Manager with automatic rotation policies (90-day rotation for database passwords, 30-day for API keys). The External Secrets Operator polls for changes every 60 seconds and updates the corresponding Kubernetes Secrets. Applications using volume-mounted secrets pick up rotated credentials automatically, while those using environment variables are restarted by a custom controller that watches for Secret changes.

A multi-tenant SaaS platform uses ConfigMaps to implement feature flags without redeployment. Each tenant's feature configuration is stored in a ConfigMap that the application watches for changes. When product managers enable a feature for a specific tenant, they update the ConfigMap through a custom UI that calls the Kubernetes API. The application detects the change within 90 seconds and activates the feature without downtime or deployment.

## Interview Questions

**Q: What is the difference between ConfigMaps and Secrets in Kubernetes?**

A: ConfigMaps store non-sensitive configuration data in plain text, while Secrets store sensitive data with base64 encoding and support encryption at rest via envelope encryption with KMS. Secrets are stored in tmpfs (RAM) when mounted as volumes, never written to disk on nodes. RBAC policies can restrict Secret access more tightly than ConfigMaps. However, both have the same 1 MiB size limit and similar consumption patterns (environment variables or volume mounts). The key operational difference is that Secrets support encryption at rest and have stricter default RBAC.

**Q: How would you handle secret rotation in a Kubernetes cluster without downtime?**

A: Use the Secrets Store CSI Driver with an external secret manager (AWS Secrets Manager, Vault) that supports automatic rotation. The CSI driver periodically syncs updated secrets into the pod's filesystem. Applications should either watch mounted files for changes and reload configuration, or use a sidecar that detects changes and triggers a graceful restart. For applications that cannot reload secrets dynamically, use a rolling restart strategy triggered by a controller that watches for Secret resource changes.

**Q: Why should you use immutable ConfigMaps and Secrets?**

A: Immutable ConfigMaps and Secrets (setting `immutable: true`) provide two benefits. First, they protect against accidental modifications that could cause widespread outages if a shared configuration is changed incorrectly. Second, they significantly improve cluster performance because the kubelet skips setting up watches for immutable objects, reducing API server load in clusters with thousands of ConfigMaps. The tradeoff is that updates require creating a new ConfigMap with a different name and updating all referencing pods.

**Q: How do you manage configuration differences across environments (dev, staging, production)?**

A: Use a combination of base ConfigMaps with environment-specific overlays. Tools like Kustomize provide overlay mechanisms that patch base manifests with environment-specific values. Helm charts use values files per environment. The key principle is that the application image is identical across environments — only configuration differs. Store non-sensitive configuration in Git (ConfigMaps via Kustomize/Helm), and reference external secret stores for credentials that vary per environment.

## Production Tips

- **Enable envelope encryption for Secrets at rest**: By default, Kubernetes stores Secrets as base64-encoded text in etcd. Enable envelope encryption using AWS KMS (in EKS) or a custom encryption provider to ensure Secrets are encrypted before being written to etcd. This protects against etcd backup exposure and unauthorized etcd access.

- **Use the External Secrets Operator for GitOps workflows**: Rather than storing encrypted secrets in Git (sealed-secrets) or managing secrets outside GitOps (manual kubectl apply), the External Secrets Operator lets you declare which external secrets to sync in Git-committed ExternalSecret resources. This maintains GitOps principles while keeping actual secret values in a dedicated secret manager with rotation and audit capabilities.

- **Implement ConfigMap versioning for safe rollbacks**: Name ConfigMaps with version suffixes (e.g., `order-service-config-v3`) and reference them explicitly in Deployments. When a configuration change causes issues, rolling back the Deployment automatically reverts to the previous ConfigMap version. This is safer than mutating a shared ConfigMap that affects all pods simultaneously.

## Related Topics

- [Core Concepts and Architecture](./core-concepts.md) — Pod specifications that consume ConfigMaps and Secrets
- [EKS and AWS Integration](./eks-aws-integration.md) — IRSA and AWS Secrets Manager integration
- [AWS Services](../aws/index.md) — AWS Secrets Manager and Systems Manager Parameter Store
