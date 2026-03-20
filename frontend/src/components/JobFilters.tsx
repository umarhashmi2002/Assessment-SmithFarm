import type { JobFilters as JobFiltersType } from '../types';

const PIPELINES = [
  'oracle-inventory-sync',
  'doris-sales-etl',
  'azure-reporting-load',
  'oracle-supplier-feed',
  'doris-warehouse-metrics',
  'azure-customer-sync',
];

const STATUSES = ['success', 'failure', 'running'] as const;

interface JobFiltersProps {
  filters: JobFiltersType;
  onChange: (filters: JobFiltersType) => void;
}

export default function JobFilters({ filters, onChange }: JobFiltersProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      <div className="flex flex-col">
        <label htmlFor="pipeline-filter" className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Pipeline
        </label>
        <select
          id="pipeline-filter"
          value={filters.pipeline ?? ''}
          onChange={(e) =>
            onChange({ ...filters, pipeline: e.target.value || undefined, cursor: undefined })
          }
          className="filter-input"
        >
          <option value="">All Pipelines</option>
          {PIPELINES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col">
        <label htmlFor="status-filter" className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Status
        </label>
        <select
          id="status-filter"
          value={filters.status ?? ''}
          onChange={(e) =>
            onChange({
              ...filters,
              status: (e.target.value || undefined) as JobFiltersType['status'],
              cursor: undefined,
            })
          }
          className="filter-input"
        >
          <option value="">All Statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col">
        <label htmlFor="from-filter" className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
          From
        </label>
        <input
          id="from-filter"
          type="date"
          value={filters.from ?? ''}
          onChange={(e) =>
            onChange({ ...filters, from: e.target.value || undefined, cursor: undefined })
          }
          className="filter-input"
        />
      </div>

      <div className="flex flex-col">
        <label htmlFor="to-filter" className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
          To
        </label>
        <input
          id="to-filter"
          type="date"
          value={filters.to ?? ''}
          onChange={(e) =>
            onChange({ ...filters, to: e.target.value || undefined, cursor: undefined })
          }
          className="filter-input"
        />
      </div>
    </div>
  );
}
