import { describe, it, expect } from 'vitest';
import { parseOcrPath } from './ocr-path.util';

describe('parseOcrPath', () => {
  it('parses tenant + usage + filename (no correlation)', () => {
    expect(parseOcrPath('tenant/scs/ocr/invoice/staempfli.pdf')).toEqual({
      tenantId: 'scs', ocrUsage: 'invoice', correlationKey: '', fileName: 'staempfli.pdf',
    });
  });

  it('parses a correlation segment (expense)', () => {
    expect(parseOcrPath('tenant/scs/ocr/expense/exp123/beleg1.pdf')).toEqual({
      tenantId: 'scs', ocrUsage: 'expense', correlationKey: 'exp123', fileName: 'beleg1.pdf',
    });
  });

  it('returns null for a non-ocr path', () => {
    expect(parseOcrPath('tenant/scs/rag/report.pdf')).toBeNull();
  });

  it('returns null for an unknown usage', () => {
    expect(parseOcrPath('tenant/scs/ocr/bogus/x.pdf')).toBeNull();
  });

  it('ignores extra nested folders, taking first as correlation and last as filename', () => {
    expect(parseOcrPath('tenant/scs/ocr/expense/exp1/sub/beleg.pdf')).toEqual({
      tenantId: 'scs', ocrUsage: 'expense', correlationKey: 'exp1', fileName: 'beleg.pdf',
    });
  });
});
