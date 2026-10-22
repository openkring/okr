import type { Request, Response } from 'express';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import corsLib from 'cors';

import {
  AccessResult, findFileTransferByToken, issueFileUrl, logFileTransferEvent, PublicAccessDeps, publicOpenFile, publicView,
  publicViewWithPassword,
} from '../../file-transfer/file-transfer-access';
import { verifyPassword } from '../../file-transfer/file-transfer-tokens';
import { checkRateLimit, clientIp, refundRateLimit } from '../rateLimit';

/**
 * Public personal-link access to a quick file transfer (spec 1.115 §4.2). The token in the path
 * IS the credential: it is only hashed and compared, never logged. Responses are never cached.
 * Rate limits (see file-transfer-access.ts): per client IP 120 GET and 600 POST / 15 min; password
 * attempts 5 / 15 min per link and 20 / 15 min per transfer (reserved, refunded when right).
 * CORS: open to any origin, see `fileTransferCors` below.
 */
/** Path prefix of the file-transfer routes (mounted under the public API base). */
export const FILE_TRANSFER_PATH = '/public/api/v1/file-transfer/';

export function isFileTransferPath(path: string): boolean {
  return path.startsWith(FILE_TRANSFER_PATH);
}

/**
 * Route-level CORS for the file-transfer routes: ANY origin, no credentials. The link page runs in
 * every tenant app (each its own origin), and the token in the path is the credential — not a
 * cookie or an origin — so an origin allowlist would protect nothing and break every tenant not
 * on it. `credentials: false` keeps browsers from sending cookies; only Content-Type is needed.
 */
export const fileTransferCors = corsLib({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  credentials: false,
  maxAge: 3600,
});

function deps(): PublicAccessDeps {
  const db = getFirestore();
  return {
    findByToken: token => findFileTransferByToken(db, token),
    refundLimit: (bucket, key) => refundRateLimit(bucket, key),
    hitLimit: async (bucket, key, opts) => {
      const r = await checkRateLimit(bucket, key, opts);
      return r.unavailable ? 'unavailable' : r.allowed;
    },
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

/** GET /public/api/v1/file-transfer/:token → FileTransferView (locked view when password-protected) | 404 | 410 | 429 */
export async function fileTransferViewRouter(req: Request, res: Response): Promise<void> {
  try {
    send(res, await publicView(String(req.params['token'] ?? ''), clientIp(req), deps()));
  } catch (err) {
    internalError(res, 'view', err);
  }
}

/** POST /public/api/v1/file-transfer/:token/view {password} → FileTransferView | 400 | 401 | 404 | 410 | 429 | 503 */
export async function fileTransferUnlockRouter(req: Request, res: Response): Promise<void> {
  try {
    send(res, await publicViewWithPassword(String(req.params['token'] ?? ''), req.body, clientIp(req), deps()));
  } catch (err) {
    internalError(res, 'unlock', err);
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
