import { describe, expect, it } from 'vitest';
import { lexVcards, splitStructured, unescapeVcardValue } from './vcard-lexer';

const CRLF = '\r\n';
const card = (...lines: string[]) => ['BEGIN:VCARD', 'VERSION:3.0', ...lines, 'END:VCARD'].join(CRLF);

describe('lexVcards', () => {
  it('splits a file into one property list per card', () => {
    const blocks = lexVcards(card('FN:A') + CRLF + card('FN:B'));
    expect(blocks).toHaveLength(2);
    expect(blocks[0].find((p) => p.name === 'FN')?.value).toBe('A');
    expect(blocks[1].find((p) => p.name === 'FN')?.value).toBe('B');
  });

  it('unfolds continuation lines (leading space or tab)', () => {
    const blocks = lexVcards(card('NOTE:erste Zeile' + CRLF + ' zweite', 'FN:A'));
    expect(blocks[0].find((p) => p.name === 'NOTE')?.value).toBe('erste Zeilezweite');
  });

  it('parses parameters, both TYPE= and bare 2.1 tokens', () => {
    const blocks = lexVcards(card('TEL;TYPE=WORK,VOICE:1', 'EMAIL;HOME;INTERNET:a@b.ch'));
    const tel = blocks[0].find((p) => p.name === 'TEL');
    expect(tel?.params['TYPE']).toEqual(['WORK', 'VOICE']);
    const email = blocks[0].find((p) => p.name === 'EMAIL');
    expect(email?.params['TYPE']).toEqual(['HOME', 'INTERNET']);
  });

  it('keeps the item group separate from the property name', () => {
    const blocks = lexVcards(card('item1.URL:https://a.ch', 'item1.X-ABLabel:Blog'));
    expect(blocks[0][0].group).toBe('item1');
    expect(blocks[0][0].name).toBe('URL');
    expect(blocks[0][1].name).toBe('X-ABLabel');
  });

  it('decodes quoted-printable with soft line breaks', () => {
    const blocks = lexVcards(card('NOTE;ENCODING=QUOTED-PRINTABLE;CHARSET=UTF-8:Gr=C3=BC=' + CRLF + 'sse'));
    expect(blocks[0].find((p) => p.name === 'NOTE')?.value).toBe('Grüsse');
  });

  it('normalizes a BOM and CR-only line endings', () => {
    const blocks = lexVcards('﻿' + ['BEGIN:VCARD', 'FN:A', 'END:VCARD'].join('\r'));
    expect(blocks[0].find((p) => p.name === 'FN')?.value).toBe('A');
  });

  it('drops a block without END:VCARD and keeps the rest', () => {
    expect(lexVcards('BEGIN:VCARD\r\nFN:A\r\n' + card('FN:B'))).toHaveLength(1);
  });

  it('returns [] for text containing no card', () => {
    expect(lexVcards('irgendwas')).toEqual([]);
  });
});

describe('unescapeVcardValue', () => {
  it('undoes generator escaping, backslash last', () => {
    expect(unescapeVcardValue('a\\,b\\;c\\nd\\\\e')).toBe('a,b;c\nd\\e');
  });
});

describe('splitStructured', () => {
  it('splits on unescaped semicolons only', () => {
    expect(splitStructured('Muster;Anna;;;')).toEqual(['Muster', 'Anna', '', '', '']);
    expect(splitStructured('A\\;B;C')).toEqual(['A;B', 'C']);
  });
});
