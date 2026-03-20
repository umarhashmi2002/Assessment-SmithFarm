import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { createOrUpdateJobStatus, getJob, listJobs } from '../services/jobService.js';
import { createAlert } from '../services/alertService.js';
import { sendTeamsAlert } from '../services/webhookService.js';
import type { Request, Response, NextFunction } from 'express';

export const createJobStatusSchema = z.object({
  status: z.enum(['success', 'failure', 'running']),
  pipeline: z.string().min(1),
  source: z.enum(['oracle', 'doris', 'azure_db']),
  recordsProcessed: z.number().int().min(0),
  durationMs: z.number().int().min(0),
  errorMessage: z.string().optional(),
});

export const jobListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
  status: z.enum(['success', 'failure', 'running']).optional(),
  pipeline: z.string().optional(),
  from: z.string().refine((v) => !isNaN(Date.parse(v)), { message: 'Invalid date format' }).optional(),
  to: z.string().refine((v) => !isNaN(Date.parse(v)), { message: 'Invalid date format' }).optional(),
});

const router = Router();

// POST /jobs/:jobId/status
router.post(
  '/:jobId/status',
  validate(createJobStatusSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const jobId = req.params.jobId as string;
      const job = await createOrUpdateJobStatus(jobId, req.body);

      if (job.status === 'failure') {
        await createAlert(jobId, job);
        // Fire-and-forget webhook — don't await
        sendTeamsAlert(job).catch(() => {});
      }

      res.status(201).json(job);
    } catch (err) {
      next(err);
    }
  },
);

// GET /jobs
router.get(
  '/',
  validate(jobListQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await listJobs(req.query as any);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// GET /jobs/:jobId
router.get(
  '/:jobId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const jobId = req.params.jobId as string;
      const job = await getJob(jobId);
      if (!job) {
        res.status(404).json({
          error: 'Not Found',
          message: `Job with id '${jobId}' not found`,
          correlationId: (req as any).correlationId ?? '',
        });
        return;
      }
      res.json(job);
    } catch (err) {
      next(err);
    }
  },
);

export { router as jobsRouter };
