import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
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
vi.mock('axios');

const { app } = await import('../../src/app.js') as { app: Express };

const request = supertest(app);

describe('Webhooks API Integration', () => {
  beforeAll(async () => {
    await up(testDb);
  });

  afterAll(async () => {
    await testDb.destroy();
  });

  describe('POST /webhooks/teams/test', () => {
    it('should echo the received payload', async () => {
      const payload = {
        '@type': 'MessageCard',
        themeColor: 'FF0000',
        summary: 'Test alert',
        sections: [
          {
            activityTitle: 'Test Pipeline Failure',
            facts: [{ name: 'Job ID', value: 'test-123' }],
            markdown: true,
          },
        ],
      };

      const res = await request
        .post('/webhooks/teams/test')
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.received).toBe(true);
      expect(res.body.payload).toEqual(payload);
    });
  });
});
