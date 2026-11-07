import { describe, expect, it } from 'vitest';
import { isTenantDocumentPath, keysFor, noticeExcerpt, parseDeliveries, privateRefs, safeFilename } from './mailing';

describe('parseDeliveries', () => {
  it('keeps each person once with the sendable channels in a fixed order', () => {
    expect(parseDeliveries([
      { personKey: 'a', channels: ['chat', 'email'] },
      { personKey: 'a', channels: ['email'] },
      { personKey: 'b', channels: ['post', 'signal'] },
      { personKey: 'c', channels: ['signal'] },
    ])).toEqual([{ personKey: 'a', channels: ['email', 'chat'] }, { personKey: 'b', channels: ['post'] }]);
  });

  it('refuses anything that is not the expected shape', () => {
    expect(() => parseDeliveries('x')).toThrow();
    expect(() => parseDeliveries([{ personKey: '', channels: [] }])).toThrow();
    expect(() => parseDeliveries([{ personKey: 'a' }])).toThrow();
  });
});

describe('keysFor', () => {
  it('lists the persons ticked for one channel', () => {
    const d = [{ personKey: 'a', channels: ['email', 'chat'] }, { personKey: 'b', channels: ['chat'] }];
    expect(keysFor(d, 'email')).toEqual(['a']);
    expect(keysFor(d, 'chat')).toEqual(['a', 'b']);
  });
});

describe('safeFilename', () => {
  it('drops the path and control characters', () => {
    expect(safeFilename('../../etc/pass\u0000wd.pdf')).toBe('passwd.pdf');
    expect(safeFilename('C:\\Users\\x\\Einladung GV.pdf')).toBe('Einladung GV.pdf');
  });

  it('never returns an empty name and caps the length', () => {
    expect(safeFilename('  ')).toBe('attachment');
    expect(safeFilename('a'.repeat(300))).toHaveLength(120);
  });
});

describe('noticeExcerpt', () => {
  it('turns the body into one short line', () => {
    expect(noticeExcerpt('<p>Liebe Mitglieder</p><p>bis bald</p>')).toBe('Liebe Mitglieder bis bald');
    expect(noticeExcerpt(`<p>${'x'.repeat(200)}</p>`, 10)).toBe(`${'x'.repeat(9)}…`);
  });
});

describe('privateRefs', () => {
  it('references the stored files instead of copying their content', () => {
    expect(privateRefs([{ filename: 'a.pdf', storagePath: 'mailings/scs/m1/0-a.pdf', contentType: 'application/pdf' }]))
      .toEqual([{ privatePath: 'mailings/scs/m1/0-a.pdf', filename: 'a.pdf', contentType: 'application/pdf' }]);
  });
});

describe('isTenantDocumentPath', () => {
  it('accepts the tenant\'s own generated documents', () => {
    expect(isTenantDocumentPath('generated-docs/scs/uid1/g1.pdf', 'scs')).toBe(true);
    expect(isTenantDocumentPath('generated-docs-ephemeral/scs/g1.pdf', 'scs')).toBe(true);
  });

  it('refuses another tenant\'s documents, traversal and other prefixes', () => {
    expect(isTenantDocumentPath('generated-docs/kwa/uid1/g1.pdf', 'scs')).toBe(false);
    expect(isTenantDocumentPath('generated-docs/scs/../kwa/g1.pdf', 'scs')).toBe(false);
    expect(isTenantDocumentPath('generated-docs/scsx/g1.pdf', 'scs')).toBe(false);
    expect(isTenantDocumentPath('tenant/scs/logo.png', 'scs')).toBe(false);
    expect(isTenantDocumentPath('generated-docs/scs/g1.pdf', '')).toBe(false);
  });
});
