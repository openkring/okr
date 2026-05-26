import { createHmac, timingSafeEqual } from 'crypto';
import { defineSecret } from 'firebase-functions/params';
import axios from 'axios';

// ─── Secrets ─────────────────────────────────────────────────────────────────
export const deepsignClientId        = defineSecret('DEEPSIGN_CLIENT_ID');
export const deepsignClientSecret    = defineSecret('DEEPSIGN_CLIENT_SECRET');
export const deepsignServiceUsername = defineSecret('DEEPSIGN_SERVICE_USERNAME');
export const deepsignServicePassword = defineSecret('DEEPSIGN_SERVICE_PASSWORD');
export const webhookSecret           = defineSecret('WEBHOOK_SECRET');

export const ALL_ESIGN_SECRETS = [
  deepsignClientId, deepsignClientSecret,
  deepsignServiceUsername, deepsignServicePassword,
  webhookSecret,
] as const;

// ─── Runtime constants ────────────────────────────────────────────────────────
export const DEEPSIGN_API_BASE = 'https://api.sign.deepbox.swiss/api/v1';
export const DEEPSIGN_AUTH_URL =
  'https://deepcloud.swiss/auth/realms/sso/protocol/openid-connect/token';
export const REGION = 'europe-west6';
export const MAX_FILE_BYTES = 40 * 1024 * 1024;

// ─── Token cache ─────────────────────────────────────────────────────────────
interface TokenCache { accessToken: string; expiresAt: number }
let tokenCache: TokenCache | null = null;

export async function getDeepSignAccessToken(
  clientId: string,
  clientSecret: string,
  username: string,
  password: string,
): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + 60_000) {
    return tokenCache.accessToken;
  }
  const params = new URLSearchParams({
    grant_type: 'password',
    client_id: clientId,
    client_secret: clientSecret,
    username,
    password,
  });
  const response = await axios.post<{ access_token: string; expires_in: number }>(
    DEEPSIGN_AUTH_URL,
    params.toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  );
  const { access_token, expires_in } = response.data;
  tokenCache = { accessToken: access_token, expiresAt: now + expires_in * 1000 };
  return access_token;
}

// ─── HMAC helpers ─────────────────────────────────────────────────────────────
export function computeWebhookToken(esignId: string, secret: string): string {
  return createHmac('sha256', secret).update(esignId).digest('hex');
}

export function verifyWebhookToken(esignId: string, token: string, secret: string): boolean {
  const expected = computeWebhookToken(esignId, secret);
  try {
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(token, 'hex');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// ─── Storage helper ───────────────────────────────────────────────────────────
import { getStorage } from 'firebase-admin/storage';

export async function downloadFromStorage(storagePath: string): Promise<Buffer> {
  const [buffer] = await getStorage().bucket().file(storagePath).download();
  if (buffer.length > MAX_FILE_BYTES) {
    throw new Error(`File exceeds 40 MB limit (${buffer.length} bytes)`);
  }
  return buffer;
}
