import { useParams, Link } from 'react-router-dom';
import { useJobDetail } from '../hooks/useJobDetail';

const STATUS_INDICATOR: Record<string, string> = {
  success: 'bg-green-500',
  failure: 'bg-red-500',
  running: 'bg-yellow-500',
};

const STATUS_TEXT_COLOR: Record<string, string> = {
  success: 'text-emerald-700',
  failure: 'text-red-700',
  running: 'text-amber-700',
};

const STATUS_BG: Record<string, string> = {
  success: 'bg-emerald-50 ring-emerald-600/20',
  failure: 'bg-red-50 ring-red-600/20',
  running: 'bg-amber-50 ring-amber-600/20',
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

export default function JobDetail() {
  const { jobId } = useParams<{ jobId: string }>();
  const { job, loading, error } = useJobDetail(jobId ?? '');

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16" data-testid="loading">
        <svg className="h-8 w-8 animate-spin text-indigo-600" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <p className="mt-3 text-sm text-slate-500">Loading job details…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6" data-testid="error">
        <p className="font-semibold text-red-700">Error loading job</p>
        <p className="mt-1 text-sm text-red-600">{error}</p>
        <div className="mt-4">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            ← Back to Jobs
          </Link>
        </div>
      </div>
    );
  }

  if (!job) return null;

  return (
    <div className="space-y-4">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-800 transition-colors">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
        </svg>
        Back to Jobs
      </Link>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-5">
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`inline-block h-3.5 w-3.5 rounded-full ${STATUS_INDICATOR[job.status] ?? 'bg-gray-400'}`}
              data-testid={`status-${job.status}`}
            />
            <h2 className="text-xl font-bold text-slate-900">{job.jobId}</h2>
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ring-1 ring-inset ${STATUS_BG[job.status] ?? ''} ${STATUS_TEXT_COLOR[job.status] ?? 'text-slate-500'}`}>
              {job.status}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">Pipeline execution details</p>
        </div>

        <dl className="divide-y divide-slate-100 px-6">
          <div className="grid grid-cols-1 gap-1 py-4 sm:grid-cols-3">
            <dt className="text-sm font-medium text-slate-500">Job ID</dt>
            <dd className="text-sm font-mono text-slate-900 sm:col-span-2">{job.jobId}</dd>
          </div>
          <div className="grid grid-cols-1 gap-1 py-4 sm:grid-cols-3">
            <dt className="text-sm font-medium text-slate-500">Status</dt>
            <dd className="text-sm capitalize text-slate-900 sm:col-span-2">{job.status}</dd>
          </div>
          <div className="grid grid-cols-1 gap-1 py-4 sm:grid-cols-3">
            <dt className="text-sm font-medium text-slate-500">Pipeline</dt>
            <dd className="text-sm text-slate-900 sm:col-span-2">{job.pipeline}</dd>
          </div>
          <div className="grid grid-cols-1 gap-1 py-4 sm:grid-cols-3">
            <dt className="text-sm font-medium text-slate-500">Source</dt>
            <dd className="text-sm text-slate-900 sm:col-span-2">
              <span className="inline-flex items-center gap-1.5">
                <span>{SOURCE_ICON[job.source] ?? ''}</span>
                {job.source}
              </span>
            </dd>
          </div>
          <div className="grid grid-cols-1 gap-1 py-4 sm:grid-cols-3">
            <dt className="text-sm font-medium text-slate-500">Records Processed</dt>
            <dd className="text-sm tabular-nums text-slate-900 sm:col-span-2">{job.recordsProcessed.toLocaleString()}</dd>
          </div>
          <div className="grid grid-cols-1 gap-1 py-4 sm:grid-cols-3">
            <dt className="text-sm font-medium text-slate-500">Duration</dt>
            <dd className="text-sm tabular-nums text-slate-900 sm:col-span-2">{formatDuration(job.durationMs)}</dd>
          </div>
          {job.errorMessage && (
            <div className="grid grid-cols-1 gap-1 py-4 sm:grid-cols-3">
              <dt className="text-sm font-semibold text-red-600">Error Message</dt>
              <dd className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 sm:col-span-2" data-testid="error-message">
                {job.errorMessage}
              </dd>
            </div>
          )}
          <div className="grid grid-cols-1 gap-1 py-4 sm:grid-cols-3">
            <dt className="text-sm font-medium text-slate-500">Timestamp</dt>
            <dd className="text-sm text-slate-900 sm:col-span-2">{new Date(job.timestamp).toLocaleString()}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
