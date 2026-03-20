import express from 'express';
import cors from 'cors';
import { correlationId } from './middleware/correlationId.js';
import { requestLogger } from './middleware/requestLogger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { jobsRouter } from './routes/jobs.js';
import { healthRouter } from './routes/health.js';
import { alertsRouter } from './routes/alerts.js';
import { webhooksRouter } from './routes/webhooks.js';

const app = express();

// Middleware (order matters)
app.use(cors());
app.use(express.json());
app.use(correlationId);
app.use(requestLogger);

// Routes
app.use('/jobs', jobsRouter);
app.use('/health', healthRouter);
app.use('/alerts', alertsRouter);
app.use('/webhooks', webhooksRouter);

// Error handler (must be last)
app.use(errorHandler);

export { app };
