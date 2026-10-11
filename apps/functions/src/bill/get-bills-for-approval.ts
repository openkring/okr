// apps/functions/src/bill/get-bills-for-approval.ts
//
// Read-only Kreditoren for the payment_approver (spec 1.94 §3.5): either the bills of one digest day
// ({ accountingTenantId, date }) or one bill ({ billKey }). The caller must be the treasurer/admin, or the current
// payment_approver (or its active delegate) of the books. The books come from the request or the bill — never from
// the app tenant (tenant 'scs' keeps the books 'scs' AND 'gss').

import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

import { AccountCollection, BillCollection, BillModel, CostCenterCollection, FinanceDocumentCollection } from '@okr/shared-models';
import { ApprovalBill, BillApprovalResult, billVoucherKeys } from '@okr/finance-bill-util';
import { checkAppCheckToken, checkAuthentication, tenantIdOfUserData } from '@okr/shared-util-functions';

import { privateBucket } from '../_storage/private-bucket';
import { FINANCE_HISTORY_COLLECTION, zurichStoreDateTime } from '../finance-history/finance-history.logic';
import { validVoucherKeys, VoucherView, voucherView } from '../finance-document/voucher-view';
import { ResponsibilityDoc } from '../workflow/types';
import { canReadBillsForApproval } from './bill-approval-access';
import { bookedBillKeys, dayWindow, HistoryRow, selectDigestBills, toDigestBill, vendorNameOf } from './bill-approver.logic';
import { loadPayingAccounts } from './bill-approver.load';

const CF_NAME = 'getBillsForApproval';
const PAYMENT_APPROVER = 'payment_approver';
const URL_TTL_MS = 10 * 60 * 1000;
/** a Firestore document id: no slash, not empty, bounded */
const DOC_ID = /^[^/]{1,200}$/;

interface ApprovalRequest { accountingTenantId?: string; date?: string; billKey?: string }

type Data = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const reqStr = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

export const getBillsForApproval = onCall(
  { region: 'europe-west6', enforceAppCheck: true, cors: true },
  async (request: CallableRequest<ApprovalRequest>): Promise<BillApprovalResult> => {
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    const db = getFirestore();
    const uid = request.auth?.uid ?? '';
    const user = (await db.collection('users').doc(uid).get()).data();
    const tenantId = tenantIdOfUserData(user);
    if (!tenantId) throw new HttpsError('failed-precondition', 'User is not linked to a tenant.');
    const roles = (user?.['roles'] ?? {}) as Record<string, boolean>;
    const personKey = str(user?.['personKey']);

    let books = reqStr(request.data?.accountingTenantId);
    let day = reqStr(request.data?.date);
    const billKey = reqStr(request.data?.billKey);
    if (billKey) {
      if (!DOC_ID.test(billKey)) throw new HttpsError('invalid-argument', 'billKey is invalid');
      const b = (await db.collection(BillCollection).doc(billKey).get()).data();
      if (!b || !((b['tenants'] as string[] | undefined) ?? []).includes(tenantId)) throw new HttpsError('not-found', 'bill');
      books = str(b['accountingTenantId']);
      day = '';
    } else if (!books || !DOC_ID.test(books) || !/^\d{8}$/.test(day)) {
      throw new HttpsError('invalid-argument', 'accountingTenantId and date (yyyymmdd) are required');
    }
    // books and permission first: the all-tenant day scan below runs only for an authorized caller
    if (!books || !DOC_ID.test(books)) throw new HttpsError('not-found', 'unknown books');
    const config = await db.collection('accounting-configs').doc(books).get();
    if (!config.exists || !((config.data()?.['tenants'] as string[] | undefined) ?? []).includes(tenantId)) {
      throw new HttpsError('not-found', 'unknown books');
    }
    const today = zurichStoreDateTime(new Date()).slice(0, 8);
    const resps = await db.collection('responsibilities').where('name', '==', PAYMENT_APPROVER)
      .where('parentKey', '==', `org.${books}`).where('tenants', 'array-contains', tenantId).get();
    const isTreasurer = request.auth?.token?.['admin'] === true || roles['treasurer'] === true || roles['admin'] === true;
    if (!canReadBillsForApproval({ isTreasurer, personKey, responsibilities: resps.docs.map(d => d.data() as ResponsibilityDoc), today })) {
      throw new HttpsError('permission-denied', 'not the payment approver of these books');
    }

    let billKeys: string[];
    if (billKey) {
      billKeys = [billKey];
    } else {
      const { from, to } = dayWindow(day);
      // single-field range (no composite index); tenant and tag are filtered in memory, as in billApproverDaily
      const hist = await db.collection(FINANCE_HISTORY_COLLECTION).where('creationDateTime', '>=', from).where('creationDateTime', '<=', to).get();
      billKeys = bookedBillKeys(hist.docs.map(d => d.data() as HistoryRow)).get(tenantId) ?? [];
    }

    const snaps = billKeys.length > 0 ? await db.getAll(...billKeys.map(k => db.collection(BillCollection).doc(k))) : [];
    // approvers review issued Kreditoren only: the digest's own selection (still booked, no draft) in both modes
    const candidates = snaps.filter(s => s.exists).map(s => ({ okey: s.id, data: (s.data() ?? {}) as Data }))
      .filter(r => ((r.data['tenants'] as string[] | undefined) ?? []).includes(tenantId) && str(r.data['accountingTenantId']) === books);
    const booked = new Set(selectDigestBills(candidates.map(r => toDigestBill(r.okey, r.data))).map(b => b.okey));
    const rows = candidates.filter(r => booked.has(r.okey));
    if (billKey && rows.length === 0) throw new HttpsError('not-found', 'bill');

    // only the books' own paying accounts are resolved and grouped (as in the digest); any other key counts as none
    const allowed = ((config.data()?.['billPaymentAccountKeys'] as string[] | undefined) ?? []).filter(k => typeof k === 'string' && k);
    const accountKeys = [...new Set(rows.map(r => str(r.data['paymentAccountKey'])))].filter(k => k && allowed.includes(k));
    const accounts = await loadPayingAccounts(db, tenantId, accountKeys);
    const allLines = rows.flatMap(r => (Array.isArray(r.data['lines']) ? (r.data['lines'] as Data[]) : []));
    const accountLabels = await loadLabels(db, AccountCollection, allLines.map(l => str(l['accountKey'])), tenantId, books);
    const costCenterLabels = await loadLabels(db, CostCenterCollection, allLines.map(l => str(l['costCenterKey'])), tenantId, books);

    const bills: ApprovalBill[] = await Promise.all(rows.map(async ({ okey, data }) => {
      const total = (data['totalAmount'] ?? {}) as { amount?: unknown; currency?: unknown };
      const storedKey = str(data['paymentAccountKey']);
      const paymentAccountKey = allowed.includes(storedKey) ? storedKey : '';
      const acc = accounts.find(a => a.key === paymentAccountKey);
      const lines = Array.isArray(data['lines']) ? (data['lines'] as Data[]) : [];
      return {
        okey, billId: str(data['billId']), title: str(data['title']), vendorName: vendorNameOf(data),
        billDate: str(data['billDate']), dueDate: str(data['dueDate']),
        amount: num(total.amount), currency: str(total.currency) || 'CHF', state: str(data['state']),
        creditorIban: str(data['creditorIban']), paymentReference: str(data['paymentReference']),
        paymentAccountKey, paymentAccountName: acc?.name ?? '', paymentAccountIban: acc?.iban ?? '',
        lines: lines.map(l => {
          const accountKey = str(l['accountKey']);
          const costCenterKey = str(l['costCenterKey']);
          return { title: str(l['title']), accountKey, costCenterKey, amount: num(l['amount']),
            accountLabel: accountLabels.get(accountKey) ?? '', costCenterLabel: costCenterLabels.get(costCenterKey) ?? '' };
        }),
        vouchers: await signVouchers(db, billVoucherKeys({ attachments: (data['attachments'] as string[] | undefined) ?? [] } as BillModel), tenantId),
      };
    }));

    logger.info(`${CF_NAME}: ${bills.length} bill(s), books=${books}`);
    return { accountingTenantId: books, date: day, paymentAccountKeys: allowed, bills };
  },
);

/**
 * `id name` labels of accounts or cost centres, keyed by okey. Only docs of the caller's tenant AND these books are
 * read back; a key of other books, an invalid key or a missing doc stays unlabelled.
 */
async function loadLabels(db: Firestore, collection: string, keys: string[], tenantId: string, books: string): Promise<Map<string, string>> {
  const valid = [...new Set(keys)].filter(k => k && DOC_ID.test(k));
  const labels = new Map<string, string>();
  if (valid.length === 0) return labels;
  const snaps = await db.getAll(...valid.map(k => db.collection(collection).doc(k)));
  for (const s of snaps) {
    const d = s.data();
    if (!d || !((d['tenants'] as string[] | undefined) ?? []).includes(tenantId) || str(d['accountingTenantId']) !== books) continue;
    const label = [str(d['id']), str(d['name'])].filter(Boolean).join(' ');
    if (label) labels.set(s.id, label);
  }
  return labels;
}

/** Short-lived signed links to the bill's vouchers in the private bucket; documents of another tenant are left out. */
async function signVouchers(db: Firestore, keys: string[], tenantId: string): Promise<{ name: string; url: string }[]> {
  const valid = validVoucherKeys(keys);
  if (valid.length === 0) return [];
  const snaps = await db.getAll(...valid.map(k => db.collection(FinanceDocumentCollection).doc(k)));
  const views = snaps.map((s, i) => voucherView(valid[i], s.data(), [tenantId])).filter((v): v is VoucherView => v !== null);
  const expires = Date.now() + URL_TTL_MS;
  return Promise.all(views.map(async v => {
    const [url] = await privateBucket().file(v.path).getSignedUrl({ version: 'v4', action: 'read', expires,
      responseDisposition: `inline; filename="${v.name.replace(/[^\x20-\x7e]|"/g, '_')}"` });
    return { name: v.name, url };
  }));
}
