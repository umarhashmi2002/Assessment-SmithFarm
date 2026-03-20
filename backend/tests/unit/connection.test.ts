import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import Knex from 'knex';
import { up, down } from '../../src/db/migrations/001_create_tables.js';

describe('Database connection and migrations', () => {
  const testDb = Knex({
    client: 'better-sqlite3',
    connection: { filename: ':memory:' },
    useNullAsDefault: true,
  });

  beforeAll(async () => {
    await up(testDb);
  });

  afterAll(async () => {
    await testDb.destroy();
  });

  it('should create all three tables', async () => {
    const tables = await testDb.raw(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    );
    const tableNames = tables.map((r: { name: string }) => r.name);
    expect(tableNames).toContain('etl_jobs');
    expect(tableNames).toContain('alerts');
    expect(tableNames).toContain('webhook_logs');
  });

  it('should create etl_jobs table with correct columns', async () => {
    const columns = await testDb.raw("PRAGMA table_info('etl_jobs')");
    const colNames = columns.map((c: { name: string }) => c.name);
    expect(colNames).toEqual([
      'id', 'jobId', 'status', 'pipeline', 'source',
      'recordsProcessed', 'durationMs', 'errorMessage', 'timestamp',
    ]);
  });

  it('should create alerts table with correct columns', async () => {
    const columns = await testDb.raw("PRAGMA table_info('alerts')");
    const colNames = columns.map((c: { name: string }) => c.name);
    expect(colNames).toEqual(['id', 'jobId', 'acknowledged', 'acknowledgedAt', 'createdAt']);
  });

  it('should create webhook_logs table with correct columns', async () => {
    const columns = await testDb.raw("PRAGMA table_info('webhook_logs')");
    const colNames = columns.map((c: { name: string }) => c.name);
    expect(colNames).toEqual(['id', 'jobId', 'payload', 'httpStatus', 'response', 'createdAt']);
  });

  it('should enforce unique constraint on etl_jobs.jobId', async () => {
    await testDb('etl_jobs').insert({
      id: 'test-1', jobId: 'job-1', status: 'success', pipeline: 'test',
      source: 'oracle', recordsProcessed: 100, durationMs: 1000, timestamp: new Date().toISOString(),
    });

    await expect(
      testDb('etl_jobs').insert({
        id: 'test-2', jobId: 'job-1', status: 'failure', pipeline: 'test',
        source: 'oracle', recordsProcessed: 50, durationMs: 500, timestamp: new Date().toISOString(),
      })
    ).rejects.toThrow();
  });

  it('should support down migration', async () => {
    await down(testDb);

    const tables = await testDb.raw(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    );
    expect(tables).toHaveLength(0);
  });
});
