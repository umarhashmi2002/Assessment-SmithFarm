import { useHealth } from '../hooks/useHealth';

const COMPONENT_LABELS: Record<string, string> = {
  database: 'Database',
  kubernetes: 'Kubernetes',
  airflow: 'Airflow',
};

export default function HealthOverview() {
  const { health, loading } = useHealth();

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-indigo-200">
        <span className="inline-block h-2 w-2 rounded-full bg-indigo-300 animate-pulse" />
        Health: loading…
      </div>
    );
  }

  if (!health) return null;

  const isDegraded = health.status === 'degraded';
  const componentKeys = ['database', 'kubernetes', 'airflow'] as const;

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm sm:gap-3">
      {isDegraded && (
        <span
          data-testid="health-degraded-warning"
          className="rounded-full bg-amber-400/20 px-2.5 py-0.5 text-xs font-semibold text-amber-300 ring-1 ring-amber-400/30"
        >
          Degraded
        </span>
      )}
      {componentKeys.map((key) => {
        const component = health.components[key];
        const isHealthy = component.status === 'healthy';
        return (
          <span
            key={key}
            data-testid={`health-${key}`}
            className="flex items-center gap-1.5 text-indigo-100"
            title={component.message}
          >
            <span
              className={`inline-block h-2 w-2 rounded-full ${isHealthy ? 'bg-green-500' : 'bg-red-500'}`}
            />
            <span className="text-xs font-medium">{COMPONENT_LABELS[key]}</span>
          </span>
        );
      })}
    </div>
  );
}
