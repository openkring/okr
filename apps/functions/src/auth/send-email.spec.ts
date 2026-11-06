import { beforeEach, describe, expect, it, vi } from 'vitest';

// The callable is driven with `.run(req)`; only its edges are replaced: the provider call, Auth's
// link generator, the caller's users/{uid} doc, and the per-tenant config.
const state = vi.hoisted(() => ({
  user: undefined as Record<string, unknown> | undefined,
  sent: [] as Record<string, unknown>[],
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
vi.mock('./email-templates', () => ({
  getEmailProvider: async () => 'mailtrap_api',
  getAppEmailConfig: async () => ({ from: 'no-reply@tenant.example', appName: 'Tenant', appDomain: 'app.tenant.example', continueUrl: 'https://app.tenant.example/', passwordResetTemplate: '' }),
}));
vi.mock('./email-transport', () => ({
  sendEmailViaProvider: async (_provider: string, options: Record<string, unknown>) => { state.sent.push(options); },
}));
vi.mock('../email/render-email', () => ({ renderPasswordResetEmail: async () => undefined }));
vi.mock('../srv/sentry', () => ({ reportToSentry: async () => undefined }));

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
