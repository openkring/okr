import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'firebase-functions/v2/https';

vi.mock('./ingest', () => ({ ingest: vi.fn() }));
vi.mock('firebase-functions/v2', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));

import { clientFromPath, handleWebhook } from './http';
import { ingest } from './ingest';
import { logger } from 'firebase-functions/v2';
import type { WebhookClient } from './types';

describe('clientFromPath', () => {
  it('is the first path segment', () => {
    expect(clientFromPath('/mailtrap')).toBe('mailtrap');
    expect(clientFromPath('/mailtrap/extra')).toBe('mailtrap');
  });
  it('is empty for the root', () => {
    expect(clientFromPath('/')).toBe('');
  });
});

describe('handleWebhook', () => {
  const req = { method: 'POST', rawBody: Buffer.from('{}'), query: {}, path: '/x', header: () => undefined } as unknown as Request;
  function makeRes() {
    const res = { status: vi.fn(), send: vi.fn() };
    res.status.mockReturnValue(res);
    return res;
  }
  it('answers with the status and body ingest returns', async () => {
    vi.mocked(ingest).mockResolvedValueOnce({ status: 401, body: 'Unauthorized' });
    const res = makeRes();
    await handleWebhook(() => ({ id: 'x' }) as WebhookClient)(req, res as unknown as Response);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.send).toHaveBeenCalledWith('Unauthorized');
  });
  it('answers 500 when ingest rejects', async () => {
    vi.mocked(ingest).mockRejectedValueOnce(new Error('secret unset'));
    const res = makeRes();
    await handleWebhook(() => ({ id: 'x' }) as WebhookClient)(req, res as unknown as Response);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(logger.error).toHaveBeenCalledWith('webhooks: receiver failed', { clientId: 'x' });
  });
});
