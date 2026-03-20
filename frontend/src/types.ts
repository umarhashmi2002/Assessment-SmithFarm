export type JobStatus = 'success' | 'failure' | 'running';
export type DataSource = 'oracle' | 'doris' | 'azure_db';

export interface EtlJob {
  id: string;
  jobId: string;
  status: JobStatus;
  pipeline: string;
  source: DataSource;
  recordsProcessed: number;
  durationMs: number;
  errorMessage: string | null;
  timestamp: string;
}

export interface EtlJobWithAlert extends EtlJob {
  hasUnacknowledgedAlert: boolean;
}

export interface Alert {
  id: string;
  jobId: string;
  acknowledged: boolean;
  acknowledgedAt: string | null;
  createdAt: string;
}

export interface HealthComponent {
  status: 'healthy' | 'unhealthy';
  message: string;
}

export interface HealthCheckResult {
  status: 'healthy' | 'degraded';
  components: {
    database: HealthComponent;
    kubernetes: HealthComponent;
    airflow: HealthComponent;
  };
  timestamp: string;
}

export interface JobFilters {
  limit?: number;
  cursor?: string;
  status?: JobStatus;
  pipeline?: string;
  from?: string;
  to?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  nextCursor: string | null;
  total: number;
}
