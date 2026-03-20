import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/connection.js';
import type { Alert, EtlJob } from '../types.js';

export class AlertNotFoundError extends Error {
  public statusCode = 404;
  constructor(alertId: string) {
    super(`Alert with id '${alertId}' not found`);
    this.name = 'AlertNotFoundError';
  }
}

export class AlertAlreadyAcknowledgedError extends Error {
  public statusCode = 409;
  constructor(alertId: string) {
    super(`Alert with id '${alertId}' is already acknowledged`);
    this.name = 'AlertAlreadyAcknowledgedError';
  }
}

export async function createAlert(jobId: string, _jobRecord: EtlJob): Promise<Alert> {
  const alert: Alert = {
    id: uuidv4(),
    jobId,
    acknowledged: false,
    acknowledgedAt: null,
    createdAt: new Date().toISOString(),
  };

  await db('alerts').insert({
    id: alert.id,
    jobId: alert.jobId,
    acknowledged: 0,
    acknowledgedAt: null,
    createdAt: alert.createdAt,
  });

  return alert;
}

export async function acknowledgeAlert(alertId: string): Promise<Alert> {
  const row = await db('alerts').where({ id: alertId }).first();

  if (!row) {
    throw new AlertNotFoundError(alertId);
  }

  if (row.acknowledged === 1) {
    throw new AlertAlreadyAcknowledgedError(alertId);
  }

  const acknowledgedAt = new Date().toISOString();
  await db('alerts').where({ id: alertId }).update({
    acknowledged: 1,
    acknowledgedAt,
  });

  return {
    id: row.id,
    jobId: row.jobId,
    acknowledged: true,
    acknowledgedAt,
    createdAt: row.createdAt,
  };
}

export async function getAlert(alertId: string): Promise<Alert | null> {
  const row = await db('alerts').where({ id: alertId }).first();
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    jobId: row.jobId,
    acknowledged: row.acknowledged === 1,
    acknowledgedAt: row.acknowledgedAt ?? null,
    createdAt: row.createdAt,
  };
}
