import { useState, useEffect, useCallback, useRef } from 'react';
import { getJobs } from '../api/client';
import type { EtlJobWithAlert, JobFilters } from '../types';

export function useJobs(filters: JobFilters) {
  const [jobs, setJobs] = useState<EtlJobWithAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const filtersRef = useRef(filters);

  const fetchJobs = useCallback(async (currentFilters: JobFilters, append = false) => {
    setLoading(true);
    setError(null);
    try {
      const result = await getJobs(currentFilters);
      setJobs((prev) => (append ? [...prev, ...result.data] : result.data));
      setNextCursor(result.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load jobs');
    } finally {
      setLoading(false);
    }
  }, []);

  // Reset and refetch when filters change
  useEffect(() => {
    filtersRef.current = filters;
    setJobs([]);
    setNextCursor(null);
    fetchJobs(filters);
  }, [filters, fetchJobs]);

  const loadMore = useCallback(() => {
    if (nextCursor) {
      fetchJobs({ ...filtersRef.current, cursor: nextCursor }, true);
    }
  }, [nextCursor, fetchJobs]);

  const refetch = useCallback(() => {
    setJobs([]);
    setNextCursor(null);
    fetchJobs(filtersRef.current);
  }, [fetchJobs]);

  return { jobs, loading, error, nextCursor, loadMore, refetch };
}
