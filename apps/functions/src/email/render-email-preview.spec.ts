import { beforeEach, describe, expect, it, vi } from 'vitest';

// The callable is driven with `.run(req)`; only its edges are replaced.
const state = vi.hoisted(() => ({
  user: undefined as Record<string, unknown> | undefined,
  composed: [] as unknown[][],
  groups: {} as Record<string, Record<string, unknown>>,
  pageAsked: [] as unknown[][],
}));

vi.mock('firebase-admin/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase-admin/firestore')>();
  return { ...actual, getFirestore: () => ({
    collection: (name: string) => ({ doc: (id: string) => ({ get: async () => {
      const doc = name === 'groups' ? state.groups[id] : state.user;
      return { exists: !!doc, data: () => doc };
    } }) }),
  }) };
});
vi.mock('./mailing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./mailing')>();
  return { ...actual, mailPageContent: async (...args: unknown[]) => { state.pageAsked.push(args); return { html: '<p>Inhalt</p>' }; } };
});
vi.mock('@okr/shared-util-functions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@okr/shared-util-functions')>();
  return { ...actual, checkAppCheckToken: () => undefined };
});
vi.mock('./render-email', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./render-email')>();
  return {
    ...actual,
    composeBody: async (...args: unknown[]) => {
      state.composed.push(args);
      return { subject: '', html: '<div>x</div>', text: 'x' };
    },
  };
});

import { mayPreviewTemplate, parseSampleData, renderEmailPreview } from './render-email-preview';

const req = (data: Record<string, unknown>) => ({ auth: { uid: 'u1' }, app: {}, data }) as never;

describe('renderEmailPreview: the tenant', () => {
  beforeEach(() => { state.composed = []; state.user = undefined; });

  it('renders for the app the send uses, not for the first tenant of the caller', async () => {
    state.user = { tenants: ['scs', 'gss'] };
    await renderEmailPreview.run(req({ appId: 'gss', body: '<p>x</p>' }));
    expect(state.composed[0][0]).toBe('gss');
  });

  it('refuses an app the caller may not send for', async () => {
    state.user = { tenants: ['scs'] };
    await expect(renderEmailPreview.run(req({ appId: 'p13', body: '<p>x</p>' }))).rejects.toMatchObject({ code: 'permission-denied' });
    expect(state.composed).toHaveLength(0);
  });

  it('refuses a call without an app', async () => {
    state.user = { tenants: ['scs'] };
    await expect(renderEmailPreview.run(req({ body: '<p>x</p>' }))).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(renderEmailPreview.run(req({ appId: 5, body: '<p>x</p>' }))).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});

describe('renderEmailPreview of a mail page', () => {
  beforeEach(() => {
    state.composed = [];
    state.pageAsked = [];
    state.user = { tenants: ['scs'] };
    state.groups = { nl: { kind: 'newsletter', tenants: ['scs'] }, g1: { kind: 'group', tenants: ['scs'] }, foreign: { kind: 'newsletter', tenants: ['p13'] } };
  });
  const preview = async (data: Record<string, unknown>): Promise<{ body: string; layout: string; attachmentName?: string }> => {
    await renderEmailPreview.run(req({ appId: 'scs', pageKey: 'pg1', ...data }));
    return state.composed[state.composed.length - 1][1] as { body: string; layout: string; attachmentName?: string };
  };
  const parts = (body: string): boolean[] => ['Im Browser ansehen', 'An- oder abmelden', 'Newsletter abbestellen'].map((s) => body.includes(s));

  it('is the content alone for an old client, as before', async () => {
    expect(await preview({ layout: 'plain', attachmentName: 'a.pdf' })).toEqual({ body: '<p>Inhalt</p>', layout: 'plain', attachmentName: 'a.pdf' });
    expect(state.pageAsked).toEqual([['scs', 'pg1', 'u1']]);
  });

  it('shows the events of an old client too', async () => {
    const { body } = await preview({ answerEvents: [{ name: 'GV', when: '01.12.2026' }, 'x', null] });
    expect(parts(body)).toEqual([false, true, false]);
    expect(body).toContain('01.12.2026 · GV');
  });

  it('shows the unsubscribe line and the web link of a newsletter', async () => {
    expect(parts((await preview({ groupKey: 'nl' })).body)).toEqual([true, false, true]);
    expect(parts((await preview({ groupKey: 'nl', webVersion: false })).body)).toEqual([false, false, true]);
  });

  it('shows neither for another group, another tenant\'s newsletter or a group that is no key', async () => {
    for (const groupKey of ['g1', 'foreign', 'none', '', 7]) expect(parts((await preview({ groupKey })).body), String(groupKey)).toEqual([false, false, false]);
  });

  it('shows the web link that was asked for, with a real choice only', async () => {
    expect(parts((await preview({ webVersion: true })).body)).toEqual([true, false, false]);
    expect(parts((await preview({ webVersion: 'yes' })).body)).toEqual([false, false, false]);
  });

  it('leads nowhere', async () => {
    const { body } = await preview({ groupKey: 'nl', answerEvents: [{ name: 'GV', when: 'x' }] });
    expect([...body.matchAll(/href="([^"]*)"/g)].map((m) => m[1])).toEqual(['#', '#', '#']);
  });
});

describe('parseSampleData', () => {
  it('returns {} for invalid JSON', () => {
    expect(parseSampleData('{oops')).toEqual({});
    expect(parseSampleData(undefined)).toEqual({});
    expect(parseSampleData('')).toEqual({});
  });

  it('returns {} for JSON that is not an object', () => {
    expect(parseSampleData('[1,2]')).toEqual({});
    expect(parseSampleData('null')).toEqual({});
    expect(parseSampleData('"x"')).toEqual({});
  });

  it('keeps strings, numbers and booleans as strings and drops nested values', () => {
    expect(parseSampleData('{"url":"https://a.ch","n":3,"b":true,"o":{"x":1},"a":[1],"z":null}')).toEqual({ url: 'https://a.ch', n: '3', b: 'true' });
  });
});

describe('mayPreviewTemplate', () => {
  it('lets a tenant preview its own template and a system one', () => {
    expect(mayPreviewTemplate({ tenants: ['scs'] }, 'scs')).toBe(true);
    expect(mayPreviewTemplate({ tenants: ['system'] }, 'scs')).toBe(true);
  });
  it('refuses another tenant and a missing doc', () => {
    expect(mayPreviewTemplate({ tenants: ['p13'] }, 'scs')).toBe(false);
    expect(mayPreviewTemplate({}, 'scs')).toBe(false);
    expect(mayPreviewTemplate(undefined, 'scs')).toBe(false);
  });
});
