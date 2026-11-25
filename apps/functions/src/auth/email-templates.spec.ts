import { describe, expect, it, vi } from 'vitest';

let read: () => Promise<{ data: () => Record<string, unknown> | undefined }>;
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({ collection: () => ({ doc: () => ({ get: () => read() }) }) }),
}));
vi.mock('firebase-functions/v2', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const reported = vi.hoisted(() => [] as Record<string, unknown>[]);
vi.mock('../srv/sentry', () => ({ reportToSentry: async (e: Record<string, unknown>) => { reported.push(e); } }));

import { bareAddress, effectiveSender, getAppEmailConfig, getEmailProvider, isBareAddress } from './email-templates';

describe('getAppEmailConfig', () => {
  const cfg = (data: Record<string, unknown>) => { read = async () => ({ data: () => data }); reported.length = 0; };

  it('keeps a valid config unchanged', async () => {
    cfg({ appDomain: 'app.kring.ch', emailDomain: 'kring.ch', loginUrl: '/login' });
    const c = await getAppEmailConfig('t');
    expect(c.appDomain).toBe('app.kring.ch');
    expect(c.senderDomain).toBe('kring.ch');
    expect(c.continueUrl).toBe('https://app.kring.ch/login');
    expect(reported).toEqual([]);
  });

  it('falls back for an appDomain that is not a bare host and reports it without the value', async () => {
    cfg({ appDomain: 'evil.ch:80@own.ch' });
    const c = await getAppEmailConfig('t');
    expect(c.appDomain).toBe('bkaiser.ch');
    expect(c.continueUrl).toBe('https://bkaiser.ch/auth/login');
    expect(reported).toHaveLength(1);
    expect(reported[0]['fingerprint']).toEqual(['app-config-host', 'appDomain']);
    expect(reported[0]['tags']).toEqual({ appId: 't', field: 'appDomain' });
    expect(JSON.stringify(reported[0])).not.toContain('evil');
  });

  it('falls back silently for an empty or missing appDomain', async () => {
    cfg({ appDomain: '' });
    expect((await getAppEmailConfig('t')).appDomain).toBe('bkaiser.ch');
    cfg({});
    expect((await getAppEmailConfig('t')).appDomain).toBe('bkaiser.ch');
    expect(reported).toEqual([]);
  });

  it('falls back to the app domain for a bad emailDomain', async () => {
    cfg({ appDomain: 'app.kring.ch', emailDomain: 'x@y' });
    expect((await getAppEmailConfig('t')).senderDomain).toBe('app.kring.ch');
    expect(reported).toHaveLength(1);
    expect(reported[0]['tags']).toEqual({ appId: 't', field: 'emailDomain' });
  });

  it.each(['@evil.ch', '//evil.ch', '/\\evil.ch', 'login'])('falls back to the default login path for %s', async (loginUrl) => {
    cfg({ appDomain: 'app.kring.ch', loginUrl });
    expect((await getAppEmailConfig('t')).continueUrl).toBe('https://app.kring.ch/auth/login');
    expect(reported).toHaveLength(1);
  });

  it('keeps an ordinary name in the sender', async () => {
    cfg({ appName: 'Seeclub Stäfa & Co. (SCS)', appDomain: 'app.kring.ch', emailDomain: 'kring.ch' });
    expect((await getAppEmailConfig('t')).from).toBe('"Seeclub Stäfa & Co. (SCS)" <app@kring.ch>');
  });

  // the rules do not check the value, and the settings form is not the only writer
  it.each([
    ['a quote', 'A" <x@evil.ch>, "B', 'A x@evil.ch, B'],
    ['a trailing backslash', 'Club\\', 'Club'],
    ['a line break', 'A\r\nBcc: x@evil.ch', 'A Bcc: x@evil.ch'],
    ['other control characters', 'A\u0000B\u0085C\u2028D\u2029E\u007fF', 'A B C D E F'],
  ])('strips %s from the name in the sender', async (_what, appName, name) => {
    cfg({ appName, appDomain: 'app.kring.ch', emailDomain: 'kring.ch' });
    expect((await getAppEmailConfig('t')).from).toBe(`"${name}" <app@kring.ch>`);
  });

  it('sends from the bare address when no name is left', async () => {
    for (const appName of ['', ' ', '"\\<>', '\n']) {
      cfg({ appName, appDomain: 'app.kring.ch', emailDomain: 'kring.ch' });
      expect((await getAppEmailConfig('t')).from, JSON.stringify(appName)).toBe('app@kring.ch');
    }
  });
});

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

describe('isBareAddress', () => {
  it('accepts one plain address', () => {
    for (const a of ['a@x.ch', 'Anna.Muster+tag@mail.x-y.example.org', "o'neil@x.ch"]) expect(isBareAddress(a), a).toBe(true);
  });

  it('refuses everything that could be read as a name, a list or a header', () => {
    for (const a of ['', ' ', 'a', 'a@x', 'x.ch', '@x.ch', 'a@', 'a b@x.ch', 'a@b@x.ch', ' a@x.ch', 'a@x.ch ', 'a@x.ch, b@x.ch', 'a@x.ch;b@x.ch', 'A <a@x.ch>', '<a@x.ch>', '"a"@x.ch',
      'a@x.ch\nBcc: b@x.ch', 'a@x.ch\r', 'a\u2028@x.ch', '=?utf-8?q?a?=@x.ch', 'a@[1.2.3.4]', 'a@x..ch']) expect(isBareAddress(a), JSON.stringify(a)).toBe(false);
  });

  it('refuses one that is too long', () => {
    expect(isBareAddress(`${'a'.repeat(315)}@x.ch`)).toBe(true);
    expect(isBareAddress(`${'a'.repeat(316)}@x.ch`)).toBe(false);
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
