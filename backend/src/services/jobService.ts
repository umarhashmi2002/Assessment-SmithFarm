import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/connection.js';
import type {
  CreateJobStatusInput,
  EtlJob,
  EtlJobWithAlert,
  JobFilters,
  PaginatedResult,
} from '../types.js';

function encodeCursor(job: EtlJob): string {
  return Buffer.from(JSON.stringify({ t: job.timestamp, i: job.id })).toString('base64url');
}

function decodeCursor(cursor: string): { t: string; i: string } {
  return JSON.parse(Buffer.from(cursor, 'base64url').toString());
}

export async function createOrUpdateJobStatus(
  jobId: string,
  payload: CreateJobStatusInput,
): Promise<EtlJob> {
  const existing = await db('etl_jobs').where({ jobId }).first();

  if (existing) {
    const updated: Partial<EtlJob> = {
      status: payload.status,
      pipeline: payload.pipeline,
      source: payload.source,
      recordsProcessed: payload.recordsProcessed,
      durationMs: payload.durationMs,
      errorMessage: payload.errorMessage ?? null,
      timestamp: new Date().toISOString(),
    };
    await db('etl_jobs').where({ jobId }).update(updated);
    return { ...existing, ...updated } as EtlJob;
  }

  const newJob: EtlJob = {
    id: uuidv4(),
    jobId,
    status: payload.status,
    pipeline: payload.pipeline,
    source: payload.source,
    recordsProcessed: payload.recordsProcessed,
    durationMs: payload.durationMs,
    errorMessage: payload.errorMessage ?? null,
    timestamp: new Date().toISOString(),
  };

  await db('etl_jobs').insert(newJob);
  return newJob;
}

export async function getJob(jobId: string): Promise<EtlJob | null> {
  const row = await db('etl_jobs').where({ jobId }).first();
  return row ?? null;
}

export async function listJobs(
  filters: JobFilters,
): Promise<PaginatedResult<EtlJobWithAlert>> {
  const limit = Math.min(Math.max(filters.limit ?? 20, 1), 100);

  // Build base query conditions for filtering
  function applyFilters(query: ReturnType<typeof db>) {
    if (filters.status) {
      query.where('etl_jobs.status', filters.status);
    }
    if (filters.pipeline) {
      query.where('etl_jobs.pipeline', filters.pipeline);
    }
    if (filters.from) {
      query.where('etl_jobs.timestamp', '>=', filters.from);
    }
    if (filters.to) {
      query.where('etl_jobs.timestamp', '<=', filters.to);
    }
    return query;
  }

  // Total count query (separate, ignores pagination)
  const countQuery = applyFilters(db('etl_jobs').count('* as count'));
  const [{ count: total }] = await countQuery;

  // Data query with cursor pagination
  let dataQuery = applyFilters(
    db('etl_jobs')
      .leftJoin('alerts', function () {
        this.on('etl_jobs.jobId', '=', 'alerts.jobId').andOn(
          'alerts.acknowledged',
          '=',
          db.raw('0'),
        );
      })
      .select(
        'etl_jobs.*',
        db.raw('CASE WHEN alerts.id IS NOT NULL THEN 1 ELSE 0 END as hasUnacknowledgedAlert'),
      )
      .groupBy('etl_jobs.id'),
  );

  if (filters.cursor) {
    const { t, i } = decodeCursor(filters.cursor);
    dataQuery = dataQuery.where(function () {
      this.where('etl_jobs.timestamp', '<', t).orWhere(function () {
        this.where('etl_jobs.timestamp', '=', t).andWhere('etl_jobs.id', '<', i);
      });
    });
  }

  dataQuery = dataQuery
    .orderBy('etl_jobs.timestamp', 'desc')
    .orderBy('etl_jobs.id', 'desc')
    .limit(limit + 1);

  const rows = await dataQuery;

  const hasMore = rows.length > limit;
  const data = rows.slice(0, limit).map((row: any) => ({
    id: row.id,
    jobId: row.jobId,
    status: row.status,
    pipeline: row.pipeline,
    source: row.source,
    recordsProcessed: row.recordsProcessed,
    durationMs: row.durationMs,
    errorMessage: row.errorMessage,
    timestamp: row.timestamp,
    hasUnacknowledgedAlert: row.hasUnacknowledgedAlert === 1,
  })) as EtlJobWithAlert[];

  const nextCursor = hasMore && data.length > 0
    ? encodeCursor(data[data.length - 1])
    : null;

  return {
    data,
    nextCursor,
    total: Number(total),
  };
}
