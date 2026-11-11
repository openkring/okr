import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const axiosMock = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('axios', () => ({ default: axiosMock }));
vi.mock('firebase-admin/app', () => ({
  getApp: () => ({ options: { credential: { getAccessToken: async () => ({ access_token: 'tok' }) } } }),
  applicationDefault: () => ({ getAccessToken: async () => ({ access_token: 'adc' }) }),
}));

import {
  CLONE_EXCLUDE_REGEXES,
  cloneStaticAssets,
  finalizeAndRelease,
  getLiveVersion,
  listReleases,
  releaseExisting,
  uploadFiles,
} from './hosting-client';

const BASE = 'https://firebasehosting.googleapis.com/v1beta1';

function lastCalls() {
  return axiosMock.request.mock.calls.map((c) => c[0]);
}

beforeEach(() => {
  axiosMock.request.mockReset();
});

describe('getLiveVersion', () => {
  it('returns the version of the latest release', async () => {
    axiosMock.request.mockResolvedValue({ data: { releases: [{ name: 'sites/s/releases/r', version: { name: 'sites/s/versions/v1' } }] } });
    expect(await getLiveVersion('s')).toBe('sites/s/versions/v1');
    const req = lastCalls()[0];
    expect(req.method).toBe('GET');
    expect(req.url).toBe(`${BASE}/sites/s/channels/live/releases`);
    expect(req.params).toEqual({ pageSize: 1 });
    expect(req.headers.Authorization).toBe('Bearer tok');
  });

  it('returns undefined when the site has no release', async () => {
    axiosMock.request.mockResolvedValue({ data: {} });
    expect(await getLiveVersion('s')).toBeUndefined();
  });
});

describe('cloneStaticAssets', () => {
  it('excludes html, sitemap and robots, does not finalize, and polls the operation', async () => {
    axiosMock.request
      .mockResolvedValueOnce({ data: { name: 'operations/op1', done: false } })
      .mockResolvedValueOnce({ data: { name: 'operations/op1', done: true, response: { name: 'sites/s/versions/v2' } } });
    const v = await cloneStaticAssets('s', 'sites/s/versions/v1', { pollMs: 0 });
    expect(v).toBe('sites/s/versions/v2');
    const [clone, poll] = lastCalls();
    expect(clone.method).toBe('POST');
    expect(clone.url).toBe(`${BASE}/sites/s/versions:clone`);
    expect(clone.data).toEqual({
      sourceVersion: 'sites/s/versions/v1',
      finalize: false,
      exclude: { regexes: ['^/[^/]*\\.html$', '^/(en|fr|es|it)/[^/]*\\.html$', '^/sitemap\\.xml$', '^/robots\\.txt$'] },
    });
    expect(poll.method).toBe('GET');
    expect(poll.url).toBe(`${BASE}/operations/op1`);
  });

  it('throws when the operation fails', async () => {
    axiosMock.request.mockResolvedValue({ data: { name: 'operations/op1', done: true, error: { message: 'boom' } } });
    await expect(cloneStaticAssets('s', 'sites/s/versions/v1', { pollMs: 0 })).rejects.toThrow('boom');
  });

  it('gives up after the poll limit', async () => {
    axiosMock.request.mockResolvedValue({ data: { name: 'operations/op1', done: false } });
    await expect(cloneStaticAssets('s', 'sites/s/versions/v1', { pollMs: 0, maxPolls: 2 })).rejects.toThrow(/did not finish/);
  });
});

describe('uploadFiles', () => {
  it('populates with gzip hashes and uploads only the requested ones', async () => {
    const a = { path: 'index.html', content: '<p>a</p>' };
    const b = { path: 'en/x.html', content: '<p>b</p>' };
    const gz = (s: string) => gzipSync(Buffer.from(s, 'utf8'), { level: 9 });
    const hash = (s: string) => createHash('sha256').update(gz(s)).digest('hex');
    axiosMock.request
      .mockResolvedValueOnce({ data: { uploadRequiredHashes: [hash(a.content)], uploadUrl: 'https://upload.example/up' } })
      .mockResolvedValueOnce({ data: {} });
    await uploadFiles('sites/s/versions/v2', [a, b]);
    const [populate, upload] = lastCalls();
    expect(axiosMock.request).toHaveBeenCalledTimes(2);
    expect(populate.url).toBe(`${BASE}/sites/s/versions/v2:populateFiles`);
    expect(populate.data).toEqual({ files: { '/index.html': hash(a.content), '/en/x.html': hash(b.content) } });
    expect(upload.url).toBe(`https://upload.example/up/${hash(a.content)}`);
    expect(upload.headers['Content-Type']).toBe('application/octet-stream');
    expect(Buffer.isBuffer(upload.data)).toBe(true);
  });

  it('uploads nothing when every hash is already known', async () => {
    axiosMock.request.mockResolvedValueOnce({ data: { uploadUrl: 'https://u' } });
    await uploadFiles('sites/s/versions/v2', [{ path: 'a.html', content: 'x' }]);
    expect(axiosMock.request).toHaveBeenCalledTimes(1);
  });
});

describe('finalizeAndRelease', () => {
  it('finalizes then releases', async () => {
    axiosMock.request.mockResolvedValueOnce({ data: {} }).mockResolvedValueOnce({ data: { name: 'sites/s/releases/r9' } });
    expect(await finalizeAndRelease('s', 'sites/s/versions/v2', 'msg')).toBe('sites/s/releases/r9');
    const [fin, rel] = lastCalls();
    expect(fin.method).toBe('PATCH');
    expect(fin.url).toBe(`${BASE}/sites/s/versions/v2`);
    expect(fin.params).toEqual({ update_mask: 'status' });
    expect(fin.data).toEqual({ status: 'FINALIZED' });
    expect(rel.method).toBe('POST');
    expect(rel.url).toBe(`${BASE}/sites/s/releases`);
    expect(rel.params).toEqual({ versionName: 'sites/s/versions/v2' });
    expect(rel.data).toEqual({ message: 'msg' });
  });
});

describe('releaseExisting', () => {
  it('releases an already finalized version without finalizing', async () => {
    axiosMock.request.mockResolvedValueOnce({ data: { name: 'sites/s/releases/r1' } });
    expect(await releaseExisting('s', 'sites/s/versions/v1', 'rollback')).toBe('sites/s/releases/r1');
    expect(axiosMock.request).toHaveBeenCalledTimes(1);
    expect(lastCalls()[0].params).toEqual({ versionName: 'sites/s/versions/v1' });
  });
});

describe('listReleases', () => {
  it('maps releases to name, version, createTime', async () => {
    axiosMock.request.mockResolvedValue({
      data: { releases: [{ name: 'sites/s/releases/r', version: { name: 'sites/s/versions/v' }, releaseTime: '2026-01-01T00:00:00Z' }] },
    });
    expect(await listReleases('s', 5)).toEqual([{ name: 'sites/s/releases/r', version: 'sites/s/versions/v', createTime: '2026-01-01T00:00:00Z' }]);
    expect(lastCalls()[0].params).toEqual({ pageSize: 5 });
    expect(lastCalls()[0].url).toBe(`${BASE}/sites/s/channels/live/releases`);
  });

  it('returns [] when there are none', async () => {
    axiosMock.request.mockResolvedValue({ data: {} });
    expect(await listReleases('s', 5)).toEqual([]);
  });
});

describe('CLONE_EXCLUDE_REGEXES', () => {
  const excluded = ['/en/vorstand.html', '/index.html', '/impressum.html', '/sitemap.xml', '/robots.txt'];
  const kept = ['/assets/brand-styleguide.html', '/assets/x/y.html', '/assets/app.js', '/assets/app.html.map', '/assets/logo.svg', '/styles.css'];
  const full = (r: string) => new RegExp('^(?:' + r + ')$');
  const partial = (r: string) => new RegExp(r);
  const hit = (make: (r: string) => RegExp, path: string) => CLONE_EXCLUDE_REGEXES.some((r) => make(r).test(path));

  it.each([
    ['full-match', full],
    ['partial-match', partial],
  ])('excludes the rendered files under %s semantics', (_n, make) => {
    for (const p of excluded) expect(hit(make, p), p).toBe(true);
  });

  it.each([
    ['full-match', full],
    ['partial-match', partial],
  ])('keeps static assets under %s semantics', (_n, make) => {
    for (const p of kept) expect(hit(make, p), p).toBe(false);
  });
});

describe('error hygiene', () => {
  it('never leaks the bearer token through a failed call', async () => {
    const axiosError = Object.assign(new Error('Request failed with status code 403'), {
      isAxiosError: true,
      config: { headers: { Authorization: 'Bearer tok' }, url: `${BASE}/sites/s/channels/live/releases` },
      response: { status: 403, data: { error: { message: 'permission denied' } } },
    });
    axiosMock.request.mockRejectedValue(axiosError);
    const err = await getLiveVersion('s').catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain('403');
    expect(err.message).toContain('permission denied');
    expect(err.message).toContain('/sites/s/channels/live/releases');
    const serialized = JSON.stringify(err, Object.getOwnPropertyNames(err)) + String(err.stack);
    expect(serialized).not.toMatch(/Authorization|Bearer|tok\b/);
    expect(err.config).toBeUndefined();
  });

  it('also wraps a failed upload', async () => {
    axiosMock.request
      .mockResolvedValueOnce({ data: { uploadRequiredHashes: ['h'], uploadUrl: 'https://u/up' } })
      .mockRejectedValueOnce(Object.assign(new Error('x'), { config: { headers: { Authorization: 'Bearer tok' } }, response: { status: 500 } }));
    // hash 'h' is unknown to the client -> its own error, never an axios error
    await expect(uploadFiles('sites/s/versions/v', [{ path: 'a.html', content: 'x' }])).rejects.toThrow(/unknown hash/);
  });
});
