# Part 3 — Engineering Reasoning

## Smith Farms Agricultural Supply Chain Platform

---

## Table of Contents

1. [Infrastructure Resilience](#1-infrastructure-resilience)
2. [Monitoring & Incident Response](#2-monitoring--incident-response)
3. [Single-Person Dependency](#3-single-person-dependency)
4. [Failure Modes & Degradation](#4-failure-modes--degradation)

---

## 1. Infrastructure Resilience

### Oracle Read-Replica Failover: Design, Risks, and Mitigation

The Oracle read-replica failover for Smith Farms is built on Oracle Data Guard with Fast-Start Failover (FSFO). The primary Oracle instance handles all ERP write traffic, while an asynchronous read replica serves the ETL Monitor API and reporting queries. An observer process runs on a dedicated host, continuously monitoring the primary.

### Failover Timeline

```mermaid
gantt
    title Oracle Failover — Estimated Timeline
    dateFormat mm:ss
    axisFormat %M:%S

    section Detection
    Primary unreachable          :a1, 00:00, 00:30

    section Promotion
    Observer triggers FSFO       :a2, 00:30, 00:35
    Apply pending redo logs      :a3, 00:35, 01:30
    Replica promoted to primary  :a4, 01:30, 02:00

    section Reconnection
    DNS / connection string update :a5, 02:00, 05:00
    Application reconnection     :a6, 05:00, 10:00
    Post-failover validation     :a7, 10:00, 15:00

    section Rebuild
    New standby provisioning     :a8, 15:00, 60:00
```

### Key Risks During Transition

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Async replication data loss** | Seconds of redo log lag; could widen under network degradation | Monitor replication lag as P1 metric; alert if >5 minutes. RPO ≤ 4h target met comfortably. |
| **Connection string staleness** | Applications point to old primary after promotion | Oracle TNS failover address list + Azure DNS updates; apps reconnect transparently without code changes. |
| **Single point of failure post-promotion** | New primary runs without standby until rebuild completes | Automated standby rebuild starts immediately after promotion; on-call validates within first hour. |

### Failover Sequence

```mermaid
sequenceDiagram
    participant P as Oracle Primary
    participant O as Observer (FSFO)
    participant R as Read Replica
    participant TNS as TNS / Azure DNS
    participant App as Applications

    Note over P: ❌ Primary becomes unreachable
    O->>P: Health check fails
    O->>O: 30-second threshold exceeded
    O->>R: Initiate Fast-Start Failover
    R->>R: Apply pending redo logs (~60s)
    R->>R: Promote to Primary role
    O->>TNS: Update connection endpoints
    TNS->>App: New primary address propagated
    App->>R: Reconnect (transparent)
    Note over R: ✅ Serving read + write traffic
    R->>R: Begin automated standby rebuild
```

### Failover Testing Strategy

Failover testing is performed quarterly during a scheduled maintenance window (Sunday 2–4 AM PT), when ETL pipelines are idle and ERP write traffic is minimal.

| Step | Action | Duration |
|------|--------|----------|
| 1 | Pause Airflow DAGs | 2 min |
| 2 | Controlled switchover (clean role reversal, no data loss) | ~5 min |
| 3 | Validate ETL Monitor health endpoint | 1 min |
| 4 | Run sample ETL job round-trip | 3 min |
| 5 | Send pre/post Teams notifications to #platform-alerts | — |
| 6 | Resume Airflow DAGs once health = healthy | 1 min |

This approach validates the failover mechanism regularly without impacting supply chain operations during business hours.

---

## 2. Monitoring & Incident Response

### Building Confidence in System Health

A monitoring strategy that gives the team real confidence starts with answering one question clearly: **"Is data flowing?"** For Smith Farms, that means tracking ETL pipeline completion as the top-level health signal. If the `oracle-inventory-sync`, `doris-sales-etl`, and `azure-reporting-load` pipelines are completing on schedule with expected record counts, the system is healthy. Everything else — pod CPU, database connections, replication lag — is supporting detail.

### Monitoring Stack Architecture

```mermaid
graph TB
    subgraph AppMetrics["Application-Level Metrics"]
        JobCount["Job success/failure counts"]
        Duration["Pipeline duration"]
        Records["Records processed"]
    end

    subgraph InfraMetrics["Infrastructure Metrics"]
        PodStatus["AKS pod status"]
        NodeMem["Node memory"]
        QueueDepth["Airflow task queue depth"]
    end

    subgraph AzureMetrics["Azure Service Metrics"]
        DTU["Azure SQL DTU"]
        RepLag["Oracle replication lag"]
        KVAccess["Key Vault access patterns"]
    end

    AppMetrics --> Prom["Prometheus"]
    InfraMetrics --> Prom
    AzureMetrics --> AzMon["Azure Monitor"]

    Prom --> Graf["Grafana<br/>(unified dashboard)"]
    AzMon --> Graf

    Graf --> TopPanel["🟢 Pipeline Health Panel<br/>(top of dashboard)"]
    Graf --> DrillDown["📊 Infrastructure Drill-downs<br/>(below)"]
```

### Metric Priority Matrix

| Priority | Metric | Why It Matters | Threshold | Action |
|----------|--------|----------------|-----------|--------|
| 🔴 **1** | ETL pipeline completion rate | Any failure = data not flowing to reporting | Any failure | Immediate triage |
| 🟠 **2** | Pipeline staleness | Something stuck even if nothing explicitly failed | No success in 30 min | Investigate Airflow |
| 🟡 **3** | Oracle replication lag | Read replica serving stale data to reporting | >5 minutes | Check network / primary load |
| 🔵 **4** | AKS pod restart count | Crash loops = app bugs or resource exhaustion | >3 restarts in 10 min | Check logs + resource limits |
| ⚪ **5** | Azure SQL DTU utilization | Reporting layer under pressure, queries degrade | Sustained >80% for 5 min | Scale up or optimize queries |

These five metrics cover the critical path from data ingestion through transformation to reporting.

### Alert Routing & Fatigue Prevention

```mermaid
flowchart TD
    A["Alert Fires"] --> B{"Severity Classification"}

    B -->|"P1 Critical"| C["#platform-alerts<br/>+ PagerDuty on-call page"]
    B -->|"P2 High"| D["#etl-alerts<br/>(working hours triage)"]
    B -->|"P3 Warning"| E["#platform-warnings<br/>(daily standup review)"]

    C --> F["Includes: Grafana link<br/>+ Correlation ID for log lookup"]
    D --> F
    E --> F

    F --> G{"Same alert repeated<br/>within 10 min?"}
    G -->|"Yes"| H["Alertmanager groups<br/>into single notification"]
    G -->|"No"| I["Individual notification sent"]
```

Alert routing is where most teams get fatigue wrong — they alert on everything and route it all to the same channel. We avoid this by tiering alerts and separating channels. Every alert includes a direct link to the relevant Grafana dashboard panel and the correlation ID for log lookup. Alertmanager groups repeated alerts (e.g., same pipeline fails 5 times in 10 minutes → one grouped notification, not five). This keeps the signal-to-noise ratio high.

---

## 3. Single-Person Dependency

### First 30 Days: Knowledge Absorption and Operational Resilience

### 30-Day Knowledge Transfer Plan

```mermaid
gantt
    title 30-Day Knowledge Transfer Timeline
    dateFormat YYYY-MM-DD
    axisFormat %d

    section Week 1 — Observe & Map
    Shadow current owner (daily 30 min)     :w1a, 2025-01-01, 5d
    Document ETL dependency graph           :w1b, 2025-01-01, 5d
    Map Oracle→DORIS→Azure data flow        :w1c, 2025-01-02, 4d
    Review 3-month Teams alert history      :w1d, 2025-01-03, 3d
    Identify highest-risk knowledge gaps    :w1e, 2025-01-04, 2d

    section Week 2–3 — Hands-On Validation
    Take ownership of morning health checks :w2a, 2025-01-06, 10d
    Run through all runbooks in non-prod    :w2b, 2025-01-06, 10d
    Create incident response playbook       :w2c, 2025-01-08, 8d
    Write architecture decision records     :w2d, 2025-01-10, 6d
    Create break-glass emergency guide      :w2e, 2025-01-13, 3d

    section Week 4 — Team Enablement
    Knowledge-sharing session               :w3a, 2025-01-20, 2d
    Paired simulated incident exercise      :w3b, 2025-01-22, 2d
    Set up automated health summaries       :w3c, 2025-01-22, 3d
    Validate docs with second engineer      :w3d, 2025-01-24, 1d
```

### Week-by-Week Breakdown

| Week | Focus | Key Activities | Deliverables |
|------|-------|----------------|--------------|
| **Week 1** | Observe & Map | Shadow current owner, document ETL dependency graph, map data flows, review 3-month alert history | Knowledge gap inventory, system map wiki page |
| **Week 2–3** | Hands-On Validation | Own morning health checks (with backup), run all runbooks in non-prod, update outdated steps | Incident response playbook (top 5 scenarios), ADRs for key design choices, break-glass guide |
| **Week 4** | Team Enablement | Knowledge-sharing session, paired simulated incident, set up automated daily/weekly reports | Team can diagnose + resolve issues from docs alone |

### Critical Documents to Produce

| Document | Purpose | Contents |
|----------|---------|----------|
| **Incident Response Playbook** | Step-by-step resolution for top 5 failure scenarios | Symptoms → diagnosis → resolution → verification for each scenario |
| **Architecture Decision Records (ADRs)** | Capture *why* key design choices were made | Why async replication, why DORIS staging, why specific Airflow retry settings |
| **Break-Glass Guide** | Emergency access and manual overrides | Credentials, escalation paths, manual failover steps, rollback procedures |

The measure of success isn't that one person has absorbed all the knowledge — it's that the knowledge now lives in documentation, dashboards, and runbooks that any engineer on the team can follow.

---

## 4. Failure Modes & Degradation

### Overnight ETL Pipeline Failure: Blast Radius and Expected Behavior

If the Oracle → DORIS → Azure DB ETL pipeline fails overnight, the blast radius depends on where in the chain the failure occurs.

### Blast Radius by Failure Point

```mermaid
flowchart LR
    subgraph Pipeline["ETL Pipeline"]
        Oracle3["Oracle<br/>(Source)"]
        DORIS4["DORIS<br/>(Staging)"]
        AzureDB2["Azure DB<br/>(Reporting)"]
    end

    Oracle3 -->|"Extract"| DORIS4
    DORIS4 -->|"Load"| AzureDB2

    Oracle3 -.- F1["❌ Failure Point 1"]
    DORIS4 -.- F2["❌ Failure Point 2"]
    AzureDB2 -.- F3["❌ Failure Point 3"]
```

| Failure Point | What Breaks | What Still Works | Recovery |
|---------------|-------------|------------------|----------|
| **Oracle → DORIS extraction fails** | DORIS has stale data; Azure DB reports show yesterday's numbers | Oracle primary + read replica operational; ETL Monitor API has visibility | Re-run extraction once Oracle is accessible |
| **DORIS → Azure DB load fails** | Azure DB is stale | DORIS has current data; Oracle unaffected | Re-run just the load step (faster recovery) |
| **Oracle itself is down** | Entire chain stalls | Read replica may still serve recent data for status visibility | Wait for Oracle recovery or Data Guard failover |
| **Silent failure (0 records / corrupt data)** | Pipeline appears to succeed but data is wrong | All systems "healthy" — most dangerous scenario | `recordsProcessed` metric alerts if count is significantly below historical average |

### Expected System Behavior During Overnight Failure

```mermaid
sequenceDiagram
    participant AF as Airflow
    participant ETL as ETL Monitor API
    participant Alert as Alert System
    participant Teams as Teams #etl-alerts
    participant PD as PagerDuty
    participant Dash as Dashboard

    Note over AF: Overnight task fails
    AF->>AF: Retry 1 (after 5 min)
    AF->>ETL: Status: "running"
    AF->>AF: Retry 2 (after 10 min)
    AF->>ETL: Status: "running"
    AF->>AF: Retry 3 (after 20 min)
    AF->>ETL: Status: "running"

    Note over AF: All retries exhausted
    AF->>ETL: Status: "failure"
    ETL->>Alert: Create unacknowledged alert
    Alert->>Teams: MessageCard with job details
    ETL->>Dash: Health → "degraded"

    Note over ETL: 30-min staleness window
    ETL->>Alert: Prometheus absent() rule fires
    Alert->>Teams: Redundant alert (Alertmanager)

    Note over Teams: If Oracle replication also affected
    Alert->>PD: P1 page to on-call engineer
```

### Morning Triage — What the Team Sees

When the team arrives in the morning, they should see a clear picture without needing to investigate:

| Where to Look | What They See |
|----------------|---------------|
| **ETL Monitor Dashboard** | Health status: "degraded", Airflow component flagged unhealthy |
| **Job List** | Failed pipeline's last run highlighted in red with unacknowledged alert badge |
| **Job Detail** | Error message, duration, timestamp of last attempt, retry history |
| **Teams #etl-alerts** | MessageCard with failure details + Grafana dashboard link |
| **PagerDuty log** | Whether P1 was triggered (Oracle replication affected) or just P2 (isolated pipeline failure) |

The team can immediately assess: what failed, when it failed, how many retries were attempted, what the error was, and whether the failure is isolated or part of a broader infrastructure issue — all without running a single manual query.