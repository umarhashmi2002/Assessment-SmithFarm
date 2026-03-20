import axios from 'axios';
import type {
  EtlJob,
  EtlJobWithAlert,
  HealthCheckResult,
  Alert,
  JobFilters,
  PaginatedResult,
} from '../types.js';

const apiClient = axios.create({
  baseURL: '/api',
});

apiClient.interceptors.request.use((config) => {
  config.headers['X-Correlation-ID'] = crypto.randomUUID();
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const message =
      error.response?.data?.message ??
      error.message ??
      'An unexpected error occurred';
    return Promise.reject(new Error(message));
  },
);

export async function getJobs(
  filters: JobFilters = {},
): Promise<PaginatedResult<EtlJobWithAlert>> {
  const params: Record<string, string | number> = {};
  if (filters.limit != null) params.limit = filters.limit;
  if (filters.cursor) params.cursor = filters.cursor;
  if (filters.status) params.status = filters.status;
  if (filters.pipeline) params.pipeline = filters.pipeline;
  if (filters.from) params.from = filters.from;
  if (filters.to) params.to = filters.to;

  const { data } = await apiClient.get<PaginatedResult<EtlJobWithAlert>>(
    '/jobs',
    { params },
  );
  return data;
}

export async function getJob(jobId: string): Promise<EtlJob> {
  const { data } = await apiClient.get<EtlJob>(`/jobs/${jobId}`);
  return data;
}

export async function getHealth(): Promise<HealthCheckResult> {
  const { data } = await apiClient.get<HealthCheckResult>('/health');
  return data;
}

export async function acknowledgeAlert(alertId: string): Promise<Alert> {
  const { data } = await apiClient.post<Alert>(
    `/alerts/acknowledge/${alertId}`,
  );
  return data;
}

export default apiClient;
