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
 * Property 4: Failure status creates unacknowledged alert
 *
 * For any valid job status payload with status set to "failure", posting it to
 * POST /jobs/:jobId/status should result in an Alert record existing for that
 * jobId with acknowledged set to false.
 *
 * **Validates: Requirements 1.5**
 */
describe('Property 4: Failure status creates unacknowledged alert', () => {
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

  const failurePayloadArb = fc.record({
    status: fc.constant('failure' as const),
    pipeline: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
    source: fc.constantFrom('oracle' as const, 'doris' as const, 'azure_db' as const),
    recordsProcessed: fc.nat({ max: 100000 }),
    durationMs: fc.nat({ max: 1000000 }),
    errorMessage: fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: undefined }),
  });

  it('should create an unacknowledged alert for any failure job status', async () => {
    await fc.assert(
      fc.asyncProperty(failurePayloadArb, async (payload) => {
        const jobId = `prop-fail-alert-${++jobCounter}`;

        // POST the failure job status
        const postRes = await request.post(`/jobs/${jobId}/status`).send(payload);
        expect(postRes.status).toBe(201);

        // Query the alerts table directly to verify an alert was created
        const alertRow = await testDb('alerts').where({ jobId }).first();

        expect(alertRow).toBeDefined();
        expect(alertRow.jobId).toBe(jobId);
        expect(alertRow.acknowledged).toBe(0);
        expect(alertRow.acknowledgedAt).toBeNull();
        expect(alertRow.id).toBeDefined();
        expect(alertRow.createdAt).toBeDefined();

        // Clean up between iterations
        await testDb('webhook_logs').del();
        await testDb('alerts').del();
        await testDb('etl_jobs').del();
      }),
      { numRuns: 100 },
    );
  });
});
