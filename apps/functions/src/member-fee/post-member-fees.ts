import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import {
  AccountingConfigCollection, AccountingConfigModel,
  InvoiceCollection, InvoiceModel,
  InvoicePositionCollection, InvoicePositionModel,
  MemberFeeCollection, MemberFeeModel, MemberFeePosition,
} from '@okr/shared-models';
import { checkAppCheckToken, checkAuthentication, checkRoles } from '@okr/shared-util-functions';
import { addDuration, DateFormat, generateRandomString, getTodayStr, getYear, removeKeyFromOkrModel } from '@okr/shared-util-core';
import { getFeeTotal } from '@okr/relationship-membership-util';
import { getInvoiceIndex } from '@okr/finance-invoice-util';

import { withoutUndefined } from '../invoice/invoice.logic';

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

/**
 * The fee positions that become invoice positions, with the sign the invoice needs. A zero amount
 * is left out (an `E` Eintrittsgebühr kept at 0 for everyone, a rebate that only records a reason):
 * `issueInvoice` refuses any zero position (`invalid-amount`), so one would block the whole draft.
 * A rebate is stored positive on the fee row (`getFeeTotal` subtracts it) but must be NEGATIVE on
 * the invoice — `issueInvoice` sums and books signed amounts and does not look at the type.
 */
export function billedPositions(fee: Pick<MemberFeeModel, 'positions'>): MemberFeePosition[] {
  return (fee.positions ?? [])
    .filter(p => Number(p.amount) !== 0)
    .map(p => p.type === 'rebate' ? { ...p, amount: -Math.abs(p.amount) } : p);
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
 * Post every 'ready' member-fee row of a tenant as an in-house invoice DRAFT (no number; a treasurer
 * issues it via `issueInvoice`, which numbers it transactionally): one `InvoiceModel`
 * plus one `InvoicePositionModel` per fee position, written in a single Firestore batch per fee
 * row so a row is never left half-posted (invoice without positions, or positions without the
 * fee record being flipped to 'invoiced'). This is the 'native' counterpart to
 * uploadToBexio/createBexioInvoice: `AccountingConfigModel.accountingBackend` decides which path
 * a tenant's UI calls, and this callable also refuses to run for a 'bexio' tenant — defense in
 * depth in case something ever calls it directly instead of going through the store's routing.
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

    const { tenantId, accountingTenantId } = request.data ?? {};
    if (!tenantId) throw new HttpsError('invalid-argument', 'tenantId is required');
    if (!accountingTenantId) throw new HttpsError('invalid-argument', 'accountingTenantId is required');

    const db = getFirestore();

    const configSnap = await db.collection(AccountingConfigCollection).doc(accountingTenantId).get();
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
      .get();

    const scheduleYear = getYear();
    const invoiceDate = getTodayStr(DateFormat.StoreDate);
    const dueDate = addDuration(invoiceDate, { days: 30 });

    let invoiced = 0;
    const failed: { member: string; positions: string[] }[] = [];
    for (const feeDoc of feeSnap.docs) {
      const fee = feeDoc.data() as MemberFeeModel;

      const unbookable = unbookablePositions(fee);
      if (unbookable.length > 0) {
        const member = fee.member?.label || fee.member?.key || feeDoc.id;
        logger.error(`${CF_NAME}: ${member} has position(s) without a revenue account: ${unbookable.join(', ')} — skipped`);
        failed.push({ member, positions: unbookable });
        continue;
      }

      const invoice = memberFeeDraft(fee, { tenantId, accountingTenantId, year: scheduleYear, invoiceDate, dueDate });

      const invoiceKey = generateRandomString(20);
      const invoiceRef = db.collection(InvoiceCollection).doc(invoiceKey);

      const batch = db.batch();
      batch.set(invoiceRef, withoutUndefined(removeKeyFromOkrModel(invoice)));

      for (const p of billedPositions(fee)) {
        const position = new InvoicePositionModel(tenantId);
        position.invoiceKey = invoiceKey;
        position.name = p.label;
        position.amount = p.amount;
        position.invoicePositionUsage = p.usage;
        position.invoicePositionType = p.type;
        position.accountKey = p.accountKey;
        position.vatCodeKey = p.vatCodeKey;
        position.description = p.description ?? '';
        position.personKey = fee.member?.key ?? '';
        position.firstName = fee.member?.name1 ?? '';
        position.lastName = fee.member?.name2 ?? '';
        position.year = scheduleYear;

        const positionKey = generateRandomString(20);
        batch.set(db.collection(InvoicePositionCollection).doc(positionKey), removeKeyFromOkrModel(position));
      }

      batch.update(feeDoc.ref, { invoiceKey, state: 'invoiced' });

      await batch.commit();
      invoiced++;
    }

    logger.info(`${CF_NAME}: posted ${invoiced} of ${feeSnap.size} 'ready' member-fee(s) for tenant ${tenantId} (accountingTenantId ${accountingTenantId}), ${failed.length} skipped`);
    return { processed: feeSnap.size, invoiced, failed };
  },
);
