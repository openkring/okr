// Firebase Hosting REST client (v1beta1) for publishWebsite (design §8): clone the live version without
// its HTML, upload the rendered files, finalize, release. Plain axios; no googleapis dependency.
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import axios from 'axios';
import { applicationDefault, getApp } from 'firebase-admin/app';
import type { RenderedFile } from '@okr/cms-website-render';

const BASE = 'https://firebasehosting.googleapis.com/v1beta1';

/** Everything the renderer owns; the clone keeps css, js, images, fonts, … */
export const CLONE_EXCLUDE_REGEXES = ['^.*\\.html$', '^/sitemap\\.xml$', '^/robots\\.txt$'];

export interface ReleaseInfo {
  name: string;
  version: string;
  createTime: string;
}

interface HostingOperation {
  name: string;
  done?: boolean;
  error?: { message?: string };
  response?: { name?: string };
}

async function accessToken(): Promise<string> {
  const credential = getApp().options.credential ?? applicationDefault();
  const token = await credential.getAccessToken();
  return token.access_token;
}

/**
 * An axios error carries `config.headers.Authorization`; thrown as is, it would put the bearer token into
 * the function log. Only method, URL path, status and the API's message leave this module.
 */
function wrapError(error: unknown, method: string, url: string): Error {
  const e = error as { response?: { status?: number; data?: { error?: { message?: string } } }; message?: string };
  let path = url;
  try {
    path = new URL(url).pathname;
  } catch {
    // not a URL: keep as given
  }
  const status = e.response?.status ?? 'no response';
  const detail = e.response?.data?.error?.message ?? (e.response ? '' : 'network error');
  return new Error(`Hosting ${method} ${path} failed (${status})${detail ? `: ${detail}` : ''}`);
}

async function call<T>(method: 'GET' | 'POST' | 'PATCH', url: string, options: { params?: Record<string, unknown>; data?: unknown } = {}): Promise<T> {
  try {
    const response = await axios.request<T>({
      method,
      url,
      params: options.params,
      data: options.data,
      headers: { Authorization: `Bearer ${await accessToken()}` },
      timeout: 60_000,
    });
    return response.data;
  } catch (error) {
    throw wrapError(error, method, url);
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Latest release's version name (`sites/<site>/versions/<id>`), undefined when the site never released. */
export async function getLiveVersion(site: string): Promise<string | undefined> {
  const data = await call<{ releases?: { version?: { name?: string } }[] }>('GET', `${BASE}/sites/${site}/releases`, { params: { pageSize: 1 } });
  return data.releases?.[0]?.version?.name;
}

/** Clones `source` without HTML/sitemap/robots into a new, not yet finalized version; returns its name. */
export async function cloneStaticAssets(site: string, source: string, options: { pollMs?: number; maxPolls?: number } = {}): Promise<string> {
  const pollMs = options.pollMs ?? 1000;
  const maxPolls = options.maxPolls ?? 120;
  let op = await call<HostingOperation>('POST', `${BASE}/sites/${site}/versions:clone`, {
    data: { sourceVersion: source, finalize: false, exclude: { regexes: CLONE_EXCLUDE_REGEXES } },
  });
  for (let i = 0; !op.done; i++) {
    if (i >= maxPolls) throw new Error(`Hosting clone ${op.name} did not finish`);
    await sleep(pollMs);
    op = await call<HostingOperation>('GET', `${BASE}/${op.name}`);
  }
  if (op.error) throw new Error(`Hosting clone failed: ${op.error.message ?? 'unknown error'}`);
  const version = op.response?.name;
  if (!version) throw new Error('Hosting clone returned no version');
  return version;
}

/** Gzips, hashes (sha256 of the gzipped bytes), populates, and uploads only what Hosting does not have yet. */
export async function uploadFiles(version: string, files: RenderedFile[]): Promise<void> {
  const byHash = new Map<string, Buffer>();
  const manifest: Record<string, string> = {};
  for (const file of files) {
    const gzipped = gzipSync(Buffer.from(file.content, 'utf8'), { level: 9 });
    const hash = createHash('sha256').update(gzipped).digest('hex');
    manifest[`/${file.path}`] = hash;
    byHash.set(hash, gzipped);
  }
  const populated = await call<{ uploadRequiredHashes?: string[]; uploadUrl?: string }>('POST', `${BASE}/${version}:populateFiles`, {
    data: { files: manifest },
  });
  const required = populated.uploadRequiredHashes ?? [];
  if (!required.length) return;
  if (!populated.uploadUrl) throw new Error('Hosting populateFiles returned hashes but no uploadUrl');
  const token = await accessToken();
  for (const hash of required) {
    const body = byHash.get(hash);
    if (!body) throw new Error(`Hosting asked for unknown hash ${hash}`);
    const url = `${populated.uploadUrl}/${hash}`;
    try {
      await axios.request({
        method: 'POST',
        url,
        data: body,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
        maxBodyLength: Infinity,
        timeout: 60_000,
      });
    } catch (error) {
      throw wrapError(error, 'POST', url);
    }
  }
}

/** Finalizes a cloned+populated version and releases it; returns the release name. */
export async function finalizeAndRelease(site: string, version: string, message: string): Promise<string> {
  await call('PATCH', `${BASE}/${version}`, { params: { update_mask: 'status' }, data: { status: 'FINALIZED' } });
  return releaseExisting(site, version, message);
}

/** Releases an already finalized version (rollback). */
export async function releaseExisting(site: string, version: string, message: string): Promise<string> {
  const release = await call<{ name: string }>('POST', `${BASE}/sites/${site}/releases`, {
    params: { versionName: version },
    data: { message },
  });
  return release.name;
}

export async function listReleases(site: string, pageSize: number): Promise<ReleaseInfo[]> {
  const data = await call<{ releases?: { name: string; version?: { name?: string }; releaseTime?: string }[] }>('GET', `${BASE}/sites/${site}/releases`, {
    params: { pageSize },
  });
  return (data.releases ?? []).map((r) => ({ name: r.name, version: r.version?.name ?? '', createTime: r.releaseTime ?? '' }));
}
