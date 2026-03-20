import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { config } from '../config.js';
import { db, runMigrations } from './connection.js';
import { logger } from '../logger.js';

// Ensure data directory exists
const dbDir = dirname(config.databasePath);
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

interface Pipeline {
  name: string;
  source: 'oracle' | 'doris' | 'azure_db';
}

const PIPELINES: Pipeline[] = [
  { name: 'oracle-inventory-sync', source: 'oracle' },
  { name: 'doris-sales-etl', source: 'doris' },
  { name: 'azure-reporting-load', source: 'azure_db' },
  { name: 'oracle-supplier-feed', source: 'oracle' },
  { name: 'doris-warehouse-metrics', source: 'doris' },
  { name: 'azure-customer-sync', source: 'azure_db' },
];

const ERROR_MESSAGES = [
  'Connection timeout to Oracle DB after 30000ms',
  'DORIS replication lag exceeded threshold (>5min)',
  'Azure DB authentication token expired',
  'Out of memory during transform phase — recordset too large',
  'Deadlock detected on target table: inventory_snapshot',
  'Source schema mismatch: column "unit_cost" type changed from DECIMAL to VARCHAR',
  'Network unreachable: DORIS replica endpoint 10.0.3.42:9030',
  'Airflow task exceeded SLA: expected <15min, actual 47min',
];

type JobStatus = 'success' | 'failure' | 'running';

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateTimestamp(daysAgo: number): string {
  const now = Date.now();
  const msAgo = daysAgo * 24 * 60 * 60 * 1000;
  const offset = Math.random() * msAgo;
  return new Date(now - offset).toISOString();
}

function pickStatus(): JobStatus {
  const roll = Math.random();
  if (roll < 0.7) return 'success';
  if (roll < 0.9) return 'failure';
  return 'running';
}

interface SeedJob {
  id: string;
  jobId: string;
  status: JobStatus;
  pipeline: string;
  source: string;
  recordsProcessed: number;
  durationMs: number;
  errorMessage: string | null;
  timestamp: string;
}

function generateJobs(count: number): SeedJob[] {
  const jobs: SeedJob[] = [];

  // Guarantee at least 8 failures (5+ needed for alerts requirement)
  const guaranteedFailureCount = 8;
  const guaranteedRunningCount = 5;
  const remainingCount = count - guaranteedFailureCount - guaranteedRunningCount;

  // Generate guaranteed failures
  for (let i = 0; i < guaranteedFailureCount; i++) {
    const pipeline = PIPELINES[i % PIPELINES.length];
    jobs.push({
      id: randomUUID(),
      jobId: `seed-fail-${i + 1}-${randomUUID().slice(0, 8)}`,
      status: 'failure',
      pipeline: pipeline.name,
      source: pipeline.source,
      recordsProcessed: randomInt(0, 5000),
      durationMs: randomInt(5000, 120000),
      errorMessage: ERROR_MESSAGES[i % ERROR_MESSAGES.length],
      timestamp: generateTimestamp(7),
    });
  }

  // Generate guaranteed running
  for (let i = 0; i < guaranteedRunningCount; i++) {
    const pipeline = PIPELINES[i % PIPELINES.length];
    jobs.push({
      id: randomUUID(),
      jobId: `seed-run-${i + 1}-${randomUUID().slice(0, 8)}`,
      status: 'running',
      pipeline: pipeline.name,
      source: pipeline.source,
      recordsProcessed: randomInt(0, 10000),
      durationMs: randomInt(1000, 30000),
      errorMessage: null,
      timestamp: generateTimestamp(1), // running jobs are recent
    });
  }

  // Generate remaining with weighted random status
  for (let i = 0; i < remainingCount; i++) {
    const pipeline = pickRandom(PIPELINES);
    const status = pickStatus();
    jobs.push({
      id: randomUUID(),
      jobId: `seed-job-${i + 1}-${randomUUID().slice(0, 8)}`,
      status,
      pipeline: pipeline.name,
      source: pipeline.source,
      recordsProcessed: randomInt(100, 50000),
      durationMs: randomInt(2000, 180000),
      errorMessage: status === 'failure' ? pickRandom(ERROR_MESSAGES) : null,
      timestamp: generateTimestamp(7),
    });
  }

  return jobs;
}

async function seed(): Promise<void> {
  logger.info('Running database migrations before seeding...');
  await runMigrations();

  // Check if seed data already exists (idempotency)
  const existing = await db('etl_jobs')
    .where('jobId', 'like', 'seed-%')
    .count('* as count')
    .first();

  const existingCount = (existing as any)?.count ?? 0;
  if (existingCount > 0) {
    logger.info(`Seed data already exists (${existingCount} records). Skipping insert.`);
    await db.destroy();
    return;
  }

  const TOTAL_JOBS = 55;
  const jobs = generateJobs(TOTAL_JOBS);

  logger.info(`Inserting ${jobs.length} seed ETL job records...`);

  // Use INSERT OR IGNORE for idempotency on jobId unique constraint
  for (const job of jobs) {
    await db.raw(
      `INSERT OR IGNORE INTO etl_jobs (id, jobId, status, pipeline, source, recordsProcessed, durationMs, errorMessage, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [job.id, job.jobId, job.status, job.pipeline, job.source, job.recordsProcessed, job.durationMs, job.errorMessage, job.timestamp]
    );
  }

  // Create unacknowledged alerts for failure jobs
  const failureJobs = jobs.filter((j) => j.status === 'failure');
  logger.info(`Creating ${failureJobs.length} alert records for failure jobs...`);

  for (const job of failureJobs) {
    await db.raw(
      `INSERT OR IGNORE INTO alerts (id, jobId, acknowledged, acknowledgedAt, createdAt)
       VALUES (?, ?, 0, NULL, ?)`,
      [randomUUID(), job.jobId, job.timestamp]
    );
  }

  const finalCount = await db('etl_jobs').count('* as count').first();
  const alertCount = await db('alerts').count('* as count').first();
  logger.info(
    `Seed complete: ${(finalCount as any)?.count} ETL jobs, ${(alertCount as any)?.count} alerts`
  );

  await db.destroy();
}

seed().catch((err) => {
  logger.error({ err }, 'Seed script failed');
  process.exit(1);
});
