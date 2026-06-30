import { createHmac, timingSafeEqual } from 'crypto';
import { defineSecret } from 'firebase-functions/params';
import { HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import axios from 'axios';
import { EsignSignee, EsignSignStatus } from '@bk2/shared-models';

// ─── Environment switch ───────────────────────────────────────────────────────
// Flip the entire DeepSign integration (endpoints + credentials) between the
// integration/test and production tenants with a single value: 'int' | 'prod'.
//   firebase functions:secrets:set DEEPSIGN_ENV   →  enter "int" or "prod"
// Anything other than 'int' resolves to 'prod' (safe default).
export const deepsignEnv = defineSecret('DEEPSIGN_ENV');

// ─── Credentials (separate int / prod sets, selected by DEEPSIGN_ENV) ──────────
const deepsignClientIdProd        = defineSecret('DEEPSIGN_CLIENT_ID_PROD');
const deepsignClientIdInt         = defineSecret('DEEPSIGN_CLIENT_ID_INT');
const deepsignClientSecretProd    = defineSecret('DEEPSIGN_CLIENT_SECRET_PROD');
const deepsignClientSecretInt     = defineSecret('DEEPSIGN_CLIENT_SECRET_INT');
const deepsignServiceUsernameProd = defineSecret('DEEPSIGN_SERVICE_USERNAME_PROD');
const deepsignServiceUsernameInt  = defineSecret('DEEPSIGN_SERVICE_USERNAME_INT');
const deepsignServicePasswordProd = defineSecret('DEEPSIGN_SERVICE_PASSWORD_PROD');
const deepsignServicePasswordInt  = defineSecret('DEEPSIGN_SERVICE_PASSWORD_INT');

// The webhook HMAC key is OUR own secret — DeepSign only echoes the token back, it
// never validates it — so it is independent of the DeepSign environment and shared
// across both. A single deployed webhook function verifies int and prod callbacks.
export const webhookSecret = defineSecret('WEBHOOK_SECRET');

export const ALL_ESIGN_SECRETS = [
  deepsignEnv,
  deepsignClientIdProd, deepsignClientIdInt,
  deepsignClientSecretProd, deepsignClientSecretInt,
  deepsignServiceUsernameProd, deepsignServiceUsernameInt,
  deepsignServicePasswordProd, deepsignServicePasswordInt,
  webhookSecret,
] as const;

// ─── Per-environment endpoints (URLs are not secret, so they live in code) ─────
const ENDPOINTS = {
  prod: {
    apiBase: 'https://api.sign.deepbox.swiss/api/v1',
    authUrl: 'https://deepcloud.swiss/auth/realms/sso/protocol/openid-connect/token',
  },
  int: {
    apiBase: 'https://api.int.sign.deepbox.swiss/api/v1',
    authUrl: 'https://int.deepcloud.swiss/auth/realms/sso/protocol/openid-connect/token',
  },
} as const;

export type DeepSignEnv = keyof typeof ENDPOINTS;

/** Active environment, derived from the DEEPSIGN_ENV secret ('int' or 'prod'). */
function activeEnv(): DeepSignEnv {
  return deepsignEnv.value() === 'int' ? 'int' : 'prod';
}

export interface EsignConfig {
  apiBase: string;
  authUrl: string;
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
}

/** Resolve the active DeepSign config (endpoints + credentials) from DEEPSIGN_ENV. */
export function getEsignConfig(): EsignConfig {
  const env = activeEnv();
  const { apiBase, authUrl } = ENDPOINTS[env];
  if (env === 'int') {
    return {
      apiBase, authUrl,
      clientId: deepsignClientIdInt.value(),
      clientSecret: deepsignClientSecretInt.value(),
      username: deepsignServiceUsernameInt.value(),
      password: deepsignServicePasswordInt.value(),
    };
  }
  return {
    apiBase, authUrl,
    clientId: deepsignClientIdProd.value(),
    clientSecret: deepsignClientSecretProd.value(),
    username: deepsignServiceUsernameProd.value(),
    password: deepsignServicePasswordProd.value(),
  };
}

/** Base URL of the active DeepSign API (cheap helper for handlers). */
export function getEsignApiBase(): string {
  return ENDPOINTS[activeEnv()].apiBase;
}

export const REGION = 'europe-west6';
export const MAX_FILE_BYTES = 40 * 1024 * 1024;

// ─── Token cache ─────────────────────────────────────────────────────────────
interface TokenCache { accessToken: string; expiresAt: number }
let tokenCache: TokenCache | null = null;

export async function getDeepSignAccessToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + 60_000) {
    return tokenCache.accessToken;
  }
  const cfg = getEsignConfig();
  const params = new URLSearchParams({
    grant_type: 'password',
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    username: cfg.username,
    password: cfg.password,
  });
  const response = await axios.post<{ access_token: string; expires_in: number }>(
    cfg.authUrl,
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

// ─── Signee mapping ───────────────────────────────────────────────────────────
const SIGN_STATUSES: readonly EsignSignStatus[] = ['on-hold', 'pending', 'in-progress', 'signed', 'rejected'];

/**
 * Project DeepSign's raw signee objects onto our flat EsignSignee shape.
 * DeepSign returns extra nested properties (some are arrays-of-arrays, which Firestore
 * rejects with "Nested arrays are not allowed"), so we keep only the fields our schema
 * and the webhook rely on — crucially `signeeId`, which the webhook matches events on.
 * Status timestamps are left undefined here; the webhook fills them in as events arrive.
 */
export function mapDeepSignSignees(raw: unknown): EsignSignee[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const o = (entry ?? {}) as Record<string, unknown>;
    const status = o['signStatus'];
    const signee: EsignSignee = {
      signeeId: String(o['signeeId'] ?? o['id'] ?? ''),
      email: String(o['email'] ?? ''),
      signOrder: typeof o['signOrder'] === 'number' ? (o['signOrder'] as number) : 0,
      signStatus: SIGN_STATUSES.includes(status as EsignSignStatus) ? (status as EsignSignStatus) : 'pending',
    };
    if (typeof o['name'] === 'string' && o['name']) signee.name = o['name'] as string;
    if (typeof o['signeeComment'] === 'string' && o['signeeComment']) signee.signeeComment = o['signeeComment'] as string;
    return signee;
  });
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

// ─── Authorization helpers (H-5) ───────────────────────────────────────────────
// Authorization is derived from the caller's users/{uid} document, NOT from a
// custom claim (token.tenantId is never minted in this project).

/** Tenants the caller belongs to, from users/{uid}.tenants. Empty if no doc. */
export async function getCallerTenants(uid: string): Promise<string[]> {
  const snap = await getFirestore().collection('users').doc(uid).get();
  const tenants = snap.data()?.tenants;
  return Array.isArray(tenants) ? (tenants as string[]) : [];
}

/**
 * Authorize access to an esign record loaded by esignId. Allowed when the caller
 * is the record owner, or a member of the record's tenant. Prevents reading or
 * mutating another tenant's/user's signing process by guessing the document id.
 * Owner-based access also covers legacy records whose tenantId was never set.
 */
export async function assertEsignAccess(
  uid: string,
  record: { ownerUserId?: string; tenantId?: string },
): Promise<void> {
  if (record.ownerUserId && record.ownerUserId === uid) return;
  if (record.tenantId && (await getCallerTenants(uid)).includes(record.tenantId)) return;
  throw new HttpsError('permission-denied', 'You do not have access to this signing process.');
}
