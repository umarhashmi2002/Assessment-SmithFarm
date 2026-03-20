import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import HealthOverview from '../../src/components/HealthOverview';
import type { HealthCheckResult } from '../../src/types';

const allHealthy: HealthCheckResult = {
  status: 'healthy',
  components: {
    database: { status: 'healthy', message: 'SQLite connection OK' },
    kubernetes: { status: 'healthy', message: 'All pods running' },
    airflow: { status: 'healthy', message: 'Scheduler active' },
  },
  timestamp: '2025-01-15T10:00:00.000Z',
};

const degraded: HealthCheckResult = {
  status: 'degraded',
  components: {
    database: { status: 'healthy', message: 'SQLite connection OK' },
    kubernetes: { status: 'unhealthy', message: 'Pod crash loop' },
    airflow: { status: 'healthy', message: 'Scheduler active' },
  },
  timestamp: '2025-01-15T10:00:00.000Z',
};

// Mock the useHealth hook
vi.mock('../../src/hooks/useHealth', () => ({
  useHealth: vi.fn(),
}));

import { useHealth } from '../../src/hooks/useHealth';
const mockUseHealth = vi.mocked(useHealth);

describe('HealthOverview', () => {
  it('renders all three component statuses when healthy', () => {
    mockUseHealth.mockReturnValue({ health: allHealthy, loading: false, error: null });
    render(<HealthOverview />);
    expect(screen.getByTestId('health-database')).toBeInTheDocument();
    expect(screen.getByTestId('health-kubernetes')).toBeInTheDocument();
    expect(screen.getByTestId('health-airflow')).toBeInTheDocument();
  });

  it('shows distinct indicators for healthy components (green dots)', () => {
    mockUseHealth.mockReturnValue({ health: allHealthy, loading: false, error: null });
    render(<HealthOverview />);
    const dbEl = screen.getByTestId('health-database');
    const dot = dbEl.querySelector('span.rounded-full');
    expect(dot?.className).toContain('bg-green-500');
  });

  it('shows distinct indicators for unhealthy components (red dots)', () => {
    mockUseHealth.mockReturnValue({ health: degraded, loading: false, error: null });
    render(<HealthOverview />);
    const k8sEl = screen.getByTestId('health-kubernetes');
    const dot = k8sEl.querySelector('span.rounded-full');
    expect(dot?.className).toContain('bg-red-500');
  });

  it('does not show degraded warning when all healthy', () => {
    mockUseHealth.mockReturnValue({ health: allHealthy, loading: false, error: null });
    render(<HealthOverview />);
    expect(screen.queryByTestId('health-degraded-warning')).not.toBeInTheDocument();
  });

  it('shows degraded warning banner when status is degraded', () => {
    mockUseHealth.mockReturnValue({ health: degraded, loading: false, error: null });
    render(<HealthOverview />);
    expect(screen.getByTestId('health-degraded-warning')).toBeInTheDocument();
    expect(screen.getByText('Degraded')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    mockUseHealth.mockReturnValue({ health: null, loading: true, error: null });
    render(<HealthOverview />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });
});
