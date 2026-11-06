import { beforeEach, describe, expect, it, vi } from 'vitest';

// The callable is driven with `.run(req)`; only its edges are replaced: the provider call, Auth's
// link generator, the caller's users/{uid} doc, and the per-tenant config.
const state = vi.hoisted(() => ({
  user: undefined as Record<string, unknown> | undefined,
  sent: [] as Record<string, unknown>[],
  composed: [] as unknown[][],
  composeError: undefined as Error | undefined,
  reported: [] as Record<string, unknown>[],
}));

vi.mock('firebase-admin/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase-admin/firestore')>();
  return {
    ...actual,
    getFirestore: () => ({
      collection: () => ({ doc: () => ({ get: async () => ({ data: () => state.user }) }) }),
    }),
  };
});
vi.mock('firebase-admin/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase-admin/auth')>();
  return {
    ...actual,
    getAuth: () => ({ generatePasswordResetLink: async () => 'https://project.firebaseapp.com/__/auth/action?oobCode=abc' }),
  };
});
vi.mock('@okr/shared-util-functions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@okr/shared-util-functions')>();
  return { ...actual, checkAppCheckToken: () => undefined };
});
vi.mock('firebase-functions/v2', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase-functions/v2')>();
  return { ...actual, logger: { info: () => undefined, warn: () => undefined, error: () => undefined } };
});
vi.mock('./email-templates', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./email-templates')>();
  return {
    ...actual,
    getEmailProvider: async () => 'mailtrap_api',
    getAppEmailConfig: async () => ({ from: 'no-reply@tenant.example', senderDomain: 'tenant.example', appName: 'Tenant', appDomain: 'app.tenant.example', continueUrl: 'https://app.tenant.example/', passwordResetTemplate: '' }),
  };
});
vi.mock('./email-transport', () => ({
  sendEmailViaProvider: async (_provider: string, options: Record<string, unknown>) => { state.sent.push(options); },
}));
vi.mock('../email/render-email', () => ({
  EmailTemplateError: class EmailTemplateError extends Error {
    constructor(message: string, public readonly code: string) { super(message); }
  },
  renderPasswordResetEmail: async () => undefined,
  composeBody: async (...args: unknown[]) => {
    state.composed.push(args);
    if (state.composeError) throw state.composeError;
    return { subject: '', html: '<div>wrapped</div>', text: 'wrapped text' };
  },
}));
vi.mock('../srv/sentry', () => ({ reportToSentry: async (event: Record<string, unknown>) => { state.reported.push(event); } }));

import { sendEmail } from './index';

const req = (data: Record<string, unknown>, auth: { uid: string } | undefined = { uid: 'u1' }) => ({ auth, app: {}, data }) as never;

describe('sendEmail: password reset envelope', () => {
  beforeEach(() => { state.sent = []; state.user = undefined; });

  it('sends to the one address the link is for, never to cc, bcc or extra to entries', async () => {
    const result = await sendEmail.run(req(
      { to: ['victim@x.ch', 'attacker@x.ch'], cc: ['cc@x.ch'], bcc: ['attacker@x.ch'], appId: 'scs', template: 'password_reset' },
      undefined,
    ));
    expect(result).toEqual({ success: true });
    expect(state.sent).toHaveLength(1);
    expect(state.sent[0]['to']).toEqual(['victim@x.ch']);
    expect(state.sent[0]['cc']).toBeUndefined();
    expect(state.sent[0]['bcc']).toBeUndefined();
  });

  it('still rejects an empty to', async () => {
    await expect(sendEmail.run(req({ to: [], appId: 'scs', template: 'password_reset' }, undefined))).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(state.sent).toHaveLength(0);
  });
});

describe('sendEmail: signed-in sends need the caller to belong to appId', () => {
  const body = { to: ['a@x.ch'], appId: 'scs', subject: 'Hallo', html: '<p>x</p>', cc: ['c@x.ch'] };
  beforeEach(() => { state.sent = []; state.user = undefined; });

  it('a foreign appId is permission-denied and never reaches the provider', async () => {
    state.user = { tenants: ['other'] };
    await expect(sendEmail.run(req(body))).rejects.toMatchObject({ code: 'permission-denied' });
    expect(state.sent).toHaveLength(0);
  });

  it('a caller with no users doc is permission-denied', async () => {
    await expect(sendEmail.run(req(body))).rejects.toMatchObject({ code: 'permission-denied' });
    expect(state.sent).toHaveLength(0);
  });

  it('an appId anywhere in the caller tenants reaches the provider, with the composer cc intact', async () => {
    state.user = { tenants: ['other', 'scs'] };
    await expect(sendEmail.run(req(body))).resolves.toEqual({ success: true });
    expect(state.sent).toHaveLength(1);
    expect(state.sent[0]['to']).toEqual(['a@x.ch']);
    expect(state.sent[0]['cc']).toEqual(['c@x.ch']);
  });
});

describe('sendEmail: composer body', () => {
  const composed = { to: ['a@x.ch'], appId: 'scs', subject: 'Hallo' };
  beforeEach(() => { state.sent = []; state.composed = []; state.composeError = undefined; state.reported = []; state.user = { tenants: ['scs'] }; });

  it('wraps a body with the chosen layout and hands html and text to the provider', async () => {
    await expect(sendEmail.run(req({ ...composed, body: '<p>x</p>', layout: 'plain', attachmentName: 'a.pdf' }))).resolves.toEqual({ success: true });
    expect(state.composed).toEqual([['scs', { body: '<p>x</p>', layout: 'plain', attachmentName: 'a.pdf' }]]);
    expect(state.sent).toHaveLength(1);
    expect(state.sent[0]['html']).toBe('<div>wrapped</div>');
    expect(state.sent[0]['text']).toBe('wrapped text');
  });

  it('defaults the layout to standard', async () => {
    await sendEmail.run(req({ ...composed, body: '<p>x</p>' }));
    expect(state.composed[0][1]).toMatchObject({ layout: 'standard' });
  });

  it('prefers the body over an html sent by the same request', async () => {
    await sendEmail.run(req({ ...composed, body: '<p>x</p>', html: '<p>old</p>' }));
    expect(state.sent[0]['html']).toBe('<div>wrapped</div>');
  });

  it('rejects, sends nothing and reports without the body when the render fails', async () => {
    state.composeError = new Error('No usable email layout');
    await expect(sendEmail.run(req({ ...composed, body: '<p>geheim</p>' }))).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(state.sent).toHaveLength(0);
    expect(JSON.stringify(state.reported)).not.toContain('geheim');
    expect(JSON.stringify(state.reported)).not.toContain('a@x.ch');
  });

  it('refuses an empty body', async () => {
    await expect(sendEmail.run(req({ ...composed, body: '  ' }))).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(state.sent).toHaveLength(0);
  });

  it('still sends html alone unchanged', async () => {
    await sendEmail.run(req({ ...composed, html: '<p>old</p>' }));
    expect(state.composed).toHaveLength(0);
    expect(state.sent[0]['html']).toBe('<p>old</p>');
    expect(state.sent[0]['text']).toBeUndefined();
  });
});

describe('sendEmail: sender', () => {
  const base = { to: ['a@x.ch'], appId: 'scs', subject: 'Hallo', html: '<p>x</p>' };
  beforeEach(() => { state.sent = []; state.user = { tenants: ['scs'] }; });

  it('keeps a sender on the tenant domain', async () => {
    await sendEmail.run(req({ ...base, from: 'info@tenant.example' }));
    expect(state.sent[0]['from']).toBe('info@tenant.example');
  });

  it('replaces a foreign sender with the tenant sender, also on an html send', async () => {
    await sendEmail.run(req({ ...base, from: 'ceo@evil.example' }));
    expect(state.sent[0]['from']).toBe('no-reply@tenant.example');
  });

  it('uses the tenant sender when none is given', async () => {
    await sendEmail.run(req(base));
    expect(state.sent[0]['from']).toBe('no-reply@tenant.example');
  });

  it('never takes the caller sender on the reset path', async () => {
    await sendEmail.run(req({ to: ['a@x.ch'], appId: 'scs', template: 'password_reset', from: 'info@tenant.example' }, undefined));
    expect(state.sent[0]['from']).toBe('no-reply@tenant.example');
  });
});
