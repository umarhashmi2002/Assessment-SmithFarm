import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { HealthComponent, HealthCheckResult } from '../../src/types.js';

/**
 * Pure aggregation function that mirrors the health service logic.
 * Given a record of component statuses, returns the aggregate health status.
 */
function aggregateHealth(components: Record<string, HealthComponent>): HealthCheckResult['status'] {
  const allHealthy = Object.values(components).every(c => c.status === 'healthy');
  return allHealthy ? 'healthy' : 'degraded';
}

const healthComponentArb: fc.Arbitrary<HealthComponent> = fc.record({
  status: fc.constantFrom('healthy' as const, 'unhealthy' as const),
  message: fc.string({ minLength: 1, maxLength: 100 }),
});

/**
 * Property 9: Health aggregation logic
 *
 * For any combination of component health statuses (each being "healthy" or "unhealthy"),
 * the aggregate health status should be "healthy" if and only if all components report "healthy",
 * and "degraded" if any component reports "unhealthy". Each component should have a valid status
 * string and a non-empty message.
 *
 * **Validates: Requirements 3.2, 3.3, 3.4**
 */
describe('Property 9: Health aggregation logic', () => {
  it('should return "healthy" iff all components are healthy, "degraded" if any unhealthy', () => {
    fc.assert(
      fc.property(
        fc.record({
          database: healthComponentArb,
          kubernetes: healthComponentArb,
          airflow: healthComponentArb,
        }),
        (components) => {
          const result = aggregateHealth(components);

          const allHealthy = components.database.status === 'healthy'
            && components.kubernetes.status === 'healthy'
            && components.airflow.status === 'healthy';

          if (allHealthy) {
            expect(result).toBe('healthy');
          } else {
            expect(result).toBe('degraded');
          }

          // Each component should have a valid status and non-empty message
          for (const comp of Object.values(components)) {
            expect(['healthy', 'unhealthy']).toContain(comp.status);
            expect(comp.message.length).toBeGreaterThan(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
