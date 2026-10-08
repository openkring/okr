import { describe, it, expect } from 'vitest';
import { buildOcrPrompt, OCR_RESPONSE_SCHEMA } from './ocr-schema';

describe('buildOcrPrompt', () => {
  it('describes a bill as a supplier invoice and asks for number and due date', () => {
    const p = buildOcrPrompt('bill', '6500 Büromaterial');
    expect(p).toContain('supplier invoice');
    expect(p).toContain('invoiceNumber');
    expect(p).toContain('dueDate');
    expect(p).toContain('6500 Büromaterial');
  });
  it('keeps the paper prompt free of accounting fields', () => {
    expect(buildOcrPrompt('paper', '')).not.toContain('invoiceNumber');
  });
});

describe('OCR_RESPONSE_SCHEMA', () => {
  it('has invoiceNumber and dueDate', () => {
    expect(Object.keys(OCR_RESPONSE_SCHEMA.properties)).toEqual(expect.arrayContaining(['invoiceNumber', 'dueDate']));
  });
});
