import { randomUUID } from 'crypto';
import type { Request, Response, NextFunction } from 'express';

export function correlationId(req: Request, res: Response, next: NextFunction): void {
  const id = (req.headers['x-correlation-id'] as string) || randomUUID();
  (req as any).correlationId = id;
  res.setHeader('X-Correlation-ID', id);
  next();
}
