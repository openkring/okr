import { describe, expect, it } from 'vitest';
import { appendImportNotes, composeImportNotes, importNotesHeader, NOTES_RESIDUAL_LIMIT } from './vcard-import-notes';
import { ParsedVcard } from './vcard-parser';

function parsed(over: Partial<ParsedVcard> = {}): ParsedVcard {
  return {
    kind: 'person', displayName: 'Anna Muster', channels: [], relatedNames: [],
    sourceFileName: 'kontakte.vcf', residual: [], noteTexts: [], warnings: [], ...over,
  } as ParsedVcard;
}
const prop = (name: string, value: string, params: Record<string, string[]> = {}) =>
  ({ name, value, rawValue: value, params });

describe('composeImportNotes', () => {
  it('keeps the NOTE verbatim and still stamps the header when there is no residual', () => {
    const n = composeImportNotes(parsed({ noteTexts: ['Trainingszeiten Di/Do.'] }), '09.09.2026');
    expect(n.text).toBe(['Trainingszeiten Di/Do.', '', '--- vCard-Import 09.09.2026 · kontakte.vcf ---'].join('\n'));
    expect(n.residualLineCount).toBe(0);
  });

  it('appends a residual block under a header carrying date and file name', () => {
    const n = composeImportNotes(parsed({
      noteTexts: ['Notiz.'],
      residual: [prop('NICKNAME', 'Anni'), prop('CATEGORIES', 'Verein,Freunde')],
    }), '09.09.2026');
    expect(n.text).toBe([
      'Notiz.', '',
      '--- vCard-Import 09.09.2026 · kontakte.vcf ---',
      'NICKNAME: Anni',
      'CATEGORIES: Verein,Freunde',
    ].join('\n'));
    expect(n.residualLineCount).toBe(2);
  });

  it('renders the residual block alone when there is no NOTE', () => {
    const n = composeImportNotes(parsed({ residual: [prop('NICKNAME', 'Anni')] }), '09.09.2026');
    expect(n.text.startsWith('--- vCard-Import')).toBe(true);
  });

  it('renders parameters next to the property name', () => {
    const n = composeImportNotes(parsed({
      residual: [prop('X-SOCIALPROFILE', 'https://x.com/a', { TYPE: ['twitter'] })],
    }), '09.09.2026');
    expect(n.text).toContain('X-SOCIALPROFILE;TYPE=twitter: https://x.com/a');
  });

  it('records a binary payload by size instead of dumping base64', () => {
    const n = composeImportNotes(parsed({
      residual: [prop('SOUND', 'A'.repeat(18432), { TYPE: ['WAV'], ENCODING: ['b'] })],
    }), '09.09.2026');
    expect(n.text).toContain('SOUND;TYPE=WAV: (14 kB, nicht importiert)');
    expect(n.text).not.toContain('AAAA');
  });

  it('drops a sensitive property without leaking its value, and warns', () => {
    const n = composeImportNotes(parsed({ residual: [prop('X-AHV-NR', '756.1234.5678.90')] }), '09.09.2026');
    expect(n.text).not.toContain('756.1234.5678.90');
    expect(n.text).not.toContain('X-AHV-NR:');
    expect(n.warnings.some((w) => w.includes('X-AHV-NR'))).toBe(true);
  });

  it('truncates a runaway block and warns', () => {
    const many = Array.from({ length: 400 }, (_, i) => prop(`X-P${i}`, 'x'.repeat(50)));
    const n = composeImportNotes(parsed({ residual: many }), '09.09.2026');
    expect(n.text.length).toBeLessThanOrEqual(NOTES_RESIDUAL_LIMIT + 200);
    expect(n.text).toContain('… (gekürzt)');
    expect(n.warnings.length).toBeGreaterThan(0);
  });

  it('takes extra lines from the caller, e.g. a rejected date', () => {
    const n = composeImportNotes(parsed({}), '09.09.2026', ['BDAY: 2001-02-30   ← kein gültiges Datum']);
    expect(n.text).toContain('BDAY: 2001-02-30   ← kein gültiges Datum');
  });

  it('returns empty text when there is nothing at all', () => {
    expect(composeImportNotes(parsed({}), '09.09.2026').text).toBe('');
  });
});

describe('importNotesHeader', () => {
  it('renders the file name and the import date', () => {
    expect(importNotesHeader('kontakte.vcf', '09.09.2026')).toBe('--- vCard-Import 09.09.2026 · kontakte.vcf ---');
  });

  it('is the exact header composeImportNotes embeds', () => {
    const n = composeImportNotes(parsed({ noteTexts: ['x'] }), '09.09.2026');
    expect(n.header).toBe(importNotesHeader('kontakte.vcf', '09.09.2026'));
    expect(n.text).toContain(n.header);
  });
});

describe('appendImportNotes', () => {
  it('appends to existing notes without touching them', () => {
    const n = composeImportNotes(parsed({ residual: [prop('NICKNAME', 'Anni')] }), '09.09.2026');
    const result = appendImportNotes('Bestehende Notiz.', n);
    expect(result.startsWith('Bestehende Notiz.')).toBe(true);
    expect(result).toContain('NICKNAME: Anni');
  });

  it('does not append the same header twice', () => {
    const n = composeImportNotes(parsed({ residual: [prop('NICKNAME', 'Anni')] }), '09.09.2026');
    const once = appendImportNotes('', n);
    expect(appendImportNotes(once, n)).toBe(once);
  });

  it('does not append a NOTE-only card twice either (the header is embedded for it too)', () => {
    const n = composeImportNotes(parsed({ noteTexts: ['Trainingszeiten Di/Do.'] }), '09.09.2026');
    const once = appendImportNotes('', n);
    expect(once).toContain('Trainingszeiten Di/Do.');
    expect(appendImportNotes(once, n)).toBe(once);
  });

  it('returns the existing notes unchanged when there is nothing to add', () => {
    const n = composeImportNotes(parsed({}), '09.09.2026');
    expect(appendImportNotes('Bestehend.', n)).toBe('Bestehend.');
  });
});
