import { beforeEach, describe, expect, it, vi } from 'vitest';

// Spec 1.115 §4.2 — access to a quick file transfer: the public personal-link API and the
// logged-in member check. The handlers take their I/O as `deps`, so Firestore, Storage and the
// rate-limit counters are in-memory fakes here; only `issueFileUrl` reaches a (stubbed) bucket.
const signed = vi.hoisted(() => ({ calls: [] as { path: string; opts: Record<string, unknown> }[] }));
vi.mock('../_storage/private-bucket', () => ({
  privateBucket: () => ({
    file: (path: string) => ({
      getSignedUrl: async (opts: Record<string, unknown>) => {
        signed.calls.push({ path, opts });
        return ['https://signed.example/file'];
      },
    }),
  }),
}));

import type { FileTransferEventModel, FileTransferModel } from '@okr/shared-models';

import {
  effectiveDisposition, findFileTransferByToken, issueFileUrl, logFileTransferEvent, memberFileAccess, publicOpenFile,
  PublicAccessDeps, publicView, toFileTransferView,
} from './file-transfer-access';
import { hashToken } from './file-transfer-tokens';

const NOW = '2026-10-22T10:00:00.000Z';
const TOKEN = 'tok-anna-0123456789abcdefghijklmnopqrstuvwx';
const OTHER_TOKEN = 'tok-mail-0123456789abcdefghijklmnopqrstuvwx';

function transfer(over: Partial<FileTransferModel> = {}): FileTransferModel {
  return {
    okey: 'T1', tenants: ['scs'], isArchived: false, index: '',
    senderKey: 'sender', senderName: 'Sara Sender', message: 'Hallo',
    files: [
      { index: 0, name: 'Video 1.MOV', size: 100, contentType: 'video/quicktime', path: 'tenant/scs/file-transfer/T1/0-Video_1.MOV', uploaded: true },
      { index: 1, name: 'page.html', size: 10, contentType: 'text/html', path: 'tenant/scs/file-transfer/T1/1-page.html', uploaded: true },
    ],
    totalBytes: 110, groupKeys: [], chatRoomId: '',
    recipients: [
      { id: 'p:anna', kind: 'person', personKey: 'anna', email: 'anna@example.com', name: 'Anna', tokenHash: hashToken(TOKEN), aliasUrl: '', viaGroupKeys: [] },
      { id: 'e:out@example.com', kind: 'email', personKey: '', email: 'out@example.com', name: '', tokenHash: hashToken(OTHER_TOKEN), aliasUrl: '', viaGroupKeys: [] },
    ],
    recipientPersonKeys: ['anna'],
    tokenHashes: [hashToken(TOKEN), hashToken(OTHER_TOKEN)],
    passwordHash: '',
    createdAt: '20261020100000', expiresAt: '2026-10-29T10:00:00.000Z', state: 'open', endedBy: '',
    ...over,
  } as FileTransferModel;
}

interface Fake extends PublicAccessDeps {
  events: Omit<FileTransferEventModel, 'okey'>[];
  issued: { index: number; disposition: string }[];
  counters: Map<string, number>;
  lookups: string[];
}

/** In-memory deps; `checkPassword` accepts exactly 'secret'. Rate-limit counters are fixed-window per `bucket:key`. */
function fakeDeps(t: FileTransferModel | undefined): Fake {
  const counters = new Map<string, number>();
  const fake: Fake = {
    events: [], issued: [], counters, lookups: [],
    findByToken: async (token) => {
      fake.lookups.push(token);
      return t && t.tokenHashes.includes(hashToken(token)) ? t : undefined;
    },
    peekLimit: async (bucket, key, opts) => (counters.get(`${bucket}:${key}`) ?? 0) >= opts.limit,
    hitLimit: async (bucket, key, opts) => {
      const n = counters.get(`${bucket}:${key}`) ?? 0;
      if (n >= opts.limit) return false;
      counters.set(`${bucket}:${key}`, n + 1);
      return true;
    },
    checkPassword: async (pw) => pw === 'secret',
    issueFileUrl: async (_t, index, disposition) => {
      fake.issued.push({ index, disposition });
      return 'https://signed.example/file';
    },
    logEvent: async (e) => { fake.events.push(e); },
    now: () => NOW,
  };
  return fake;
}

describe('toFileTransferView', () => {
  it('returns only the public fields — no paths, hashes, emails or other recipients', () => {
    const view = toFileTransferView(transfer({ passwordHash: 'aa:bb' }), true);
    expect(view).toEqual({
      transferKey: 'T1', senderName: 'Sara Sender', message: 'Hallo', expiresAt: '2026-10-29T10:00:00.000Z', needsPassword: true,
      files: [
        { index: 0, name: 'Video 1.MOV', size: 100, contentType: 'video/quicktime' },
        { index: 1, name: 'page.html', size: 10, contentType: 'text/html' },
      ],
    });
    const json = JSON.stringify(view);
    for (const leak of ['tenant/scs', hashToken(TOKEN), 'aa:bb', 'anna@example.com', 'out@example.com', 'Anna']) {
      expect(json).not.toContain(leak);
    }
  });
});

describe('publicView (GET /file-transfer/:token)', () => {
  it('returns the view for a valid token', async () => {
    const deps = fakeDeps(transfer());
    const r = await publicView(TOKEN, '1.2.3.4', deps);
    expect(r.status).toBe(200);
    expect((r.body as { transferKey: string }).transferKey).toBe('T1');
    expect((r.body as { needsPassword: boolean }).needsPassword).toBe(false);
  });

  it('answers 404 for an unknown token', async () => {
    const r = await publicView('unknown-token-0123456789abcdefghijklmnop', '1.2.3.4', fakeDeps(transfer()));
    expect(r).toEqual({ status: 404, body: { error: { code: 'notFound' } } });
  });

  it('answers 404 without a lookup for a malformed token', async () => {
    const deps = fakeDeps(transfer());
    expect((await publicView('a/b', '1.2.3.4', deps)).status).toBe(404);
    expect(deps.lookups).toEqual([]);
  });

  it('rejects expired and ended transfers', async () => {
    for (const t of [transfer({ state: 'ended' }), transfer({ expiresAt: '2026-10-22T09:59:59.000Z' }), transfer({ state: 'expired' })]) {
      const deps = fakeDeps(t);
      expect(await publicView(TOKEN, '1.2.3.4', deps)).toEqual({ status: 410, body: { error: { code: 'expired' } } });
      const open = await publicOpenFile(TOKEN, { fileIndex: 0, disposition: 'inline' }, '1.2.3.4', deps);
      expect(open.status).toBe(410);
      expect(deps.issued).toEqual([]);
      expect(deps.events).toEqual([]);
    }
  });

  it('flags needsPassword when the transfer has one', async () => {
    const r = await publicView(TOKEN, '1.2.3.4', fakeDeps(transfer({ passwordHash: 'aa:bb' })));
    expect((r.body as { needsPassword: boolean }).needsPassword).toBe(true);
  });

  it('rate-limits per client IP (120 / 15 min)', async () => {
    const deps = fakeDeps(transfer());
    for (let i = 0; i < 120; i++) expect((await publicView(TOKEN, '9.9.9.9', deps)).status).toBe(200);
    expect(await publicView(TOKEN, '9.9.9.9', deps)).toEqual({ status: 429, body: { error: { code: 'rateLimited' } } });
    expect((await publicView(TOKEN, '8.8.8.8', deps)).status).toBe(200);
  });
});

describe('publicOpenFile (POST /file-transfer/:token/file)', () => {
  let deps: Fake;
  beforeEach(() => { deps = fakeDeps(transfer()); });

  it("writes 'opened' for inline, with the recipient id, fileIndex and senderKey — never an IP", async () => {
    const r = await publicOpenFile(TOKEN, { fileIndex: 0, disposition: 'inline' }, '1.2.3.4', deps);
    expect(r).toEqual({ status: 200, body: { url: 'https://signed.example/file' } });
    expect(deps.issued).toEqual([{ index: 0, disposition: 'inline' }]);
    expect(deps.events).toEqual([{
      tenants: ['scs'], transferKey: 'T1', senderKey: 'sender', type: 'opened', recipientId: 'p:anna', actorKey: '', fileIndex: 0, at: NOW,
    }]);
    expect(JSON.stringify(deps.events)).not.toContain('1.2.3.4');
  });

  it("writes 'downloaded' for attachment, attributed to the link's recipient", async () => {
    await publicOpenFile(OTHER_TOKEN, { fileIndex: 1, disposition: 'attachment' }, '1.2.3.4', deps);
    expect(deps.events).toEqual([expect.objectContaining({ type: 'downloaded', recipientId: 'e:out@example.com', actorKey: '', fileIndex: 1 })]);
  });

  it('forces attachment (and logs a download) when inline is asked for a type that may not render inline', async () => {
    await publicOpenFile(TOKEN, { fileIndex: 1, disposition: 'inline' }, '1.2.3.4', deps);
    expect(deps.issued).toEqual([{ index: 1, disposition: 'attachment' }]);
    expect(deps.events[0].type).toBe('downloaded');
  });

  it('answers 400 for a bad file index or disposition', async () => {
    for (const body of [{ fileIndex: 7, disposition: 'inline' }, { fileIndex: -1, disposition: 'inline' }, { fileIndex: '0', disposition: 'inline' },
      { fileIndex: 0, disposition: 'evil' }, null]) {
      expect((await publicOpenFile(TOKEN, body, '1.2.3.4', deps)).status).toBe(400);
    }
    expect(deps.events).toEqual([]);
  });

  it('answers 404 for an unknown token', async () => {
    expect((await publicOpenFile('unknown-token-0123456789abcdefghijklmnop', { fileIndex: 0, disposition: 'inline' }, '1.2.3.4', deps)).status).toBe(404);
  });

  describe('with a password', () => {
    beforeEach(() => { deps = fakeDeps(transfer({ passwordHash: 'aa:bb' })); });

    it('answers 401 without a password and logs nothing', async () => {
      const r = await publicOpenFile(TOKEN, { fileIndex: 0, disposition: 'attachment' }, '1.2.3.4', deps);
      expect(r).toEqual({ status: 401, body: { error: { code: 'wrongPassword' } } });
      expect(deps.issued).toEqual([]);
      expect(deps.events).toEqual([]);
    });

    it('answers 401 for a wrong password', async () => {
      expect((await publicOpenFile(TOKEN, { fileIndex: 0, disposition: 'attachment', password: 'nope' }, '1.2.3.4', deps)).status).toBe(401);
    });

    it('issues the url for the right password', async () => {
      const r = await publicOpenFile(TOKEN, { fileIndex: 0, disposition: 'attachment', password: 'secret' }, '1.2.3.4', deps);
      expect(r.status).toBe(200);
      expect(deps.events).toEqual([expect.objectContaining({ type: 'downloaded', recipientId: 'p:anna' })]);
    });

    it('rate-limits wrong passwords: 5 per token within 15 min, then 429 even for the right one', async () => {
      for (let i = 0; i < 5; i++) {
        expect((await publicOpenFile(TOKEN, { fileIndex: 0, disposition: 'inline', password: `bad${i}` }, `10.0.0.${i}`, deps)).status).toBe(401);
      }
      expect(deps.counters.get(`transferPw:${hashToken(TOKEN)}`)).toBe(5);
      const r = await publicOpenFile(TOKEN, { fileIndex: 0, disposition: 'inline', password: 'secret' }, '10.0.0.9', deps);
      expect(r).toEqual({ status: 429, body: { error: { code: 'rateLimited' } } });
      expect(deps.issued).toEqual([]);
      // another recipient's link of the same transfer has its own bucket
      expect((await publicOpenFile(OTHER_TOKEN, { fileIndex: 0, disposition: 'inline', password: 'secret' }, '10.0.0.9', deps)).status).toBe(200);
    });

    it('does not count right passwords (a recipient may open many files)', async () => {
      for (let i = 0; i < 8; i++) {
        expect((await publicOpenFile(TOKEN, { fileIndex: 0, disposition: 'inline', password: 'secret' }, '1.2.3.4', deps)).status).toBe(200);
      }
      expect(deps.counters.get(`transferPw:${hashToken(TOKEN)}`)).toBeUndefined();
    });

    it('rate-limits wrong passwords per client IP: 60 within 15 min across tokens', async () => {
      deps.counters.set('transferPwIp:6.6.6.6', 60);
      const r = await publicOpenFile(TOKEN, { fileIndex: 0, disposition: 'inline', password: 'secret' }, '6.6.6.6', deps);
      expect(r.status).toBe(429);
      expect((await publicOpenFile(TOKEN, { fileIndex: 0, disposition: 'inline', password: 'secret' }, '7.7.7.7', deps)).status).toBe(200);
    });
  });
});

describe('findFileTransferByToken', () => {
  it("looks up by 'tokenHashes array-contains hashToken(token)' — the token itself never reaches Firestore", async () => {
    const wheres: unknown[][] = [];
    const t = transfer();
    const { okey, ...data } = t;
    const query = {
      where: (...args: unknown[]) => { wheres.push(args); return query; },
      limit: () => query,
      get: async () => ({ empty: false, docs: [{ id: okey, data: () => data }] }),
    };
    const db = { collection: (name: string) => { expect(name).toBe('file-transfers'); return query; } };
    const found = await findFileTransferByToken(db as never, TOKEN);
    expect(wheres).toEqual([['tokenHashes', 'array-contains', hashToken(TOKEN)]]);
    expect(found?.okey).toBe('T1');
    expect(found?.files.length).toBe(2);
  });

  it('returns undefined when nothing matches', async () => {
    const query = { where: () => query, limit: () => query, get: async () => ({ empty: true, docs: [] }) };
    expect(await findFileTransferByToken({ collection: () => query } as never, TOKEN)).toBeUndefined();
  });
});

describe('logFileTransferEvent', () => {
  it('adds a plain object to file-transfer-events', async () => {
    const added: { name: string; data: unknown }[] = [];
    const db = { collection: (name: string) => ({ add: async (data: unknown) => { added.push({ name, data }); } }) };
    const e = { tenants: ['scs'], transferKey: 'T1', senderKey: 'sender', type: 'opened' as const, recipientId: 'p:anna', actorKey: '', fileIndex: 0, at: NOW };
    await logFileTransferEvent(db as never, e);
    expect(added).toEqual([{ name: 'file-transfer-events', data: e }]);
    expect(Object.getPrototypeOf(added[0].data)).toBe(Object.prototype);
  });
});

describe('effectiveDisposition', () => {
  it('allows inline only for video, image (not svg) and pdf', () => {
    expect(effectiveDisposition('video/mp4', 'inline')).toBe('inline');
    expect(effectiveDisposition('image/jpeg', 'inline')).toBe('inline');
    expect(effectiveDisposition('Application/PDF; charset=x', 'inline')).toBe('inline');
    expect(effectiveDisposition('image/svg+xml', 'inline')).toBe('attachment');
    expect(effectiveDisposition('text/html', 'inline')).toBe('attachment');
    expect(effectiveDisposition('', 'inline')).toBe('attachment');
    expect(effectiveDisposition('video/mp4', 'attachment')).toBe('attachment');
  });
});

describe('issueFileUrl', () => {
  beforeEach(() => { signed.calls = []; });

  it('signs a 10-minute v4 read url with an inline disposition and the stored type for playable files', async () => {
    const before = Date.now();
    const url = await issueFileUrl(transfer(), 0, 'inline');
    expect(url).toBe('https://signed.example/file');
    const { path, opts } = signed.calls[0];
    expect(path).toBe('tenant/scs/file-transfer/T1/0-Video_1.MOV');
    expect(opts['version']).toBe('v4');
    expect(opts['action']).toBe('read');
    expect(opts['expires'] as number).toBeGreaterThanOrEqual(before + 10 * 60_000);
    expect(opts['expires'] as number).toBeLessThanOrEqual(Date.now() + 10 * 60_000);
    expect(String(opts['responseDisposition'])).toMatch(/^inline; filename="Video 1.MOV"/);
    expect(opts['responseType']).toBe('video/quicktime');
  });

  it('forces attachment and no response type for anything else', async () => {
    await issueFileUrl(transfer(), 1, 'inline');
    const { opts } = signed.calls[0];
    expect(String(opts['responseDisposition'])).toMatch(/^attachment; filename="page.html"/);
    expect(opts['responseType']).toBeUndefined();
  });

  it('throws for an unknown file index', async () => {
    await expect(issueFileUrl(transfer(), 5, 'inline')).rejects.toThrow();
  });
});

describe('memberFileAccess', () => {
  const caller = (over: Partial<{ personKey: string; isAdmin: boolean; tenantId: string }> = {}) =>
    ({ personKey: 'anna', isAdmin: false, tenantId: 'scs', ...over });

  it('lets a person recipient in, attributed to their recipient id', () => {
    expect(memberFileAccess(transfer(), caller(), NOW)).toEqual({ ok: true, recipientId: 'p:anna' });
  });

  it('lets the sender and an admin in with no recipient id', () => {
    expect(memberFileAccess(transfer(), caller({ personKey: 'sender' }), NOW)).toEqual({ ok: true, recipientId: '' });
    expect(memberFileAccess(transfer(), caller({ personKey: 'boss', isAdmin: true }), NOW)).toEqual({ ok: true, recipientId: '' });
  });

  it('refuses other members — an email-only recipient has no password-free path', () => {
    expect(memberFileAccess(transfer(), caller({ personKey: 'mallory' }), NOW)).toEqual({ ok: false, failure: 'notFound' });
    // a member whose address happens to be an email recipient is still not in recipientPersonKeys
    expect(memberFileAccess(transfer(), caller({ personKey: '' }), NOW)).toEqual({ ok: false, failure: 'notFound' });
  });

  it('refuses a caller of another tenant, even an admin or the sender', () => {
    expect(memberFileAccess(transfer(), caller({ tenantId: 'p13' }), NOW)).toEqual({ ok: false, failure: 'notFound' });
    expect(memberFileAccess(transfer(), caller({ tenantId: 'p13', personKey: 'boss', isAdmin: true }), NOW)).toEqual({ ok: false, failure: 'notFound' });
  });

  it('refuses expired, ended and still-uploading transfers', () => {
    expect(memberFileAccess(transfer({ state: 'ended' }), caller(), NOW)).toEqual({ ok: false, failure: 'expired' });
    expect(memberFileAccess(transfer({ expiresAt: NOW }), caller(), NOW)).toEqual({ ok: false, failure: 'expired' });
    expect(memberFileAccess(transfer({ state: 'uploading' }), caller({ personKey: 'sender' }), NOW)).toEqual({ ok: false, failure: 'notFound' });
  });
});
