import { describe, expect, it, vi } from 'vitest';
import { PingenError, makePingenClient } from './pingen-client';

interface Call {
  url: string;
  init: RequestInit;
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

const OPTIONS = { deliveryProduct: 'cheap', printMode: 'simplex', printSpectrum: 'grayscale' } as const;
const LETTER_BODY = {
  data: { id: 'L1', attributes: { status: 'valid', file_pages: 2, price_value: 1.2, price_currency: 'CHF' } },
};

function setup(overrides: Partial<Record<string, (c: Call) => Response>> = {}, env: 'staging' | 'production' = 'staging') {
  const calls: Call[] = [];
  let t = 1_000_000;
  const fetchFn = vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
    const call = { url: String(url), init };
    calls.push(call);
    const path = new URL(call.url).pathname;
    const key = `${init.method ?? 'GET'} ${path}`;
    const h = overrides[key];
    if (h) return h(call);
    if (path === '/auth/access-tokens') return json(200, { access_token: 'TOK', expires_in: 3600, token_type: 'Bearer' });
    if (path === '/file-upload') return json(200, { data: { attributes: { url: 'https://upload.example/x', url_signature: 'SIG' } } });
    if (init.method === 'PUT') return new Response(null, { status: 200 });
    if (path.endsWith('/deliveries/letters')) return json(201, LETTER_BODY);
    if (path.startsWith('/organisations/')) return json(200, { data: { attributes: { billing_balance: 12.5, missing_credits: 0, billing_currency: 'CHF' } } });
    return json(404, {});
  });
  const clock = { now: () => t, advance: (ms: number) => (t += ms) };
  const client = makePingenClient({
    fetch: fetchFn as unknown as typeof fetch,
    now: clock.now,
    clientId: 'cid',
    clientSecret: 'csec',
    organisationId: 'org1',
    env,
  });
  return { client, calls, clock };
}

const input = { pdf: Buffer.from('%PDF'), fileName: 'rec1.pdf', options: OPTIONS, idempotencyKey: 'rec1' };

describe('pingen client', () => {
  it('caches the token until 60 s before expiry', async () => {
    const { client, calls, clock } = setup();
    await client.createLetter(input);
    await client.createLetter(input);
    const tokenCalls = () => calls.filter(c => c.url.includes('/auth/access-tokens')).length;
    expect(tokenCalls()).toBe(1);
    clock.advance(3600 * 1000 - 59_000);
    await client.createLetter(input);
    expect(tokenCalls()).toBe(2);
  });

  it('posts the token request as client credentials form', async () => {
    const { client, calls } = setup();
    await client.readOrganisation();
    const tok = calls.find(c => c.url.includes('/auth/access-tokens'))!;
    expect(tok.url).toBe('https://identity-staging.pingen.com/auth/access-tokens');
    const body = new URLSearchParams(String(tok.init.body));
    expect(body.get('grant_type')).toBe('client_credentials');
    expect(body.get('client_id')).toBe('cid');
    expect(body.get('client_secret')).toBe('csec');
  });

  it('uploads then creates', async () => {
    const { client, calls } = setup();
    const letter = await client.createLetter(input);
    const seq = calls.filter(c => !c.url.includes('/auth/')).map(c => `${c.init.method ?? 'GET'} ${new URL(c.url).pathname}`);
    expect(seq).toEqual(['GET /file-upload', 'PUT /x', 'POST /organisations/org1/deliveries/letters']);
    const put = calls.find(c => c.init.method === 'PUT')!;
    expect(put.url).toBe('https://upload.example/x');
    expect(Buffer.from(put.init.body as Uint8Array)).toEqual(input.pdf);
    const post = calls[calls.length - 1];
    expect((post.init.headers as Record<string, string>)['Content-Type']).toBe('application/vnd.api+json');
    const body = JSON.parse(String(post.init.body));
    expect(body.data.type).toBe('letters');
    expect(body.data.attributes).toEqual({
      file_original_name: 'rec1.pdf',
      file_url: 'https://upload.example/x',
      file_url_signature: 'SIG',
      address_position: 'right',
      auto_send: true,
      delivery_product: 'cheap',
      print_mode: 'simplex',
      print_spectrum: 'grayscale',
    });
    expect(letter).toEqual({ id: 'L1', status: 'valid', filePages: 2, priceValue: 1.2, priceCurrency: 'CHF' });
  });

  it('sends the record id as Idempotency-Key', async () => {
    const { client, calls } = setup();
    await client.createLetter(input);
    const post = calls[calls.length - 1];
    expect((post.init.headers as Record<string, string>)['Idempotency-Key']).toBe('rec1');
  });

  it.each([
    [429, true],
    [500, true],
    [503, true],
    [422, false],
    [401, false],
  ])('maps %i to retryable=%s', async (status, retryable) => {
    const { client } = setup({ 'POST /organisations/org1/deliveries/letters': () => json(status, { errors: [] }) });
    const err = await client.createLetter(input).catch(e => e);
    expect(err).toBeInstanceOf(PingenError);
    expect(err.status).toBe(status);
    expect(err.retryable).toBe(retryable);
  });

  it('staging uses api-staging.pingen.com, production api.pingen.com', async () => {
    const s = setup();
    await s.client.createLetter(input);
    expect(s.calls.filter(c => !c.url.includes('identity')).every(c => c.url.startsWith('https://api-staging.pingen.com') || c.url.startsWith('https://upload.example'))).toBe(true);
    const p = setup({}, 'production');
    await p.client.readOrganisation();
    expect(p.calls[0].url).toBe('https://identity.pingen.com/auth/access-tokens');
    expect(p.calls[1].url).toBe('https://api.pingen.com/organisations/org1');
  });

  it('forwards the file name unchanged (staging simulation uses recipient name)', async () => {
    const { client, calls } = setup();
    await client.createLetter({ ...input, fileName: 'Test_simulate_undeliverable.pdf' });
    const body = JSON.parse(String(calls[calls.length - 1].init.body));
    expect(body.data.attributes.file_original_name).toBe('Test_simulate_undeliverable.pdf');
  });

  it('reads the organisation balance', async () => {
    const { client } = setup();
    expect(await client.readOrganisation()).toEqual({ billingBalance: 12.5, missingCredits: 0, currency: 'CHF' });
  });

  it('treats a network failure as retryable', async () => {
    const calls: string[] = [];
    const client = makePingenClient({
      fetch: (async (u: string) => {
        calls.push(u);
        throw new TypeError('fetch failed');
      }) as unknown as typeof fetch,
      now: () => 0,
      clientId: 'a',
      clientSecret: 'b',
      organisationId: 'o',
      env: 'staging',
    });
    const err = await client.readOrganisation().catch(e => e);
    expect(err).toBeInstanceOf(PingenError);
    expect(err.retryable).toBe(true);
  });
});
