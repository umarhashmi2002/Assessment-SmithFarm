import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
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

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Property 12: Correlation ID handling
 *
 * For any API request, the response should include an X-Correlation-ID header.
 * If the request included an X-Correlation-ID header, the response header value
 * should match the request value. If the request did not include one, the response
 * should contain a valid UUID.
 *
 * **Validates: Requirements 9.1, 9.2, 9.3, 9.4**
 */
describe('Property 12: Correlation ID handling', () => {
  beforeAll(async () => {
    await up(testDb);
  });

  afterAll(async () => {
    await testDb.destroy();
  });

  it('should echo back the provided X-Correlation-ID header', async () => {
    // Generate strings without leading/trailing whitespace since HTTP headers trim whitespace
    const correlationIdArb = fc.string({ minLength: 1, maxLength: 200 })
      .map(s => s.trim())
      .filter(s => s.length > 0);

    await fc.assert(
      fc.asyncProperty(correlationIdArb, async (correlationId) => {
          const res = await request
            .get('/health')
            .set('X-Correlation-ID', correlationId);

          expect(res.status).toBe(200);
          expect(res.headers['x-correlation-id']).toBe(correlationId);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should generate a valid UUID when no X-Correlation-ID is provided', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(null), async () => {
        const res = await request.get('/health');

        expect(res.status).toBe(200);
        const responseCorrelationId = res.headers['x-correlation-id'];
        expect(responseCorrelationId).toBeDefined();
        expect(responseCorrelationId).toMatch(UUID_REGEX);
      }),
      { numRuns: 100 },
    );
  });
});
