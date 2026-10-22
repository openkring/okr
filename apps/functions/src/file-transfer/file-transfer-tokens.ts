import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/** Personal link tokens and the transfer password (spec 1.115 §4.2). */

const SALT_BYTES = 16;
const KEY_BYTES = 32;

/** 32 random bytes, base64url — the secret part of a personal link. Only its hash is stored. */
export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

/** sha256 hex of a token: what `file-transfers.tokenHashes` holds and the public lookup compares. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function scryptAsync(pw: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(pw, salt, KEY_BYTES, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

/** scrypt with a random salt, stored as 'salt:hash' (both hex). */
export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await scryptAsync(pw, salt);
  return `${salt.toString('hex')}:${key.toString('hex')}`;
}

/** Timing-safe check against a 'salt:hash' value; a malformed stored value never matches. */
export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [saltHex, keyHex] = (stored ?? '').split(':');
  if (!saltHex || !keyHex || !/^[0-9a-f]+$/.test(saltHex) || !/^[0-9a-f]+$/.test(keyHex)) return false;
  const expected = Buffer.from(keyHex, 'hex');
  if (expected.length !== KEY_BYTES) return false;
  const actual = await scryptAsync(pw, Buffer.from(saltHex, 'hex'));
  return timingSafeEqual(actual, expected);
}
