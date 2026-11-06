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

  it('falls back to the tenant sender when the tenant has no sender domain', () => {
    expect(effectiveSender('info@club.ch', { from: config.from, senderDomain: '' })).toBe(config.from);
  });
});
