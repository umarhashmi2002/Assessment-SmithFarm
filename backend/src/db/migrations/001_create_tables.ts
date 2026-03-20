import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('etl_jobs', (table) => {
    table.text('id').primary();
    table.text('jobId').notNullable().unique();
    table.text('status').notNullable();
    table.text('pipeline').notNullable();
    table.text('source').notNullable();
    table.integer('recordsProcessed').notNullable();
    table.integer('durationMs').notNullable();
    table.text('errorMessage');
    table.text('timestamp').notNullable();
    table.index(['timestamp']);
    table.index(['status']);
    table.index(['pipeline']);
    table.index(['jobId']);
  });

  await knex.schema.createTable('alerts', (table) => {
    table.text('id').primary();
    table.text('jobId').notNullable();
    table.integer('acknowledged').defaultTo(0);
    table.text('acknowledgedAt');
    table.text('createdAt').notNullable();
    table.index(['jobId']);
    table.index(['acknowledged']);
  });

  await knex.schema.createTable('webhook_logs', (table) => {
    table.text('id').primary();
    table.text('jobId').notNullable();
    table.text('payload').notNullable();
    table.integer('httpStatus');
    table.text('response');
    table.text('createdAt').notNullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('webhook_logs');
  await knex.schema.dropTableIfExists('alerts');
  await knex.schema.dropTableIfExists('etl_jobs');
}
