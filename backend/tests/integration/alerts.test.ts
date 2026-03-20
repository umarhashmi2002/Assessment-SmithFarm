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

describe('Alerts API Integration', () => {
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

  async function createFailureJobWithAlert(jobId: string): Promise<string> {
    // Create a failure job which auto-creates an alert
    await request.post(`/jobs/${jobId}/status`).send({
      status: 'failure',
      pipeline: 'oracle-inventory-sync',
      source: 'oracle',
      recordsProcessed: 0,
      durationMs: 5000,
      errorMessage: 'Connection timeout',
    });

    const alerts = await testDb('alerts').where({ jobId });
    return alerts[0].id;
  }

  describe('POST /alerts/acknowledge/:alertId', () => {
    it('should return 200 and acknowledge the alert', async () => {
      const alertId = await createFailureJobWithAlert('ack-job-1');

      const res = await request.post(`/alerts/acknowledge/${alertId}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(alertId);
      expect(res.body.acknowledged).toBe(true);
      expect(res.body.acknowledgedAt).toBeDefined();
    });

    it('should return 404 for a non-existent alertId', async () => {
      const res = await request.post('/alerts/acknowledge/non-existent-id');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('AlertNotFoundError');
    });

    it('should return 409 when alert is already acknowledged', async () => {
      const alertId = await createFailureJobWithAlert('ack-job-2');

      // First acknowledgment
      await request.post(`/alerts/acknowledge/${alertId}`);

      // Second acknowledgment
      const res = await request.post(`/alerts/acknowledge/${alertId}`);

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('AlertAlreadyAcknowledgedError');
    });
  });
});
