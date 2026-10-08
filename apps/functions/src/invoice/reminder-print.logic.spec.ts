import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { MAX_PRINT_ITEMS, mergePdfs, printFilename, printItemRefusal, printItemsRefusal } from './reminder-print.logic';

const onePage = async (w: number): Promise<Uint8Array> => { const d = await PDFDocument.create(); d.addPage([w, 800]); return d.save(); };
const inv = { tenants: ['scs'], documentKey: 'invoice-a', reminders: [{ level: 1, date: 'd', dueDate: 'd', documentKey: 'invoice-a-reminder-1' }] };

describe('reminder print', () => {
  it('validates the item list', () => {
    expect(printItemsRefusal([{ invoiceKey: 'a', documentKey: 'k', attachInvoice: false }])).toBeUndefined();
    expect(printItemsRefusal([])).toBe('bad-items');
    expect(printItemsRefusal('x')).toBe('bad-items');
    expect(printItemsRefusal([{ invoiceKey: '', documentKey: 'k', attachInvoice: false }])).toBe('bad-items');
    expect(printItemsRefusal(Array.from({ length: MAX_PRINT_ITEMS + 1 }, () => ({ invoiceKey: 'a', documentKey: 'k', attachInvoice: false })))).toBe('too-many');
  });
  it('checks each item against its invoice', () => {
    expect(printItemRefusal(inv, 'scs', 'invoice-a-reminder-1', true)).toBeUndefined();
    expect(printItemRefusal(undefined, 'scs', 'invoice-a-reminder-1', false)).toBe('not-found');
    expect(printItemRefusal(inv, 'gss', 'invoice-a-reminder-1', false)).toBe('not-found');
    expect(printItemRefusal(inv, 'scs', 'invoice-b-reminder-1', false)).toBe('foreign-document');
    expect(printItemRefusal({ ...inv, documentKey: '' }, 'scs', 'invoice-a-reminder-1', true)).toBe('no-document');
    expect(printItemRefusal({ ...inv, documentKey: '' }, 'scs', 'invoice-a-reminder-1', false)).toBeUndefined();
  });
  it('names the file', () => {
    expect(printFilename(['202600001'], '20261008')).toBe('Mahnung-202600001.pdf');
    expect(printFilename(['202600001', '202600002'], '20261008')).toBe('Mahnlauf-20261008.pdf');
  });
  it('merges in order', async () => {
    const merged = await PDFDocument.load(await mergePdfs([await onePage(500), await onePage(600), await onePage(700)]));
    expect(merged.getPages().map(p => p.getWidth())).toEqual([500, 600, 700]);
  });
});
