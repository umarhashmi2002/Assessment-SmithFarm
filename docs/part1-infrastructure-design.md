# Part 1 — Infrastructure Hardening & Redundancy Design

## Smith Farms Agricultural Supply Chain Platform

---

## Table of Contents

1. [High-Level Architecture](#high-level-architecture)
2. [Azure Services & Justification](#azure-services--justification)
3. [Database Redundancy & Failover](#database-redundancy--failover)
4. [Automated Backup & Recovery Strategy](#automated-backup--recovery-strategy)
5. [Monitoring & Alerting](#monitoring--alerting)
6. [Kubernetes Hardening](#kubernetes-hardening)
7. [Azure VDI Session Pooling & Cost Optimization](#azure-vdi-session-pooling--cost-optimization)
8. [ETL Resilience](#etl-resilience)
9. [Security](#security)
10. [Disaster Recovery Plan](#disaster-recovery-plan)
11. [Key Tradeoffs & Assumptions](#key-tradeoffs--assumptions)

---

## High-Level Architecture

The platform runs on Azure (West US 2 primary, East US 2 DR) with AKS orchestrating the application tier, Oracle Data Guard providing ERP database resilience, and a dual-stack monitoring approach combining Prometheus and Azure Monitor.

```mermaid
graph TB
    subgraph Azure["Azure Cloud (West US 2 — Primary Region)"]
        subgraph VNet["Virtual Network (10.0.0.0/16)"]
            subgraph AKS_Subnet["AKS Subnet (10.0.1.0/24)"]
                AKS["Azure Kubernetes Service"]
                subgraph Pods["Application Pods"]
                    API["ETL Monitor API<br/>(3 replicas)"]
                    Dashboard["React Dashboard<br/>(2 replicas)"]
                    Airflow["Airflow Scheduler<br/>+ Workers"]
                end
            end

            subgraph Data_Subnet["Data Subnet (10.0.2.0/24)"]
                Oracle_Primary["Oracle DB<br/>(Primary — ERP)"]
                Oracle_Replica["Oracle DB<br/>(Read Replica)"]
                DORIS["DORIS<br/>(Clone / ETL)"]
                AzureSQL["Azure SQL<br/>(Reporting)"]
            end

            subgraph Mgmt_Subnet["Management Subnet (10.0.3.0/24)"]
                VDI["Azure VDI<br/>Session Pool"]
            end
        end

        KeyVault["Azure Key Vault"]
        Monitor["Azure Monitor<br/>+ Log Analytics"]
        Backup["Azure Backup Vault"]
        ACR["Azure Container<br/>Registry"]
    end

    subgraph Monitoring_Stack["Observability"]
        Prometheus["Prometheus"]
        Grafana["Grafana"]
    end

    subgraph DR["DR Region (East US 2)"]
        Oracle_DR["Oracle Standby"]
        AzureSQL_DR["Azure SQL<br/>Geo-Replica"]
        AKS_DR["AKS (Standby)"]
    end

    Teams["Microsoft Teams<br/>(Alert Channel)"]

    Oracle_Primary -->|"Data Guard<br/>Async Replication"| Oracle_Replica
    Oracle_Primary -->|"ETL via Airflow"| DORIS
    DORIS -->|"ETL via Airflow"| AzureSQL
    API --> Oracle_Primary
    API --> AzureSQL
    Prometheus --> Grafana
    Grafana -->|"Webhook Alerts"| Teams
    Monitor -->|"Action Groups"| Teams
    Oracle_Primary -.->|"Data Guard"| Oracle_DR
    AzureSQL -.->|"Geo-Replication"| AzureSQL_DR
```

### Network Topology & Security Zones

```mermaid
graph LR
    subgraph Internet["Public Internet"]
        Users["Operators / Browsers"]
    end

    subgraph Azure["Azure Cloud"]
        TM["Azure Traffic Manager<br/>(DNS-based failover)"]
        FW["Azure Firewall<br/>(Egress inspection)"]

        subgraph VNet["VNet 10.0.0.0/16"]
            subgraph AKS["AKS Subnet<br/>10.0.1.0/24"]
                LB["Load Balancer :443"]
                APIPod["API Pods"]
                DashPod["Dashboard Pods"]
            end
            subgraph Data["Data Subnet<br/>10.0.2.0/24"]
                ORA["Oracle"]
                DOR["DORIS"]
                SQL["Azure SQL"]
            end
            subgraph Mgmt["Mgmt Subnet<br/>10.0.3.0/24"]
                VDI2["VDI Session Hosts"]
            end
        end

        PE["Private Endpoints<br/>(SQL, Key Vault, ACR)"]
    end

    subgraph Corp["Corporate Network"]
        VPN["VPN Gateway"]
    end

    Users -->|HTTPS| TM --> LB
    LB --> APIPod
    LB --> DashPod
    APIPod -->|"1521/1433"| Data
    DashPod -->|"API only"| APIPod
    VPN -->|"RDP/443"| VDI2
    VDI2 --> AKS
    VDI2 --> Data
    AKS -->|"Egress"| FW
    SQL -.-> PE
```

---

## Azure Services & Justification

| Service | Purpose | Justification |
|---------|---------|---------------|
| **Azure Kubernetes Service (AKS)** | Container orchestration for API, dashboard, and Airflow | Managed K8s reduces operational overhead; supports auto-scaling, rolling deployments, and self-healing. Smith Farms already runs on Kubernetes. |
| **Azure SQL Database** | Reporting layer (ETL target) | Managed service with built-in geo-replication, automated backups, and point-in-time restore. Eliminates DBA overhead for the reporting tier. |
| **Azure Key Vault** | Secrets management | Centralized storage for database credentials, webhook URLs, API keys. Integrates natively with AKS via CSI driver — pods mount secrets as volumes without embedding them in config. |
| **Azure Monitor + Log Analytics** | Infrastructure and application telemetry | Native integration with AKS, Azure SQL, and VDI. Provides a single pane for metrics, logs, and alerts without additional infrastructure. |
| **Azure Virtual Desktop (VDI)** | Secure operator access to internal tools | Provides session-based access to Oracle management tools and internal dashboards without exposing services to the public internet. |
| **Azure Container Registry** | Container image storage | Private registry co-located with AKS for fast pulls. Supports vulnerability scanning and image signing. |
| **Azure Backup Vault** | Centralized backup management | Manages backup policies for Azure SQL and AKS persistent volumes with configurable retention and geo-redundant storage. |

---

## Database Redundancy & Failover

### Database Tier Overview

| Database | Role | Replication | RPO | RTO |
|----------|------|-------------|-----|-----|
| Oracle Primary | ERP system of record | Data Guard (async) to read replica + DR standby | ≤ 4 hours | ≤ 2 hours |
| Oracle Read Replica | Read-only queries for API & reporting | Receives redo logs from primary | — | — |
| Azure SQL | Reporting layer (ETL target) | Active geo-replication to East US 2 | ≤ 5 seconds | ≤ 30 minutes |
| DORIS | ETL staging (transient) | Daily snapshots; recoverable via re-ETL | ≤ 24 hours | ≤ 4 hours |

### Oracle (Transactional ERP)

Oracle is the system of record for Smith Farms' ERP data. Redundancy is achieved through Oracle Data Guard with an asynchronous read-replica:

- **Primary instance** handles all ERP write traffic in the Data Subnet.
- **Read replica** (Active Data Guard) serves read-only queries from the ETL Monitor API and reporting workloads, offloading the primary.
- **Replication mode:** Asynchronous redo log shipping. This introduces a small lag (typically seconds) but avoids write-path latency penalties on the primary.
- **Failover:** Automatic failover via Data Guard Fast-Start Failover with an observer process running on a separate host. If the primary becomes unreachable for >30 seconds, the replica is promoted.
- **RPO ≤ 4 hours:** Achieved comfortably — async replication lag is typically <1 minute. Even in a degraded network scenario, redo log gaps are bounded by the 4-hour archive log shipping interval.
- **RTO ≤ 2 hours:** Fast-Start Failover completes promotion in <2 minutes. The remaining time budget covers DNS/connection string updates, application reconnection, and validation.

### Oracle Failover Sequence

```mermaid
sequenceDiagram
    participant P as Oracle Primary
    participant O as Observer Process
    participant R as Read Replica
    participant App as Application Layer
    participant DNS as Azure DNS

    Note over P: Primary becomes unreachable
    O->>P: Health check fails
    O->>O: Wait 30s threshold
    O->>R: Initiate Fast-Start Failover
    R->>R: Apply pending redo logs
    R->>R: Promote to Primary role (~2 min)
    O->>DNS: Update connection endpoints
    DNS->>App: New primary address propagated
    App->>R: Reconnect to new primary
    Note over R: Serving read + write traffic
    R->>R: Begin standby rebuild (automated)
    O->>App: Post-failover validation
```

### Azure SQL (Reporting)

- **Active geo-replication** to the DR region (East US 2) with automatic failover groups.
- **Point-in-time restore** enabled with 35-day retention.
- **RPO:** <5 seconds (synchronous commit within the primary region's availability zone).

### DORIS (Clone/ETL Intermediate)

- DORIS is a transient ETL staging layer. Data loss is recoverable by re-running the ETL pipeline from Oracle.
- Daily snapshots are taken as a convenience to avoid full re-extraction during minor failures.

---

## Automated Backup & Recovery Strategy

| Component | Backup Method | Frequency | Retention | Offsite |
|-----------|--------------|-----------|-----------|---------|
| Oracle Primary | RMAN incremental + archive logs | Every 4 hours | 30 days | Geo-redundant Azure Blob (RA-GRS) |
| Azure SQL | Automated backups (Azure-managed) | Continuous (PITR) | 35 days | Geo-redundant (paired region) |
| DORIS | Volume snapshots | Daily | 7 days | Same region (recoverable via re-ETL) |
| AKS Config | GitOps (Flux) — cluster state in Git | On every change | Unlimited (Git history) | GitHub/Azure DevOps |
| Key Vault | Soft-delete + purge protection | Continuous | 90 days | Azure-managed geo-redundancy |

**Restore validation:** Automated monthly restore tests run against a non-production environment. A scheduled Azure DevOps pipeline restores the latest Oracle RMAN backup to a test instance, runs a checksum comparison on 10 key tables, and reports pass/fail to the Teams channel. Runbooks for each restore scenario are maintained in the team wiki and reviewed quarterly.

### Backup & Restore Flow

```mermaid
flowchart TD
    subgraph Backup["Automated Backup Processes"]
        A["Oracle RMAN<br/>Every 4 hours"] --> B["Azure Blob (RA-GRS)<br/>Geo-redundant"]
        C["Azure SQL<br/>Continuous PITR"] --> D["Paired Region<br/>Geo-redundant"]
        E["DORIS Snapshots<br/>Daily"] --> F["Same Region Storage"]
        G["AKS GitOps<br/>On every change"] --> H["Git Repository"]
    end

    subgraph Validation["Monthly Restore Validation"]
        I["Azure DevOps Pipeline<br/>Scheduled monthly"] --> J["Restore to Test Instance"]
        J --> K{"Checksum Comparison<br/>10 key tables"}
        K -->|Pass| L["✅ Report to Teams"]
        K -->|Fail| M["❌ Alert + Incident Created"]
    end

    B --> I
```

---

## Monitoring & Alerting

### Observability Architecture

```mermaid
graph LR
    subgraph Sources["Metric Sources"]
        AKS_Metrics["AKS Metrics<br/>(kubelet, cAdvisor)"]
        App_Metrics["App Metrics<br/>(Pino logs, custom)"]
        Airflow_Metrics["Airflow Metrics<br/>(task duration, failures)"]
        DB_Metrics["DB Metrics<br/>(connections, DTU, replication lag)"]
    end

    subgraph Collection["Collection & Storage"]
        Prometheus["Prometheus<br/>(scrape interval: 15s)"]
        LogAnalytics["Azure Log Analytics"]
    end

    subgraph Visualization["Visualization"]
        Grafana["Grafana Dashboards"]
        AzurePortal["Azure Portal"]
    end

    subgraph Alerting["Alert Routing"]
        AlertManager["Alertmanager"]
        AzureAlerts["Azure Monitor<br/>Alert Rules"]
        Teams["Microsoft Teams<br/>(#platform-alerts)"]
    end

    AKS_Metrics --> Prometheus
    App_Metrics --> Prometheus
    App_Metrics --> LogAnalytics
    Airflow_Metrics --> Prometheus
    DB_Metrics --> LogAnalytics

    Prometheus --> Grafana
    LogAnalytics --> AzurePortal
    LogAnalytics --> Grafana

    Prometheus --> AlertManager
    AlertManager -->|"Webhook"| Teams
    LogAnalytics --> AzureAlerts
    AzureAlerts -->|"Action Group"| Teams
```

### Alert Severity Tiers

| Severity | Response | Channel | Examples |
|----------|----------|---------|----------|
| **P1 — Critical** | Immediate page to on-call | #platform-alerts + PagerDuty | Oracle replication lag >5 min, complete region failure |
| **P2 — High** | Triage during working hours | #etl-alerts | ETL job failure, pod crash loop, pipeline staleness |
| **P3 — Warning** | Review in daily standup | #platform-warnings | Elevated DTU, high memory, slow queries |

### Alert Rules

| Alert | Source | Threshold | Severity | Channel |
|-------|--------|-----------|----------|---------|
| ETL job failure | Prometheus (app metric) | Any failure status | P2 — High | #etl-alerts |
| ETL pipeline stale (no run) | Prometheus | No successful run in 30 min | P2 — High | #etl-alerts |
| Oracle replication lag | Azure Monitor | >5 minutes | P1 — Critical | #platform-alerts |
| AKS pod crash loop | Prometheus (kube-state-metrics) | >3 restarts in 10 min | P2 — High | #platform-alerts |
| Azure SQL DTU >80% | Azure Monitor | Sustained 5 min | P3 — Warning | #platform-alerts |
| Node memory >85% | Prometheus | Sustained 5 min | P3 — Warning | #platform-alerts |
| Health endpoint degraded | Prometheus (blackbox) | Any component unhealthy | P2 — High | #platform-alerts |

All alerts route to Microsoft Teams via webhook — matching Smith Farms' existing communication tooling. Critical (P1) alerts also page the on-call engineer via Azure Monitor Action Groups integrated with PagerDuty.

### Alert Routing Flowchart

```mermaid
flowchart TD
    A["Event Detected"] --> B{"Source?"}
    B -->|"App / K8s metric"| C["Prometheus"]
    B -->|"Azure service metric"| D["Azure Monitor"]

    C --> E["Alertmanager"]
    D --> F["Azure Alert Rules"]

    E --> G{"Severity?"}
    F --> G

    G -->|P1 Critical| H["#platform-alerts<br/>+ PagerDuty page"]
    G -->|P2 High| I["#etl-alerts<br/>(working hours triage)"]
    G -->|P3 Warning| J["#platform-warnings<br/>(daily standup review)"]

    H --> K["On-call engineer<br/>responds immediately"]
    I --> L["Team triages<br/>within business hours"]
    J --> M["Reviewed in<br/>morning standup"]
```

---

## Kubernetes Hardening

### Resource Management

Every pod specifies CPU and memory requests/limits to prevent noisy-neighbor issues and enable the scheduler to make informed placement decisions:

```yaml
# Example: ETL Monitor API pod
resources:
  requests:
    cpu: 250m
    memory: 256Mi
  limits:
    cpu: 1000m
    memory: 512Mi
```

A `LimitRange` on the namespace enforces defaults so no pod runs without resource boundaries. A `ResourceQuota` caps total namespace consumption to prevent runaway scaling from exhausting the node pool.

### Health Checks & Auto-Restart

| Probe | Endpoint | Interval | Failure Threshold | Purpose |
|-------|----------|----------|-------------------|---------|
| **Liveness** | `GET /health` | 10s | 3 failures | Catches deadlocked/hung processes — kubelet restarts the container |
| **Readiness** | `GET /health` | 5s | 1 failure | Removes pod from Service endpoint during startup or transient failures |
| **Startup** | `GET /health` | 30s initial delay, 10 retries | 10 failures | Gives time for migrations and warm-up without premature liveness kills |

### Pod Disruption Budgets

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: etl-monitor-api-pdb
spec:
  minAvailable: 2
  selector:
    matchLabels:
      app: etl-monitor-api
```

Ensures at least 2 API replicas remain available during voluntary disruptions (node upgrades, scaling events).

### Auto-Scaling Strategy

| Scaler | Target | Min | Max | Trigger |
|--------|--------|-----|-----|---------|
| **HPA (API pods)** | CPU utilization 70% + request rate | 3 | 10 | Prometheus adapter custom metrics |
| **Cluster Autoscaler** | Pending pod scheduling pressure | 3 nodes | 8 nodes | Unschedulable pods |
| **KEDA (Airflow workers)** | Airflow task queue depth | 0 | 10 | Scale-to-zero during idle periods |

### Kubernetes Pod Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Pending: Pod scheduled
    Pending --> ContainerCreating: Image pulled
    ContainerCreating --> StartupProbe: Container starts
    StartupProbe --> Running: Startup probe passes
    StartupProbe --> CrashLoopBackOff: Startup probe fails (10x)
    Running --> Ready: Readiness probe passes
    Ready --> Running: Readiness probe fails (removed from Service)
    Running --> Ready: Readiness probe recovers
    Ready --> Terminating: Scale-down / upgrade
    Running --> CrashLoopBackOff: Liveness probe fails (3x)
    CrashLoopBackOff --> Pending: Kubelet restarts container
    Terminating --> [*]: Graceful shutdown
```

### Network Policies

Calico network policies restrict pod-to-pod traffic:

```mermaid
graph LR
    subgraph AKS["AKS Cluster"]
        Dashboard["Dashboard Pods"]
        API2["API Pods"]
        Airflow2["Airflow Workers"]
    end

    subgraph Data2["Data Subnet"]
        Oracle2["Oracle"]
        DORIS2["DORIS"]
        SQL2["Azure SQL"]
    end

    Prom2["Prometheus"]

    Dashboard -->|"Allowed"| API2
    API2 -->|"Allowed"| Data2
    API2 -->|"Allowed"| Prom2
    Airflow2 -->|"Allowed"| Data2
    Airflow2 -->|"Allowed"| API2
    Dashboard -.->|"❌ Denied"| Data2
    Dashboard -.->|"❌ Denied"| Airflow2
```

All other inter-pod traffic is denied by default.

---

## Azure VDI Session Pooling & Cost Optimization

Smith Farms operators access internal tools (Oracle Enterprise Manager, Grafana, internal dashboards) through Azure Virtual Desktop rather than exposing these services to the public internet.

### Session Pool Configuration

| Setting | Value | Rationale |
|---------|-------|-----------|
| Host pool type | Pooled | Shared hosts for cost efficiency |
| Session hosts | 4–12 (Standard_D4s_v5) | Breadth-first load balancing |
| Max sessions per host | 10 | Tuned for browser-based operator workloads |
| Idle session timeout | 30 minutes | Frees host capacity |
| Disconnected session logoff | 2 hours | Prevents orphaned sessions |
| Profile storage | FSLogix on Azure Files (Standard) | Fast login without per-host profiles |

### VDI Scaling Schedule

```mermaid
gantt
    title VDI Session Host Scaling (24-hour cycle)
    dateFormat HH:mm
    axisFormat %H:%M

    section Active Hosts
    Off-hours (2 hosts - reserved)    :a1, 00:00, 06:00
    Ramp-up (3-4 hosts)               :a2, 06:00, 08:00
    Peak hours (4-12 hosts)           :a3, 08:00, 17:00
    Ramp-down (3-4 hosts)             :a4, 17:00, 19:00
    Off-hours (2 hosts - reserved)    :a5, 19:00, 24:00
```

### Cost Optimization

| Strategy | Savings | Details |
|----------|---------|---------|
| Reserved Instances (1-year) | ~35% vs. pay-as-go | Baseline 2 hosts |
| Spot Instances | ~60-80% vs. on-demand | Burst capacity beyond baseline |
| Auto-scaling off-hours | ~40% reduction | Scale to 2 hosts 7 PM–6 AM + weekends |
| **Estimated monthly cost** | **$800–$2,000** | $800–$1,200 baseline, up to $2,000 peak |

---

## ETL Resilience

### ETL Data Flow Pipeline

```mermaid
flowchart LR
    subgraph Source["Source Systems"]
        OracleERP["Oracle ERP<br/>(System of Record)"]
    end

    subgraph Staging["Staging Layer"]
        DORIS3["DORIS<br/>(Clone / ETL Intermediate)"]
    end

    subgraph Target["Reporting Layer"]
        AzureDB["Azure SQL<br/>(Reporting Database)"]
    end

    subgraph Orchestration["Orchestration"]
        Airflow3["Apache Airflow<br/>(AKS)"]
    end

    subgraph Monitor["Monitoring"]
        ETLMon["ETL Monitor API"]
        TeamsCh["Teams #etl-alerts"]
    end

    OracleERP -->|"1. Extract<br/>(Airflow task)"| DORIS3
    DORIS3 -->|"2. Transform + Load<br/>(Airflow task)"| AzureDB
    Airflow3 -->|"Orchestrates"| OracleERP
    Airflow3 -->|"Orchestrates"| DORIS3
    Airflow3 -->|"Status updates"| ETLMon
    ETLMon -->|"Failure alerts"| TeamsCh
```

### Airflow Monitoring & Failure Detection

The ETL pipeline (Oracle → DORIS → Azure DB) is orchestrated by Apache Airflow running on AKS. Resilience is built into multiple layers:

**30-minute failure detection SLA** is achieved through three independent detection paths:

| Detection Layer | Mechanism | Detection Time | Alert Path |
|----------------|-----------|----------------|------------|
| Task-level | Airflow `execution_timeout` + StatsD → Prometheus | Seconds | Alertmanager → Teams |
| Pipeline-level | Prometheus `absent()` rule (no success in 30 min) | ≤ 30 minutes | Alertmanager → Teams |
| Application-level | ETL Monitor health endpoint staleness check | ≤ 30 minutes | Dashboard degraded warning |

### Failure Detection Flowchart

```mermaid
flowchart TD
    A["Airflow Task Executes"] --> B{"Task Succeeds?"}
    B -->|Yes| C["Report 'success' to ETL Monitor"]
    C --> D["Health endpoint: healthy"]

    B -->|No| E["Retry with exponential backoff<br/>(5 → 10 → 20 min)"]
    E --> F{"Retries exhausted?<br/>(3 attempts)"}
    F -->|No| A
    F -->|Yes| G["Report 'failure' to ETL Monitor"]

    G --> H["Create unacknowledged Alert"]
    H --> I["WebhookService formats MessageCard"]
    I --> J["POST to Teams #etl-alerts"]

    G --> K["Health endpoint: degraded"]
    K --> L["Prometheus absent() rule fires"]
    L --> M["Alertmanager → Teams<br/>(redundant notification)"]
```

### Retry Strategy

| Parameter | Value | Notes |
|-----------|-------|-------|
| Max retries | 3 | Per Airflow task |
| Retry delay | 5 minutes (base) | Exponential backoff: 5 → 10 → 20 min |
| Execution timeout | Per-task configured | Prevents hung tasks |
| Post-retry action | Report failure to ETL Monitor | Triggers alert + Teams notification |

This layered approach ensures failures are caught even if one detection mechanism is down.

---

## Security

### Network Segmentation

The Azure Virtual Network is segmented into three subnets with NSG (Network Security Group) rules:

| Subnet | CIDR | Allowed Inbound | Allowed Outbound |
|--------|------|-----------------|------------------|
| AKS Subnet | 10.0.1.0/24 | Load Balancer (443), VDI Subnet (internal) | Data Subnet (1521, 3306, 1433), Internet (HTTPS) |
| Data Subnet | 10.0.2.0/24 | AKS Subnet only | Azure Backup, DR Region (replication) |
| Management Subnet | 10.0.3.0/24 | Corporate VPN (RDP/443) | AKS Subnet, Data Subnet |

- **Private endpoints** for Azure SQL, Key Vault, and Container Registry — no public internet exposure.
- **Azure Firewall** at the VNet egress for outbound traffic inspection and FQDN filtering.

### Access Control Model

```mermaid
graph TD
    subgraph Identity["Identity Provider"]
        AAD["Azure AD (Entra ID)"]
    end

    subgraph Human["Human Access"]
        Dev["Developers<br/>(read-only prod)"]
        Ops["Operators<br/>(VDI sessions)"]
        OnCall["On-call Engineer<br/>(break-glass)"]
    end

    subgraph Service["Service Access"]
        CICD["CI/CD Service Principal<br/>(deploy permissions)"]
        APIIdentity["API Managed Identity<br/>(read Oracle, read/write Azure SQL)"]
        AirflowIdentity["Airflow Managed Identity<br/>(read/write Oracle, DORIS)"]
    end

    subgraph Resources["Protected Resources"]
        KV["Key Vault<br/>(per-workload secrets)"]
        DB["Databases"]
        K8s["AKS RBAC"]
    end

    AAD --> Human
    AAD --> Service
    Dev --> K8s
    Ops --> KV
    CICD --> K8s
    APIIdentity --> KV
    APIIdentity --> DB
    AirflowIdentity --> KV
    AirflowIdentity --> DB
```

### Secrets Management (Azure Key Vault)

| Principle | Implementation |
|-----------|---------------|
| Centralized storage | All secrets in Azure Key Vault (connection strings, webhook URLs, API keys) |
| Pod access | Secrets Store CSI Driver mounts secrets as files; auto-refreshed |
| Least privilege | Each managed identity gets only the secrets it needs |
| Audit trail | All Key Vault access logged to Azure Monitor |
| No embedded credentials | Managed Identities for pod-to-Azure-service auth; no env vars or config files |

---

## Disaster Recovery Plan

### RPO/RTO Targets

| Component | RPO | RTO | Recovery Method |
|-----------|-----|-----|-----------------|
| Oracle (ERP) | ≤ 4 hours | ≤ 2 hours | Data Guard failover to DR standby |
| Azure SQL (Reporting) | ≤ 5 seconds | ≤ 30 minutes | Auto-failover group to geo-replica |
| DORIS (ETL Staging) | ≤ 24 hours | ≤ 4 hours | Re-run ETL from Oracle (data is reproducible) |
| AKS Workloads | N/A (stateless) | ≤ 30 minutes | Redeploy from GitOps repo to DR cluster |
| Key Vault | 0 (geo-redundant) | ≤ 5 minutes | Automatic (Azure-managed) |

### DR Failover Procedure

```mermaid
flowchart TD
    A["🔴 Primary Region Failure Detected"] --> B{"Detection Method"}
    B -->|Automated| C["Azure Monitor detects failure"]
    B -->|Manual| D["On-call engineer declares outage"]

    C --> E["Azure Traffic Manager<br/>DNS failover to East US 2"]
    D --> E

    E --> F["Oracle Data Guard<br/>promotes DR standby"]
    E --> G["Azure SQL auto-failover<br/>group activates geo-replica"]
    E --> H["Flux GitOps reconciles<br/>DR AKS cluster"]

    F --> I["Pods connect via<br/>region-aware Key Vault strings"]
    G --> I
    H --> I

    I --> J["Automated Smoke Tests"]
    J --> K{"All checks pass?"}
    K -->|Yes| L["✅ Teams notification:<br/>DR active, services operational"]
    K -->|No| M["❌ Escalate to engineering<br/>Manual intervention required"]
```

### Quarterly DR Testing

| Aspect | Details |
|--------|---------|
| Cadence | Full DR failover test every quarter; tabletop exercise in alternate quarters |
| Scope | Simulate primary region outage, execute full DR procedure |
| Success criteria | All services operational in DR within RTO; data loss within RPO; no manual intervention beyond initial declaration |
| Post-test | Retrospective with findings documented; remediation items tracked in backlog |

---

## Key Tradeoffs & Assumptions

### Design Tradeoffs

| Decision | Tradeoff | Rationale |
|----------|----------|-----------|
| **Async Oracle replication** | Small data loss window (seconds) vs. zero-loss sync | Sync adds latency to every ERP write. Batch-oriented agricultural workflows tolerate seconds of lag; RPO ≤ 4h is easily met. |
| **DORIS as recoverable staging** | No dedicated DR vs. full replication | DORIS data is derived from Oracle and regenerated by re-running ETL. Replicating adds cost without meaningful resilience gain. |
| **Dual monitoring stack** | Operational complexity vs. single-vendor simplicity | Prometheus provides deep K8s/app metrics with PromQL. Azure Monitor covers native Azure services. Grafana unifies both. Overlap is intentional. |
| **Breadth-first VDI balancing** | More active hosts vs. packing hosts full | Better per-user performance for a small operator pool (~20 users). |
| **KEDA scale-to-zero** | Cold-start latency vs. cost savings | 30–60s cold start acceptable for overnight batch ETL runs. |
| **GitOps for cluster state** | Slower emergency changes vs. reproducibility | DR cluster reconstructed identically from Git. Break-glass procedures mitigate slow emergency path. |

### Assumptions

| Assumption | Impact if Invalid |
|------------|-------------------|
| US time zones (7 PM–6 AM PT = low traffic) | Off-hours scaling would need adjustment for global operations |
| Oracle managed by existing DBA team | Would need to include primary Oracle admin in scope |
| Microsoft Teams is sole alerting channel | Alertmanager and Action Groups are extensible to Slack/PagerDuty |
| Sufficient inter-region bandwidth for replication | May need dedicated ExpressRoute circuits |
| 30-min staleness window is reliable failure signal | Maintenance windows must be annotated in Airflow to suppress false positives |