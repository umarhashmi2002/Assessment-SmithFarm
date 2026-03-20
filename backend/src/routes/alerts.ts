import { Router } from 'express';
import { acknowledgeAlert } from '../services/alertService.js';
import type { Request, Response, NextFunction } from 'express';

const router = Router();

// POST /alerts/acknowledge/:alertId
router.post(
  '/acknowledge/:alertId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const alertId = req.params.alertId as string;
      const alert = await acknowledgeAlert(alertId);
      res.json(alert);
    } catch (err) {
      next(err);
    }
  },
);

export { router as alertsRouter };
