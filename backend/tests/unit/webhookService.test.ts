import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import Knex from 'knex';
import { up } from '../../src/db/migrations/001_create_tables.js';
import type { EtlJob } from '../../src/types.js';

const testDb = Knex({
  client: 'better-sqlite3',
  connection: { filename: ':memory:' },
  useNullAsDefault: true,
});

vi.mock('../../src/db/connection.js', () => ({
  db: testDb,
}));

const mockAxiosPost = vi.fn();
vi.mock('axios', () => ({
  default: { post: (...args: any[]) => mockAxiosPost(...args) },
}));

const mockConfig = { teamsWebhookUrl: 'https://teams.example.com/webhook' };
vi.mock('../../src/config.js', () => ({
  config: mockConfig,
}));

const { sendTeamsAlert, formatTeamsAlertCard } = await import(
  '../../src/services/webhookService.js'
);

const sampleJob: EtlJob = {
  id: 'uuid-1',
  jobId: 'job-fail-1',
  status: 'failure',
  pipeline: 'oracle-inventory-sync',
  source: 'oracle',
  recordsProcessed: 0,
  durationMs: 12000,
  errorMessage: 'Connection timeout to Oracle DB',
  timestamp: '2025-01-15T10:30:00.000Z',
};

describe('WebhookService', () => {
  beforeAll(async () => {
    await up(testDb);
  });

  beforeEach(async () => {
    await testDb('webhook_logs').del();
    mockAxiosPost.mockReset();
    mockConfig.teamsWebhookUrl = 'https://teams.example.com/webhook';
  });

  afterAll(async () => {
    await testDb.destroy();
  });

  describe('formatTeamsAlertCard', () => {
    it('should return a valid MessageCard with all required fields', () => {
      const card = formatTeamsAlertCard(sampleJob);

      expect(card['@type']).toBe('MessageCard');
      expect(card.themeColor).toBeDefined();
      expect(card.summary).toContain(sampleJob.jobId);
      expect(card.sections).toHaveLength(1);

      const facts = card.sections[0].facts;
      const factMap = Object.fromEntries(facts.map((f) => [f.name, f.value]));

      expect(factMap['Job ID']).toBe('job-fail-1');
      expect(factMap['Pipeline']).toBe('oracle-inventory-sync');
      expect(factMap['Source']).toBe('oracle');
      expect(factMap['Error']).toBe('Connection timeout to Oracle DB');
      expect(factMap['Duration (ms)']).toBe('12000');
      expect(factMap['Timestamp']).toBe('2025-01-15T10:30:00.000Z');
    });

    it('should handle null errorMessage gracefully', () => {
      const jobNoError = { ...sampleJob, errorMessage: null };
      const card = formatTeamsAlertCard(jobNoError);
      const facts = card.sections[0].facts;
      const errorFact = facts.find((f) => f.name === 'Error');
      expect(errorFact).toBeDefined();
      expect(errorFact!.value).toBeTruthy();
    });
  });

  describe('sendTeamsAlert', () => {
    it('should POST the alert card to the configured webhook URL', async () => {
      mockAxiosPost.mockResolvedValueOnce({ status: 200, data: '1' });

      await sendTeamsAlert(sampleJob);

      expect(mockAxiosPost).toHaveBeenCalledOnce();
      const [url, body] = mockAxiosPost.mock.calls[0];
      expect(url).toBe('https://teams.example.com/webhook');
      expect(body['@type']).toBe('MessageCard');
    });

    it('should log dispatch to webhook_logs on success', async () => {
      mockAxiosPost.mockResolvedValueOnce({ status: 200, data: '1' });

      await sendTeamsAlert(sampleJob);

      const logs = await testDb('webhook_logs').where({ jobId: sampleJob.jobId });
      expect(logs).toHaveLength(1);
      expect(logs[0].httpStatus).toBe(200);
      expect(logs[0].payload).toContain('MessageCard');
      expect(logs[0].createdAt).toBeDefined();
    });

    it('should not throw when webhook URL is not configured', async () => {
      mockConfig.teamsWebhookUrl = '';

      await expect(sendTeamsAlert(sampleJob)).resolves.toBeUndefined();
      expect(mockAxiosPost).not.toHaveBeenCalled();
    });

    it('should not log to webhook_logs when URL is not configured', async () => {
      mockConfig.teamsWebhookUrl = '';

      await sendTeamsAlert(sampleJob);

      const logs = await testDb('webhook_logs').select();
      expect(logs).toHaveLength(0);
    });

    it('should not throw when the POST request fails', async () => {
      const axiosError = new Error('Network error') as any;
      axiosError.response = { status: 500, data: 'Internal Server Error' };
      mockAxiosPost.mockRejectedValueOnce(axiosError);

      await expect(sendTeamsAlert(sampleJob)).resolves.toBeUndefined();
    });

    it('should log dispatch to webhook_logs on failure with error status', async () => {
      const axiosError = new Error('Bad request') as any;
      axiosError.response = { status: 400, data: 'Bad Request' };
      mockAxiosPost.mockRejectedValueOnce(axiosError);

      await sendTeamsAlert(sampleJob);

      const logs = await testDb('webhook_logs').where({ jobId: sampleJob.jobId });
      expect(logs).toHaveLength(1);
      expect(logs[0].httpStatus).toBe(400);
      expect(logs[0].response).toBe('Bad Request');
    });

    it('should handle network errors without response object', async () => {
      mockAxiosPost.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      await expect(sendTeamsAlert(sampleJob)).resolves.toBeUndefined();

      const logs = await testDb('webhook_logs').where({ jobId: sampleJob.jobId });
      expect(logs).toHaveLength(1);
      expect(logs[0].httpStatus).toBeNull();
      expect(logs[0].response).toBe('ECONNREFUSED');
    });
  });
});
