import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import fc from 'fast-check';
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

/**
 * Property 1: Job status round-trip
 *
 * For any valid CreateJobStatusInput payload, posting it to POST /jobs/:jobId/status
 * and then retrieving it via GET /jobs/:jobId should return a record with equivalent
 * jobId, status, pipeline, source, recordsProcessed, durationMs, and errorMessage fields.
 *
 * **Validates: Requirements 1.1, 4.1, 11.4**
 */
describe('Property 1: Job status round-trip', () => {
  let jobCounter = 0;

  beforeAll(async () => {
    await up(testDb);
  });

  beforeEach(async () => {
    await testDb('webhook_logs').del();
    await testDb('alerts').del();
    await testDb('etl_jobs').del();
    jobCounter = 0;
  });

  afterAll(async () => {
    await testDb.destroy();
  });

  const validPayloadArb = fc.record({
    status: fc.constantFrom('success' as const, 'failure' as const, 'running' as const),
    pipeline: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
    source: fc.constantFrom('oracle' as const, 'doris' as const, 'azure_db' as const),
    recordsProcessed: fc.nat({ max: 100000 }),
    durationMs: fc.nat({ max: 1000000 }),
    errorMessage: fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: undefined }),
  });

  it('should round-trip any valid job status payload through POST then GET', async () => {
    await fc.assert(
      fc.asyncProperty(validPayloadArb, async (payload) => {
        const jobId = `prop-rt-${++jobCounter}`;

        // POST the job status
        const postRes = await request.post(`/jobs/${jobId}/status`).send(payload);
        expect(postRes.status).toBe(201);

        // GET the job back
        const getRes = await request.get(`/jobs/${jobId}`);
        expect(getRes.status).toBe(200);

        const job = getRes.body;

        // Verify field equivalence
        expect(job.jobId).toBe(jobId);
        expect(job.status).toBe(payload.status);
        expect(job.pipeline).toBe(payload.pipeline);
        expect(job.source).toBe(payload.source);
        expect(job.recordsProcessed).toBe(payload.recordsProcessed);
        expect(job.durationMs).toBe(payload.durationMs);
        expect(job.errorMessage).toBe(payload.errorMessage ?? null);

        // Verify server-generated fields exist
        expect(job.id).toBeDefined();
        expect(job.timestamp).toBeDefined();

        // Clean up between iterations to avoid unique constraint conflicts
        await testDb('webhook_logs').del();
        await testDb('alerts').del();
        await testDb('etl_jobs').del();
      }),
      { numRuns: 100 },
    );
  });
});
