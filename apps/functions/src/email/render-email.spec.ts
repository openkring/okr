import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../auth/email-templates', () => ({
  getAppEmailConfig: vi.fn(async () => ({
    appName: 'Seeclub',
    appDomain: 'app.example.org',
    from: '"Seeclub" <app@example.org>',
    replyTo: 'app@example.org',
    continueUrl: 'https://app.example.org/auth/login',
    contactEmail: 'info@example.org',
    passwordResetTemplate: '',
  })),
}));
vi.mock('../srv/sentry', () => ({ reportToSentry: vi.fn(async () => undefined) }));
vi.mock('firebase-functions/v2', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));

import { logger } from 'firebase-functions/v2';
import { reportToSentry } from '../srv/sentry';
import { composeBody, EmailTemplateError, renderEmail, renderPasswordResetEmail, TemplateReader } from './render-email';
import type { StoredTemplate } from './render-email.logic';

interface Entry {
  doc?: StoredTemplate;
  version?: { html?: string; text?: string; subject?: string };
}

/** Fake reader: `okey` is the published entry, `okey@N` an explicit version (preview). */
function readerOf(entries: Record<string, Entry>): TemplateReader {
  return async (okey, version) => {
    const entry = (version !== undefined ? entries[`${okey}@${version}`] : undefined) ?? entries[okey];
    return { doc: entry?.doc, version: entry?.version as never };
  };
}

const layoutDoc = (tenant: string): StoredTemplate => ({ kind: 'emailLayout', tenants: [tenant], currentVersion: 1 });
const textDoc = (tenant: string, currentVersion = 1): StoredTemplate => ({ kind: 'emailText', tenants: [tenant], currentVersion });

const STANDARD = { html: '<div class="std">{{app_name}} {{{content}}}{{#if contact_email}} {{contact_email}}{{/if}} (c) {{year}}</div>', text: 'STD\n{{{content}}}\n{{#if contact_email}}{{contact_email}}{{/if}}' };
const PLAIN = { html: '<div class="plain">{{{content}}}</div>', text: 'PLAIN\n{{{content}}}' };
const RESET = { subject: 'Passwort fuer {{app_name}}', html: '<p><a href="{{url}}">Link</a></p>', text: 'Link: {{{url}}}' };
const SHARED_RESET = { subject: 'Shared {{app_name}}', html: '<p>shared {{url}}</p>', text: 'shared {{{url}}}' };

const base: Record<string, Entry> = {
  'email-layout_scs': { doc: layoutDoc('scs'), version: STANDARD },
  'email-layout-plain': { doc: layoutDoc('system'), version: PLAIN },
  'email-text-password-reset': { doc: textDoc('system'), version: SHARED_RESET },
};
const url = 'https://app.example.org/auth/confirm?mode=resetPassword&oobCode=abc';

beforeEach(() => vi.clearAllMocks());

describe('renderEmail', () => {
  it('prefers the published tenant copy over the shared text', async () => {
    const read = readerOf({ ...base, 'email-text-password-reset_scs': { doc: textDoc('scs'), version: RESET } });
    const mail = await renderEmail({ tenantId: 'scs', layout: 'standard', textKey: 'email-text-password-reset', variables: { url } }, read);
    expect(mail.subject).toBe('Passwort fuer Seeclub');
    expect(mail.html).toContain('class="std"');
    expect(mail.html).toContain('Link</a>');
  });

  it('uses the shared text while the tenant copy is a draft', async () => {
    const read = readerOf({ ...base, 'email-text-password-reset_scs': { doc: textDoc('scs', 0), version: RESET } });
    const mail = await renderEmail({ tenantId: 'scs', layout: 'standard', textKey: 'email-text-password-reset', variables: { url } }, read);
    expect(mail.subject).toBe('Shared Seeclub');
  });

  it('compiles text and subject raw and html escaped', async () => {
    const read = readerOf(base);
    const mail = await renderEmail({ tenantId: 'scs', layout: 'standard', textKey: 'email-text-password-reset', variables: { url } }, read);
    expect(mail.text).toContain(`shared ${url}`);
    expect(mail.html).toContain('oobCode&#x3D;abc');
    expect(mail.html).not.toContain(url);
  });

  it('adds the shared variables and lets a caller variable not override them', async () => {
    const read = readerOf(base);
    const mail = await renderEmail({ tenantId: 'scs', layout: 'standard', body: '<p>x</p>', variables: { app_name: 'Spoof' } }, read);
    expect(mail.html).toContain('Seeclub');
    expect(mail.html).not.toContain('Spoof');
    expect(mail.html).toContain(`(c) ${new Date().getFullYear()}`);
  });

  it('wraps a body in the standard layout and derives the text half', async () => {
    const mail = await renderEmail({ tenantId: 'scs', layout: 'standard', body: '<p>Hallo <a href="https://a.ch/x?a=1&amp;b=2">Welt</a></p>' }, readerOf(base));
    expect(mail.subject).toBe('');
    expect(mail.html).toContain('<div class="std">Seeclub <p>Hallo <a href="https://a.ch/x?a=1&amp;b=2">Welt</a></p>');
    expect(mail.text).toBe('STD\nHallo Welt (https://a.ch/x?a=1&b=2)\n');
  });

  it('falls to plain when the tenant has no standard layout', async () => {
    const mail = await renderEmail({ tenantId: 'p13', layout: 'standard', body: '<p>x</p>' }, readerOf(base));
    expect(mail.html).toContain('class="plain"');
    expect(mail.text.startsWith('PLAIN')).toBe(true);
  });

  it('throws EmailTemplateError with noPlainFallback and no standard layout', async () => {
    await expect(
      renderEmail({ tenantId: 'p13', layout: 'standard', textKey: 'email-text-password-reset', noPlainFallback: true }, readerOf(base))
    ).rejects.toMatchObject({ name: 'EmailTemplateError', code: 'no-standard-layout' });
  });

  it('throws EmailTemplateError when no text template is usable', async () => {
    await expect(renderEmail({ tenantId: 'scs', layout: 'standard', textKey: 'email-text-gone' }, readerOf(base))).rejects.toBeInstanceOf(EmailTemplateError);
  });

  it('throws EmailTemplateError when a layout has no content slot', async () => {
    const noSlotHtml = readerOf({ ...base, 'email-layout_scs': { doc: layoutDoc('scs'), version: { html: '<p>none</p>', text: '{{{content}}}' } } });
    const noSlotText = readerOf({ ...base, 'email-layout_scs': { doc: layoutDoc('scs'), version: { html: '{{{content}}}', text: 'none' } } });
    for (const read of [noSlotHtml, noSlotText]) {
      await expect(renderEmail({ tenantId: 'scs', layout: 'standard', body: '<p>x</p>' }, read)).rejects.toMatchObject({ code: 'layout-without-content' });
    }
  });

  it('passes contact_email only with includeContact', async () => {
    const read = readerOf(base);
    const without = await renderEmail({ tenantId: 'scs', layout: 'standard', body: '<p>x</p>' }, read);
    const withContact = await renderEmail({ tenantId: 'scs', layout: 'standard', body: '<p>x</p>', includeContact: true }, read);
    expect(without.html).not.toContain('info@example.org');
    expect(withContact.html).toContain('info@example.org');
    expect(withContact.text).toContain('info@example.org');
  });

  it('appends the attachment note with the filename escaped', async () => {
    const mail = await renderEmail({ tenantId: 'scs', layout: 'standard', body: '<p>x</p>', attachmentName: 'a<b.pdf' }, readerOf(base));
    expect(mail.html).toContain('📎 Beilage: <strong>a&lt;b.pdf</strong>');
    expect(mail.html).not.toContain('a<b.pdf');
    expect(mail.text).toContain('📎 Beilage: a<b.pdf');
  });

  it('renders a draft only through previewVersion', async () => {
    const entries = {
      ...base,
      'email-text-password-reset_scs': { doc: textDoc('scs', 0), version: undefined },
      'email-text-password-reset_scs@3': { doc: textDoc('scs', 0), version: { subject: 'Draft {{app_name}}', html: '<p>draft</p>', text: 'draft' } },
    };
    const read = readerOf(entries);
    const live = await renderEmail({ tenantId: 'scs', layout: 'standard', textKey: 'email-text-password-reset' }, read);
    expect(live.subject).toBe('Shared Seeclub');
    const preview = await renderEmail(
      { tenantId: 'scs', layout: 'standard', textKey: 'email-text-password-reset', previewVersion: { okey: 'email-text-password-reset_scs', version: 3 } },
      read
    );
    expect(preview.subject).toBe('Draft Seeclub');
    expect(preview.html).toContain('<p>draft</p>');
  });

  it('replaces the layout when the previewed version is a layout, even a draft one', async () => {
    const read = readerOf({
      ...base,
      'email-layout_scs@2': { doc: { ...layoutDoc('scs'), currentVersion: 0 }, version: { html: '<b>new</b>{{{content}}}', text: 'NEW {{{content}}}' } },
    });
    const mail = await renderEmail({ tenantId: 'scs', layout: 'standard', body: '<p>x</p>', previewVersion: { okey: 'email-layout_scs', version: 2 } }, read);
    expect(mail.html).toBe('<b>new</b><p>x</p>');
    expect(mail.text).toBe('NEW x');
  });
});

describe('template ownership', () => {
  const text = (subject: string, tenants: string[]) => ({ doc: { kind: 'emailText', tenants, currentVersion: 1 } as StoredTemplate, version: { subject, html: '<p>x</p>', text: 'x' } });
  const layout = (tenants: string[]) => ({ doc: { kind: 'emailLayout', tenants, currentVersion: 1 } as StoredTemplate, version: { html: '<i>planted</i>{{{content}}}', text: 'PLANTED {{{content}}}' } });
  const reset = { tenantId: 'scs', layout: 'standard', textKey: 'email-text-password-reset' } as const;

  it('ignores a fork key another tenant planted with a mixed tenants array', async () => {
    const read = readerOf({ ...base, 'email-text-password-reset_scs': text('Planted', ['p13', 'scs']) });
    expect((await renderEmail(reset, read)).subject).toBe('Shared Seeclub');
  });

  it('ignores a base key that names a tenant next to system', async () => {
    const read = readerOf({ 'email-layout_scs': base['email-layout_scs'], 'email-text-password-reset': text('Planted', ['p13', 'system']) });
    await expect(renderEmail(reset, read)).rejects.toMatchObject({ code: 'no-text' });
  });

  it('ignores a planted plain layout on the base key', async () => {
    const read = readerOf({ 'email-layout-plain': layout(['p13', 'system']) });
    await expect(renderEmail({ tenantId: 'scs', layout: 'plain', body: '<p>x</p>' }, read)).rejects.toMatchObject({ code: 'no-layout' });
  });

  it('never reads the base key of the standard layout', async () => {
    const reads: string[] = [];
    const entries = { ...base, 'email-layout_scs': { doc: undefined }, 'email-layout': layout(['system']) };
    const read: TemplateReader = (okey, version) => {
      reads.push(okey);
      return readerOf(entries)(okey, version);
    };
    const mail = await renderEmail({ tenantId: 'scs', layout: 'standard', body: '<p>x</p>' }, read);
    expect(mail.html).toContain('class="plain"');
    expect(reads).not.toContain('email-layout');
  });

  it('refuses a reset through a planted email-layout doc, whatever its tenants say', async () => {
    const planted = readerOf({ 'email-layout': layout(['scs', 'system']), 'email-text-password-reset': base['email-text-password-reset'] });
    await expect(
      renderEmail({ ...reset, tenantId: 'scs', noPlainFallback: true }, planted)
    ).rejects.toMatchObject({ code: 'no-standard-layout' });
  });
});

describe('renderPasswordResetEmail', () => {
  const vars = { url, email: 'x@example.org', app_name: 'Seeclub', login_id: '' };

  it('renders the reset mail through the standard layout', async () => {
    const mail = await renderPasswordResetEmail('scs', vars, readerOf(base));
    expect(mail?.subject).toBe('Shared Seeclub');
    expect(mail?.text).toContain(url);
  });

  it('returns undefined from renderPasswordResetEmail on a broken template and never throws', async () => {
    const broken = readerOf({ ...base, 'email-text-password-reset': { doc: textDoc('system'), version: { subject: 's', html: '{{#if}}', text: 'x' } } });
    await expect(renderPasswordResetEmail('scs', vars, broken)).resolves.toBeUndefined();
    const throwing: TemplateReader = async () => {
      throw new Error('firestore down');
    };
    await expect(renderPasswordResetEmail('scs', vars, throwing)).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledTimes(2);
    expect(reportToSentry).toHaveBeenCalledTimes(2);
  });

  it('is quiet about a missing standard layout, which is normal during migration', async () => {
    await expect(renderPasswordResetEmail('p13', vars, readerOf(base))).resolves.toBeUndefined();
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.error).not.toHaveBeenCalled();
    expect(reportToSentry).not.toHaveBeenCalled();
  });

  it('returns undefined when the rendered mail lacks the link', async () => {
    const noLink = readerOf({ ...base, 'email-text-password-reset': { doc: textDoc('system'), version: { subject: 's', html: '<p>no link</p>', text: 'no link' } } });
    await expect(renderPasswordResetEmail('scs', vars, noLink)).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(reportToSentry).toHaveBeenCalledTimes(1);
  });

  it('returns undefined when the subject is missing or renders empty', async () => {
    const withSubject = (subject: string | undefined) =>
      readerOf({ ...base, 'email-text-password-reset': { doc: textDoc('system'), version: { subject, html: '<a href="{{url}}">x</a>', text: '{{{url}}}' } } });
    await expect(renderPasswordResetEmail('scs', vars, withSubject(undefined))).resolves.toBeUndefined();
    await expect(renderPasswordResetEmail('scs', vars, withSubject('{{#if login_id}}Konto {{login_id}}{{/if}}'))).resolves.toBeUndefined();
    await expect(renderPasswordResetEmail('scs', vars, withSubject('  \n'))).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledTimes(3);
    expect(reportToSentry).toHaveBeenCalledTimes(3);
  });

  it('trims a subject with a trailing newline', async () => {
    const read = readerOf({ ...base, 'email-text-password-reset': { doc: textDoc('system'), version: { subject: 'Passwort zuruecksetzen\n', html: '<a href="{{url}}">x</a>', text: '{{{url}}}' } } });
    const mail = await renderPasswordResetEmail('scs', vars, read);
    expect(mail?.subject).toBe('Passwort zuruecksetzen');
  });

  it('never logs the link or the address', async () => {
    const noLink = readerOf({ ...base, 'email-text-password-reset': { doc: textDoc('system'), version: { subject: 's', html: 'x', text: 'x' } } });
    await renderPasswordResetEmail('scs', vars, noLink);
    const logged = JSON.stringify([(logger.error as ReturnType<typeof vi.fn>).mock.calls, (reportToSentry as ReturnType<typeof vi.fn>).mock.calls]);
    expect(logged).not.toContain('oobCode');
    expect(logged).not.toContain('x@example.org');
  });
});

describe('composeBody', () => {
  it('sanitises the body, wraps it in the standard layout and passes the contact address', async () => {
    const mail = await composeBody('scs', { body: '<p>Hallo</p><script>x()</script><a href="http://a.ch">l</a>' }, readerOf(base));
    expect(mail.html).toContain('class="std"');
    expect(mail.html).toContain('<p>Hallo</p>');
    expect(mail.html).toContain('href="http://a.ch"');
    expect(mail.html).not.toContain('<script');
    expect(mail.html).toContain('info@example.org');
    expect(mail.text).toContain('Hallo');
  });

  it('uses the plain layout when asked', async () => {
    const mail = await composeBody('scs', { body: '<p>x</p>', layout: 'plain' }, readerOf(base));
    expect(mail.html).toContain('class="plain"');
    expect(mail.html).not.toContain('info@example.org');
  });

  it('appends the attachment note', async () => {
    const mail = await composeBody('scs', { body: '<p>x</p>', attachmentName: 'R1.pdf' }, readerOf(base));
    expect(mail.html).toContain('<strong>R1.pdf</strong>');
  });

  it('throws when no layout is usable', async () => {
    await expect(composeBody('scs', { body: '<p>x</p>' }, readerOf({}))).rejects.toBeInstanceOf(EmailTemplateError);
  });
});
