import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { correlationId } from '../../src/middleware/correlationId.js';
import { requestLogger } from '../../src/middleware/requestLogger.js';
import { validate } from '../../src/middleware/validate.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    method: 'GET',
    originalUrl: '/test',
    body: {},
    query: {},
    ...overrides,
  } as unknown as Request;
}

function mockRes(): Response {
  const res: any = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    setHeader(key: string, value: string) {
      res.headers[key] = value;
      return res;
    },
    getHeader(key: string) {
      return res.headers[key];
    },
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json: vi.fn().mockReturnThis(),
    on: vi.fn(),
  };
  return res as Response;
}

describe('correlationId middleware', () => {
  it('generates a UUID when no header is provided', () => {
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    correlationId(req, res, next);

    expect((req as any).correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect((res as any).headers['X-Correlation-ID']).toBe((req as any).correlationId);
    expect(next).toHaveBeenCalled();
  });

  it('uses the provided X-Correlation-ID header', () => {
    const req = mockReq({ headers: { 'x-correlation-id': 'my-custom-id' } } as any);
    const res = mockRes();
    const next = vi.fn();

    correlationId(req, res, next);

    expect((req as any).correlationId).toBe('my-custom-id');
    expect((res as any).headers['X-Correlation-ID']).toBe('my-custom-id');
    expect(next).toHaveBeenCalled();
  });
});

describe('requestLogger middleware', () => {
  it('registers a finish listener and calls next', () => {
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    requestLogger(req, res, next);

    expect((res.on as any)).toHaveBeenCalledWith('finish', expect.any(Function));
    expect(next).toHaveBeenCalled();
  });
});

describe('validate middleware', () => {
  const schema = z.object({
    name: z.string().min(1),
    age: z.number().int().min(0),
  });

  it('passes valid body and calls next', () => {
    const req = mockReq({ body: { name: 'Alice', age: 30 } } as any);
    const res = mockRes();
    const next = vi.fn();

    validate(schema)(req, res, next);

    expect(next).toHaveBeenCalled();
    expect((res.json as any)).not.toHaveBeenCalled();
  });

  it('returns 400 with field errors on invalid body', () => {
    const req = mockReq({ body: { name: '', age: -1 } } as any);
    const res = mockRes();
    const next = vi.fn();

    validate(schema)(req, res, next);

    expect(res.statusCode).toBe(400);
    expect((res.json as any)).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Validation Error',
        details: expect.arrayContaining([
          expect.objectContaining({ field: 'name' }),
          expect.objectContaining({ field: 'age' }),
        ]),
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('validates query params when source is query', () => {
    const querySchema = z.object({ limit: z.coerce.number().min(1) });
    const req = mockReq({ query: { limit: '5' } } as any);
    const res = mockRes();
    const next = vi.fn();

    validate(querySchema, 'query')(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.query).toEqual({ limit: 5 });
  });
});

describe('errorHandler middleware', () => {
  it('returns structured JSON with error status code', () => {
    const err: any = new Error('Not found');
    err.name = 'NotFoundError';
    err.statusCode = 404;

    const req = mockReq();
    (req as any).correlationId = 'test-corr-id';
    const res = mockRes();
    const next = vi.fn();

    errorHandler(err, req, res, next);

    expect(res.statusCode).toBe(404);
    expect((res.json as any)).toHaveBeenCalledWith({
      error: 'NotFoundError',
      message: 'Not found',
      correlationId: 'test-corr-id',
    });
  });

  it('defaults to 500 and hides message for unknown errors', () => {
    const err = new Error('secret db details');

    const req = mockReq();
    (req as any).correlationId = 'corr-123';
    const res = mockRes();
    const next = vi.fn();

    errorHandler(err, req, res, next);

    expect(res.statusCode).toBe(500);
    expect((res.json as any)).toHaveBeenCalledWith({
      error: 'Error',
      message: 'An unexpected error occurred',
      correlationId: 'corr-123',
    });
  });
});
