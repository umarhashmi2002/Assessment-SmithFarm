import { Router } from 'express';
import { checkHealth } from '../services/healthService.js';
import type { Request, Response, NextFunction } from 'express';

const router = Router();

// GET /health
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await checkHealth();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export { router as healthRouter };
