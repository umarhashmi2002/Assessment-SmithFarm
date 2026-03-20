import { useMemo } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  AreaChart, Area,
} from 'recharts';
import type { EtlJobWithAlert } from '../types';

interface DashboardChartsProps {
  jobs: EtlJobWithAlert[];
}

const STATUS_COLORS: Record<string, string> = {
  success: '#10b981',
  failure: '#ef4444',
  running: '#f59e0b',
};

const SOURCE_COLORS: Record<string, string> = {
  oracle: '#f97316',
  doris: '#3b82f6',
  azure_db: '#8b5cf6',
};

const SOURCE_LABELS: Record<string, string> = {
  oracle: 'Oracle',
  doris: 'DORIS',
  azure_db: 'Azure DB',
};

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg">
      {label && <p className="mb-1 text-xs font-medium text-slate-500">{label}</p>}
      {payload.map((entry: any, i: number) => (
        <p key={i} className="text-sm" style={{ color: entry.color }}>
          {entry.name}: <span className="font-semibold">{entry.value}</span>
        </p>
      ))}
    </div>
  );
}

function PieLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) {
  if (percent < 0.05) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" className="text-xs font-semibold">
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

export default function DashboardCharts({ jobs }: DashboardChartsProps) {
  const statusData = useMemo(() => {
    const counts: Record<string, number> = { success: 0, failure: 0, running: 0 };
    jobs.forEach((j) => { counts[j.status] = (counts[j.status] || 0) + 1; });
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value, color: STATUS_COLORS[name] }));
  }, [jobs]);

  const sourceData = useMemo(() => {
    const counts: Record<string, number> = {};
    jobs.forEach((j) => { counts[j.source] = (counts[j.source] || 0) + 1; });
    return Object.entries(counts).map(([source, count]) => ({
      name: SOURCE_LABELS[source] || source,
      count,
      color: SOURCE_COLORS[source] || '#94a3b8',
    }));
  }, [jobs]);

  const timelineData = useMemo(() => {
    const byDate: Record<string, { date: string; success: number; failure: number; running: number }> = {};
    jobs.forEach((j) => {
      const date = j.timestamp.slice(0, 10);
      if (!byDate[date]) byDate[date] = { date, success: 0, failure: 0, running: 0 };
      byDate[date][j.status]++;
    });
    return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
  }, [jobs]);

  const pipelineData = useMemo(() => {
    const byPipeline: Record<string, { pipeline: string; total: number; failures: number; avgDuration: number; totalRecords: number; durations: number[] }> = {};
    jobs.forEach((j) => {
      if (!byPipeline[j.pipeline]) {
        byPipeline[j.pipeline] = { pipeline: j.pipeline, total: 0, failures: 0, avgDuration: 0, totalRecords: 0, durations: [] };
      }
      const p = byPipeline[j.pipeline];
      p.total++;
      if (j.status === 'failure') p.failures++;
      p.totalRecords += j.recordsProcessed;
      p.durations.push(j.durationMs);
    });
    return Object.values(byPipeline).map((p) => ({
      pipeline: p.pipeline.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      shortName: p.pipeline.split('-').slice(0, 2).join('-'),
      total: p.total,
      failures: p.failures,
      successRate: p.total > 0 ? Math.round(((p.total - p.failures) / p.total) * 100) : 0,
      avgDuration: p.durations.length > 0 ? Math.round(p.durations.reduce((a, b) => a + b, 0) / p.durations.length) : 0,
      totalRecords: p.totalRecords,
    }));
  }, [jobs]);

  const recordsTimeline = useMemo(() => {
    const byDate: Record<string, number> = {};
    jobs.forEach((j) => {
      const date = j.timestamp.slice(0, 10);
      byDate[date] = (byDate[date] || 0) + j.recordsProcessed;
    });
    return Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, records]) => ({ date, records }));
  }, [jobs]);

  if (jobs.length === 0) {
    return (
      <div className="chart-card flex items-center justify-center py-12">
        <div className="text-center">
          <svg className="mx-auto h-8 w-8 animate-spin text-indigo-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="mt-3 text-sm text-slate-500">Loading analytics data…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Row 1: Status Pie + Source Breakdown + Records Trend */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Status Distribution */}
        <div className="chart-card">
          <h3 className="chart-title">Job Status Distribution</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={statusData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={3}
                dataKey="value"
                labelLine={false}
                label={PieLabel}
              >
                {statusData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} stroke="none" />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend
                verticalAlign="bottom"
                height={36}
                formatter={(value: string) => <span className="text-xs text-slate-600">{value}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Source Breakdown */}
        <div className="chart-card">
          <h3 className="chart-title">Jobs by Data Source</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={sourceData} layout="vertical" margin={{ left: 10, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} width={70} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" name="Jobs" radius={[0, 4, 4, 0]} barSize={24}>
                {sourceData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Records Processed Trend */}
        <div className="chart-card">
          <h3 className="chart-title">Records Processed</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={recordsTimeline} margin={{ left: 0, right: 10, top: 5 }}>
              <defs>
                <linearGradient id="recordsGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={(v) => v.slice(5)} />
              <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="records" name="Records" stroke="#6366f1" fill="url(#recordsGradient)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Row 2: Jobs Timeline */}
      <div className="chart-card">
        <h3 className="chart-title">Job Executions Over Time</h3>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={timelineData} margin={{ left: 0, right: 10, top: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(v) => v.slice(5)} />
            <YAxis tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              verticalAlign="top"
              height={36}
              formatter={(value: string) => <span className="text-xs text-slate-600">{value}</span>}
            />
            <Bar dataKey="success" name="Success" fill="#10b981" stackId="a" radius={[0, 0, 0, 0]} />
            <Bar dataKey="failure" name="Failure" fill="#ef4444" stackId="a" radius={[0, 0, 0, 0]} />
            <Bar dataKey="running" name="Running" fill="#f59e0b" stackId="a" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Row 3: Pipeline Performance Table */}
      <div className="chart-card overflow-hidden p-0">
        <div className="px-6 py-4">
          <h3 className="chart-title mb-0">Pipeline Performance Summary</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-y border-slate-100 bg-slate-50/50">
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Pipeline</th>
                <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Total Runs</th>
                <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Failures</th>
                <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Success Rate</th>
                <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Avg Duration</th>
                <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Total Records</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pipelineData.map((p) => (
                <tr key={p.shortName} className="transition-colors hover:bg-slate-50">
                  <td className="whitespace-nowrap px-6 py-3 text-sm font-medium text-slate-900">{p.pipeline}</td>
                  <td className="whitespace-nowrap px-6 py-3 text-right text-sm tabular-nums text-slate-700">{p.total}</td>
                  <td className="whitespace-nowrap px-6 py-3 text-right text-sm tabular-nums">
                    <span className={p.failures > 0 ? 'font-semibold text-red-600' : 'text-slate-400'}>
                      {p.failures}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-3 text-right text-sm">
                    <div className="flex items-center justify-end gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full ${p.successRate >= 90 ? 'bg-emerald-500' : p.successRate >= 70 ? 'bg-amber-500' : 'bg-red-500'}`}
                          style={{ width: `${p.successRate}%` }}
                        />
                      </div>
                      <span className="tabular-nums font-medium text-slate-700">{p.successRate}%</span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-3 text-right text-sm tabular-nums text-slate-700">
                    {p.avgDuration < 1000 ? `${p.avgDuration}ms` : p.avgDuration < 60000 ? `${(p.avgDuration / 1000).toFixed(1)}s` : `${(p.avgDuration / 60000).toFixed(1)}m`}
                  </td>
                  <td className="whitespace-nowrap px-6 py-3 text-right text-sm tabular-nums text-slate-700">
                    {p.totalRecords.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
