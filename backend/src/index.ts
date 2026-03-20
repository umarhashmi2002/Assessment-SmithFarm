import { app } from './app.js';
import { config } from './config.js';
import { logger } from './logger.js';
import { runMigrations } from './db/connection.js';

async function main(): Promise<void> {
  await runMigrations();

  app.listen(config.port, () => {
    logger.info(`Server listening on port ${config.port}`);
  });
}

main().catch((err) => {
  logger.error(err, 'Failed to start server');
  process.exit(1);
});
