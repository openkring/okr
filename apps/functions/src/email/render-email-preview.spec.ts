import { beforeEach, describe, expect, it, vi } from 'vitest';

// The callable is driven with `.run(req)`; only its edges are replaced.
const state = vi.hoisted(() => ({
  user: undefined as Record<string, unknown> | undefined,
  composed: [] as unknown[][],
}));

vi.mock('firebase-admin/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase-admin/firestore')>();
  return { ...actual, getFirestore: () => ({ collection: () => ({ doc: () => ({ get: async () => ({ data: () => state.user }) }) }) }) };
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
