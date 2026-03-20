import { describe, it, expect } from 'vitest';
import { checkHealth } from '../../src/services/healthService.js';

describe('HealthService', () => {
  it('returns healthy status when all components are healthy', async () => {
    const result = await checkHealth();

    expect(result.status).toBe('healthy');
    expect(result.components.database.status).toBe('healthy');
    expect(result.components.database.message).toBeTruthy();
    expect(result.components.kubernetes.status).toBe('healthy');
    expect(result.components.kubernetes.message).toBeTruthy();
    expect(result.components.airflow.status).toBe('healthy');
    expect(result.components.airflow.message).toBeTruthy();
  });

  it('includes an ISO timestamp', async () => {
    const result = await checkHealth();

    expect(result.timestamp).toBeTruthy();
    // Verify it's a valid ISO date string
    const parsed = new Date(result.timestamp);
    expect(parsed.toISOString()).toBe(result.timestamp);
  });

  it('returns all three component keys', async () => {
    const result = await checkHealth();

    expect(result.components).toHaveProperty('database');
    expect(result.components).toHaveProperty('kubernetes');
    expect(result.components).toHaveProperty('airflow');
  });

  it('each component has status and message fields', async () => {
    const result = await checkHealth();

    for (const component of Object.values(result.components)) {
      expect(['healthy', 'unhealthy']).toContain(component.status);
      expect(typeof component.message).toBe('string');
      expect(component.message.length).toBeGreaterThan(0);
    }
  });

  it('responds within 5000ms', async () => {
    const start = Date.now();
    await checkHealth();
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(5000);
  });
});
