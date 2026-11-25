import { describe, expect, it } from 'vitest';

import type { MailBlock } from '@okr/shared-models';

import { checkMailBlocks, firstTextId, mailBlocksFromBody } from './mail-editor';

const counter = () => { let n = 0; return () => `n${++n}`; };

describe('mailBlocksFromBody', () => {
  it('starts an empty mail with one empty text', () => {
    expect(mailBlocksFromBody(undefined, counter())).toEqual([{ id: 'n1', type: 'text', html: '' }]);
    expect(mailBlocksFromBody('<p></p>', counter())).toEqual([{ id: 'n1', type: 'text', html: '' }]);
    expect(mailBlocksFromBody('<p>&nbsp;</p><!-- x -->', counter())).toEqual([{ id: 'n1', type: 'text', html: '' }]);
  });

  it('puts a prefilled body into the first text', () => {
    expect(mailBlocksFromBody('<p>Hallo <b>du</b></p>', counter())).toEqual([{ id: 'n1', type: 'text', html: '<p>Hallo <b>du</b></p>' }]);
  });

  it('removes comments, styles and scripts of a prefilled body', () => {
    const html = '<style>p{color:red}</style><p>Hallo</p><!-- note --><script>alert(1)</script><SCRIPT src="x"></SCRIPT>';
    expect(mailBlocksFromBody(html, counter())).toEqual([{ id: 'n1', type: 'text', html: '<p>Hallo</p>' }]);
  });

  it('keeps a body that is only a picture', () => {
    expect(mailBlocksFromBody('<p><img src="https://x/a.png"></p>', counter())[0]).toMatchObject({ type: 'text', html: '<p><img src="https://x/a.png"></p>' });
  });
});

describe('firstTextId', () => {
  it('finds the first text in reading order, also in a column', () => {
    const blocks = [
      { id: 'd', type: 'divider' },
      { id: 'c', type: 'columns', columns: [{ size: 6, blocks: [{ id: 'inner', type: 'text', html: '' }] }, { size: 6, blocks: [] }] },
      { id: 't', type: 'text', html: '<p>x</p>' },
    ] as MailBlock[];
    expect(firstTextId(blocks)).toBe('inner');
  });

  it('is undefined without a text and on malformed data', () => {
    expect(firstTextId([{ id: 'd', type: 'divider' }] as MailBlock[])).toBeUndefined();
    expect(firstTextId(undefined as unknown as MailBlock[])).toBeUndefined();
  });
});

describe('checkMailBlocks', () => {
  it('passes a mail with a text', () => {
    expect(checkMailBlocks([{ id: 'a', type: 'text', html: '<p>x</p>' }])).toEqual({ errors: {}, valid: true, errorCount: 0 });
  });

  it('counts the blocks with errors', () => {
    const blocks = [
      { id: 'a', type: 'button', cta: { label: '', url: '', style: 'primary' } },
      { id: 'b', type: 'events', calendarKey: '', maxEvents: 3 },
      { id: 'c', type: 'text', html: '<p>x</p>' },
    ] as MailBlock[];
    const result = checkMailBlocks(blocks);
    expect(result.valid).toBe(false);
    expect(result.errorCount).toBe(2);
    expect(Object.keys(result.errors).some((key) => key.startsWith('blocks.a.'))).toBe(true);
  });

  it('is invalid without a block error when ids repeat', () => {
    const result = checkMailBlocks([{ id: 'a', type: 'divider' }, { id: 'a', type: 'divider' }] as MailBlock[]);
    expect(result.valid).toBe(false);
  });
});
