/**
 * Global test setup for the Smith Farms ETL Monitor backend.
 *
 * Creates an in-memory SQLite database, runs migrations, and provides
 * table cleanup between tests. This is primarily used by integration tests
 * that use supertest against the Express app.
 *
 * Unit tests in tests/unit/ create their own in-memory databases and mock
 * the db module themselves — those mocks take precedence over this global one.
 */
import { beforeAll, beforeEach, afterAll } from 'vitest';
import Knex from 'knex';
import { vi } from 'vitest';
import { up } from '../src/db/migrations/001_create_tables.js';

export const testDb = Knex({
  client: 'better-sqlite3',
  connection: { filename: ':memory:' },
  useNullAsDefault: true,
});

// Mock the db connection module so the Express app (and services) use
// the in-memory test database. Unit tests that call vi.mock() on the
// same module will override this with their own test db instance.
vi.mock('../src/db/connection.js', () => ({
  db: testDb,
}));

beforeAll(async () => {
  await up(testDb);
});

beforeEach(async () => {
  // Clean all tables between tests to ensure isolation.
  // Delete in order that respects logical dependencies.
  await testDb('webhook_logs').del();
  await testDb('alerts').del();
  await testDb('etl_jobs').del();
});

afterAll(async () => {
  await testDb.destroy();
});
