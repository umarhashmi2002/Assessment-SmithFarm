import { useState, useEffect, useCallback } from 'react';
import { getHealth } from '../api/client';
import type { HealthCheckResult } from '../types';

const DEFAULT_POLL_INTERVAL_MS = 30_000;

export function useHealth(pollIntervalMs: number = DEFAULT_POLL_INTERVAL_MS) {
  const [health, setHealth] = useState<HealthCheckResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = useCallback(async () => {
    try {
      const data = await getHealth();
      setHealth(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load health');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const id = setInterval(fetchHealth, pollIntervalMs);
    return () => clearInterval(id);
  }, [fetchHealth, pollIntervalMs]);

  return { health, loading, error };
}
