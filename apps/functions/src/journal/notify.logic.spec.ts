import { describe, expect, it } from 'vitest';
import { JournalChange } from '@okr/shared-models';

import { chooseChannel, digestRecipients, guestComments, guestDigest, viewDate } from './notify.logic';

const NOW = '2027-01-15T12:00:00Z';

describe('journal notify logic', () => {
  it('muted, revoked and expired guests get nothing', () => {
    const links = [
      { personKey: 'anna', linkCode: 'a' },
      { personKey: 'eva', linkCode: 'e', mutedAt: '2027-01-10T00:00:00Z' },
      { personKey: 'max', linkCode: 'm', revokedAt: '2027-01-10T00:00:00Z' },
      { personKey: 'ida', linkCode: 'i', expiresAt: '2027-01-14T00:00:00Z' },
      { personKey: 'leo', linkCode: 'l', expiresAt: '2027-02-01T00:00:00Z' },
    ];
    expect(digestRecipients(links, NOW).map((l) => l.personKey)).toEqual(['anna', 'leo']);
  });

  it('the channel: own choice, Signal only when possible, email by default', () => {
    expect(chooseChannel(undefined, true, true, true)).toBe('email');
    expect(chooseChannel(['signal'], true, true, true)).toBe('signal');
    expect(chooseChannel(['signal'], false, true, true)).toBe('email'); // integration off
    expect(chooseChannel(['signal'], true, false, true)).toBe('email'); // no mobile number
    expect(chooseChannel([], true, true, true)).toBe('none');
    expect(chooseChannel(['email'], true, true, false)).toBe('none');
  });

  it('the digest names each footprint once and carries the mute link', () => {
    const d = guestDigest('Antarktis 2027', [
      { footprintKey: 'f1', title: 'Neko Harbour', date: '20270114', updated: true, newComments: 2 },
      { footprintKey: 'f2', title: 'Deception', date: '20270115', updated: false, newComments: 1 },
    ], 'https://app/g/j1/c', 'https://app/g/j1/c?mute=1');
    expect(d.subject).toBe('Neues im Reisetagebuch «Antarktis 2027»');
    expect(d.text).toContain('• Neko Harbour, 14.01.2027 – neu oder ergänzt, 2 neue Kommentare');
    expect(d.text).toContain('• Deception, 15.01.2027 – 1 neuer Kommentar');
    expect(d.text).toContain('https://app/g/j1/c?mute=1');
    expect(d.html).toContain('href="https://app/g/j1/c?mute=1"');
    expect(viewDate('bad')).toBe('');
  });

  it('authors hear about guest comments, not their own', () => {
    const rec = (authorKey: string, fk: string): JournalChange => ({
      id: `${authorKey}${fk}`, journalKey: 'j1', deviceId: 'd', seq: 1, hlc: 'x', authorKey, entity: 'comment', entityKey: 'c', op: 'create', fields: { footprintKey: fk },
    });
    expect([...guestComments([rec('anna', 'f1'), rec('anna', 'f1'), rec('bruno', 'f1'), rec('eva', 'f2')], ['bruno', 'barbara'])])
      .toEqual([['f1', 2], ['f2', 1]]);
  });
});
