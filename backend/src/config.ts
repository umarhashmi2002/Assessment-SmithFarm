export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  databasePath: process.env.DATABASE_PATH || './data/etl-monitor.db',
  teamsWebhookUrl: process.env.TEAMS_WEBHOOK_URL || '',
} as const;
