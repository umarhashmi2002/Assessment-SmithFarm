import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import Knex from 'knex';
import { vi } from 'vitest';
import { up } from '../../src/db/migrations/001_create_tables.js';
import type { EtlJob } from '../../src/types.js';

const testDb = Knex({
  client: 'better-sqlite3',
  connection: { filename: ':memory:' },
  useNullAsDefault: true,
});

vi.mock('../../src/db/connection.js', () => ({
  db: testDb,
}));

const { createAlert, acknowledgeAlert, getAlert } = await import(
  '../../src/services/alertService.js'
);
const { AlertNotFoundError, AlertAlreadyAcknowledgedError } = await import(
  '../../src/services/alertService.js'
);

const sampleJob: EtlJob = {
  id: 'job-uuid-1',
  jobId: 'job-1',
  status: 'failure',
  pipeline: 'oracle-inventory-sync',
  source: 'oracle',
  recordsProcessed: 0,
  durationMs: 5000,
  errorMessage: 'Connection timeout',
  timestamp: '2025-01-15T10:00:00.000Z',
};

describe('AlertService', () => {
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

  describe('createAlert', () => {
    it('should create an unacknowledged alert for a job', async () => {
      const alert = await createAlert('job-1', sampleJob);

      expect(alert.id).toBeDefined();
      expect(alert.jobId).toBe('job-1');
      expect(alert.acknowledged).toBe(false);
      expect(alert.acknowledgedAt).toBeNull();
      expect(alert.createdAt).toBeDefined();
    });

    it('should persist the alert in the database', async () => {
      const alert = await createAlert('job-2', sampleJob);

      const row = await testDb('alerts').where({ id: alert.id }).first();
      expect(row).toBeDefined();
      expect(row.jobId).toBe('job-2');
      expect(row.acknowledged).toBe(0);
    });

    it('should generate unique IDs for each alert', async () => {
      const alert1 = await createAlert('job-a', sampleJob);
      const alert2 = await createAlert('job-b', sampleJob);

      expect(alert1.id).not.toBe(alert2.id);
    });
  });

  describe('acknowledgeAlert', () => {
    it('should acknowledge an unacknowledged alert', async () => {
      const alert = await createAlert('job-ack-1', sampleJob);
      const acked = await acknowledgeAlert(alert.id);

      expect(acked.id).toBe(alert.id);
      expect(acked.acknowledged).toBe(true);
      expect(acked.acknowledgedAt).toBeDefined();
      expect(acked.acknowledgedAt).not.toBeNull();
    });

    it('should persist acknowledgment in the database', async () => {
      const alert = await createAlert('job-ack-2', sampleJob);
      await acknowledgeAlert(alert.id);

      const row = await testDb('alerts').where({ id: alert.id }).first();
      expect(row.acknowledged).toBe(1);
      expect(row.acknowledgedAt).toBeDefined();
    });

    it('should throw AlertNotFoundError for non-existent alert', async () => {
      await expect(acknowledgeAlert('non-existent-id')).rejects.toThrow(AlertNotFoundError);
      await expect(acknowledgeAlert('non-existent-id')).rejects.toThrow(
        "Alert with id 'non-existent-id' not found",
      );
    });

    it('should have statusCode 404 on AlertNotFoundError', async () => {
      try {
        await acknowledgeAlert('missing-id');
      } catch (err: any) {
        expect(err.statusCode).toBe(404);
      }
    });

    it('should throw AlertAlreadyAcknowledgedError for already acknowledged alert', async () => {
      const alert = await createAlert('job-ack-3', sampleJob);
      await acknowledgeAlert(alert.id);

      await expect(acknowledgeAlert(alert.id)).rejects.toThrow(AlertAlreadyAcknowledgedError);
      await expect(acknowledgeAlert(alert.id)).rejects.toThrow(
        `Alert with id '${alert.id}' is already acknowledged`,
      );
    });

    it('should have statusCode 409 on AlertAlreadyAcknowledgedError', async () => {
      const alert = await createAlert('job-ack-4', sampleJob);
      await acknowledgeAlert(alert.id);

      try {
        await acknowledgeAlert(alert.id);
      } catch (err: any) {
        expect(err.statusCode).toBe(409);
      }
    });
  });

  describe('getAlert', () => {
    it('should return an alert by id', async () => {
      const created = await createAlert('job-get-1', sampleJob);
      const alert = await getAlert(created.id);

      expect(alert).not.toBeNull();
      expect(alert!.id).toBe(created.id);
      expect(alert!.jobId).toBe('job-get-1');
      expect(alert!.acknowledged).toBe(false);
    });

    it('should return null for non-existent alert', async () => {
      const alert = await getAlert('does-not-exist');
      expect(alert).toBeNull();
    });

    it('should reflect acknowledged state after acknowledgment', async () => {
      const created = await createAlert('job-get-2', sampleJob);
      await acknowledgeAlert(created.id);

      const alert = await getAlert(created.id);
      expect(alert).not.toBeNull();
      expect(alert!.acknowledged).toBe(true);
      expect(alert!.acknowledgedAt).not.toBeNull();
    });
  });
});
