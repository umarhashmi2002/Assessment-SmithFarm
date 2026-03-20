# Smith Farms ETL Monitor

A full-stack monitoring system for the Smith Farms agricultural supply chain ETL pipelines. Tracks job executions across Oracle, DORIS, and Azure DB data sources, provides real-time health checks, failure alerting via Microsoft Teams, and a React dashboard for operational visibility.

---

## Architecture Overview

```mermaid
graph TB
    subgraph Docker["Docker Compose"]
        subgraph FE["Frontend (port 5173)"]
            React["React 18 + Vite"]
            Tailwind["Tailwind CSS"]
            Nginx["nginx reverse proxy"]
        end

        subgraph BE["Backend (port 3000)"]
            Express["Express API Server"]
            MW["Middleware Stack<br/>Correlation ID · Request Logger<br/>Zod Validation · Error Handler"]
            Services["Services<br/>JobService · AlertService<br/>HealthService · WebhookService"]
            SQLite["SQLite (embedded)<br/>/data/etl-monitor.db"]
        end
    end

    ETL["ETL Pipeline Runners"]
    Teams2["Microsoft Teams<br/>(Webhook Alerts)"]

    React -->|"/api/* proxy"| Express
    ETL -->|"POST /jobs/:jobId/status"| Express
    Services -->|"Failure alerts"| Teams2
    Express --> MW --> Services --> SQLite
```

### Request Flow

```mermaid
sequenceDiagram
    participant ETL as ETL Pipeline Runner
    participant API as Express API
    participant MW as Middleware Chain
    participant Svc as JobService
    participant DB as SQLite
    participant Alert as AlertService
    participant WH as WebhookService
    participant Teams as Microsoft Teams

    ETL->>API: POST /jobs/:jobId/status
    API->>MW: Correlation ID → Logger → Zod Validation
    MW->>Svc: Validated request
    Svc->>DB: INSERT job record

    alt status = "failure"
        Svc->>Alert: Create unacknowledged alert
        Alert->>DB: INSERT alert record
        Alert->>WH: Trigger Teams notification
        WH->>Teams: POST MessageCard
    end

    Svc-->>API: 201 Created
    API-->>ETL: Response + X-Correlation-ID
```

### Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | React 18, Vite, Tailwind CSS | SPA dashboard for job monitoring |
| **Frontend Serving** | nginx | Static file serving + API reverse proxy |
| **Backend Runtime** | Node.js 20, Express, TypeScript | REST API server |
| **Validation** | Zod | Request schema validation |
| **Database** | SQLite via Knex.js | Embedded persistence (swappable to PostgreSQL/Azure SQL) |
| **Logging** | Pino | Structured JSON logging with correlation IDs |
| **Alerting** | Microsoft Teams Webhooks | MessageCard notifications for ETL failures |
| **Testing** | Vitest, Supertest, React Testing Library, fast-check | Unit, integration, and property-based testing |
| **Containerization** | Docker, Docker Compose | Single-command deployment |

---

## Setup and Run Instructions

### Prerequisites

- Node.js 20+
- npm 9+
- Docker and Docker Compose (for containerized setup)

### Option 1: Docker (Recommended)

Start the full application with a single command. The backend automatically runs database migrations and seeds 55 demo records on first startup.

```bash
docker-compose up --build
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:3000 |

To configure Teams webhook notifications:

```bash
TEAMS_WEBHOOK_URL=https://your-webhook-url docker-compose up --build
```

### Option 2: Manual Setup

**Backend:**

```bash
cd backend
npm install
npm run seed      # Run migrations + seed 55 demo records
npm run dev       # Start dev server on port 3000
```

**Frontend (in a separate terminal):**

```bash
cd frontend
npm install
npm run dev       # Start Vite dev server on port 5173
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Backend API server port |
| `DATABASE_PATH` | `./data/etl-monitor.db` | SQLite database file path |
| `TEAMS_WEBHOOK_URL` | *(empty)* | Microsoft Teams incoming webhook URL (optional) |

---

## Data Model

### Entity Relationship Diagram

```mermaid
erDiagram
    ETL_JOB {
        uuid id PK
        string jobId UK
        enum status "success | failure | running"
        string pipeline
        enum source "oracle | doris | azure_db"
        int recordsProcessed
        int durationMs
        string errorMessage "nullable"
        datetime timestamp
    }

    ALERT {
        uuid id PK
        string jobId FK
        boolean acknowledged
        datetime acknowledgedAt "nullable"
        datetime createdAt
    }

    HEALTH_CHECK {
        enum status "healthy | degraded"
        object database
        object kubernetes
        object airflow
        datetime timestamp
    }

    ETL_JOB ||--o| ALERT : "failure creates"
```

### ETL_Job

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Internal primary key |
| `jobId` | string | External job identifier (unique per execution) |
| `status` | enum | `success`, `failure`, or `running` |
| `pipeline` | string | Pipeline name (e.g., `oracle-inventory-sync`) |
| `source` | enum | `oracle`, `doris`, or `azure_db` |
| `recordsProcessed` | integer | Number of records processed |
| `durationMs` | integer | Execution duration in milliseconds |
| `errorMessage` | string? | Error details (nullable, relevant for failures) |
| `timestamp` | ISO 8601 | Server-generated timestamp |

### Alert

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `jobId` | string | References the failed ETL job |
| `acknowledged` | boolean | Whether an operator has acknowledged the alert |
| `acknowledgedAt` | ISO 8601? | Timestamp of acknowledgment (nullable) |
| `createdAt` | ISO 8601 | Alert creation timestamp |

### Health_Check

| Field | Type | Description |
|-------|------|-------------|
| `status` | enum | `healthy` (all components OK) or `degraded` (any component unhealthy) |
| `components.database` | object | Real SQLite connectivity check |
| `components.kubernetes` | object | Kubernetes pod status (simulated adapter) |
| `components.airflow` | object | Airflow scheduler status (simulated adapter) |
| `timestamp` | ISO 8601 | Health check timestamp |

### Seed Data Distribution

| Pipeline | Source | Count | Status Mix |
|----------|--------|-------|------------|
| `oracle-inventory-sync` | oracle | ~10 | 70% success, 20% failure, 10% running |
| `oracle-supplier-update` | oracle | ~9 | 70% success, 20% failure, 10% running |
| `doris-sales-etl` | doris | ~9 | 70% success, 20% failure, 10% running |
| `doris-warehouse-sync` | doris | ~9 | 70% success, 20% failure, 10% running |
| `azure-reporting-load` | azure_db | ~9 | 70% success, 20% failure, 10% running |
| `azure-analytics-refresh` | azure_db | ~9 | 70% success, 20% failure, 10% running |
| **Total** | | **55 records** | Spread across 7 days |

---

## Alerting and Monitoring

### Failure Detection Flow

```mermaid
flowchart TD
    A["ETL Runner POSTs<br/>status: failure"] --> B["Backend persists job record"]
    B --> C["AlertService creates<br/>unacknowledged Alert"]
    C --> D["WebhookService formats<br/>Teams MessageCard"]
    D --> E{"TEAMS_WEBHOOK_URL<br/>configured?"}

    E -->|Yes| F["POST MessageCard to Teams"]
    F --> G{"Webhook request<br/>succeeds?"}
    G -->|Yes| H["✅ Notification delivered"]
    G -->|No| I["⚠️ Error logged<br/>(never blocks job processing)"]

    E -->|No| J["⚠️ Warning logged<br/>Processing continues"]
```

### MessageCard Contents

| Field | Source | Example |
|-------|--------|---------|
| Job ID | Request parameter | `oracle-inv-2025-01-15-001` |
| Pipeline | Request body | `oracle-inventory-sync` |
| Data Source | Request body | `oracle` |
| Error Message | Request body | `Connection timeout to Oracle DB` |
| Duration | Request body | `45,230 ms` |
| Timestamp | Server-generated | `2025-01-15T03:22:41Z` |

### Alert Acknowledgment

Operators acknowledge alerts via `POST /alerts/acknowledge/:alertId`, which records the acknowledgment timestamp. The dashboard displays visual indicators for unacknowledged failure alerts. Re-acknowledging an already-acknowledged alert returns a `409 Conflict`.

---

## API Endpoints

| Method | Path | Description | Request Body |
|--------|------|-------------|-------------|
| `POST` | `/jobs/:jobId/status` | Report ETL job execution status | `{ status, pipeline, source, recordsProcessed, durationMs, errorMessage? }` |
| `GET` | `/jobs` | List jobs (paginated, filterable) | Query: `?status=&source=&pipeline=&cursor=&limit=` |
| `GET` | `/jobs/:jobId` | Get job details | — |
| `GET` | `/health` | Aggregate health check | — |
| `POST` | `/alerts/acknowledge/:alertId` | Acknowledge a failure alert | — |
| `POST` | `/webhooks/teams/test` | Local webhook testing endpoint | Teams MessageCard payload |

---

## Advanced Features

### Property-Based Testing with fast-check

The project uses [fast-check](https://github.com/dubzzz/fast-check) for property-based testing alongside traditional unit and integration tests. Property tests generate hundreds of random inputs to verify universal correctness properties.

```mermaid
flowchart LR
    subgraph PBT["Property-Based Testing"]
        Gen["Random Input<br/>Generator"] --> Prop["Property<br/>Assertion"]
        Prop --> Check{"Passes for<br/>all inputs?"}
        Check -->|"Yes (100+ runs)"| Pass["✅ Property holds"]
        Check -->|"No"| Shrink["Shrink to minimal<br/>counterexample"]
        Shrink --> Report["❌ Report failing case"]
    end
```

| Suite | Properties | Min Iterations | Examples |
|-------|-----------|----------------|----------|
| **Backend** | 12 | 100 each | Job round-trip consistency, invalid enum rejection, failure-alert creation, pagination completeness, health aggregation, correlation ID propagation |
| **Frontend** | 3 | 100 each | Job status visual indicators, unacknowledged alert indicators, health overview rendering |

### Cursor-Based Pagination

Job listing uses cursor-based pagination instead of offset-based pagination. The cursor encodes the last seen job's `timestamp` and `id` as a base64url JSON string. This avoids issues with offset pagination when records are inserted or deleted between page requests, ensuring consistent results.

```mermaid
flowchart LR
    A["Page 1 Request<br/>GET /jobs?limit=20"] --> B["Response includes<br/>nextCursor = base64(timestamp+id)"]
    B --> C["Page 2 Request<br/>GET /jobs?cursor=abc&limit=20"]
    C --> D["Query: WHERE (timestamp, id) < cursor<br/>ORDER BY timestamp DESC, id DESC"]
    D --> E["Stable results even if<br/>new records inserted"]
```

### Structured Observability

| Feature | Implementation | Benefit |
|---------|---------------|---------|
| **Correlation IDs** | `X-Correlation-ID` header (UUIDv4), generated or propagated | Distributed tracing across request lifecycle |
| **Structured Logging** | Pino JSON logs with timestamp, level, message, correlation ID | Machine-parseable, searchable in Log Analytics |
| **Request Logging** | Middleware logs method, path, status, duration per request | Performance monitoring and debugging |

### Microsoft Teams Webhook Integration

ETL job failures trigger formatted `MessageCard` notifications to a configured Microsoft Teams channel. The integration is resilient — webhook failures are logged but never block job processing. A local test endpoint (`POST /webhooks/teams/test`) is available for development.

---

## Testing Summary

```mermaid
pie title Test Distribution (130+ tests)
    "Backend Unit Tests" : 45
    "Backend Integration Tests" : 30
    "Backend Property Tests" : 22
    "Frontend Component Tests" : 20
    "Frontend Property Tests" : 13
```

| Category | Count | Framework | What's Tested |
|----------|-------|-----------|---------------|
| Backend unit tests | ~45 | Vitest | Service logic, Zod validation, middleware behavior |
| Backend integration tests | ~30 | Vitest + Supertest | Full HTTP request/response cycles for all endpoints |
| Backend property tests | ~22 | Vitest + fast-check | 12 properties × 100+ iterations each |
| Frontend component tests | ~20 | Vitest + React Testing Library | JobList, JobFilters, JobDetail, HealthOverview |
| Frontend property tests | ~13 | Vitest + fast-check | 3 properties × 100+ iterations each |

### Running Tests

```bash
# All tests (backend + frontend)
npm test

# Backend only
npm run test:backend

# Frontend only
npm run test:frontend

# Backend subsets
cd backend
npm run test:unit
npm run test:integration
npm run test:property

# Frontend subsets
cd frontend
npm run test:unit
npm run test:property
```

---

## Project Structure

```
smith-farms-etl-monitor/
├── backend/
│   ├── src/
│   │   ├── index.ts              # Server entry point
│   │   ├── app.ts                # Express app + middleware wiring
│   │   ├── config.ts             # Environment configuration
│   │   ├── logger.ts             # Pino structured logger
│   │   ├── types.ts              # Shared TypeScript interfaces
│   │   ├── db/
│   │   │   ├── connection.ts     # Knex + SQLite connection
│   │   │   ├── migrations/       # Database schema migrations
│   │   │   └── seed.ts           # Demo data seed script
│   │   ├── middleware/           # correlationId, requestLogger, validate, errorHandler
│   │   ├── routes/               # jobs, health, alerts, webhooks
│   │   └── services/             # jobService, alertService, healthService, webhookService
│   └── tests/                    # unit/, integration/, property/
├── frontend/
│   ├── src/
│   │   ├── App.tsx               # Root component + routing
│   │   ├── api/client.ts         # Axios instance with correlation ID interceptor
│   │   ├── components/           # JobList, JobDetail, JobFilters, HealthOverview, etc.
│   │   ├── hooks/                # useJobs, useJobDetail, useHealth
│   │   └── types.ts              # Frontend TypeScript interfaces
│   └── tests/                    # components/, property/
├── docs/                         # Infrastructure design + engineering reasoning
├── docker-compose.yml
└── README.md
```

---

## Assumptions and Limitations

| Assumption | Details | Production Path |
|------------|---------|-----------------|
| **SQLite for assessment** | Embedded file-based DB eliminates setup friction | Swap to PostgreSQL/Azure SQL via Knex.js config change |
| **Mocked K8s & Airflow health** | Simulated adapters return health status | Plug in real K8s API and Airflow API checks |
| **Synthetic seed data** | 55 records with realistic distributions (70/20/10 split) | Replace with real ETL pipeline integrations |
| **Single-node deployment** | Docker Compose on one host | Deploy as separate AKS pods with scaling + load balancing |
| **No authentication** | API and dashboard are open | Secure via Azure AD / OAuth 2.0 |
| **Teams webhook optional** | Logs warning if URL not set; local test endpoint available | Configure real webhook URL in production |
| **No real-time updates** | Dashboard fetches on user interaction | Add WebSocket/SSE for live updates |