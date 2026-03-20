import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import JobList from '../../src/components/JobList';
import HealthOverview from '../../src/components/HealthOverview';
import type { EtlJobWithAlert, JobStatus, DataSource, HealthCheckResult } from '../../src/types';

// Mock useHealth hook for HealthOverview
vi.mock('../../src/hooks/useHealth', () => ({
  useHealth: vi.fn(),
}));

import { useHealth } from '../../src/hooks/useHealth';
const mockUseHealth = vi.mocked(useHealth);

// --- Arbitraries ---

const arbJobStatus: fc.Arbitrary<JobStatus> = fc.constantFrom('success', 'failure', 'running');
const arbDataSource: fc.Arbitrary<DataSource> = fc.constantFrom('oracle', 'doris', 'azure_db');

const arbEtlJobWithAlert: fc.Arbitrary<EtlJobWithAlert> = fc.record({
  id: fc.uuid(),
  jobId: fc.stringMatching(/^job-[a-z0-9]{4,8}$/),
  status: arbJobStatus,
  pipeline: fc.constantFrom(
    'oracle-inventory-sync',
    'doris-sales-etl',
    'azure-reporting-load',
    'oracle-supplier-feed',
  ),
  source: arbDataSource,
  recordsProcessed: fc.nat({ max: 100000 }),
  durationMs: fc.nat({ max: 600000 }),
  errorMessage: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: null }),
  timestamp: fc.date({ min: new Date('2025-01-01'), max: new Date('2025-12-31') }).map((d) => d.toISOString()),
  hasUnacknowledgedAlert: fc.boolean(),
});

const arbComponentStatus = fc.constantFrom('healthy' as const, 'unhealthy' as const);

const arbHealthCheckResult: fc.Arbitrary<HealthCheckResult> = fc.record({
  database: arbComponentStatus,
  kubernetes: arbComponentStatus,
  airflow: arbComponentStatus,
}).map(({ database, kubernetes, airflow }) => {
  const allHealthy = database === 'healthy' && kubernetes === 'healthy' && airflow === 'healthy';
  return {
    status: allHealthy ? 'healthy' : 'degraded',
    components: {
      database: { status: database, message: database === 'healthy' ? 'SQLite OK' : 'DB down' },
      kubernetes: { status: kubernetes, message: kubernetes === 'healthy' ? 'Pods running' : 'Pod crash' },
      airflow: { status: airflow, message: airflow === 'healthy' ? 'Scheduler active' : 'Scheduler down' },
    },
    timestamp: new Date().toISOString(),
  } satisfies HealthCheckResult;
});

// --- Helpers ---

const STATUS_CLASSES: Record<JobStatus, string> = {
  success: 'bg-green-500',
  failure: 'bg-red-500',
  running: 'bg-yellow-500',
};

function renderJobList(jobs: EtlJobWithAlert[]) {
  return render(
    <MemoryRouter>
      <JobList
        jobs={jobs}
        loading={false}
        error={null}
        onLoadMore={vi.fn()}
        hasMore={false}
      />
    </MemoryRouter>,
  );
}

// --- Property Tests ---

/**
 * Property 13: Job status visual indicators
 * For any ETL job rendered in JobList, the status indicator should have
 * a visually distinct color class corresponding to the job's status.
 *
 * **Validates: Requirements 7.1**
 */
describe('Property 13: Job status visual indicators', () => {
  it('each status produces a distinct color indicator', () => {
    fc.assert(
      fc.property(
        fc.array(arbEtlJobWithAlert, { minLength: 1, maxLength: 10 }),
        (jobs) => {
          // Ensure unique jobIds to avoid key collisions
          const uniqueJobs = jobs.reduce<EtlJobWithAlert[]>((acc, job, i) => {
            acc.push({ ...job, jobId: `${job.jobId}-${i}` });
            return acc;
          }, []);

          const { unmount } = renderJobList(uniqueJobs);

          for (const job of uniqueJobs) {
            const expectedClass = STATUS_CLASSES[job.status];
            const indicators = screen.getAllByTestId(`status-${job.status}`);
            // At least one indicator for this status should exist
            expect(indicators.length).toBeGreaterThanOrEqual(1);
            // Each indicator should have the correct color class
            for (const indicator of indicators) {
              expect(indicator.className).toContain(expectedClass);
            }
          }

          // Verify distinct statuses get distinct classes
          const presentStatuses = [...new Set(uniqueJobs.map((j) => j.status))];
          const presentClasses = presentStatuses.map((s) => STATUS_CLASSES[s]);
          expect(new Set(presentClasses).size).toBe(presentStatuses.length);

          unmount();
        },
      ),
      { numRuns: 100 },
    );
  });
});

/**
 * Property 14: Unacknowledged alert indicator
 * For any ETL job with hasUnacknowledgedAlert=true, an alert badge should
 * be present in its row. For false, no alert badge should be in that row.
 *
 * **Validates: Requirements 7.5**
 */
describe('Property 14: Unacknowledged alert indicator', () => {
  it('alert indicator present iff hasUnacknowledgedAlert is true', () => {
    fc.assert(
      fc.property(
        fc.array(arbEtlJobWithAlert, { minLength: 1, maxLength: 10 }),
        (jobs) => {
          const uniqueJobs = jobs.reduce<EtlJobWithAlert[]>((acc, job, i) => {
            acc.push({ ...job, jobId: `${job.jobId}-${i}` });
            return acc;
          }, []);

          const { unmount } = renderJobList(uniqueJobs);

          for (const job of uniqueJobs) {
            const row = screen.getByTestId(`job-row-${job.jobId}`);
            const alertBadge = within(row).queryByTestId('alert-badge');

            if (job.hasUnacknowledgedAlert) {
              expect(alertBadge).toBeInTheDocument();
            } else {
              expect(alertBadge).not.toBeInTheDocument();
            }
          }

          unmount();
        },
      ),
      { numRuns: 100 },
    );
  });
});

/**
 * Property 16: Health overview display
 * For any HealthCheckResult, the HealthOverview component should render
 * all three components (database, kubernetes, airflow) with correct
 * healthy/unhealthy indicators.
 *
 * **Validates: Requirements 8.1, 8.2**
 */
describe('Property 16: Health overview display', () => {
  it('all three components rendered with correct indicators', () => {
    fc.assert(
      fc.property(arbHealthCheckResult, (healthResult) => {
        mockUseHealth.mockReturnValue({ health: healthResult, loading: false, error: null });

        const { unmount } = render(<HealthOverview />);

        // All three components must be rendered
        const dbEl = screen.getByTestId('health-database');
        const k8sEl = screen.getByTestId('health-kubernetes');
        const airflowEl = screen.getByTestId('health-airflow');

        expect(dbEl).toBeInTheDocument();
        expect(k8sEl).toBeInTheDocument();
        expect(airflowEl).toBeInTheDocument();

        // Verify each component has the correct indicator color
        const componentMap = {
          database: dbEl,
          kubernetes: k8sEl,
          airflow: airflowEl,
        } as const;

        for (const [key, el] of Object.entries(componentMap)) {
          const compStatus = healthResult.components[key as keyof typeof healthResult.components].status;
          const dot = el.querySelector('span.rounded-full');
          expect(dot).not.toBeNull();
          if (compStatus === 'healthy') {
            expect(dot!.className).toContain('bg-green-500');
          } else {
            expect(dot!.className).toContain('bg-red-500');
          }
        }

        // Verify degraded warning presence
        if (healthResult.status === 'degraded') {
          expect(screen.getByTestId('health-degraded-warning')).toBeInTheDocument();
        } else {
          expect(screen.queryByTestId('health-degraded-warning')).not.toBeInTheDocument();
        }

        unmount();
      }),
      { numRuns: 100 },
    );
  });
});
