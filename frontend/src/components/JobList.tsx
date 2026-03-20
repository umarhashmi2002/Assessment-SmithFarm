import { useNavigate } from 'react-router-dom';
import type { EtlJobWithAlert } from '../types';

interface JobListProps {
  jobs: EtlJobWithAlert[];
  loading: boolean;
  error: string | null;
  onLoadMore: () => void;
  hasMore: boolean;
}

const STATUS_INDICATOR: Record<string, string> = {
  success: 'bg-green-500',
  failure: 'bg-red-500',
  running: 'bg-yellow-500',
};

const STATUS_BG: Record<string, string> = {
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  failure: 'bg-red-50 text-red-700 ring-red-600/20',
  running: 'bg-amber-50 text-amber-700 ring-amber-600/20',
};

const SOURCE_ICON: Record<string, string> = {
  oracle: '🔶',
  doris: '🔷',
  azure_db: '☁️',
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function timeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function JobList({ jobs, loading, error, onLoadMore, hasMore }: JobListProps) {
  const navigate = useNavigate();

  if (error) {
    return (
      <div className="mx-6 mb-4 rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="font-medium text-red-700">Error loading jobs</p>
        <p className="mt-1 text-sm text-red-600">{error}</p>
        <button
          onClick={onLoadMore}
          className="mt-3 rounded-lg bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr className="border-y border-slate-100 bg-slate-50/50">
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                Job ID
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                Pipeline
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                Source
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                Records
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                Duration
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                Timestamp
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {jobs.map((job) => (
              <tr
                key={job.id}
                onClick={() => navigate(`/jobs/${job.jobId}`)}
                className="cursor-pointer transition-colors hover:bg-indigo-50/50"
                data-testid={`job-row-${job.jobId}`}
              >
                <td className="whitespace-nowrap px-6 py-3.5">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block h-2.5 w-2.5 rounded-full ${STATUS_INDICATOR[job.status] ?? 'bg-gray-400'}`}
                      data-testid={`status-${job.status}`}
                    />
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${STATUS_BG[job.status] ?? ''}`}>
                      {job.status}
                    </span>
                    {job.hasUnacknowledgedAlert && (
                      <span
                        className="ml-1 inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-600/20"
                        data-testid="alert-badge"
                      >
                        <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                        </svg>
                        Alert
                      </span>
                    )}
                  </div>
                </td>
                <td className="whitespace-nowrap px-6 py-3.5 text-sm font-mono text-slate-700">
                  {job.jobId}
                </td>
                <td className="whitespace-nowrap px-6 py-3.5 text-sm text-slate-700">
                  {job.pipeline}
                </td>
                <td className="whitespace-nowrap px-6 py-3.5 text-sm text-slate-700">
                  <span className="inline-flex items-center gap-1.5">
                    <span>{SOURCE_ICON[job.source] ?? ''}</span>
                    {job.source}
                  </span>
                </td>
                <td className="whitespace-nowrap px-6 py-3.5 text-sm tabular-nums text-slate-700">
                  {job.recordsProcessed.toLocaleString()}
                </td>
                <td className="whitespace-nowrap px-6 py-3.5 text-sm tabular-nums text-slate-700">
                  {formatDuration(job.durationMs)}
                </td>
                <td className="whitespace-nowrap px-6 py-3.5 text-sm text-slate-500">
                  <span title={new Date(job.timestamp).toLocaleString()}>
                    {timeAgo(job.timestamp)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {jobs.length === 0 && !loading && (
        <div className="py-12 text-center">
          <svg className="mx-auto h-10 w-10 text-slate-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25 2.25M12 13.875l2.25-2.25M12 13.875l-2.25 2.25M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
          </svg>
          <p className="mt-2 text-sm text-slate-500">No jobs found. Try adjusting your filters.</p>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center gap-2 py-6">
          <svg className="h-5 w-5 animate-spin text-indigo-600" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm text-slate-500">Loading…</span>
        </div>
      )}
    </div>
  );
}
