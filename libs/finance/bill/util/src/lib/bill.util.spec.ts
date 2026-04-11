import { describe, it, expect } from 'vitest';
import { newBill, getBillIndex } from './bill.util';

describe('newBill', () => {
  it('creates a BillModel with the given tenantId', () => {
    const bill = newBill('scs');
    expect(bill.tenants).toEqual(['scs']);
  });

  it('initializes with default state draft', () => {
    const bill = newBill('scs');
    expect(bill.state).toBe('draft');
  });
});

describe('getBillIndex', () => {
  it('returns empty string for empty bill', () => {
    const bill = newBill('scs');
    expect(getBillIndex(bill)).toBe('');
  });

  it('includes billId in index', () => {
    const bill = newBill('scs');
    bill.billId = 'RE-2024-001';
    const index = getBillIndex(bill);
    expect(index).toContain('RE-2024-001');
  });
});
