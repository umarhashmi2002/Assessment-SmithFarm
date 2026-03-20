import { Router } from 'express';
import type { Request, Response } from 'express';

const router = Router();

// POST /webhooks/teams/test
router.post('/teams/test', (req: Request, res: Response) => {
  res.json({ received: true, payload: req.body });
});

export { router as webhooksRouter };
