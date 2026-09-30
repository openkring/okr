import { Injectable } from '@angular/core';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

import { Voucher } from '@okr/finance-accounting-util';

/**
 * Vouchers (Belege) live in the private bucket (spec 1.74) — the client never reads them directly.
 * `signFinanceDocuments` checks the role and returns short-lived signed links (~10 min).
 */
@Injectable({ providedIn: 'root' })
export class FinanceDocumentService {
  public async sign(documentKeys: string[]): Promise<Voucher[]> {
    const keys = documentKeys.filter(Boolean);
    if (keys.length === 0) return [];
    const fn = httpsCallable<{ documentKeys: string[] }, { vouchers: Voucher[] }>(getFunctions(getApp(), 'europe-west6'), 'signFinanceDocuments');
    const result = await fn({ documentKeys: keys });
    // keep the caller's order (the first key is the booking's primary voucher)
    return keys.map(k => result.data.vouchers.find(v => v.key === k)).filter((v): v is Voucher => !!v);
  }
}
