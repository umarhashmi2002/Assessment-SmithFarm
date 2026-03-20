import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import Knex from 'knex';
import { up } from '../../src/db/migrations/001_create_tables.js';
import type { Express } from 'express';
import supertest from 'supertest';

const testDb = Knex({
  client: 'better-sqlite3',
  connection: { filename: ':memory:' },
  useNullAsDefault: true,
});

vi.mock('../../src/db/connection.js', () => ({ db: testDb }));
vi.mock('../../src/config.js', () => ({
  config: {
    port: 3000,
    databasePath: ':memory:',
    teamsWebhookUrl: '',
  },
}));

const { app } = await import('../../src/app.js') as { app: Express };

const request = supertest(app);

const validPayload = {
  status: 'success',
  pipeline: 'oracle-inventory-sync',
  source: 'oracle',
  recordsProcessed: 1500,
  durationMs: 30000,
};

describe('Jobs API Integration', () => {
  beforeAll(async () => {
    await up(testDb);
  });

  beforeEach(async () => {
    await testDb('webhook_logs').del();
    await testDb('alerts').del();
    await testDb('etl_jobs').del();
  });

  afterAll(async () => {
    await testDb.destroy();
  });

  describe('POST /jobs/:jobId/status', () => {
    it('should return 201 for a valid payload', async () => {
      const res = await request.post('/jobs/job-1/status').send(validPayload);

      expect(res.status).toBe(201);
      expect(res.body.jobId).toBe('job-1');
      expect(res.body.status).toBe('success');
      expect(res.body.pipeline).toBe('oracle-inventory-sync');
      expect(res.body.source).toBe('oracle');
      expect(res.body.recordsProcessed).toBe(1500);
      expect(res.body.durationMs).toBe(30000);
      expect(res.body.id).toBeDefined();
      expect(res.body.timestamp).toBeDefined();
    });

    it('should return 400 for an invalid status value', async () => {
      const res = await request
        .post('/jobs/job-bad-status/status')
        .send({ ...validPayload, status: 'completed' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation Error');
    });

    it('should return 400 for an invalid source value', async () => {
      const res = await request
        .post('/jobs/job-bad-source/status')
        .send({ ...validPayload, source: 'mysql' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation Error');
    });

    it('should return 400 when a required field is missing', async () => {
      const { pipeline, ...missingPipeline } = validPayload;
      const res = await request
        .post('/jobs/job-missing/status')
        .send(missingPipeline);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation Error');
    });

    it('should create an alert when status is failure', async () => {
      const res = await request.post('/jobs/job-fail/status').send({
        ...validPayload,
        status: 'failure',
        errorMessage: 'Connection timeout',
      });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('failure');

      // Verify alert was created
      const alerts = await testDb('alerts').where({ jobId: 'job-fail' });
      expect(alerts).toHaveLength(1);
      expect(alerts[0].acknowledged).toBe(0);
    });
  });

  describe('GET /jobs', () => {
    it('should return paginated results', async () => {
      // Insert 5 jobs
      for (let i = 0; i < 5; i++) {
        await request.post(`/jobs/page-job-${i}/status`).send(validPayload);
      }

      const res = await request.get('/jobs?limit=3');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(3);
      expect(res.body.total).toBe(5);
      expect(res.body.nextCursor).toBeDefined();
    });

    it('should filter by status', async () => {
      await request.post('/jobs/s-1/status').send({ ...validPayload, status: 'success' });
      await request.post('/jobs/s-2/status').send({ ...validPayload, status: 'failure', errorMessage: 'err' });
      await request.post('/jobs/s-3/status').send({ ...validPayload, status: 'running' });

      const res = await request.get('/jobs?status=failure');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].status).toBe('failure');
    });

    it('should filter by pipeline', async () => {
      await request.post('/jobs/p-1/status').send({ ...validPayload, pipeline: 'oracle-sync' });
      await request.post('/jobs/p-2/status').send({ ...validPayload, pipeline: 'doris-etl' });

      const res = await request.get('/jobs?pipeline=oracle-sync');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].pipeline).toBe('oracle-sync');
    });

    it('should support cursor-based pagination', async () => {
      for (let i = 0; i < 5; i++) {
        await request.post(`/jobs/cur-${i}/status`).send(validPayload);
      }

      const page1 = await request.get('/jobs?limit=3');
      expect(page1.body.data).toHaveLength(3);
      expect(page1.body.nextCursor).toBeDefined();

      const page2 = await request.get(`/jobs?limit=3&cursor=${page1.body.nextCursor}`);
      expect(page2.body.data).toHaveLength(2);

      // No overlap
      const ids1 = page1.body.data.map((j: any) => j.jobId);
      const ids2 = page2.body.data.map((j: any) => j.jobId);
      const allIds = [...ids1, ...ids2];
      expect(new Set(allIds).size).toBe(5);
    });
  });

  describe('GET /jobs/:jobId', () => {
    it('should return 200 with the job record', async () => {
      await request.post('/jobs/detail-1/status').send(validPayload);

      const res = await request.get('/jobs/detail-1');

      expect(res.status).toBe(200);
      expect(res.body.jobId).toBe('detail-1');
      expect(res.body.status).toBe('success');
    });

    it('should return 404 for a non-existent jobId', async () => {
      const res = await request.get('/jobs/non-existent');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Not Found');
    });
  });
});
