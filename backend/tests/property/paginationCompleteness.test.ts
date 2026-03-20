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
 * Property 7: Pagination completeness
 *
 * For any set of ETL jobs in the database, iterating through all pages using
 * the nextCursor from each response should yield every job exactly once, and
 * nextCursor should be null only on the final page.
 *
 * **Validates: Requirements 2.3, 2.7**
 */
describe('Property 7: Pagination completeness', () => {
  let iterationCounter = 0;

  beforeAll(async () => {
    await up(testDb);
  });

  beforeEach(async () => {
    await testDb('webhook_logs').del();
    await testDb('alerts').del();
    await testDb('etl_jobs').del();
    iterationCounter = 0;
  });

  afterAll(async () => {
    await testDb.destroy();
  });

  // Generate a random number of jobs (1-30)
  const jobCountArb = fc.integer({ min: 1, max: 30 });
  // Generate a random page size (1-10)
  const pageSizeArb = fc.integer({ min: 1, max: 10 });

  const validPayloadArb = fc.record({
    status: fc.constantFrom('success' as const, 'failure' as const, 'running' as const),
    pipeline: fc.constantFrom(
      'oracle-inventory-sync',
      'doris-sales-etl',
      'azure-reporting-load',
      'oracle-supplier-feed',
    ),
    source: fc.constantFrom('oracle' as const, 'doris' as const, 'azure_db' as const),
    recordsProcessed: fc.nat({ max: 100000 }),
    durationMs: fc.nat({ max: 1000000 }),
    errorMessage: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
  });

  it('should return every inserted job exactly once across all pages with null nextCursor on final page', async () => {
    await fc.assert(
      fc.asyncProperty(jobCountArb, pageSizeArb, async (numJobs, pageSize) => {
        iterationCounter++;

        // Clean up from previous iteration
        await testDb('webhook_logs').del();
        await testDb('alerts').del();
        await testDb('etl_jobs').del();

        // Generate and insert N random jobs
        const payloads = await fc.sample(validPayloadArb, numJobs);
        const insertedJobIds: string[] = [];

        for (let i = 0; i < numJobs; i++) {
          const jobId = `prop-page-${iterationCounter}-${i}`;
          insertedJobIds.push(jobId);
          const postRes = await request.post(`/jobs/${jobId}/status`).send(payloads[i]);
          expect(postRes.status).toBe(201);
        }

        // Paginate through all pages collecting jobIds
        const collectedJobIds: string[] = [];
        let cursor: string | null = null;
        let pageCount = 0;
        const maxPages = numJobs + 1; // safety limit

        do {
          const url = cursor
            ? `/jobs?limit=${pageSize}&cursor=${cursor}`
            : `/jobs?limit=${pageSize}`;

          const res = await request.get(url);
          expect(res.status).toBe(200);

          const { data, nextCursor } = res.body;

          // Each page should have at most pageSize items
          expect(data.length).toBeLessThanOrEqual(pageSize);

          for (const job of data) {
            collectedJobIds.push(job.jobId);
          }

          // If there's a nextCursor, there should be data on this page
          if (nextCursor !== null) {
            expect(data.length).toBeGreaterThan(0);
          }

          cursor = nextCursor;
          pageCount++;

          // Safety: prevent infinite loops
          if (pageCount > maxPages) break;
        } while (cursor !== null);

        // Final page must have nextCursor === null (loop exits when cursor is null)
        // This is inherently verified by the while condition

        // Every inserted jobId appears exactly once in collected results
        const sortedInserted = [...insertedJobIds].sort();
        const sortedCollected = [...collectedJobIds].sort();
        expect(sortedCollected).toEqual(sortedInserted);

        // No duplicates: collected length should equal unique count
        const uniqueCollected = new Set(collectedJobIds);
        expect(uniqueCollected.size).toBe(collectedJobIds.length);
      }),
      { numRuns: 100 },
    );
  });
});
