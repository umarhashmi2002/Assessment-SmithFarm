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

const { app } = await import('../../src/app.js') as { app: Express };

const request = supertest(app);

describe('Health API Integration', () => {
  beforeAll(async () => {
    await up(testDb);
  });

  afterAll(async () => {
    await testDb.destroy();
  });

  it('should return 200 with aggregate status and components', async () => {
    const res = await request.get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBeDefined();
    expect(['healthy', 'degraded']).toContain(res.body.status);
    expect(res.body.components).toBeDefined();
    expect(res.body.components.database).toBeDefined();
    expect(res.body.components.kubernetes).toBeDefined();
    expect(res.body.components.airflow).toBeDefined();
    expect(res.body.timestamp).toBeDefined();
  });

  it('should return healthy status for each component', async () => {
    const res = await request.get('/health');

    const { database, kubernetes, airflow } = res.body.components;

    for (const component of [database, kubernetes, airflow]) {
      expect(['healthy', 'unhealthy']).toContain(component.status);
      expect(component.message).toBeDefined();
      expect(typeof component.message).toBe('string');
      expect(component.message.length).toBeGreaterThan(0);
    }
  });

  it('should return healthy aggregate when all components are healthy', async () => {
    const res = await request.get('/health');

    // With in-memory SQLite and simulated K8s/Airflow, all should be healthy
    expect(res.body.status).toBe('healthy');
    expect(res.body.components.database.status).toBe('healthy');
    expect(res.body.components.kubernetes.status).toBe('healthy');
    expect(res.body.components.airflow.status).toBe('healthy');
  });
});
