import { describe, expect, it, vi } from 'vitest';

vi.mock('../auth/email-templates', () => ({
  getAppEmailConfig: vi.fn(async () => ({ appName: 'Seeclub', appDomain: 'app.example.org', contactEmail: 'info@example.org' })),
}));
vi.mock('../srv/sentry', () => ({ reportToSentry: vi.fn(async () => undefined) }));
vi.mock('firebase-functions/v2', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));

import { composeSample } from './compose-sample';
import { withWebLink, WEB_LINK_LABEL } from './mail-page/web-version.logic';
import { answerBlockHtml, unsubscribeBlockHtml } from './personal-mail.logic';
import { composeBody, TemplateReader } from './render-email';

const read: TemplateReader = async () => ({
  doc: { kind: 'emailLayout', tenants: ['scs'], currentVersion: 1 },
  version: { html: '<div class="frame">{{{content}}}</div>', text: 'RAHMEN\n{{{content}}}', subject: '', status: 'published' },
});
const CONTENT = '<p>Liebe Mitglieder, <a href="https://club.ch/fest">zum Fest</a></p><script>x()</script>';
const EVENTS = [{ name: 'GV <2026>', when: '01.12.2026, 19:00' }, { name: 'Fondue', when: '04.12.2026' }];
const all = { content: CONTENT, layout: 'standard' as const, answerEvents: EVENTS, newsletter: true, webLink: true };
const hrefs = (html: string): string[] => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);

describe('composeSample', () => {
  it('shows «Im Browser ansehen», the content, the answer block and the unsubscribe line, in this order and in the layout', async () => {
    const { html, text } = await composeSample('scs', all, read);
    expect(html).toContain('class="frame"');
    for (const half of [html, text]) {
      const at = ['Im Browser ansehen', 'Liebe Mitglieder', 'Melde dich hier', 'Fondue', 'An- oder abmelden', 'Newsletter abbestellen'].map((s) => half.indexOf(s));
      expect(at).not.toContain(-1);
      expect([...at].sort((a, b) => a - b)).toEqual(at);
    }
    expect(html).toContain('GV &lt;2026&gt;');
  });

  it('leads nowhere: the samples have the href # in the html and no address at all in the text', async () => {
    const { html, text } = await composeSample('scs', all, read);
    expect(hrefs(html)).toEqual(['#', 'https://club.ch/fest', '#', '#']);
    expect(html).not.toMatch(/invalid|cloudfunctions|__OKR_/);
    expect(text.match(/https?:\/\/\S+/g)).toEqual(['https://club.ch/fest)']);
    expect(text).not.toContain('(#)');
    expect(text).not.toContain('#');
  });

  it('leaves out what the send would not carry', async () => {
    const plain = await composeSample('scs', { ...all, answerEvents: [], newsletter: false, webLink: false }, read);
    expect(plain).toEqual(await composeBody('scs', { body: CONTENT, layout: 'standard' }, read));
    expect((await composeSample('scs', { ...all, answerEvents: [], webLink: false }, read)).html).not.toMatch(/Browser|abmelden/);
    expect((await composeSample('scs', { ...all, newsletter: false }, read)).html).not.toContain('abbestellen');
  });

  it('is the mail of a real send, but for the links: same parts, same sanitising, same attachment note', async () => {
    const url = (s: string) => `https://x.example/${s}`;
    const real = await composeBody('scs', {
      body: withWebLink(CONTENT, url('web'), WEB_LINK_LABEL) + answerBlockHtml(url('answer'), EVENTS) + unsubscribeBlockHtml(url('off')),
      layout: 'standard', attachmentName: 'a.pdf',
    }, read);
    const sample = await composeSample('scs', { ...all, attachmentName: 'a.pdf' }, read);
    expect(sample.html).toBe(real.html.replace(/https:\/\/x\.example\/\w+/g, '#'));
    expect(sample.text).toBe(real.text.replace(/ \(https:\/\/x\.example\/\w+\)/g, ''));
    expect(sample.html).not.toContain('<script');
  });

  it('keeps the sender\'s own # links as a real mail has them', async () => {
    const content = '<p><a href="#">hier</a></p>';
    const { text } = await composeSample('scs', { ...all, content }, read);
    expect(text).toContain('hier (#)');
  });
});
