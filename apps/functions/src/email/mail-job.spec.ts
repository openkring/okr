import { describe, expect, it, vi } from 'vitest';

import { mailJobBlocks, MailJobDoc, mailJobTenant, personalBlocks, resolveJobContent, sendPersonal, trustedCategory } from './mail-job';
import { ANSWER_URL_PLACEHOLDER, answerBlockHtml, UNSUBSCRIBE_URL_PLACEHOLDER, unsubscribeBlockHtml } from './personal-mail.logic';

const job = (bcc: string[]): MailJobDoc => ({
  tenants: ['scs'],
  to: ['info@scs.ch'],
  cc: ['revision@scs.ch'],
  bcc,
  subject: 's',
  html: '<p>x</p>',
});

const addresses = (n: number) => Array.from({ length: n }, (_, i) => `m${i}@scs.ch`);

describe('mailJobBlocks', () => {
  const from = '"Seeclub" <app@seeclub.org>';

  it('sends one message when there is no bcc list', () => {
    expect(mailJobBlocks(job([]), from)).toEqual([{ to: ['info@scs.ch'], cc: ['revision@scs.ch'], bcc: [] }]);
  });

  it('chunks bcc into blocks of 500', () => {
    const blocks = mailJobBlocks(job(addresses(1100)), from);
    expect(blocks.map((b) => b.bcc.length)).toEqual([500, 500, 100]);
  });

  it('addresses only the first block to the org, the rest to the sender', () => {
    const [first, second] = mailJobBlocks(job(addresses(600)), from);
    expect(first.to).toEqual(['info@scs.ch']);
    expect(first.cc).toEqual(['revision@scs.ch']);
    expect(second.to).toEqual(['app@seeclub.org']);   // NOT the org address — no copy per block
    expect(second.cc).toEqual([]);
  });
});

describe('mailJobTenant', () => {
  it('gives the one tenant of a job', () => {
    expect(mailJobTenant({ tenants: ['scs'] })).toBe('scs');
  });

  it('refuses a job naming more than one tenant: tenants[0] would pick the sender limit', () => {
    expect(mailJobTenant({ tenants: ['scs', 'p13'] })).toBeUndefined();
  });

  it('refuses a job with no usable tenant', () => {
    expect(mailJobTenant({ tenants: [] })).toBeUndefined();
    expect(mailJobTenant({ tenants: [''] })).toBeUndefined();
    expect(mailJobTenant({ tenants: [5 as never] })).toBeUndefined();
    expect(mailJobTenant({ tenants: undefined as never })).toBeUndefined();
    expect(mailJobTenant({ tenants: 'scs' as never })).toBeUndefined();
  });
});

describe('resolveJobContent', () => {
  const rendered = { subject: '', html: '<div>wrapped</div>', text: 'wrapped' };

  it('wraps a body through the composer with the job layout and attachment', async () => {
    const compose = vi.fn(async () => rendered);
    const content = await resolveJobContent({ ...job([]), html: undefined, body: '<p>x</p>', layout: 'plain', attachmentName: 'a.pdf' }, 'scs', compose);
    expect(content).toEqual({ html: rendered.html, text: rendered.text });
    expect(compose).toHaveBeenCalledWith('scs', { body: '<p>x</p>', layout: 'plain', attachmentName: 'a.pdf' });
  });

  it('sends the html of an old job unchanged, with no text half', async () => {
    const compose = vi.fn(async () => rendered);
    expect(await resolveJobContent(job([]), 'scs', compose)).toEqual({ html: '<p>x</p>', text: undefined });
    expect(compose).not.toHaveBeenCalled();
  });

  it('passes layout standard for a missing or malformed layout, and the attachment name as it came', async () => {
    const compose = vi.fn(async () => rendered);
    await resolveJobContent({ ...job([]), body: '<p>x</p>', layout: '../fancy' as never, attachmentName: 5 as never }, 'scs', compose);
    expect(compose).toHaveBeenCalledWith('scs', { body: '<p>x</p>', layout: 'standard', attachmentName: 5 });
  });

  it('passes a layout key on to the renderer (spec 1.145)', async () => {
    const compose = vi.fn(async () => rendered);
    await resolveJobContent({ ...job([]), body: '<p>x</p>', layout: 'club-news_scs' }, 'scs', compose);
    expect(compose).toHaveBeenCalledWith('scs', { body: '<p>x</p>', layout: 'club-news_scs', attachmentName: undefined });
  });

  it('fails a job with a blank or non-text body', async () => {
    const compose = vi.fn(async () => rendered);
    await expect(resolveJobContent({ ...job([]), body: '  ' }, 'scs', compose)).rejects.toThrow();
    await expect(resolveJobContent({ ...job([]), body: 7 as never }, 'scs', compose)).rejects.toThrow();
    expect(compose).not.toHaveBeenCalled();
  });

  it('prefers the body when a job carries both', async () => {
    const compose = vi.fn(async () => rendered);
    expect((await resolveJobContent({ ...job([]), body: '<p>b</p>' }, 'scs', compose)).html).toBe(rendered.html);
  });

  it('lets a render failure through, so the job ends as failed', async () => {
    const compose = vi.fn(async () => { throw new Error('no layout'); });
    await expect(resolveJobContent({ ...job([]), body: '<p>b</p>' }, 'scs', compose)).rejects.toThrow('no layout');
  });

  it('refuses a job with neither body nor html', async () => {
    await expect(resolveJobContent({ ...job([]), html: undefined }, 'scs', vi.fn())).rejects.toThrow();
  });
});

describe('sendPersonal', () => {
  const personalJob = (n: number): MailJobDoc => ({
    tenants: ['scs'], to: ['info@scs.ch'], subject: 's', body: '<p>Hallo</p>',
    personal: Array.from({ length: n }, (_, i) => ({ to: `m${i}@scs.ch`, answerUrl: `https://x/?p=${i}` })),
    answerEvents: [{ name: 'GV', when: '01.12.2026, 19:30' }],
  });
  const compose = vi.fn(async () => ({ subject: '', html: `<a href="${ANSWER_URL_PLACEHOLDER}">x</a>`, text: ANSWER_URL_PLACEHOLDER }));

  it('stops at the deadline and fails the job with the count sent so far', async () => {
    const updates: object[] = [];
    const snap = { ref: { update: async (data: object) => { updates.push(data); } } };
    let clock = 0;
    const send = vi.fn(async () => { clock += 200_000; });   // every mail takes 200 s
    const progress = { sent: 0 };
    await sendPersonal(snap, personalJob(5), 'scs', 'app@scs.ch', 'mailtrap_api', [], progress, { now: () => clock, send, compose, pauseMs: 0 });
    // mails start at 0, 200 and 400 s; at 600 s the 480 s deadline is passed
    expect(send).toHaveBeenCalledTimes(3);
    expect(progress.sent).toBe(3);
    expect(updates.at(-1)).toEqual({ blocksSent: 3, state: 'failed', error: '3 von 5 Mails gesendet – die Zeit hat nicht gereicht.' });
  });

  it('sends everything within the deadline and ends sent', async () => {
    const updates: object[] = [];
    const snap = { ref: { update: async (data: object) => { updates.push(data); } } };
    const send = vi.fn(async () => undefined);
    const progress = { sent: 0 };
    await sendPersonal(snap, personalJob(3), 'scs', 'app@scs.ch', 'mailtrap_api', [], progress, { now: () => 0, send, compose, pauseMs: 0 });
    expect(send).toHaveBeenCalledTimes(3);
    expect(updates.at(-1)).toEqual({ blocksSent: 3, state: 'sent' });
  });

  it('hands an entry\'s headers to send, and none when the entry has none', async () => {
    const snap = { ref: { update: async () => undefined } };
    const send = vi.fn(async (_provider: string, _options: { headers?: Record<string, string> }) => undefined);
    const headers = { 'List-Unsubscribe': '<https://x/u>' };
    const job = { ...personalJob(2), personal: [{ to: 'a@scs.ch', answerUrl: 'https://x/?p=a', headers }, { to: 'b@scs.ch', answerUrl: 'https://x/?p=b' }] };
    await sendPersonal(snap, job, 'scs', 'app@scs.ch', 'mailtrap_api', [], { sent: 0 }, { now: () => 0, send, compose, pauseMs: 0 });
    expect(send.mock.calls[0][1].headers).toEqual(headers);
    expect(send.mock.calls[1][1]).not.toHaveProperty('headers');
  });

  it('puts the job\'s category on every personal mail, and none without one', async () => {
    const snap = { ref: { update: async () => undefined } };
    const send = vi.fn(async (_provider: string, _options: { category?: string }) => undefined);
    await sendPersonal(snap, { ...personalJob(2), category: 'mailing.m1' }, 'scs', 'app@scs.ch', 'mailtrap_api', [], { sent: 0 }, { now: () => 0, send, compose, pauseMs: 0 });
    expect(send.mock.calls.map((c) => c[1].category)).toEqual(['mailing.m1', 'mailing.m1']);
    send.mockClear();
    await sendPersonal(snap, personalJob(1), 'scs', 'app@scs.ch', 'mailtrap_api', [], { sent: 0 }, { now: () => 0, send, compose, pauseMs: 0 });
    expect(send.mock.calls[0][1]).not.toHaveProperty('category');
  });

  it('keeps the true count in progress when a progress write fails mid-loop', async () => {
    let calls = 0;
    const snap = { ref: { update: async () => { calls++; if (calls > 1) throw new Error('write failed'); } } };
    const send = vi.fn(async () => undefined);
    const progress = { sent: 0 };
    await expect(sendPersonal(snap, personalJob(12), 'scs', 'app@scs.ch', 'mailtrap_api', [], progress, { now: () => 0, send, compose, pauseMs: 0 }))
      .rejects.toThrow('write failed');
    expect(progress.sent).toBe(10);                          // the first progress write comes after mail 10
  });
});

describe('trustedCategory', () => {
  const tenantsOf = (map: Record<string, string[]>) => async (key: string) => map[key];
  const read = tenantsOf({ m1: ['scs'], m2: ['p13'], m3: ['scs', 'p13'] });

  it('keeps a category that names a Versand of the job\'s own tenant', async () => {
    expect(await trustedCategory({ category: 'mailing.m1' }, 'scs', read)).toBe('mailing.m1');
  });
  it('drops one that names another tenant\'s, a shared or a missing Versand', async () => {
    expect(await trustedCategory({ category: 'mailing.m2' }, 'scs', read)).toBeUndefined();
    expect(await trustedCategory({ category: 'mailing.m3' }, 'scs', read)).toBeUndefined();
    expect(await trustedCategory({ category: 'mailing.nope' }, 'scs', read)).toBeUndefined();
  });
  it('drops anything not shaped like a Versand category without reading', async () => {
    const spy = vi.fn(read);
    for (const category of [undefined, 42, '', 'invoice.x', 'mailing.', 'mailing.a/b', `mailing.${'x'.repeat(65)}`]) {
      expect(await trustedCategory({ category } as never, 'scs', spy)).toBeUndefined();
    }
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('sendPersonal blocks (newsletter, spec 1.169 §5.4)', () => {
  const snap = { ref: { update: async () => undefined } };
  const deps = (compose: ReturnType<typeof vi.fn>, send: ReturnType<typeof vi.fn>) => ({ now: () => 0, send, compose, pauseMs: 0 } as never);
  // the composition as a layout would keep it: the whole body in html and text
  const echo = () => vi.fn(async (_t: string, req: { body: string }) => ({ subject: '', html: req.body, text: req.body }));
  const sent = () => vi.fn(async (_p: string, _o: { html: string; text?: string; headers?: Record<string, string> }) => undefined);
  const newsletterJob = (over: Partial<MailJobDoc> = {}): MailJobDoc => ({
    tenants: ['scs'], to: ['info@scs.ch'], subject: 's', body: '<p>Hallo</p>', blocks: ['unsubscribe'],
    personal: [
      { to: 'a@scs.ch', unsubscribeUrl: 'https://u/?p=a&g=nl', headers: { 'List-Unsubscribe': '<https://u/?p=a&g=nl>' } },
      { to: 'b@scs.ch', unsubscribeUrl: 'https://u/?p=b&g=nl', headers: { 'List-Unsubscribe': '<https://u/?p=b&g=nl>' } },
    ],
    ...over,
  });

  it('keeps an event-only job as it was: the answer block alone, composed with the same body', async () => {
    const compose = vi.fn(async () => ({ subject: '', html: `<a href="${ANSWER_URL_PLACEHOLDER}">x</a>`, text: ANSWER_URL_PLACEHOLDER }));
    const job: MailJobDoc = {
      tenants: ['scs'], to: ['info@scs.ch'], subject: 's', body: '<p>Hallo</p>',
      personal: [{ to: 'a@scs.ch', answerUrl: 'https://x/?p=a' }], answerEvents: [{ name: 'GV', when: '01.12.2026, 19:30' }],
    };
    const send = sent();
    await sendPersonal(snap, job, 'scs', 'app@scs.ch', 'mailtrap_api', [], { sent: 0 }, deps(compose, send));
    expect((compose.mock.calls[0] as unknown[])[1]).toMatchObject({ body: '<p>Hallo</p>' + answerBlockHtml(ANSWER_URL_PLACEHOLDER, job.answerEvents ?? []) });
    expect(send.mock.calls[0][1].html).toBe('<a href="https://x/?p=a">x</a>');
  });

  it('puts each person\'s own unsubscribe link and headers into their mail', async () => {
    const compose = echo();
    const send = sent();
    await sendPersonal(snap, newsletterJob(), 'scs', 'app@scs.ch', 'mailtrap_api', [], { sent: 0 }, deps(compose, send));
    expect((compose.mock.calls[0] as unknown[])[1]).toMatchObject({ body: '<p>Hallo</p>' + unsubscribeBlockHtml(UNSUBSCRIBE_URL_PLACEHOLDER) });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0][1].html).toContain('href="https://u/?p=a&amp;g=nl"');
    expect(send.mock.calls[0][1].text).toContain('https://u/?p=a&g=nl');
    expect(send.mock.calls[1][1].html).toContain('href="https://u/?p=b&amp;g=nl"');
    expect(send.mock.calls[1][1].html).not.toContain('p=a');
    expect(send.mock.calls[0][1].headers).toEqual({ 'List-Unsubscribe': '<https://u/?p=a&g=nl>' });
    expect(send.mock.calls.every((c) => !c[1].html.includes(UNSUBSCRIBE_URL_PLACEHOLDER))).toBe(true);
  });

  it('appends both blocks, answer first, and fills both links', async () => {
    const send = sent();
    const job = newsletterJob({
      blocks: ['answer', 'unsubscribe'], answerEvents: [{ name: 'GV', when: '01.12.2026' }],
      personal: [{ to: 'a@scs.ch', answerUrl: 'https://x/?p=a', unsubscribeUrl: 'https://u/?p=a' }],
    });
    await sendPersonal(snap, job, 'scs', 'app@scs.ch', 'mailtrap_api', [], { sent: 0 }, deps(echo(), send));
    const html = send.mock.calls[0][1].html;
    expect(html.indexOf('https://x/?p=a')).toBeGreaterThan(-1);
    expect(html.indexOf('https://u/?p=a')).toBeGreaterThan(html.indexOf('https://x/?p=a'));
    expect(html).not.toContain(ANSWER_URL_PLACEHOLDER);
    expect(html).not.toContain(UNSUBSCRIBE_URL_PLACEHOLDER);
  });

  it('fails closed when the composition lost the unsubscribe placeholder', async () => {
    const compose = vi.fn(async () => ({ subject: '', html: '<p>Hallo</p>', text: 'Hallo' }));
    const send = sent();
    await expect(sendPersonal(snap, newsletterJob(), 'scs', 'app@scs.ch', 'mailtrap_api', [], { sent: 0 }, deps(compose, send)))
      .rejects.toThrow('The unsubscribe link is missing from the composed mail.');
    expect(send).not.toHaveBeenCalled();
  });

  it('never sends an entry without its unsubscribe link', async () => {
    const updates: object[] = [];
    const send = sent();
    const job = newsletterJob({ personal: [{ to: 'a@scs.ch' }, { to: 'b@scs.ch', unsubscribeUrl: 'https://u/?p=b' }] });
    await sendPersonal({ ref: { update: async (d: object) => { updates.push(d); } } }, job, 'scs', 'app@scs.ch', 'mailtrap_api', [], { sent: 0 }, deps(echo(), send));
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][1].html).toContain('https://u/?p=b');
    expect(updates.at(-1)).toMatchObject({ blocksSent: 1, state: 'sent', error: '1 von 2 Mails konnten nicht gesendet werden.' });
  });
});

describe('personalBlocks', () => {
  it('reads an absent list as the answer block, and dedupes', () => {
    expect(personalBlocks({})).toEqual(['answer']);
    expect(personalBlocks({ blocks: ['unsubscribe', 'unsubscribe'] })).toEqual(['unsubscribe']);
  });

  it('refuses an empty list or an unknown block', () => {
    expect(() => personalBlocks({ blocks: [] })).toThrow();
    expect(() => personalBlocks({ blocks: ['footer'] as never })).toThrow();
  });
});
