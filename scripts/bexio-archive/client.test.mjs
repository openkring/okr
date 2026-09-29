import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBexioClient } from './client.mjs';

const res = (status, body, headers = {}) => ({
  status, ok: status >= 200 && status < 300,
  headers: { get: (k) => headers[k.toLowerCase()] ?? null },
  json: async () => body, arrayBuffer: async () => new TextEncoder().encode(String(body)).buffer,
});

test('retries 429 with Retry-After, then succeeds', async () => {
  const calls = []; const slept = [];
  const fetchImpl = async (url) => { calls.push(url); return calls.length === 1 ? res(429, {}, { 'retry-after': '2' }) : res(200, [{ id: 1 }]); };
  const c = createBexioClient({ token: 't', fetchImpl, sleep: async (ms) => slept.push(ms) });
  assert.deepEqual(await c.get('/2.0/kb_invoice/1/comment'), [{ id: 1 }]);
  assert.deepEqual(slept, [2000]);
});

test('404 returns null instead of throwing', async () => {
  const c = createBexioClient({ token: 't', fetchImpl: async () => res(404, {}), sleep: async () => {} });
  assert.equal(await c.get('/3.0/accounting/manual_entries/1/entries/2/files'), null);
});

test('getAll pages by offset until a short page', async () => {
  const pages = [[1, 2], [3]];
  const fetchImpl = async (url) => res(200, pages[new URL(url).searchParams.get('offset') === '0' ? 0 : 1]);
  const c = createBexioClient({ token: 't', fetchImpl, sleep: async () => {} });
  assert.deepEqual(await c.getAll('/3.0/accounting/journal', 2), [1, 2, 3]);
});

test('getAll keeps a query already in the path', async () => {
  const seen = [];
  const fetchImpl = async (url) => { seen.push(new URL(url).searchParams.get('archived_state')); return res(200, []); };
  const c = createBexioClient({ token: 't', fetchImpl, sleep: async () => {} });
  await c.getAll('/3.0/files?archived_state=all');
  assert.deepEqual(seen, ['all']);
});

test('getV4All pages until page_count', async () => {
  const fetchImpl = async (url) => {
    const page = Number(new URL(url).searchParams.get('page'));
    return res(200, { data: [page], paging: { page, page_count: 2 } });
  };
  const c = createBexioClient({ token: 't', fetchImpl, sleep: async () => {} });
  assert.deepEqual(await c.getV4All('/4.0/purchase/bills'), [1, 2]);
});

test('500 throws with the path, never the token', async () => {
  const c = createBexioClient({ token: 'SECRET', fetchImpl: async () => res(500, {}), sleep: async () => {} });
  await assert.rejects(c.get('/2.0/x'), (e) => e.message.includes('/2.0/x') && !e.message.includes('SECRET'));
});

test('getAll throws when a list endpoint is missing instead of returning an empty list', async () => {
  const c = createBexioClient({ token: 't', fetchImpl: async () => res(404, {}), sleep: async () => {} });
  await assert.rejects(c.getAll('/3.0/accounting/journal'), /no list/);
});
