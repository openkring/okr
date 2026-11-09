// apps/functions/src/pingen/pingen-client.ts
//
// Minimal Pingen REST client (letters). Plain `fetch`, injected so tests never touch the network.
//
// Pinned against https://api.pingen.com/documentation (OpenAPI 2.0.0, checked 2026-11-09):
//   - Token (client credentials): POST {identity}/auth/access-tokens, form-urlencoded
//     grant_type=client_credentials, client_id, client_secret, optional scope.
//     identity = https://identity.pingen.com (production) | https://identity-staging.pingen.com (staging).
//     Response { token_type: 'Bearer', expires_in, access_token }.
//   - Resource API: https://api.pingen.com (production) | https://api-staging.pingen.com (staging).
//   - Staging is a fully separate environment with its own account and client ids.
//   - Rate limit 300 requests/minute; 429 carries Retry-After.
import { defineSecret, defineString } from 'firebase-functions/params';
import type { PostOptions } from '@okr/shared-models';

// Set with: firebase functions:secrets:set PINGEN_CLIENT_ID / PINGEN_CLIENT_SECRET
export const pingenClientId = defineSecret('PINGEN_CLIENT_ID');
export const pingenClientSecret = defineSecret('PINGEN_CLIENT_SECRET');
export const pingenOrganisationId = defineString('PINGEN_ORGANISATION_ID');
export const pingenEnv = defineString('PINGEN_ENV', { default: 'staging' });

const HOSTS = {
  staging: { api: 'https://api-staging.pingen.com', identity: 'https://identity-staging.pingen.com' },
  production: { api: 'https://api.pingen.com', identity: 'https://identity.pingen.com' },
} as const;

/** Refresh the token this long before it expires. */
const TOKEN_SAFETY_MS = 60_000;

export class PingenError extends Error {
  constructor(message: string, public readonly status: number, public readonly retryable: boolean, public readonly retryAfterSeconds?: number) {
    super(message);
    this.name = 'PingenError';
  }
}

export interface PingenLetter {
  id: string;
  status: string;
  filePages: number;
  priceValue: number;
  priceCurrency: string;
}

export interface PingenClient {
  createLetter(input: { pdf: Buffer; fileName: string; options: PostOptions; idempotencyKey: string }): Promise<PingenLetter>;
  readOrganisation(): Promise<{ billingBalance: number; missingCredits: number; currency: string }>;
}

export interface PingenClientDeps {
  fetch: typeof fetch;
  now: () => number;
  clientId: string;
  clientSecret: string;
  organisationId: string;
  env: 'staging' | 'production';
}

// 429 and 5xx (and network failures, status 0) can succeed on retry; other 4xx cannot.
const isRetryable = (status: number): boolean => status === 429 || status >= 500;

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export function makePingenClient(deps: PingenClientDeps): PingenClient {
  const hosts = HOSTS[deps.env];
  let token: { value: string; expiresAt: number } | undefined;

  async function send(url: string, init: RequestInit): Promise<Response> {
    let res: Response;
    try {
      res = await deps.fetch(url, init);
    } catch (e) {
      throw new PingenError(`Pingen request failed: ${(e as Error).message}`, 0, true);
    }
    if (!res.ok) {
      const retryAfter = Number(res.headers.get('retry-after'));
      let detail = '';
      try {
        detail = (await res.text()).slice(0, 500);
      } catch {
        /* body unreadable */
      }
      throw new PingenError(`Pingen ${init.method ?? 'GET'} ${new URL(url).pathname} -> ${res.status} ${detail}`.trim(), res.status, isRetryable(res.status), Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined);
    }
    return res;
  }

  async function accessToken(): Promise<string> {
    if (token && deps.now() < token.expiresAt - TOKEN_SAFETY_MS) return token.value;
    const res = await send(`${hosts.identity}/auth/access-tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: deps.clientId, client_secret: deps.clientSecret }).toString(),
    });
    const body = (await res.json()) as Json;
    token = { value: String(body['access_token']), expiresAt: deps.now() + Number(body['expires_in']) * 1000 };
    return token.value;
  }

  async function api(path: string, init: RequestInit = {}, extra: Record<string, string> = {}): Promise<Json> {
    const res = await send(`${hosts.api}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${await accessToken()}`, ...extra },
    });
    return (await res.json()) as Json;
  }

  return {
    async createLetter({ pdf, fileName, options, idempotencyKey }) {
      const upload = (await api('/file-upload'))['data']['attributes'] as Json;
      await send(String(upload['url']), { method: 'PUT', body: new Uint8Array(pdf) });
      const body = await api(
        `/organisations/${encodeURIComponent(deps.organisationId)}/deliveries/letters`,
        {
          method: 'POST',
          body: JSON.stringify({
            data: {
              type: 'letters',
              attributes: {
                file_original_name: fileName,
                file_url: upload['url'],
                file_url_signature: upload['url_signature'],
                address_position: 'right',
                auto_send: true,
                delivery_product: options.deliveryProduct,
                print_mode: options.printMode,
                print_spectrum: options.printSpectrum,
              },
            },
          }),
        },
        { 'Content-Type': 'application/vnd.api+json', 'Idempotency-Key': idempotencyKey }
      );
      const d = body['data'] as Json;
      const a = d['attributes'] as Json;
      return {
        id: String(d['id']),
        status: String(a['status']),
        filePages: Number(a['file_pages']),
        priceValue: Number(a['price_value']),
        priceCurrency: String(a['price_currency']),
      };
    },

    async readOrganisation() {
      const a = (await api(`/organisations/${encodeURIComponent(deps.organisationId)}`))['data']['attributes'] as Json;
      return { billingBalance: Number(a['billing_balance']), missingCredits: Number(a['missing_credits']), currency: String(a['billing_currency']) };
    },
  };
}
