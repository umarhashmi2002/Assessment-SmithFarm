import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { config } from '../config.js';
import { db } from '../db/connection.js';
import { logger } from '../logger.js';
import type { EtlJob, TeamsAlertCard } from '../types.js';

export function formatTeamsAlertCard(job: EtlJob): TeamsAlertCard {
  return {
    '@type': 'MessageCard',
    themeColor: 'FF0000',
    summary: `ETL Job Failure: ${job.jobId}`,
    sections: [
      {
        activityTitle: `ETL Pipeline Failure — ${job.pipeline}`,
        facts: [
          { name: 'Job ID', value: job.jobId },
          { name: 'Pipeline', value: job.pipeline },
          { name: 'Source', value: job.source },
          { name: 'Error', value: job.errorMessage ?? 'No error message provided' },
          { name: 'Duration (ms)', value: String(job.durationMs) },
          { name: 'Timestamp', value: job.timestamp },
        ],
        markdown: true,
      },
    ],
  };
}

export async function sendTeamsAlert(job: EtlJob): Promise<void> {
  if (!config.teamsWebhookUrl) {
    logger.warn({ jobId: job.jobId }, 'Teams webhook URL not configured — skipping notification');
    return;
  }

  const card = formatTeamsAlertCard(job);
  const payload = JSON.stringify(card);
  let httpStatus: number | null = null;
  let responseBody: string | null = null;

  try {
    const response = await axios.post(config.teamsWebhookUrl, card, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000,
    });
    httpStatus = response.status;
    responseBody = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
    logger.info({ jobId: job.jobId, httpStatus }, 'Teams webhook alert sent successfully');
  } catch (err: any) {
    httpStatus = err.response?.status ?? null;
    responseBody = err.response?.data
      ? (typeof err.response.data === 'string' ? err.response.data : JSON.stringify(err.response.data))
      : err.message;
    logger.error(
      { jobId: job.jobId, httpStatus, responseBody },
      'Failed to send Teams webhook alert',
    );
  }

  try {
    await db('webhook_logs').insert({
      id: uuidv4(),
      jobId: job.jobId,
      payload,
      httpStatus,
      response: responseBody,
      createdAt: new Date().toISOString(),
    });
  } catch (dbErr: any) {
    logger.error({ jobId: job.jobId, error: dbErr.message }, 'Failed to log webhook dispatch');
  }
}
