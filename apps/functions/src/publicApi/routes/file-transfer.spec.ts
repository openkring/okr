import { describe, expect, it } from 'vitest';
import type { Request, Response } from 'express';

import { fileTransferCors, isFileTransferPath } from './file-transfer';

/** Runs the cors middleware on a fake req/res; resolves with headers, status and whether next() ran. */
function runCors(method: string, origin: string, extra: Record<string, string> = {}) {
  const headers: Record<string, string> = {};
  const res = {
    statusCode: 200, ended: false,
    setHeader: (k: string, v: string) => { headers[k.toLowerCase()] = String(v); },
    getHeader: (k: string) => headers[k.toLowerCase()],
    end: () => { res.ended = true; },
  };
  const req = { method, headers: { origin, ...extra } };
  let nextCalled = false;
  fileTransferCors(req as unknown as Request, res as unknown as Response, () => { nextCalled = true; });
  return { headers, res, nextCalled };
}

// The link page runs in every tenant app, each on its own origin; the token is the credential.
describe('file-transfer CORS', () => {
  it('answers a preflight from any tenant origin: *, GET/POST/OPTIONS, Content-Type, no credentials', () => {
    const { headers, res, nextCalled } = runCors('OPTIONS', 'https://app.kwa.ch', {
      'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type',
    });
    expect(headers['access-control-allow-origin']).toBe('*');
    expect(headers['access-control-allow-methods']).toBe('GET,POST,OPTIONS');
    expect(headers['access-control-allow-headers']).toBe('Content-Type');
    expect(headers['access-control-allow-credentials']).toBeUndefined();
    expect(res.statusCode).toBe(204);
    expect(res.ended).toBe(true);
    expect(nextCalled).toBe(false);
  });

  it('lets the actual request through with Access-Control-Allow-Origin: *', () => {
    const { headers, nextCalled } = runCors('GET', 'https://some-tenant.example');
    expect(headers['access-control-allow-origin']).toBe('*');
    expect(nextCalled).toBe(true);
  });

  it('applies only to the file-transfer routes', () => {
    expect(isFileTransferPath('/public/api/v1/file-transfer/abc')).toBe(true);
    expect(isFileTransferPath('/public/api/v1/file-transfer/abc/file')).toBe(true);
    expect(isFileTransferPath('/public/api/v1/gallery')).toBe(false);
    expect(isFileTransferPath('/public/api/v1/file-transferx')).toBe(false);
  });
});
