import { createHmac } from 'node:crypto';

/**
 * How long a form may stay open before its token no longer counts (§10.3).
 *
 * Seven days, not minutes: a failed check stores the submission as spam while the filler reads «thank
 * you», so a short limit silently loses people who take a break or come back to an open tab. It costs
 * no protection — `getFormToken` hands a fresh token to anybody who runs the page's script, which is all
 * the token proves; honeypot, timing and rate limit catch the rest.
 */
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function sign(formKey: string, timestamp: string, secret: string): string {
  return createHmac('sha256', secret).update(`${formKey}:${timestamp}`).digest('hex');
}

export function buildToken(formKey: string, secret: string, now = Date.now()): string {
  const timestamp = now.toString();
  return Buffer.from(`${formKey}:${timestamp}:${sign(formKey, timestamp, secret)}`).toString('base64url');
}

export function verifyToken(token: string, secret: string, now = Date.now()): { valid: boolean; reason?: string } {
  const parts = Buffer.from(token, 'base64url').toString('utf8').split(':');
  if (parts.length !== 3) return { valid: false, reason: 'malformed' };
  const [formKey, timestamp, sig] = parts;
  // the signature first: `expired` then only ever names a token we issued
  if (sig !== sign(formKey, timestamp, secret)) return { valid: false, reason: 'invalid_sig' };
  const age = now - parseInt(timestamp, 10);
  if (isNaN(age) || age > TOKEN_TTL_MS) return { valid: false, reason: 'expired' };
  return { valid: true };
}
