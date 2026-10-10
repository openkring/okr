// apps/functions/src/cost-center/get-my-cost-center-report.ts
//
// «Meine Kostenstellen» (spec 1.65 §7, D21–D23): the Soll-Ist data of the Kostenstellen the caller
// may see, for one fiscal year of one set of books (`accountingTenantId`, required — it must belong to the
// caller's app tenant, but is NOT the app tenant). Treasurer, admin and auditor see everything
// unmasked; a board member sees the Kostenstellen their responsibilities name (with every
// descendant), bookings projected and masked (D22). Nothing is stored; the client aggregates.

import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

import { checkAppCheckToken, checkAuthentication, tenantIdOfUserData } from '@okr/shared-util-functions';
import { getTodayStr, isProfitAndLossAccountId, isValidAt } from '@okr/shared-util-core';
import type { BudgetVersionModel } from '@okr/shared-models';
import type { MyCostCenterReport, ReportBooking, ReportLine } from '@okr/finance-cost-center-util';
import { newestApprovedBudget } from '@okr/finance-budget-util';
import { fiscalYear as fiscalYearRange } from '@okr/finance-reporting-util';

import { fiscalYear } from '../bank-import/bank-import.util';
import { loadFiscalYearStart } from '../booking/period-lock';
import { isPersonRelated, projectBooking, RespLike, visibleCostCenterKeys } from './cost-center-report.util';

const REGION = 'europe-west6';
const CF_NAME = 'getMyCostCenterReport';
const IN_CHUNK = 30;
const PARALLEL = 10;
const FULL_ACCESS_ROLES = ['treasurer', 'admin', 'auditor'];

interface ReportRequest { accountingTenantId?: string; fiscalYear?: number }

type Data = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => (typeof v === 'number' ? v : 0);

export const getMyCostCenterReport = onCall(
  { region: REGION, enforceAppCheck: true, cors: true, timeoutSeconds: 120, memory: '512MiB' },
  async (request: CallableRequest<ReportRequest>): Promise<MyCostCenterReport> => {
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    const db = getFirestore();
    const uid = request.auth?.uid ?? '';
    const user = (await db.collection('users').doc(uid).get()).data();
    const tenantId = tenantIdOfUserData(user);
    if (!tenantId) throw new HttpsError('failed-precondition', 'User is not linked to a tenant.');
    const roles = (user?.['roles'] ?? {}) as Record<string, boolean>;
    const fullAccess = request.auth?.token?.['admin'] === true || FULL_ACCESS_ROLES.some(r => roles[r] === true);
    const personKey = str(user?.['personKey']);

    // The books are named by the caller (route param), never derived from the app tenant: tenant 'scs' keeps the
    // books 'scs' AND 'gss' — tenantId and accountingTenantId are different things (see skill `accounting`).
    const accountingTenantId = (request.data?.accountingTenantId ?? '').trim();
    if (!accountingTenantId) throw new HttpsError('invalid-argument', 'accountingTenantId is required');
    const config = await db.collection('accounting-configs').doc(accountingTenantId).get();
    if (!config.exists || ((config.data()?.['tenants'] as string[] | undefined) ?? []).indexOf(tenantId) < 0) {
      throw new HttpsError('not-found', 'unknown books');
    }
    if ((str(config.data()?.['accountingBackend']) || 'native') !== 'native') throw new HttpsError('failed-precondition', 'accounting-backend-not-native');

    const fiscalYearStart = await loadFiscalYearStart(db, accountingTenantId);
    const today = getTodayStr();
    const currentYear = fiscalYear(today, fiscalYearStart);
    const requested = request.data?.fiscalYear;
    if (requested !== undefined && requested !== null && (typeof requested !== 'number' || !Number.isInteger(requested) || requested < 2000 || requested > 2100)) {
      throw new HttpsError('invalid-argument', 'fiscalYear must be an integer between 2000 and 2100');
    }
    const year = typeof requested === 'number' ? requested : currentYear;

    const scoped = (collection: string) => db.collection(collection)
      .where('accountingTenantId', '==', accountingTenantId).where('tenants', 'array-contains', tenantId);

    const [centerSnap, accountSnap, versionSnap] = await Promise.all([scoped('cost-centers').get(), scoped('accounts').get(), scoped('budget-versions').get()]);
    // full access keeps archived Kostenstellen (their lines still count, as in the treasurer's comparison)
    const centers = centerSnap.docs.map(d => ({ okey: d.id, ...(d.data() as Data) }))
      .filter(c => fullAccess || c['isArchived'] !== true)
      .map(c => ({ okey: c.okey, id: str(c['id']), name: str(c['name']), parentKey: str(c['parentKey']), type: str(c['type']), responsibilityKey: str(c['responsibilityKey']) }));
    const versions = versionSnap.docs.map(d => ({ ...(d.data() as BudgetVersionModel), okey: d.id }));
    const fiscalYears = [...new Set([currentYear, ...versions.filter(v => v.status === 'approved' && !v.isArchived).map(v => v.fiscalYear)])]
      .filter(y => typeof y === 'number' && y > 0).sort((a, b) => b - a);

    const visible = fullAccess
      ? new Set(centers.map(c => c.okey))
      : await visibleForCaller(db, tenantId, centers, personKey, today);
    const empty: MyCostCenterReport = {
      accountingTenantId, fiscalYear: year, fiscalYears, fullAccess, costCenters: [], accounts: [], budget: null, budgetLines: [], bookings: [], lines: [],
    };
    if (visible.size === 0 && !fullAccess) return empty;
    // full access sees every line — unassigned, archived or unknown Kostenstelle included — like the treasurer's comparison
    const keyVisible = (key: string): boolean => fullAccess || visible.has(key);

    const accounts = accountSnap.docs.map(d => ({ okey: d.id, ...(d.data() as Data) }))
      .filter(a => isProfitAndLossAccountId(str(a['id'])) || !str(a['id']) || hasProfitAndLossChild(a.okey, accountSnap.docs))
      .map(a => ({ okey: a.okey, id: str(a['id']), name: str(a['name']), parentKey: str(a['parentKey']), type: str(a['type']), isArchived: a['isArchived'] === true }));
    const pnl = new Set(accounts.filter(a => isProfitAndLossAccountId(a.id)).map(a => a.okey));

    const reference = newestApprovedBudget(versions, year);
    const budgetLines = reference
      ? (await db.collection('budget-lines').where('versionKey', '==', reference.okey).where('tenants', 'array-contains', tenantId).get()).docs
        .map(d => d.data() as Data)
        .filter(l => l['isArchived'] !== true && keyVisible(str(l['costCenterKey'])))
        .map(l => ({ costCenterKey: str(l['costCenterKey']), accountKey: str(l['accountKey']), amount: num((l['amount'] as Data | undefined)?.['amount']) }))
      : [];

    const range = fiscalYearRange(year, fiscalYearStart);
    const bookingDocs = (await scoped('bookings').get()).docs
      .filter(b => b.data()['status'] === 'posted' && str(b.data()['date']) >= range.from && str(b.data()['date']) <= range.to);
    const lines: ReportLine[] = [];
    const keys = bookingDocs.map(b => b.id);
    const chunks: string[][] = [];
    for (let i = 0; i < keys.length; i += IN_CHUNK) chunks.push(keys.slice(i, i + IN_CHUNK));
    const snaps = [];
    for (let i = 0; i < chunks.length; i += PARALLEL) {
      snaps.push(...await Promise.all(chunks.slice(i, i + PARALLEL).map(c => db.collection('booking-lines').where('bookingKey', 'in', c).get())));
    }
    for (const snap of snaps) {
      for (const d of snap.docs) {
        const l = d.data() as Data;
        if (!((l['tenants'] as string[] | undefined) ?? []).includes(tenantId) || l['accountingTenantId'] !== accountingTenantId) continue;
        const accountKey = str(l['accountKey']);
        const costCenterKey = str(l['costCenterKey']);
        if (!pnl.has(accountKey) || !keyVisible(costCenterKey)) continue;
        lines.push({ bookingKey: str(l['bookingKey']), accountKey, costCenterKey,
          debit: num((l['debitAmount'] as Data | undefined)?.['amount']), credit: num((l['creditAmount'] as Data | undefined)?.['amount']) });
      }
    }

    const used = new Set(lines.map(l => l.bookingKey));
    // Spesen: the OCR pipeline books `bookings/{expenseKey}`, so an expense doc with the booking's okey marks it
    // (independent of the expense's own accountingTenantId, which legacy docs may lack); bookingKey links count too.
    const expenseBookingKeys = fullAccess ? new Set<string>() : await expenseOrigins(db, tenantId, [...used]);
    const bookings: ReportBooking[] = bookingDocs.filter(b => used.has(b.id)).map(b => {
      const data = { okey: b.id, ...(b.data() as Data) } as Parameters<typeof projectBooking>[0] & { anonymizedAt?: string };
      return projectBooking(data, !fullAccess && isPersonRelated(data, expenseBookingKeys));
    });

    logger.info(`${CF_NAME}: books=${accountingTenantId} year=${year} full=${fullAccess} centers=${visible.size} lines=${lines.length} masked=${bookings.filter(b => b.masked).length}`);
    return {
      accountingTenantId, fiscalYear: year, fiscalYears, fullAccess,
      costCenters: centers.filter(c => visible.has(c.okey)).map(c => ({ okey: c.okey, id: c.id, name: c.name, parentKey: c.parentKey, type: c.type })),
      accounts, budget: reference ? { versionKey: reference.okey, name: reference.name ?? '' } : null, budgetLines, bookings, lines,
    };
  },
);

/** The booking okeys (of `keys`) that originate from an expense of the tenant: same okey, or the expense's `bookingKey`. */
async function expenseOrigins(db: Firestore, tenantId: string, keys: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (let i = 0; i < keys.length; i += 300) {
    const snaps = await db.getAll(...keys.slice(i, i + 300).map(k => db.collection('expenses').doc(k)));
    for (const s of snaps) if (s.exists && ((s.data()?.['tenants'] as string[] | undefined) ?? []).includes(tenantId)) out.add(s.id);
  }
  const linked = await db.collection('expenses').where('tenants', 'array-contains', tenantId).get();
  const wanted = new Set(keys);
  for (const d of linked.docs) { const k = str(d.data()['bookingKey']); if (k && wanted.has(k)) out.add(k); }
  return out;
}

/** A group account (no number of its own) stays in the response when a P&L account hangs below it — the client needs the tree. */
function hasProfitAndLossChild(okey: string, docs: FirebaseFirestore.QueryDocumentSnapshot[]): boolean {
  return docs.some(d => d.data()['parentKey'] === okey && isProfitAndLossAccountId(str(d.data()['id'])));
}

/** The Kostenstellen a board member may see: responsibilities that name them or a group they currently belong to. */
async function visibleForCaller(
  db: Firestore, tenantId: string, centers: { okey: string; parentKey: string; responsibilityKey: string }[], personKey: string, today: string,
): Promise<Set<string>> {
  if (!personKey) return new Set();
  const respKeys = [...new Set(centers.map(c => c.responsibilityKey).filter(Boolean))];
  if (respKeys.length === 0) return new Set();
  const [respSnaps, memberSnap] = await Promise.all([
    db.getAll(...respKeys.map(k => db.collection('responsibilities').doc(k))),
    db.collection('memberships').where('memberKey', '==', personKey).where('orgModelType', '==', 'group').get(),
  ]);
  const responsibilities = new Map<string, RespLike>();
  for (const s of respSnaps) {
    const d = s.data();
    if (s.exists && ((d?.['tenants'] as string[] | undefined) ?? []).includes(tenantId)) responsibilities.set(s.id, { okey: s.id, ...(d as Data) } as RespLike);
  }
  const groupKeys = new Set(memberSnap.docs.map(d => d.data() as Data)
    .filter(m => m['isArchived'] !== true && ((m['tenants'] as string[] | undefined) ?? []).includes(tenantId) && isValidAt(str(m['dateOfEntry']), str(m['dateOfExit']), today))
    .map(m => str(m['orgKey'])));
  return visibleCostCenterKeys(centers, responsibilities, personKey, groupKeys, today);
}
