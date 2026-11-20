import { describe, expect, it } from 'vitest';
import { ocrFailureHint, ocrFailureNotes, ocrFailureTaskId } from './ocr-failure.util';

const CREDITS_DEPLETED = '{"error":{"code":402,"message":"Your prepayment credits are depleted. Please go to AI Studio","status":"RESOURCE_EXHAUSTED"}}';

describe('ocrFailureHint', () => {
  it('recognises depleted Gemini prepaid credits (402)', () => {
    expect(ocrFailureHint(CREDITS_DEPLETED)).toContain('Guthaben ist aufgebraucht');
  });
  it('recognises a rate limit (429)', () => {
    expect(ocrFailureHint('{"error":{"code":429,"status":"RESOURCE_EXHAUSTED"}}')).toContain('Rate-Limit');
  });
  it('recognises a rejected API key', () => {
    expect(ocrFailureHint('{"error":{"code":403,"status":"PERMISSION_DENIED"}}')).toContain('GEMINI_API_KEY');
  });
  it('returns empty for an unknown message', () => {
    expect(ocrFailureHint('something else')).toBe('');
    expect(ocrFailureHint('')).toBe('');
  });
});

describe('ocrFailureTaskId', () => {
  it('is deterministic and a valid Firestore id', () => {
    const a = ocrFailureTaskId('tenant/scs/ocr/expense/abc/photo 1.jpg', 'p1');
    expect(a).toBe(ocrFailureTaskId('tenant/scs/ocr/expense/abc/photo 1.jpg', 'p1'));
    expect(a).not.toContain('/');
    expect(a).not.toContain(' ');
  });
  it('differs per admin', () => {
    expect(ocrFailureTaskId('x', 'p1')).not.toBe(ocrFailureTaskId('x', 'p2'));
  });
});

describe('ocrFailureNotes', () => {
  it('carries hint, trigger, receipt and raw message', () => {
    const notes = ocrFailureNotes({
      trigger: 'extract', message: CREDITS_DEPLETED, storagePath: 'tenant/scs/ocr/expense/e1/a.pdf',
      expenseKey: 'e1', submitterName: 'Max Muster', amount: '12.50', currency: 'CHF',
    });
    expect(notes).toContain('Guthaben ist aufgebraucht');
    expect(notes).toContain('Auslöser: onStorageFinalized › extractReceipt');
    expect(notes).toContain('expense.e1 (Max Muster, CHF 12.50)');
    expect(notes).toContain('Beleg: tenant/scs/ocr/expense/e1/a.pdf');
    expect(notes).toContain(CREDITS_DEPLETED);
  });
  it('omits the hint line for an unknown error', () => {
    const notes = ocrFailureNotes({
      trigger: 'unresolved-booking', message: 'x', storagePath: 'p', expenseKey: 'e', submitterName: '', amount: '0.00', currency: 'CHF',
    });
    expect(notes.startsWith('Auslöser:')).toBe(true);
    expect(notes).toContain('expense.e\n');
  });
});
