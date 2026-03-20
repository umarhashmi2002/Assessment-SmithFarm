import { db } from '../db/connection.js';
import { logger } from '../logger.js';
import type { HealthCheckResult, HealthComponent } from '../types.js';

const HEALTH_TIMEOUT_MS = 5000;

async function checkDatabase(): Promise<HealthComponent> {
  try {
    await db.raw('SELECT 1');
    return { status: 'healthy', message: 'SQLite connection OK' };
  } catch (err) {
    logger.error({ err }, 'Database health check failed');
    return { status: 'unhealthy', message: 'SQLite connection failed' };
  }
}

async function checkKubernetes(): Promise<HealthComponent> {
  // Simulated adapter — returns mocked healthy response
  // In production, this would query the K8s API for pod status
  return { status: 'healthy', message: 'All pods running (simulated)' };
}

async function checkAirflow(): Promise<HealthComponent> {
  // Simulated adapter — returns mocked healthy response
  // In production, this would query the Airflow health API
  return { status: 'healthy', message: 'Scheduler active (simulated)' };
}

export async function checkHealth(): Promise<HealthCheckResult> {
  const healthPromise = (async () => {
    const [database, kubernetes, airflow] = await Promise.all([
      checkDatabase(),
      checkKubernetes(),
      checkAirflow(),
    ]);

    const components = { database, kubernetes, airflow };

    const allHealthy = Object.values(components).every(
      (c) => c.status === 'healthy',
    );

    return {
      status: allHealthy ? 'healthy' : 'degraded',
      components,
      timestamp: new Date().toISOString(),
    } satisfies HealthCheckResult;
  })();

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Health check timed out')), HEALTH_TIMEOUT_MS),
  );

  return Promise.race([healthPromise, timeoutPromise]);
}
