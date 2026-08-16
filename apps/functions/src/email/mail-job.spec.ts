import { describe, expect, it } from 'vitest';

import { bareAddress, mailJobBlocks, MailJobDoc } from './mail-job';

const job = (bcc: string[]): MailJobDoc => ({
  tenants: ['scs'],
  to: ['info@scs.ch'],
  cc: ['revision@scs.ch'],
  bcc,
  subject: 's',
  html: '<p>x</p>',
});

const addresses = (n: number) => Array.from({ length: n }, (_, i) => `m${i}@scs.ch`);

describe('bareAddress', () => {
  it('strips the display name and passes a bare address through', () => {
    expect(bareAddress('"Seeclub" <app@seeclub.org>')).toBe('app@seeclub.org');
    expect(bareAddress(' app@seeclub.org ')).toBe('app@seeclub.org');
  });
});

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
