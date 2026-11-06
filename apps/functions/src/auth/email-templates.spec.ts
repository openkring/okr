import { describe, expect, it, vi } from 'vitest';

let read: () => Promise<{ data: () => Record<string, unknown> | undefined }>;
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({ collection: () => ({ doc: () => ({ get: () => read() }) }) }),
}));
vi.mock('firebase-functions/v2', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { bareAddress, effectiveSender, getEmailProvider } from './email-templates';

describe('getEmailProvider', () => {
  it('returns the stored provider of the tenant', async () => {
    read = async () => ({ data: () => ({ emailProvider: 'netzone_smtp' }) });
    expect(await getEmailProvider('t')).toBe('netzone_smtp');
  });

  it('returns the default when the field or the document is missing', async () => {
    read = async () => ({ data: () => ({}) });
    expect(await getEmailProvider('t')).toBe('mailtrap_api');
    read = async () => ({ data: () => undefined });
    expect(await getEmailProvider('t')).toBe('mailtrap_api');
  });

  it('returns the default for an unknown stored value', async () => {
    read = async () => ({ data: () => ({ emailProvider: 'nonsense' }) });
    expect(await getEmailProvider('t')).toBe('mailtrap_api');
  });

  it('does not throw when the read fails', async () => {
    read = async () => { throw new Error('unavailable'); };
    expect(await getEmailProvider('t')).toBe('mailtrap_api');
  });
});

describe('bareAddress', () => {
  it('strips the display name and passes a bare address through', () => {
    expect(bareAddress('"Seeclub" <app@seeclub.org>')).toBe('app@seeclub.org');
    expect(bareAddress(' app@seeclub.org ')).toBe('app@seeclub.org');
  });
});

describe('effectiveSender', () => {
  const config = { from: '"Club" <app@club.ch>', senderDomain: 'club.ch' };

  it('keeps a sender on the tenant domain or a sub or parent domain', () => {
    expect(effectiveSender('info@club.ch', config)).toBe('info@club.ch');
    expect(effectiveSender('"Vorstand" <info@mail.club.ch>', config)).toBe('"Vorstand" <info@mail.club.ch>');
    expect(effectiveSender('info@club.ch', { from: config.from, senderDomain: 'app.club.ch' })).toBe('info@club.ch');
  });

  it('compares the domain case-insensitively', () => {
    expect(effectiveSender('Info@CLUB.ch', config)).toBe('Info@CLUB.ch');
  });

  it('replaces a foreign, malformed or missing sender with the tenant sender', () => {
    expect(effectiveSender('info@notclub.ch', config)).toBe(config.from);
    expect(effectiveSender('info@club.ch.evil.ch', config)).toBe(config.from);
    expect(effectiveSender('"info@club.ch" <x@evil.ch>', config)).toBe(config.from);
    expect(effectiveSender('nobody', config)).toBe(config.from);
    expect(effectiveSender(undefined, config)).toBe(config.from);
    expect(effectiveSender('', config)).toBe(config.from);
  });

  it('replaces a sender that tries to smuggle a header line or a second address', () => {
    expect(effectiveSender('info@club.ch\r\nBcc: x@evil.ch', config)).toBe(config.from);
    expect(effectiveSender('a@club.ch, b@evil.ch', config)).toBe(config.from);
  });

  it('refuses more than 320 characters before any pattern runs', () => {
    expect(effectiveSender(`${'a'.repeat(309)}@club.ch`, config)).toBe(`${'a'.repeat(309)}@club.ch`);
    expect(effectiveSender(`${'a'.repeat(314)}@club.ch`, config)).toBe(config.from);
    expect(effectiveSender(`"${'n'.repeat(100000)}" <info@club.ch>`, config)).toBe(config.from);
    expect(effectiveSender(`${' '.repeat(321)}info@club.ch`, config)).toBe(config.from);
  });

  it.each([
    ['a control character', 'in\u0001fo@club.ch'],
    ['delete', 'in\u007ffo@club.ch'],
    ['a line separator', 'in\u2028fo@club.ch'],
    ['a paragraph separator', 'in\u2029fo@club.ch'],
    ['an encoded word', 'x=?utf-8?q?y@club.ch'],
    ['an encoded word in a named sender', 'Name <=?utf-8?q?y@club.ch>'],
  ])('refuses %s in the local part', (_, from) => {
    expect(effectiveSender(from, config)).toBe(config.from);
  });

  it.each([
    ['a control character', '"Vor\u0001stand" <info@club.ch>'],
    ['a tab', '"Vor\tstand" <info@club.ch>'],
    ['delete', 'Vor\u007fstand <info@club.ch>'],
    ['a line separator', '"Vor\u2028stand" <info@club.ch>'],
    ['a paragraph separator', 'Vor\u2029stand <info@club.ch>'],
  ])('refuses %s in the name', (_, from) => {
    expect(effectiveSender(from, config)).toBe(config.from);
  });

  it.each([
    ['a whole encoded name', '=?utf-8?q?x=40evil.ch?= <info@club.ch>'],
    ['a quoted encoded name', '"=?utf-8?q?x=40evil.ch?=" <info@club.ch>'],
    ['an encoded word inside a name', 'Vorstand =?utf-8?b?eA==?= <info@club.ch>'],
  ])('refuses %s', (_, from) => {
    expect(effectiveSender(from, config)).toBe(config.from);
  });

  it('keeps an equals sign or a question mark on their own in the name', () => {
    expect(effectiveSender('Wer? 1=1 <info@club.ch>', config)).toBe('"Wer? 1=1" <info@club.ch>');
  });

  it('keeps an equals sign or a question mark on their own in the local part', () => {
    expect(effectiveSender('a=b?c@club.ch', config)).toBe('a=b?c@club.ch');
  });

  it('replaces every crafted string where two parsers would read two addresses', () => {
    const crafted = [
      '"<info@club.ch>" <x@evil.ch>',
      '<info@club.ch> <x@evil.ch>',
      '<info@club.ch>, <x@evil.ch>',
      '<info@club.ch>, x@evil.ch',
      '<info@club.ch>x@evil.ch',
      'Group: x@evil.ch; <info@club.ch>',
      'x@evil.ch <info@club.ch>',
      '"a" <info@club.ch> x@evil.ch',
      '"a" <info@club.ch>, "b" <x@evil.ch>',
      'a, b <info@club.ch>',
    ];
    for (const value of crafted) expect(effectiveSender(value, config), value).toBe(config.from);
  });

  it('replaces a non-string, also an array that holds a permitted address', () => {
    for (const value of [123, ['a@club.ch'], ['<a@club.ch>', 'x@evil.ch'], {}, null]) {
      expect(effectiveSender(value, config)).toBe(config.from);
    }
  });

  it('refuses a domain without a dot', () => {
    expect(effectiveSender('x@ch', { from: config.from, senderDomain: 'ch' })).toBe(config.from);
    expect(effectiveSender('x@club', { from: config.from, senderDomain: 'club' })).toBe(config.from);
  });

  it('returns a permitted sender rebuilt from its parts', () => {
    expect(effectiveSender('  Vorstand   <info@club.ch>  ', config)).toBe('"Vorstand" <info@club.ch>');
    expect(effectiveSender('"Vorstand Club" <info@club.ch>', config)).toBe('"Vorstand Club" <info@club.ch>');
    expect(effectiveSender('<info@club.ch>', config)).toBe('info@club.ch');
    expect(effectiveSender(' info@club.ch ', config)).toBe('info@club.ch');
  });

  it('falls back to the tenant sender when the tenant has no sender domain', () => {
    expect(effectiveSender('info@club.ch', { from: config.from, senderDomain: '' })).toBe(config.from);
  });
});
