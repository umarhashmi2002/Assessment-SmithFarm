import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema } from 'zod';

export function validate(schema: ZodSchema, source: 'body' | 'query' = 'body') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const fieldErrors = result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));

      res.status(400).json({
        error: 'Validation Error',
        message: result.error.issues.map((i) => i.message).join('; '),
        details: fieldErrors,
        correlationId: (req as any).correlationId ?? '',
      });
      return;
    }

    req[source] = result.data;
    next();
  };
}
