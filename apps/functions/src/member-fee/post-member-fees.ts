import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { DocumentData, DocumentReference, Firestore, getFirestore, WriteBatch } from 'firebase-admin/firestore';

import {
  AccountingConfigCollection, AccountingConfigModel, AvatarInfo,
  CategoryCollection, CategoryItemModel, HouseholdCollection, HouseholdModel, HouseholdTypeCategoryName,
  InvoiceCollection, InvoiceModel,
  InvoicePositionCollection, InvoicePositionModel,
  MemberFeeCollection, MemberFeeModel, MemberFeePosition, PersonCollection,
} from '@okr/shared-models';
import { checkAppCheckToken, checkAuthentication, checkRoles, getCallerTenantId } from '@okr/shared-util-functions';
import { addDuration, DateFormat, generateRandomString, getTodayStr, getYear, removeKeyFromOkrModel } from '@okr/shared-util-core';
import { getFeeTotal } from '@okr/relationship-membership-util';
import { getInvoiceIndex } from '@okr/finance-invoice-util';

import { withoutUndefined } from '../invoice/invoice.logic';
import { postalOf } from '../email/mailing-letters';
import {
  billedPositions, groupFeesByHousehold, householdInvoiceDraft, sameAddress, withReviewNote,
} from './household-fees.logic';

const REGION = 'europe-west6';

/**
 * The positions of a fee that cannot be booked: a native invoice position without an
 * `accountKey` has no revenue account, so the booking it produces has nowhere to go. The
 * migration writes `''` for every position it converts (a legacy fee column carried no account),
 * and a schedule position whose rule has no `accountKey` does the same. Posting such a position
 * silently would produce an invoice nobody can book and which no error ever mentions — so the
 * member is skipped and named in the result instead, and a treasurer fixes the fee schedule.
 */
export function unbookablePositions(fee: Pick<MemberFeeModel, 'positions'>): string[] {
  return billedPositions(fee)
    .filter(p => (p.accountKey ?? '').trim().length === 0)
    .map(p => p.label || p.key || p.usage);
}

// Moved to household-fees.logic (shared with the household draft); re-exported for existing callers.
export { billedPositions };

/**
 * Why the books may not be posted for the caller's tenant (spec 1.108, D5), or undefined when they
 * may: the `accounting-configs` doc must exist, list the tenant and not be archived. The books id
 * comes from the client and is never derived from the tenant (scs keeps the books scs AND gss).
 */
export function booksOfTenantRefusal(config: DocumentData | undefined, tenantId: string): 'not-found' | 'foreign-tenant' | 'archived' | undefined {
  if (!config) return 'not-found';
  const tenants = Array.isArray(config['tenants']) ? (config['tenants'] as unknown[]) : [];
  if (!tenants.includes(tenantId)) return 'foreign-tenant';
  if (config['isArchived'] === true) return 'archived';
  return undefined;
}

/**
 * Whether a fee row belongs in this fee run (spec 1.108, D5): a live 'ready' row of the tenant and
 * of exactly these books. A row without books (`''` or missing, D11) belongs to no run — it never
 * counts as the club's. The query already selects these rows; this is the same rule in memory, so
 * a row the query should not have returned can never be posted.
 */
export function isPostableRow(
  fee: { tenants?: unknown; accountingTenantId?: unknown; isArchived?: unknown; state?: unknown },
  tenantId: string, accountingTenantId: string,
): boolean {
  const tenants = Array.isArray(fee.tenants) ? (fee.tenants as unknown[]) : [];
  const books = typeof fee.accountingTenantId === 'string' ? fee.accountingTenantId : '';
  return tenants.includes(tenantId) && fee.isArchived !== true && fee.state === 'ready' &&
    accountingTenantId !== '' && books === accountingTenantId;
}

/**
 * The invoice DRAFT of one member-fee row (spec 1.76 D10). It carries no number: `invoiceNo` 0 and
 * `invoiceId` '' until a treasurer reviews and issues it (`issueInvoice` allocates the number
 * transactionally). Same shape `writeInvoice` stores for a new draft.
 */
export function memberFeeDraft(
  fee: Pick<MemberFeeModel, 'member' | 'positions'>,
  o: { tenantId: string; accountingTenantId: string; year: number; invoiceDate: string; dueDate: string },
): InvoiceModel {
  const invoice = new InvoiceModel(o.tenantId);
  invoice.accountingTenantId = o.accountingTenantId;
  invoice.receiver = fee.member;
  invoice.state = 'draft';
  invoice.invoiceNo = 0;
  invoice.invoiceId = '';
  invoice.invoiceDate = o.invoiceDate;
  invoice.dueDate = o.dueDate;
  invoice.title = `${o.year} ${fee.member?.label ?? ''}`.trim();
  const totalChf = getFeeTotal(fee.positions ?? []);
  invoice.totalAmount = { amount: Math.round(totalChf * 100), currency: 'CHF', periodicity: 'one-time' };
  invoice.index = getInvoiceIndex(invoice);
  return invoice;
}

/**
 * Post every 'ready' member-fee row of a tenant AND of the given books (spec 1.108, D5) as an
 * in-house invoice DRAFT (no number; a treasurer issues it via `issueInvoice`, which numbers it transactionally): one `InvoiceModel`
 * plus one `InvoicePositionModel` per fee position, written in a single Firestore batch per fee
 * row so a row is never left half-posted (invoice without positions, or positions without the
 * fee record being flipped to 'invoiced'). This is the 'native' counterpart to
 * uploadToBexio/createBexioInvoice: `AccountingConfigModel.accountingBackend` decides which path
 * a tenant's UI calls, and this callable also refuses to run for a 'bexio' tenant — defense in
 * depth in case something ever calls it directly instead of going through the store's routing.
 *
 * Households (spec 1.168 §5/§5.1): the rows whose members share a live household with a payer are
 * posted as ONE invoice to the payer (one batch: invoice, all positions, every row), capped by the
 * `household_type` item's `feeCap` («Familienrabatt»). When the members (with a row) and the payer
 * do not share one favourite postal address, those rows go to `review` with a note instead.
 */
export const postMemberFees = onCall(
  { region: REGION, enforceAppCheck: true, timeoutSeconds: 540 },
  async (request: CallableRequest<{ tenantId?: string; accountingTenantId?: string }>) => {
    const CF_NAME = 'postMemberFees';
    checkAppCheckToken(request, CF_NAME);
    checkAuthentication(request, CF_NAME);
    // Creates invoices for member contacts — treasurer flows + privileged/admin (privacy inventory §7.2),
    // mirrors createBexioInvoice's access check.
    await checkRoles(request, CF_NAME, ['treasurer', 'privileged']);

    // The tenant is the caller's own (users/{uid}), never the client's word. `tenantId` is still
    // accepted from older app builds (staggered deploys) but must then name the same tenant.
    const tenantId = await getCallerTenantId(request, CF_NAME);
    const { tenantId: requestedTenantId, accountingTenantId } = request.data ?? {};
    if (requestedTenantId && requestedTenantId !== tenantId) {
      logger.error(`${CF_NAME}: caller of tenant ${tenantId} asked for tenant ${requestedTenantId} — refused`);
      throw new HttpsError('permission-denied', 'tenantId does not match the caller');
    }
    if (!accountingTenantId) throw new HttpsError('invalid-argument', 'accountingTenantId is required');

    const db = getFirestore();

    const configSnap = await db.collection(AccountingConfigCollection).doc(accountingTenantId).get();
    const refusal = booksOfTenantRefusal(configSnap.data(), tenantId);
    if (refusal === 'not-found') {
      logger.error(`${CF_NAME}: books ${accountingTenantId} do not exist`);
      throw new HttpsError('not-found', 'These books do not exist.');
    }
    if (refusal) {
      logger.error(`${CF_NAME}: books ${accountingTenantId} are ${refusal} for tenant ${tenantId} — refused`);
      throw new HttpsError('permission-denied', 'These books do not belong to your tenant.');
    }
    const config = configSnap.data() as AccountingConfigModel | undefined;
    const backend = config?.accountingBackend ?? 'native';
    if (backend === 'bexio') {
      logger.error(`${CF_NAME}: accountingTenantId ${accountingTenantId} books through Bexio — refusing to post native invoices`);
      throw new HttpsError('failed-precondition', 'This accounting tenant books through Bexio; use the Bexio upload instead.');
    }

    const feeSnap = await db.collection(MemberFeeCollection)
      .where('tenants', 'array-contains', tenantId)
      .where('isArchived', '==', false)
      .where('state', '==', 'ready')
      .where('accountingTenantId', '==', accountingTenantId)
      .get();

    // D11: a 'ready' row without books belongs to no fee run and is never posted — but it must
    // surface, not vanish silently. (A row MISSING the field cannot be queried; the migration
    // gives every row its books, and isPostableRow ignores such a row anyway.)
    const withoutBooks = await db.collection(MemberFeeCollection)
      .where('tenants', 'array-contains', tenantId)
      .where('isArchived', '==', false)
      .where('state', '==', 'ready')
      .where('accountingTenantId', '==', '')
      .count()
      .get();
    const withoutBooksCount = withoutBooks.data().count;
    if (withoutBooksCount > 0) {
      logger.warn(`${CF_NAME}: ${withoutBooksCount} 'ready' member-fee(s) of tenant ${tenantId} have no books (accountingTenantId ''), not posted`);
    }
    const feeDocs = feeSnap.docs.filter(d => isPostableRow(d.data(), tenantId, accountingTenantId));

    const scheduleYear = getYear();
    const invoiceDate = getTodayStr(DateFormat.StoreDate);
    const dueDate = addDuration(invoiceDate, { days: 30 });

    let invoiced = 0;
    let review = 0;
    const failed: { member: string; positions: string[] }[] = [];
    const rowRef = new Map<MemberFeeModel, DocumentReference>();
    const rows = feeDocs.map(d => {
      const fee = { ...(d.data() as MemberFeeModel), okey: d.id };
      rowRef.set(fee, d.ref);
      return fee;
    });
    const refOf = (fee: MemberFeeModel): DocumentReference => rowRef.get(fee) as DocumentReference;
    const memberOf = (fee: MemberFeeModel): string => fee.member?.label || fee.member?.key || fee.okey;

    // Spec 1.168 §5: the rows of a household with a payer become ONE invoice to the payer.
    const households = await loadHouseholds(db, tenantId);
    const householdTypes = await loadHouseholdTypes(db, tenantId);
    const { groups, singles } = groupFeesByHousehold(rows, households);

    for (const group of groups) {
      const unbookableRows = group.rows.map(fee => ({ fee, unbookable: unbookablePositions(fee) })).filter(x => x.unbookable.length > 0);
      if (unbookableRows.length > 0) {
        // The whole household waits: posting the rest would cap an incomplete invoice.
        for (const { fee, unbookable } of unbookableRows) {
          logger.error(`${CF_NAME}: ${memberOf(fee)} has position(s) without a revenue account: ${unbookable.join(', ')} — household ${group.household.okey} skipped`);
          failed.push({ member: memberOf(fee), positions: unbookable });
        }
        continue;
      }

      const payer = await payerOf(db, group.household.payerKey);
      if (!payer) {
        logger.warn(`${CF_NAME}: payer of household ${group.household.okey} not found — its ${group.rows.length} row(s) are posted one by one`);
        singles.push(...group.rows);
        continue;
      }

      // Same address: members with a row plus the payer. Only the yes/no is used, never an address value.
      const personKeys = [...new Set([...group.rows.map(r => r.member?.key ?? ''), group.household.payerKey])];
      const postals = await Promise.all(personKeys.map(key => key ? postalOf(db, `person.${key}`, tenantId) : Promise.resolve(undefined)));
      if (!sameAddress(postals)) {
        const batch = db.batch();
        for (const fee of group.rows) batch.update(refOf(fee), { state: 'review', notes: withReviewNote(fee.notes) });
        await batch.commit();
        review += group.rows.length;
        logger.warn(`${CF_NAME}: household ${group.household.okey} does not share one address — ${group.rows.length} row(s) set to review`);
        continue;
      }

      const type = householdTypes.find(t => t.name === group.household.type);
      const { invoice, positions } = householdInvoiceDraft(group, payer, {
        tenantId, accountingTenantId, year: scheduleYear, invoiceDate, dueDate,
        feeCap: type?.feeCap, feeCapOnlyMembershipFee: type?.feeCapOnlyMembershipFee,
      });
      // One batch per household: invoice, every position and every row — never half-posted.
      const batch = db.batch();
      const invoiceKey = writeInvoice(db, batch, tenantId, scheduleYear, invoice, positions);
      for (const fee of group.rows) batch.update(refOf(fee), { invoiceKey, state: 'invoiced' });
      await batch.commit();
      invoiced += group.rows.length;
    }

    for (const fee of singles) {
      const unbookable = unbookablePositions(fee);
      if (unbookable.length > 0) {
        const member = memberOf(fee);
        logger.error(`${CF_NAME}: ${member} has position(s) without a revenue account: ${unbookable.join(', ')} — skipped`);
        failed.push({ member, positions: unbookable });
        continue;
      }

      const invoice = memberFeeDraft(fee, { tenantId, accountingTenantId, year: scheduleYear, invoiceDate, dueDate });
      const batch = db.batch();
      const invoiceKey = writeInvoice(db, batch, tenantId, scheduleYear, invoice,
        billedPositions(fee).map(p => ({ ...p, member: fee.member })));
      batch.update(refOf(fee), { invoiceKey, state: 'invoiced' });

      await batch.commit();
      invoiced++;
    }

    logger.info(`${CF_NAME}: posted ${invoiced} of ${feeDocs.length} 'ready' member-fee(s) for tenant ${tenantId} (accountingTenantId ${accountingTenantId}), ${failed.length} skipped, ${review} set to review`);
    // `invoiced` still counts fee ROWS posted (a household invoice counts each of its rows);
    // `review` (spec 1.168) counts rows held back because their household no longer shares one address.
    return { processed: feeDocs.length, invoiced, failed, review };
  },
);

/**
 * Adds an invoice and its positions to `batch`; returns the new invoice key. Every position keeps
 * the person it is billed for (the row's member; the household rebate carries the payer).
 */
function writeInvoice(
  db: Firestore, batch: WriteBatch, tenantId: string, year: number,
  invoice: InvoiceModel, positions: (MemberFeePosition & { member: AvatarInfo | undefined })[],
): string {
  const invoiceKey = generateRandomString(20);
  batch.set(db.collection(InvoiceCollection).doc(invoiceKey), withoutUndefined(removeKeyFromOkrModel(invoice)));
  for (const [index, p] of positions.entries()) {
    const position = new InvoicePositionModel(tenantId);
    position.sortOrder = index; // spec 1.84 K3
    position.invoiceKey = invoiceKey;
    position.name = p.label;
    position.amount = p.amount;
    position.invoicePositionUsage = p.usage;
    position.invoicePositionType = p.type;
    position.accountKey = p.accountKey;
    position.vatCodeKey = p.vatCodeKey;
    position.description = p.description ?? '';
    position.personKey = p.member?.key ?? '';
    position.firstName = p.member?.name1 ?? '';
    position.lastName = p.member?.name2 ?? '';
    position.year = year;
    batch.set(db.collection(InvoicePositionCollection).doc(generateRandomString(20)), removeKeyFromOkrModel(position));
  }
  return invoiceKey;
}

/** The tenant's live households (spec 1.168); archived ones are filtered in memory. */
async function loadHouseholds(db: Firestore, tenantId: string): Promise<HouseholdModel[]> {
  const snap = await db.collection(HouseholdCollection).where('tenants', 'array-contains', tenantId).get();
  return snap.docs.map(d => ({ ...(d.data() as HouseholdModel), okey: d.id })).filter(h => h.isArchived !== true);
}

/** The items of the tenant's `household_type` category list (they carry `feeCap`). */
async function loadHouseholdTypes(db: Firestore, tenantId: string): Promise<CategoryItemModel[]> {
  const snap = await db.collection(CategoryCollection)
    .where('name', '==', HouseholdTypeCategoryName)
    .where('tenants', 'array-contains', tenantId)
    .get();
  return snap.docs.flatMap(d => (d.data()['items'] as CategoryItemModel[] | undefined) ?? []);
}

/** The payer as an AvatarInfo, read from `persons/{payerKey}`; undefined when the person is missing. */
async function payerOf(db: Firestore, payerKey: string): Promise<AvatarInfo | undefined> {
  if (!payerKey || payerKey.includes('/')) return undefined;
  const snap = await db.collection(PersonCollection).doc(payerKey).get();
  if (!snap.exists) return undefined;
  const p = snap.data() ?? {};
  const name1 = String(p['firstName'] ?? '');
  const name2 = String(p['lastName'] ?? '');
  return { key: payerKey, name1, name2, modelType: 'person', type: '', subType: '', label: `${name1} ${name2}`.trim() };
}
