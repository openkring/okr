import { describe, expect, it, vi } from 'vitest';

vi.mock('../auth/email-templates', () => ({
  getAppEmailConfig: vi.fn(async () => ({ appName: 'Seeclub', appDomain: 'app.example.org', contactEmail: 'info@example.org' })),
}));
vi.mock('../srv/sentry', () => ({ reportToSentry: vi.fn(async () => undefined) }));
vi.mock('firebase-functions/v2', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));

import { sanitizeEmailBody } from '../pdf/sanitize';
import { mailingAnswerUrl } from '../calendar/answer-link';
import { composeBody, TemplateReader } from './render-email';
import { ANSWER_URL_PLACEHOLDER, answerBlockHtml, fillAnswerUrl, hasAnswerPlaceholder } from './personal-mail.logic';

const events = [{ name: 'GV', when: '01.12.2026, 19:00' }];
const url = mailingAnswerUrl('https://europe-west6-p.cloudfunctions.net/mailingAnswer', 'm1', 'p1', 'secret');

describe('the answer link through the real sanitiser', () => {
  it('survives sanitizeEmailBody and is replaced by the signed url', async () => {
    const clean = await sanitizeEmailBody('<p>Hallo</p>' + answerBlockHtml(ANSWER_URL_PLACEHOLDER, events));
    expect(clean).toContain(ANSWER_URL_PLACEHOLDER);
    const out = fillAnswerUrl({ html: clean }, url);
    expect(out.html).toContain(`href="${url.replace(/&/g, '&amp;')}"`);
    expect(url).toMatch(/\?m=m1&p=p1&s=/);
    expect(out.html).not.toContain(ANSWER_URL_PLACEHOLDER);
  });
});

describe('the answer link through composeBody', () => {
  const read: TemplateReader = async (okey) => okey === 'email-layout-standard' || okey.startsWith('email-layout')
    ? {
      doc: { kind: 'emailLayout', tenants: ['system'], currentVersion: 1 },
      version: { status: 'published', html: '<div>{{{content}}}</div>', text: '{{{content}}}' } as never,
    }
    : {};

  it('keeps the placeholder in html and text, and both halves take the url', async () => {
    const composed = await composeBody('scs', { body: '<p>Hallo</p>' + answerBlockHtml(ANSWER_URL_PLACEHOLDER, events) }, read);
    expect(hasAnswerPlaceholder(composed)).toBe(true);
    const out = fillAnswerUrl(composed, url);
    expect(out.html).toContain(url.replace(/&/g, '&amp;'));
    expect(out.text).toContain(url);
    expect(hasAnswerPlaceholder(out)).toBe(false);
  });
});

describe('hasAnswerPlaceholder', () => {
  it('is false when a half lost it', () => {
    expect(hasAnswerPlaceholder({ html: 'x' })).toBe(false);
    expect(hasAnswerPlaceholder({ html: ANSWER_URL_PLACEHOLDER, text: 'x' })).toBe(false);
    expect(hasAnswerPlaceholder({ html: ANSWER_URL_PLACEHOLDER })).toBe(true);
  });
});
