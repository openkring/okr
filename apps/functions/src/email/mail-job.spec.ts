import { describe, expect, it, vi } from 'vitest';

import { mailJobBlocks, MailJobDoc, mailJobTenant, resolveJobContent, sendPersonal } from './mail-job';
import { ANSWER_URL_PLACEHOLDER } from './personal-mail.logic';

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
