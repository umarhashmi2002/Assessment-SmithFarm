import { describe, it, expect } from 'vitest';
import { createJobStatusSchema, jobListQuerySchema } from '../../src/routes/jobs.js';

describe('createJobStatusSchema', () => {
  const validPayload = {
    status: 'success',
    pipeline: 'oracle-inventory-sync',
    source: 'oracle',
    recordsProcessed: 1500,
    durationMs: 30000,
  };

  it('should accept a valid payload', () => {
    const result = createJobStatusSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it('should accept a valid payload with optional errorMessage', () => {
    const result = createJobStatusSchema.safeParse({
      ...validPayload,
      status: 'failure',
      errorMessage: 'Connection timeout',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.errorMessage).toBe('Connection timeout');
    }
  });

  it('should accept all valid status values', () => {
    for (const status of ['success', 'failure', 'running']) {
      const result = createJobStatusSchema.safeParse({ ...validPayload, status });
      expect(result.success).toBe(true);
    }
  });

  it('should accept all valid source values', () => {
    for (const source of ['oracle', 'doris', 'azure_db']) {
      const result = createJobStatusSchema.safeParse({ ...validPayload, source });
      expect(result.success).toBe(true);
    }
  });

  it('should reject an invalid status value', () => {
    const result = createJobStatusSchema.safeParse({ ...validPayload, status: 'completed' });
    expect(result.success).toBe(false);
  });

  it('should reject an invalid source value', () => {
    const result = createJobStatusSchema.safeParse({ ...validPayload, source: 'mysql' });
    expect(result.success).toBe(false);
  });

  it('should reject when status is missing', () => {
    const { status, ...rest } = validPayload;
    const result = createJobStatusSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('should reject when pipeline is missing', () => {
    const { pipeline, ...rest } = validPayload;
    const result = createJobStatusSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('should reject when source is missing', () => {
    const { source, ...rest } = validPayload;
    const result = createJobStatusSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('should reject when recordsProcessed is missing', () => {
    const { recordsProcessed, ...rest } = validPayload;
    const result = createJobStatusSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('should reject when durationMs is missing', () => {
    const { durationMs, ...rest } = validPayload;
    const result = createJobStatusSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('should reject an empty pipeline string', () => {
    const result = createJobStatusSchema.safeParse({ ...validPayload, pipeline: '' });
    expect(result.success).toBe(false);
  });

  it('should reject negative recordsProcessed', () => {
    const result = createJobStatusSchema.safeParse({ ...validPayload, recordsProcessed: -1 });
    expect(result.success).toBe(false);
  });

  it('should reject negative durationMs', () => {
    const result = createJobStatusSchema.safeParse({ ...validPayload, durationMs: -100 });
    expect(result.success).toBe(false);
  });

  it('should accept zero for recordsProcessed and durationMs', () => {
    const result = createJobStatusSchema.safeParse({
      ...validPayload,
      recordsProcessed: 0,
      durationMs: 0,
    });
    expect(result.success).toBe(true);
  });
});

describe('jobListQuerySchema', () => {
  it('should accept an empty query (all defaults)', () => {
    const result = jobListQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(20);
    }
  });

  it('should accept a valid query with all fields', () => {
    const result = jobListQuerySchema.safeParse({
      limit: '50',
      cursor: 'abc123',
      status: 'failure',
      pipeline: 'oracle-inventory-sync',
      from: '2025-01-01T00:00:00.000Z',
      to: '2025-01-31T23:59:59.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('should coerce string limit to number', () => {
    const result = jobListQuerySchema.safeParse({ limit: '10' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(10);
    }
  });

  it('should reject limit below 1', () => {
    const result = jobListQuerySchema.safeParse({ limit: '0' });
    expect(result.success).toBe(false);
  });

  it('should reject limit above 100', () => {
    const result = jobListQuerySchema.safeParse({ limit: '101' });
    expect(result.success).toBe(false);
  });

  it('should accept limit at boundaries (1 and 100)', () => {
    const result1 = jobListQuerySchema.safeParse({ limit: '1' });
    expect(result1.success).toBe(true);

    const result100 = jobListQuerySchema.safeParse({ limit: '100' });
    expect(result100.success).toBe(true);
  });

  it('should accept valid status filter values', () => {
    for (const status of ['success', 'failure', 'running']) {
      const result = jobListQuerySchema.safeParse({ status });
      expect(result.success).toBe(true);
    }
  });

  it('should reject an invalid status filter', () => {
    const result = jobListQuerySchema.safeParse({ status: 'completed' });
    expect(result.success).toBe(false);
  });

  it('should accept optional cursor and pipeline', () => {
    const result = jobListQuerySchema.safeParse({
      cursor: 'someCursorToken',
      pipeline: 'doris-sales-etl',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.cursor).toBe('someCursorToken');
      expect(result.data.pipeline).toBe('doris-sales-etl');
    }
  });

  it('should reject invalid datetime for from', () => {
    const result = jobListQuerySchema.safeParse({ from: 'not-a-date' });
    expect(result.success).toBe(false);
  });

  it('should reject invalid datetime for to', () => {
    const result = jobListQuerySchema.safeParse({ to: '2025-13-01' });
    expect(result.success).toBe(false);
  });
});
