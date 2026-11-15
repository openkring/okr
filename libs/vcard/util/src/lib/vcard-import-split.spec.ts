import { describe, expect, it } from 'vitest';

import { splitVcardBlocks } from './vcard-import-split';

const card = (fn: string, extra = '') => `BEGIN:VCARD\r\nVERSION:3.0\r\nFN:${fn}\r\n${extra}END:VCARD\r\n`;

describe('splitVcardBlocks', () => {
  it('returns one block per card', () => {
    const blocks = splitVcardBlocks(card('A') + card('B') + card('C'));
    expect(blocks).toHaveLength(3);
    expect(blocks[1]).toContain('FN:B');
  });

  it('keeps a folded PHOTO line inside its block', () => {
    const photo = 'PHOTO;ENCODING=b;TYPE=JPEG:AAAA\r\n BBBB\r\n CCCC\r\n';
    const [a, b] = splitVcardBlocks(card('A', photo) + card('B'));
    expect(a).toContain(' CCCC');
    expect(b).not.toContain('CCCC');
  });

  it('accepts LF line ends and lower-case markers', () => {
    expect(splitVcardBlocks('begin:vcard\nFN:A\nend:vcard\nBEGIN:VCARD\nFN:B\nEND:VCARD\n')).toHaveLength(2);
  });

  it('keeps an unterminated last card so the parser can count it as skipped', () => {
    const blocks = splitVcardBlocks(card('A') + 'BEGIN:VCARD\r\nFN:B\r\n');
    expect(blocks).toHaveLength(2);
  });

  it('ignores text before the first card', () => {
    expect(splitVcardBlocks('garbage\r\n' + card('A'))).toEqual([card('A')]);
  });
});
