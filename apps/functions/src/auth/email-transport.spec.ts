import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { SETTINGS_EMAIL_PROVIDERS } from '@okr/tenant-util';

import { effectiveProvider, mailtrapBody, safeMailHeaders, VALID_PROVIDERS, type EmailOptions } from './email-transport';

const base: EmailOptions = {
  from: 'Verein <app@example.ch>',
  to: ['anna@example.ch'],
  subject: 'Hallo',
  html: '<p>Hallo</p>',
};

describe('effectiveProvider', () => {
  it('falls back to the default for a missing or unknown provider', () => {
    expect(effectiveProvider(undefined)).toBe('mailtrap_api');
    expect(effectiveProvider('nonsense')).toBe('mailtrap_api');
    expect(effectiveProvider(42)).toBe('mailtrap_api');
    // the class default of AppConfig: stored by several tenants
    expect(effectiveProvider('')).toBe('mailtrap_api');
    expect(effectiveProvider(null)).toBe('mailtrap_api');
    expect(effectiveProvider('netzone_smtp')).toBe('netzone_smtp');
  });
});

describe('readers of app-config.emailProvider', () => {
  // `stored ?? default` keeps a stored '', which no transport knows: those mails were never sent
  it('never fall back with `??`', () => {
    const src = join(__dirname, '..');
    const files = readdirSync(src, { recursive: true, encoding: 'utf8' }).filter((name) => name.endsWith('.ts') && !name.endsWith('.spec.ts'));
    const offenders = files.filter((name) => /\?\?\s*DEFAULT_EMAIL_PROVIDER|\['emailProvider'\]\s*\?\?/.test(readFileSync(join(src, name), 'utf8')));
    expect(files.length).toBeGreaterThan(100);
    expect(offenders).toEqual([]);
  });
});

describe('VALID_PROVIDERS', () => {
  it('is what the settings form of the operator offers', () => {
    expect([...SETTINGS_EMAIL_PROVIDERS].sort()).toEqual([...VALID_PROVIDERS].sort());
  });
});

describe('mailtrapBody', () => {
  it('passes custom headers through as a top-level headers map, and omits it without', () => {
    const headers = { 'List-Unsubscribe': '<https://x>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' };
    expect(mailtrapBody({ ...base, headers })['headers']).toEqual(headers);
    expect(mailtrapBody(base)).not.toHaveProperty('headers');
    expect(mailtrapBody({ ...base, headers: {} })).not.toHaveProperty('headers');
  });

  it('passes a category on, capped at 255 characters, and never next to a template', () => {
    expect(mailtrapBody({ ...base, category: 'mailing.abc' })['category']).toBe('mailing.abc');
    expect(mailtrapBody(base)).not.toHaveProperty('category');
    expect(String(mailtrapBody({ ...base, category: 'x'.repeat(300) })['category'])).toHaveLength(255);
    expect(mailtrapBody({ ...base, category: 'mailing.abc', template: '12345678-1234-1234-1234-123456789abc' })).not.toHaveProperty('category');
  });

  it('leaves out an empty text half', () => {
    expect(mailtrapBody({ ...base, text: '' })).not.toHaveProperty('text');
    expect(mailtrapBody({ ...base, text: 'x' })['text']).toBe('x');
  });

  it('sends subject and html without a text half when none is given', () => {
    const body = mailtrapBody(base);
    expect(body['subject']).toBe('Hallo');
    expect(body['html']).toBe('<p>Hallo</p>');
    expect(body).not.toHaveProperty('text');
  });

  it('never sends text alongside a template uuid', () => {
    const body = mailtrapBody({
      ...base,
      text: 'x',
      template: '12345678-1234-1234-1234-123456789abc',
      templateVariables: { url: 'u' },
    });
    expect(body['template_uuid']).toBe('12345678-1234-1234-1234-123456789abc');
    expect(body).not.toHaveProperty('text');
    expect(body).not.toHaveProperty('html');
    expect(body).not.toHaveProperty('subject');
  });

  it('parses the sender and maps recipients and attachments', () => {
    const body = mailtrapBody({
      ...base,
      cc: ['b@example.ch'],
      attachments: [{ filename: 'a.pdf', content: Buffer.from('hi'), contentType: 'application/pdf' }],
    });
    expect(body['from']).toEqual({ name: 'Verein', email: 'app@example.ch' });
    expect(body['to']).toEqual([{ email: 'anna@example.ch' }]);
    expect(body['cc']).toEqual([{ email: 'b@example.ch' }]);
    expect(body['attachments']).toEqual([
      { filename: 'a.pdf', content: Buffer.from('hi').toString('base64'), type: 'application/pdf', disposition: 'attachment' },
    ]);
  });
});

describe('safeMailHeaders', () => {
  const ok = { 'List-Unsubscribe': '<https://x/u>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' };

  it('passes the allowed pair, in canonical casing', () => {
    expect(safeMailHeaders(ok)).toEqual(ok);
    expect(safeMailHeaders({ 'list-unsubscribe': '<https://x/u>' })).toEqual({ 'List-Unsubscribe': '<https://x/u>' });
  });

  it('drops everything else', () => {
    expect(safeMailHeaders({ From: 'a@b.ch', Bcc: 'a@b.ch' })).toBeUndefined();
    expect(safeMailHeaders({ 'List-Unsubscribe': '<https://x/u>\r\nBcc: a@b.ch' })).toBeUndefined();
    expect(safeMailHeaders({ 'List-Unsubscribe': '<http://x/u>' })).toBeUndefined();
    expect(safeMailHeaders({ 'List-Unsubscribe': 5 })).toBeUndefined();
    expect(safeMailHeaders({ 'List-Unsubscribe-Post': 'other' })).toBeUndefined();
    expect(safeMailHeaders({ 'List-Unsubscribe': `<https://x/${'a'.repeat(520)}>` })).toBeUndefined();
    expect(safeMailHeaders(undefined)).toBeUndefined();
    expect(safeMailHeaders({ ...ok, From: 'a@b.ch' })).toEqual(ok);
  });

  it('mailtrapBody gets no headers key when all are dropped', () => {
    expect(mailtrapBody({ ...base, headers: { From: 'a@b.ch' } })).not.toHaveProperty('headers');
  });
});
