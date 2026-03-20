import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import Knex from 'knex';
import { up } from '../../src/db/migrations/001_create_tables.js';
import type { CreateJobStatusInput } from '../../src/types.js';

// We need to mock the db module so the service uses our test database
const testDb = Knex({
  client: 'better-sqlite3',
  connection: { filename: ':memory:' },
  useNullAsDefault: true,
});

// Mock the db connection before importing the service
import { vi } from 'vitest';
vi.mock('../../src/db/connection.js', () => ({
  db: testDb,
}));

// Import service after mock is set up
const { createOrUpdateJobStatus, getJob, listJobs } = await import(
  '../../src/services/jobService.js'
);

describe('JobService', () => {
  beforeAll(async () => {
    await up(testDb);
  });

  beforeEach(async () => {
    await testDb('alerts').del();
    await testDb('etl_jobs').del();
  });

  afterAll(async () => {
    await testDb.destroy();
  });

  const validPayload: CreateJobStatusInput = {
    status: 'success',
    pipeline: 'oracle-inventory-sync',
    source: 'oracle',
    recordsProcessed: 1500,
    durationMs: 30000,
  };

  describe('createOrUpdateJobStatus', () => {
    it('should create a new job with generated id and timestamp', async () => {
      const job = await createOrUpdateJobStatus('job-1', validPayload);

      expect(job.id).toBeDefined();
      expect(job.jobId).toBe('job-1');
      expect(job.status).toBe('success');
      expect(job.pipeline).toBe('oracle-inventory-sync');
      expect(job.source).toBe('oracle');
      expect(job.recordsProcessed).toBe(1500);
      expect(job.durationMs).toBe(30000);
      expect(job.errorMessage).toBeNull();
      expect(job.timestamp).toBeDefined();
    });

    it('should update an existing job when same jobId is posted', async () => {
      await createOrUpdateJobStatus('job-2', validPayload);

      const updated = await createOrUpdateJobStatus('job-2', {
        ...validPayload,
        status: 'failure',
        errorMessage: 'Connection timeout',
        recordsProcessed: 0,
      });

      expect(updated.jobId).toBe('job-2');
      expect(updated.status).toBe('failure');
      expect(updated.errorMessage).toBe('Connection timeout');
      expect(updated.recordsProcessed).toBe(0);

      // Verify only one record exists
      const rows = await testDb('etl_jobs').where({ jobId: 'job-2' });
      expect(rows).toHaveLength(1);
    });

    it('should set errorMessage to null when not provided', async () => {
      const job = await createOrUpdateJobStatus('job-3', validPayload);
      expect(job.errorMessage).toBeNull();
    });

    it('should preserve errorMessage when provided', async () => {
      const job = await createOrUpdateJobStatus('job-4', {
        ...validPayload,
        status: 'failure',
        errorMessage: 'DB connection failed',
      });
      expect(job.errorMessage).toBe('DB connection failed');
    });
  });

  describe('getJob', () => {
    it('should return a job by jobId', async () => {
      await createOrUpdateJobStatus('job-get-1', validPayload);
      const job = await getJob('job-get-1');

      expect(job).not.toBeNull();
      expect(job!.jobId).toBe('job-get-1');
      expect(job!.status).toBe('success');
    });

    it('should return null for non-existent jobId', async () => {
      const job = await getJob('non-existent');
      expect(job).toBeNull();
    });
  });

  describe('listJobs', () => {
    it('should return paginated results with default limit of 20', async () => {
      // Insert 25 jobs
      for (let i = 0; i < 25; i++) {
        await createOrUpdateJobStatus(`list-job-${i}`, {
          ...validPayload,
          pipeline: `pipeline-${i}`,
        });
      }

      const result = await listJobs({});
      expect(result.data).toHaveLength(20);
      expect(result.total).toBe(25);
      expect(result.nextCursor).not.toBeNull();
    });

    it('should respect custom limit', async () => {
      for (let i = 0; i < 10; i++) {
        await createOrUpdateJobStatus(`limit-job-${i}`, validPayload);
      }

      const result = await listJobs({ limit: 5 });
      expect(result.data).toHaveLength(5);
      expect(result.total).toBe(10);
    });

    it('should cap limit at 100', async () => {
      const result = await listJobs({ limit: 200 });
      expect(result.data.length).toBeLessThanOrEqual(100);
    });

    it('should order by timestamp descending', async () => {
      for (let i = 0; i < 5; i++) {
        await createOrUpdateJobStatus(`order-job-${i}`, validPayload);
        // Small delay to ensure different timestamps
        await new Promise((r) => setTimeout(r, 10));
      }

      const result = await listJobs({});
      for (let i = 1; i < result.data.length; i++) {
        expect(result.data[i - 1].timestamp >= result.data[i].timestamp).toBe(true);
      }
    });

    it('should filter by status', async () => {
      await createOrUpdateJobStatus('status-1', { ...validPayload, status: 'success' });
      await createOrUpdateJobStatus('status-2', { ...validPayload, status: 'failure' });
      await createOrUpdateJobStatus('status-3', { ...validPayload, status: 'running' });

      const result = await listJobs({ status: 'failure' });
      expect(result.data).toHaveLength(1);
      expect(result.data[0].status).toBe('failure');
      expect(result.total).toBe(1);
    });

    it('should filter by pipeline', async () => {
      await createOrUpdateJobStatus('pipe-1', { ...validPayload, pipeline: 'oracle-sync' });
      await createOrUpdateJobStatus('pipe-2', { ...validPayload, pipeline: 'doris-etl' });

      const result = await listJobs({ pipeline: 'oracle-sync' });
      expect(result.data).toHaveLength(1);
      expect(result.data[0].pipeline).toBe('oracle-sync');
    });

    it('should filter by date range', async () => {
      // Insert jobs with specific timestamps
      await testDb('etl_jobs').insert({
        id: 'dr-id-1', jobId: 'dr-1', status: 'success', pipeline: 'test',
        source: 'oracle', recordsProcessed: 100, durationMs: 1000,
        timestamp: '2025-01-10T00:00:00.000Z',
      });
      await testDb('etl_jobs').insert({
        id: 'dr-id-2', jobId: 'dr-2', status: 'success', pipeline: 'test',
        source: 'oracle', recordsProcessed: 100, durationMs: 1000,
        timestamp: '2025-01-15T00:00:00.000Z',
      });
      await testDb('etl_jobs').insert({
        id: 'dr-id-3', jobId: 'dr-3', status: 'success', pipeline: 'test',
        source: 'oracle', recordsProcessed: 100, durationMs: 1000,
        timestamp: '2025-01-20T00:00:00.000Z',
      });

      const result = await listJobs({
        from: '2025-01-12T00:00:00.000Z',
        to: '2025-01-18T00:00:00.000Z',
      });
      expect(result.data).toHaveLength(1);
      expect(result.data[0].jobId).toBe('dr-2');
    });

    it('should support cursor-based pagination', async () => {
      for (let i = 0; i < 5; i++) {
        await createOrUpdateJobStatus(`cursor-job-${i}`, validPayload);
        await new Promise((r) => setTimeout(r, 10));
      }

      const page1 = await listJobs({ limit: 3 });
      expect(page1.data).toHaveLength(3);
      expect(page1.nextCursor).not.toBeNull();

      const page2 = await listJobs({ limit: 3, cursor: page1.nextCursor! });
      expect(page2.data).toHaveLength(2);
      expect(page2.nextCursor).toBeNull();

      // Ensure no overlap
      const page1Ids = page1.data.map((j) => j.id);
      const page2Ids = page2.data.map((j) => j.id);
      const allIds = [...page1Ids, ...page2Ids];
      expect(new Set(allIds).size).toBe(allIds.length);
    });

    it('should return hasUnacknowledgedAlert for jobs with unacked alerts', async () => {
      const job = await createOrUpdateJobStatus('alert-job-1', {
        ...validPayload,
        status: 'failure',
      });

      // Insert an unacknowledged alert
      await testDb('alerts').insert({
        id: 'alert-1',
        jobId: 'alert-job-1',
        acknowledged: 0,
        createdAt: new Date().toISOString(),
      });

      const result = await listJobs({});
      const alertJob = result.data.find((j) => j.jobId === 'alert-job-1');
      expect(alertJob).toBeDefined();
      expect(alertJob!.hasUnacknowledgedAlert).toBe(true);
    });

    it('should return hasUnacknowledgedAlert false for jobs without alerts', async () => {
      await createOrUpdateJobStatus('no-alert-job', validPayload);

      const result = await listJobs({});
      const job = result.data.find((j) => j.jobId === 'no-alert-job');
      expect(job).toBeDefined();
      expect(job!.hasUnacknowledgedAlert).toBe(false);
    });

    it('should return null nextCursor when all results fit in one page', async () => {
      await createOrUpdateJobStatus('single-page-1', validPayload);
      await createOrUpdateJobStatus('single-page-2', validPayload);

      const result = await listJobs({ limit: 10 });
      expect(result.nextCursor).toBeNull();
    });
  });
});
