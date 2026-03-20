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
 * Property 2: Invalid enum values are rejected
 *
 * For any job status payload where the status field is not one of "success",
 * "failure", "running", or the source field is not one of "oracle", "doris",
 * "azure_db", posting to POST /jobs/:jobId/status should return a 400 response
 * with a descriptive validation error.
 *
 * **Validates: Requirements 1.2, 1.4**
 */
describe('Property 2: Invalid enum values are rejected', () => {
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

  const validStatuses = ['success', 'failure', 'running'];
  const validSources = ['oracle', 'doris', 'azure_db'];

  const invalidStatusArb = fc.string({ minLength: 1 }).filter(s => !validStatuses.includes(s));
  const invalidSourceArb = fc.string({ minLength: 1 }).filter(s => !validSources.includes(s));

  it('should reject any payload with an invalid status value', async () => {
    await fc.assert(
      fc.asyncProperty(invalidStatusArb, async (invalidStatus) => {
        const jobId = `prop-enum-status-${++jobCounter}`;

        const payload = {
          status: invalidStatus,
          pipeline: 'test-pipeline',
          source: 'oracle',
          recordsProcessed: 100,
          durationMs: 5000,
        };

        const res = await request.post(`/jobs/${jobId}/status`).send(payload);

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Validation Error');
      }),
      { numRuns: 100 },
    );
  });

  it('should reject any payload with an invalid source value', async () => {
    await fc.assert(
      fc.asyncProperty(invalidSourceArb, async (invalidSource) => {
        const jobId = `prop-enum-source-${++jobCounter}`;

        const payload = {
          status: 'success',
          pipeline: 'test-pipeline',
          source: invalidSource,
          recordsProcessed: 100,
          durationMs: 5000,
        };

        const res = await request.post(`/jobs/${jobId}/status`).send(payload);

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Validation Error');
      }),
      { numRuns: 100 },
    );
  });
});
