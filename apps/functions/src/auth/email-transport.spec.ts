import { describe, expect, it } from 'vitest';

import { effectiveProvider, mailtrapBody, type EmailOptions } from './email-transport';

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
    expect(effectiveProvider('netzone_smtp')).toBe('netzone_smtp');
  });
});

describe('mailtrapBody', () => {
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
