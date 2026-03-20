import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import JobList from './components/JobList';
import JobFilters from './components/JobFilters';
import JobDetail from './components/JobDetail';
import Pagination from './components/Pagination';
import HealthOverview from './components/HealthOverview';
import AlertBadge from './components/AlertBadge';
import DashboardCharts from './components/DashboardCharts';
import { getJobs } from './api/client';
import { useJobs } from './hooks/useJobs';
import { useHealth } from './hooks/useHealth';
import type { JobFilters as JobFiltersType, EtlJobWithAlert } from './types';

function StatsBar() {
  const [stats, setStats] = useState({ total: 0, success: 0, failure: 0, running: 0, alertCount: 0 });
  const { health } = useHealth();

  useEffect(() => {
    getJobs({ limit: 100 })
      .then((result) => {
        const success = result.data.filter((j) => j.status === 'success').length;
        const failure = result.data.filter((j) => j.status === 'failure').length;
        const running = result.data.filter((j) => j.status === 'running').length;
        const alertCount = result.data.filter((j) => j.hasUnacknowledgedAlert).length;
        setStats({ total: result.total, success, failure, running, alertCount });
      })
      .catch(() => {});
  }, []);

  const systemStatus = health?.status === 'healthy' ? 'Operational' : health?.status === 'degraded' ? 'Degraded' : '—';
  const statusColor = health?.status === 'healthy' ? 'text-emerald-600' : health?.status === 'degraded' ? 'text-amber-600' : 'text-slate-400';

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      <div className="stat-card">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Total Jobs</p>
        <p className="mt-1 text-2xl font-bold text-slate-900">{stats.total}</p>
      </div>
      <div className="stat-card">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Successful</p>
        <p className="mt-1 text-2xl font-bold text-emerald-600">{stats.success}</p>
      </div>
      <div className="stat-card">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Failed</p>
        <p className="mt-1 text-2xl font-bold text-red-600">{stats.failure}</p>
      </div>
      <div className="stat-card">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Running</p>
        <p className="mt-1 text-2xl font-bold text-amber-600">{stats.running}</p>
      </div>
      <div className="stat-card">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-500">System Status</p>
        <p className={`mt-1 text-2xl font-bold ${statusColor}`}>{systemStatus}</p>
      </div>
    </div>
  );
}

function JobListPage() {
  const [filters, setFilters] = useState<JobFiltersType>({});
  const [allJobs, setAllJobs] = useState<EtlJobWithAlert[]>([]);
  const { jobs, loading, error, nextCursor, loadMore } = useJobs(filters);

  useEffect(() => {
    getJobs({ limit: 100 })
      .then((result) => setAllJobs(result.data))
      .catch(() => {});
  }, []);

  const handleFilterChange = (newFilters: JobFiltersType) => {
    setFilters(newFilters);
  };

  return (
    <div className="space-y-6">
      <StatsBar />

      {/* Analytics Charts */}
      <DashboardCharts jobs={allJobs} />

      {/* Job Executions Table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">ETL Pipeline Jobs</h2>
          <p className="mt-0.5 text-sm text-slate-500">Monitor and track all ETL pipeline executions across data sources</p>
        </div>
        <div className="px-6 py-4">
          <JobFilters filters={filters} onChange={handleFilterChange} />
        </div>
        <JobList
          jobs={jobs}
          loading={loading}
          error={error}
          onLoadMore={loadMore}
          hasMore={nextCursor !== null}
        />
        <div className="border-t border-slate-100 px-6 py-3">
          <Pagination onLoadMore={loadMore} hasMore={nextCursor !== null} />
        </div>
      </div>
    </div>
  );
}

function JobDetailPage() {
  return <JobDetail />;
}

function Layout() {
  const [alertCount, setAlertCount] = useState(0);

  useEffect(() => {
    getJobs({ limit: 100 })
      .then((result) => {
        const count = result.data.filter((j) => j.hasUnacknowledgedAlert).length;
        setAlertCount(count);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-gradient-to-r from-indigo-700 to-indigo-900 shadow-lg">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15">
                <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                </svg>
              </div>
              <div>
                <Link to="/" className="text-lg font-bold text-white sm:text-xl">
                  Smith Farms ETL Monitor
                </Link>
                <p className="hidden text-xs text-indigo-200 sm:block">Agricultural Supply Chain Pipeline Monitoring</p>
              </div>
            </div>
            <div className="sm:hidden">
              <AlertBadge count={alertCount} />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <HealthOverview />
            <div className="hidden sm:block">
              <AlertBadge count={alertCount} />
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Routes>
          <Route path="/" element={<JobListPage />} />
          <Route path="/jobs/:jobId" element={<JobDetailPage />} />
        </Routes>
      </main>
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-4">
          <p className="text-center text-xs text-slate-400">Smith Farms Agricultural Supply Chain Platform — ETL Pipeline Monitor v1.0</p>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Layout />
    </BrowserRouter>
  );
}
