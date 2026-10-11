// apps/functions/src/bill/bill-approver-daily.ts
//
// 23:30 Europe/Zurich (spec 1.94 §3.3–§3.4): for every set of books with `paymentApproverTask` on, one task for
// its payment_approver listing the Kreditoren booked that day, grouped by paying account. No workflow rule: the
// setting is the configuration; the assignee is resolved and the task written by the engine's own helpers.

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import { BillCollection } from '@okr/shared-models';
import { getTodayStr } from '@okr/shared-util-core';

import { FINANCE_HISTORY_COLLECTION, zurichStoreDateTime } from '../finance-history/finance-history.logic';
import { isResponsibilityValid, resolveAssignee } from '../workflow/engine';
import { createFirestoreDeps, translateMessage } from '../workflow/firestore-deps';
import { APPROVER_DIGEST_FALLBACK, APPROVER_DIGEST_MESSAGE_KEY, bookedBillKeys, BooksConfig, buildDigests, dayWindow,
  digestRelatedKey, DigestBill, formatChf, HistoryRow } from './bill-approver.logic';
import { loadPayingAccounts } from './bill-approver.load';

const CF_NAME = 'billApproverDaily';
const PAYMENT_APPROVER = 'payment_approver';
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

export const billApproverDaily = onSchedule(
  { region: 'europe-west6', schedule: 'every day 23:30', timeZone: 'Europe/Zurich' },
  async () => {
    const db = getFirestore();
    const day = zurichStoreDateTime(new Date()).slice(0, 8);
    const { from, to } = dayWindow(day);
    // single-field range (no composite index); tenant and tag are filtered in memory
    const hist = await db.collection(FINANCE_HISTORY_COLLECTION).where('creationDateTime', '>=', from).where('creationDateTime', '<=', to).get();
    const deps = createFirestoreDeps();
    for (const [tenantId, keys] of bookedBillKeys(hist.docs.map(d => d.data() as HistoryRow))) {
      try {
        const snaps = await db.getAll(...keys.map(k => db.collection(BillCollection).doc(k)));
        const bills: DigestBill[] = snaps.filter(s => s.exists).map(s => {
          const b = s.data() ?? {};
          const v = (b['vendor'] ?? {}) as { name1?: string; name2?: string };
          return {
            okey: s.id, accountingTenantId: str(b['accountingTenantId']),
            vendorName: `${v.name1 ?? ''} ${v.name2 ?? ''}`.trim() || str(b['title']), billId: str(b['billId']),
            amount: Number((b['totalAmount'] as { amount?: number } | undefined)?.amount ?? 0), dueDate: str(b['dueDate']),
            state: str(b['state']), bookingKeys: (b['bookingKeys'] as string[] | undefined) ?? [],
            tenants: (b['tenants'] as string[] | undefined) ?? [], paymentAccountKey: str(b['paymentAccountKey']),
          };
        }).filter(b => b.tenants.includes(tenantId));
        const books: BooksConfig[] = [];
        for (const id of [...new Set(bills.map(b => b.accountingTenantId).filter(Boolean))]) {
          const cfg = (await db.collection('accounting-configs').doc(id).get()).data();
          if (!cfg || !((cfg['tenants'] as string[] | undefined) ?? []).includes(tenantId)) continue;
          const paymentAccountKeys = (cfg['billPaymentAccountKeys'] as string[] | undefined) ?? [];
          const accounts = await loadPayingAccounts(db, tenantId, paymentAccountKeys);
          books.push({ accountingTenantId: id, enabled: cfg['paymentApproverTask'] === true, paymentAccountKeys, accounts });
        }
        for (const d of buildDigests(day, bills, books)) {
          const relatedKey = digestRelatedKey(d.accountingTenantId, day);
          const ctx = { tenantId, event: 'bill.bookedDaily', personKey: '', relatedKey, subjectName: d.accountingTenantId,
            today: getTodayStr(), params: {} as Record<string, string> };
          const resp = await db.collection('responsibilities').where('name', '==', PAYMENT_APPROVER)
            .where('parentKey', '==', `org.${d.accountingTenantId}`).where('tenants', 'array-contains', tenantId).get();
          // after a handover the books can hold an archived/expired approver next to the current one: pick the valid one
          const current = resp.docs.find(r => r.data()['isArchived'] !== true && isResponsibilityValid(r.data(), ctx.today));
          const assignee = await resolveAssignee({ okey: CF_NAME, responsibilityKey: current?.id ?? '' }, ctx, deps);
          if (!assignee?.key) { logger.warn(`${CF_NAME}: no assignee for books ${d.accountingTenantId}`); continue; }
          if (await deps.hasOpenTask(relatedKey, assignee.key, tenantId)) continue;   // a re-run opens no second task
          const params = { count: String(d.count), date: d.date, total: formatChf(d.total) };
          const translated = await translateMessage(tenantId, APPROVER_DIGEST_MESSAGE_KEY, params);
          const name = translated && translated !== APPROVER_DIGEST_MESSAGE_KEY
            ? translated : APPROVER_DIGEST_FALLBACK.replaceAll(/\{(\w+)\}/g, (m, k: string) => params[k as keyof typeof params] ?? m);
          await deps.createTask({ tenantId, name, assignee, dueInDays: 0, relatedModelType: 'billDigest', relatedKey,
            linkKey: '', notes: d.lines, links: d.links });
        }
        logger.info(`${CF_NAME}: tenant=${tenantId} ${keys.length} booked bill(s) on ${day}`);
      } catch (e) {
        logger.error(`${CF_NAME}: tenant=${tenantId} failed`, e);   // one tenant never stops the others
      }
    }
  },
);
