import type { Request, Response, NextFunction } from 'express';
import { logger } from '../logger.js';

export function errorHandler(
  err: Error & { statusCode?: number },
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const statusCode = err.statusCode ?? 500;
  const correlationId = (req as any).correlationId ?? '';

  logger.error({
    err,
    correlationId,
    method: req.method,
    url: req.originalUrl,
  });

  res.status(statusCode).json({
    error: err.name || 'Internal Server Error',
    message: statusCode === 500 ? 'An unexpected error occurred' : err.message,
    correlationId,
  });
}
