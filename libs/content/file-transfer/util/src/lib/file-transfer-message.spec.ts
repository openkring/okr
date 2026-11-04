import { describe, expect, it } from 'vitest';

import { expandFileTransferMessage, fileTransferExpiryDate } from './file-transfer-message';

const tokens = { lifetime: 'laufzeit', expiry: 'ablaufdatum', password: 'passwort' };

describe('expandFileTransferMessage', () => {
  it('replaces all three placeholders', () => {
    const text = expandFileTransferMessage('Während {laufzeit}, bis am {ablaufdatum}. {passwort}', tokens,
      { lifetime: '7 Tage', expiry: '09.11.2026', password: 'Mit Passwort.' });
    expect(text).toBe('Während 7 Tage, bis am 09.11.2026. Mit Passwort.');
  });

  it('replaces a placeholder that occurs twice', () => {
    expect(expandFileTransferMessage('{laufzeit} / {laufzeit}', tokens, { lifetime: '3 Tage', expiry: '', password: '' }))
      .toBe('3 Tage / 3 Tage');
  });

  it('collapses the blank lines an empty password hint leaves behind', () => {
    const text = expandFileTransferMessage('Hallo\n\nText.\n\n{passwort}\n\nGrüsse', tokens, { lifetime: '', expiry: '', password: '' });
    expect(text).toBe('Hallo\n\nText.\n\nGrüsse');
  });

  it('keeps an unknown placeholder as typed', () => {
    expect(expandFileTransferMessage('Hallo {name}', tokens, { lifetime: '', expiry: '', password: '' })).toBe('Hallo {name}');
  });

  it('leaves a message without placeholders unchanged apart from trimming', () => {
    expect(expandFileTransferMessage('  Nur Text  ', tokens, { lifetime: '1 Tag', expiry: '', password: '' })).toBe('Nur Text');
  });

  it('ignores an empty token name', () => {
    expect(expandFileTransferMessage('a {} b', { lifetime: '', expiry: '', password: '' }, { lifetime: 'X', expiry: 'Y', password: 'Z' }))
      .toBe('a {} b');
  });
});

describe('fileTransferExpiryDate', () => {
  it('adds the lifetime in calendar days', () => {
    expect(fileTransferExpiryDate(7, new Date(2026, 10, 2, 20, 0))).toBe('09.11.2026');
  });

  it('crosses a month and a year end', () => {
    expect(fileTransferExpiryDate(30, new Date(2026, 11, 15, 9, 0))).toBe('14.01.2027');
  });
});
