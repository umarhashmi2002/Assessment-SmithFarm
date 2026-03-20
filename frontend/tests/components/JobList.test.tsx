import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import JobList from '../../src/components/JobList';
import type { EtlJobWithAlert } from '../../src/types';

const mockJobs: EtlJobWithAlert[] = [
  {
    id: '1',
    jobId: 'job-success-1',
    status: 'success',
    pipeline: 'oracle-inventory-sync',
    source: 'oracle',
    recordsProcessed: 1500,
    durationMs: 3200,
    errorMessage: null,
    timestamp: '2025-01-15T10:00:00.000Z',
    hasUnacknowledgedAlert: false,
  },
  {
    id: '2',
    jobId: 'job-failure-1',
    status: 'failure',
    pipeline: 'doris-sales-etl',
    source: 'doris',
    recordsProcessed: 0,
    durationMs: 1200,
    errorMessage: 'Connection timeout',
    timestamp: '2025-01-15T09:00:00.000Z',
    hasUnacknowledgedAlert: true,
  },
  {
    id: '3',
    jobId: 'job-running-1',
    status: 'running',
    pipeline: 'azure-reporting-load',
    source: 'azure_db',
    recordsProcessed: 500,
    durationMs: 800,
    errorMessage: null,
    timestamp: '2025-01-15T08:00:00.000Z',
    hasUnacknowledgedAlert: false,
  },
];

function renderJobList(props: Partial<Parameters<typeof JobList>[0]> = {}) {
  return render(
    <MemoryRouter>
      <JobList
        jobs={mockJobs}
        loading={false}
        error={null}
        onLoadMore={vi.fn()}
        hasMore={false}
        {...props}
      />
    </MemoryRouter>,
  );
}

describe('JobList', () => {
  it('renders a row for each job', () => {
    renderJobList();
    expect(screen.getByTestId('job-row-job-success-1')).toBeInTheDocument();
    expect(screen.getByTestId('job-row-job-failure-1')).toBeInTheDocument();
    expect(screen.getByTestId('job-row-job-running-1')).toBeInTheDocument();
  });

  it('renders correct status indicators for each status', () => {
    renderJobList();
    const successDots = screen.getAllByTestId('status-success');
    const failureDots = screen.getAllByTestId('status-failure');
    const runningDots = screen.getAllByTestId('status-running');

    expect(successDots.length).toBeGreaterThanOrEqual(1);
    expect(failureDots.length).toBeGreaterThanOrEqual(1);
    expect(runningDots.length).toBeGreaterThanOrEqual(1);
  });

  it('shows alert badge only for jobs with unacknowledged alerts', () => {
    renderJobList();
    const alertBadges = screen.getAllByTestId('alert-badge');
    expect(alertBadges).toHaveLength(1);
    // The badge should be inside the failure job row
    const failureRow = screen.getByTestId('job-row-job-failure-1');
    expect(failureRow).toContainElement(alertBadges[0]);
  });

  it('displays job content fields (jobId, pipeline, source)', () => {
    renderJobList();
    expect(screen.getByText('job-success-1')).toBeInTheDocument();
    expect(screen.getByText('oracle-inventory-sync')).toBeInTheDocument();
    expect(screen.getByText('doris-sales-etl')).toBeInTheDocument();
    expect(screen.getByText('azure-reporting-load')).toBeInTheDocument();
  });

  it('shows loading text when loading', () => {
    renderJobList({ loading: true });
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('shows error state with message', () => {
    renderJobList({ jobs: [], error: 'Network error' });
    expect(screen.getByText('Network error')).toBeInTheDocument();
    expect(screen.getByText('Error loading jobs')).toBeInTheDocument();
  });

  it('shows empty state when no jobs and not loading', () => {
    renderJobList({ jobs: [], loading: false });
    expect(screen.getByText(/No jobs found/)).toBeInTheDocument();
  });
});
