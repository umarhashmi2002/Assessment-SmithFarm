import Knex from 'knex';
import { config } from '../config.js';
import { logger } from '../logger.js';
import * as migration001 from './migrations/001_create_tables.js';

export const db = Knex({
  client: 'better-sqlite3',
  connection: {
    filename: config.databasePath,
  },
  useNullAsDefault: true,
});

class InlineMigrationSource {
  private migrations = [
    { name: '001_create_tables', migration: migration001 },
  ];

  getMigrations(): Promise<string[]> {
    return Promise.resolve(this.migrations.map((m) => m.name));
  }

  getMigrationName(migration: string): string {
    return migration;
  }

  getMigration(name: string): Promise<{ up: typeof Knex; down: typeof Knex }> {
    const found = this.migrations.find((m) => m.name === name);
    if (!found) throw new Error(`Migration ${name} not found`);
    return Promise.resolve(found.migration as any);
  }
}

export async function runMigrations(): Promise<void> {
  logger.info('Running database migrations...');
  await db.migrate.latest({
    migrationSource: new InlineMigrationSource() as any,
  });
  logger.info('Database migrations complete');
}
