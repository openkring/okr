import { describe, expect, it, vi } from 'vitest';

import { mailJobBlocks, MailJobDoc, resolveJobContent } from './mail-job';

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

  it('passes layout standard for a missing or unknown layout and drops a non-text attachment name', async () => {
    const compose = vi.fn(async () => rendered);
    await resolveJobContent({ ...job([]), body: '<p>x</p>', layout: 'fancy' as never, attachmentName: 5 as never }, 'scs', compose);
    expect(compose).toHaveBeenCalledWith('scs', { body: '<p>x</p>', layout: 'standard', attachmentName: undefined });
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
