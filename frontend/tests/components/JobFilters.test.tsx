import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import JobFilters from '../../src/components/JobFilters';
import type { JobFilters as JobFiltersType } from '../../src/types';

const defaultFilters: JobFiltersType = {};

function renderFilters(
  filters: JobFiltersType = defaultFilters,
  onChange = vi.fn(),
) {
  return { onChange, ...render(<JobFilters filters={filters} onChange={onChange} />) };
}

describe('JobFilters', () => {
  it('renders pipeline dropdown', () => {
    renderFilters();
    expect(screen.getByLabelText('Pipeline')).toBeInTheDocument();
  });

  it('renders status dropdown', () => {
    renderFilters();
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
  });

  it('renders from and to date inputs', () => {
    renderFilters();
    expect(screen.getByLabelText('From')).toBeInTheDocument();
    expect(screen.getByLabelText('To')).toBeInTheDocument();
  });

  it('calls onChange when pipeline filter changes', async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilters();
    await user.selectOptions(screen.getByLabelText('Pipeline'), 'doris-sales-etl');
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ pipeline: 'doris-sales-etl' }),
    );
  });

  it('calls onChange when status filter changes', async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilters();
    await user.selectOptions(screen.getByLabelText('Status'), 'failure');
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failure' }),
    );
  });

  it('resets cursor when filter changes', async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilters({ cursor: 'abc123' });
    await user.selectOptions(screen.getByLabelText('Status'), 'success');
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: undefined }),
    );
  });
});
