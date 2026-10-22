import type { Request, Response } from 'express';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';

import {
  AccessResult, findFileTransferByToken, issueFileUrl, logFileTransferEvent, PublicAccessDeps, publicOpenFile, publicView,
} from '../../file-transfer/file-transfer-access';
import { verifyPassword } from '../../file-transfer/file-transfer-tokens';
import { checkRateLimit, clientIp, isRateLimited } from '../rateLimit';

/**
 * Public personal-link access to a quick file transfer (spec 1.115 §4.2). The token in the path
 * IS the credential: it is only hashed and compared, never logged. Responses are never cached.
 * Rate limits (see file-transfer-access.ts): 120 requests / 15 min per client IP for GET and POST
 * together (bucket `transferIp`); wrong passwords 5 / 15 min per link and 60 / 15 min per IP.
 */
function deps(): PublicAccessDeps {
  const db = getFirestore();
  return {
    findByToken: token => findFileTransferByToken(db, token),
    peekLimit: (bucket, key, opts) => isRateLimited(bucket, key, opts),
    hitLimit: async (bucket, key, opts) => (await checkRateLimit(bucket, key, opts)).allowed,
    checkPassword: verifyPassword,
    issueFileUrl,
    logEvent: e => logFileTransferEvent(db, e),
    now: () => new Date().toISOString(),
  };
}

function send<T>(res: Response, r: AccessResult<T>): void {
  res.status(r.status).set('Cache-Control', 'private, no-store').json(r.body);
}

/** Express 4 does not catch a rejected handler; never log the token (it is the credential). */
function internalError(res: Response, what: string, err: unknown): void {
  logger.error(`publicApi /file-transfer ${what} error`, { error: String(err) });
  res.status(500).set('Cache-Control', 'private, no-store').json({ error: { code: 'internal_error', message: 'Internal error' } });
}

/** GET /public/api/v1/file-transfer/:token → FileTransferView | 404 | 410 | 429 */
export async function fileTransferViewRouter(req: Request, res: Response): Promise<void> {
  try {
    send(res, await publicView(String(req.params['token'] ?? ''), clientIp(req), deps()));
  } catch (err) {
    internalError(res, 'view', err);
  }
}

/** POST /public/api/v1/file-transfer/:token/file {fileIndex, disposition, password?} → {url} | 400 | 401 | 404 | 410 | 429 */
export async function fileTransferFileRouter(req: Request, res: Response): Promise<void> {
  try {
    send(res, await publicOpenFile(String(req.params['token'] ?? ''), req.body, clientIp(req), deps()));
  } catch (err) {
    internalError(res, 'file', err);
  }
}
