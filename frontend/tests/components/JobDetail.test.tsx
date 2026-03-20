import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import JobDetail from '../../src/components/JobDetail';
import type { EtlJob } from '../../src/types';

const mockJob: EtlJob = {
  id: '1',
  jobId: 'job-detail-1',
  status: 'failure',
  pipeline: 'oracle-inventory-sync',
  source: 'oracle',
  recordsProcessed: 5000,
  durationMs: 12500,
  errorMessage: 'Connection timeout to Oracle DB',
  timestamp: '2025-01-15T10:30:00.000Z',
};

// Mock the useJobDetail hook
vi.mock('../../src/hooks/useJobDetail', () => ({
  useJobDetail: vi.fn(),
}));

import { useJobDetail } from '../../src/hooks/useJobDetail';
const mockUseJobDetail = vi.mocked(useJobDetail);

function renderJobDetail(jobId = 'job-detail-1') {
  return render(
    <MemoryRouter initialEntries={[`/jobs/${jobId}`]}>
      <Routes>
        <Route path="/jobs/:jobId" element={<JobDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('JobDetail', () => {
  it('renders all job fields', () => {
    mockUseJobDetail.mockReturnValue({ job: mockJob, loading: false, error: null });
    renderJobDetail();
    expect(screen.getAllByText('job-detail-1').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('oracle-inventory-sync')).toBeInTheDocument();
    expect(screen.getByText('oracle')).toBeInTheDocument();
    expect(screen.getByText('5,000')).toBeInTheDocument();
    expect(screen.getByText('12.5s')).toBeInTheDocument();
    expect(screen.getByText('Connection timeout to Oracle DB')).toBeInTheDocument();
  });

  it('renders status indicator', () => {
    mockUseJobDetail.mockReturnValue({ job: mockJob, loading: false, error: null });
    renderJobDetail();
    expect(screen.getByTestId('status-failure')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    mockUseJobDetail.mockReturnValue({ job: null, loading: true, error: null });
    renderJobDetail();
    expect(screen.getByTestId('loading')).toBeInTheDocument();
  });

  it('shows error state', () => {
    mockUseJobDetail.mockReturnValue({ job: null, loading: false, error: 'Server error' });
    renderJobDetail();
    expect(screen.getByTestId('error')).toBeInTheDocument();
    expect(screen.getByText('Server error')).toBeInTheDocument();
  });

  it('renders error message field when job has errorMessage', () => {
    mockUseJobDetail.mockReturnValue({ job: mockJob, loading: false, error: null });
    renderJobDetail();
    expect(screen.getByTestId('error-message')).toBeInTheDocument();
  });

  it('does not render error message field when job has no errorMessage', () => {
    const jobNoError = { ...mockJob, errorMessage: null };
    mockUseJobDetail.mockReturnValue({ job: jobNoError, loading: false, error: null });
    renderJobDetail();
    expect(screen.queryByTestId('error-message')).not.toBeInTheDocument();
  });
});
