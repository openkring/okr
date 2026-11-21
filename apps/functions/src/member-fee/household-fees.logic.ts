import { AvatarInfo, HouseholdModel, InvoiceModel, MemberFeeModel, MemberFeePosition } from '@okr/shared-models';
import { DEFAULT_INVOICE_POSITION_USAGE } from '@okr/shared-constants';
import { rebatePosition } from '@okr/relationship-membership-util';
import { getInvoiceIndex } from '@okr/finance-invoice-util';

/**
 * Pure rules of the household fee run (spec 1.168 §5 / §5.1): which fee rows merge into one invoice
 * to the household's payer, the household fee cap («Familienrabatt») and the same-address check.
 * `postMemberFees` does the reads and writes around them.
 */

/** The note a fee row gets when its household no longer lives at one address (spec 1.168 §5.1). */
export const ADDRESS_MISMATCH_NOTE = 'Wohnen nicht mehr an derselben Adresse';

/** The label of the household cap rebate — printed on the invoice as is. */
export const HOUSEHOLD_REBATE_LABEL = 'Familienrabatt';

export interface HouseholdFeeGroup {
  household: HouseholdModel;
  rows: MemberFeeModel[];
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
 * Splits the rows of a fee run into household groups and single rows. A row joins a group only when
 * its member belongs to a live household whose `payerKey` is set and is itself one of the household's
 * members; every other row stays a single (one invoice per row, as before). The payer need not have a
 * row of their own (a parent who is not a club member pays for the child). Household members without a
 * row in this run simply do not appear — only rows of the run are merged.
 */
export function groupFeesByHousehold(
  rows: MemberFeeModel[], households: HouseholdModel[],
): { groups: HouseholdFeeGroup[]; singles: MemberFeeModel[] } {
  const householdOf = new Map<string, HouseholdModel>();
  for (const h of households) {
    if (h.isArchived === true) continue;
    const members = h.memberKeys ?? [];
    const payerKey = h.payerKey ?? '';
    if (payerKey.length === 0 || !members.includes(payerKey)) continue;
    for (const key of members) {
      if (!householdOf.has(key)) householdOf.set(key, h); // one household per person and tenant
    }
  }

  const groups = new Map<HouseholdModel, MemberFeeModel[]>();
  const singles: MemberFeeModel[] = [];
  for (const row of rows) {
    const h = householdOf.get(row.member?.key ?? '');
    if (!h) { singles.push(row); continue; }
    const list = groups.get(h) ?? [];
    list.push(row);
    groups.set(h, list);
  }
  return { groups: [...groups].map(([household, rs]) => ({ household, rows: rs })), singles };
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * The «Familienrabatt» of a merged household invoice, or undefined when the cap does not apply.
 * Counted sum = Σ counted non-rebate positions (only `usage === 'membershipFee'` unless
 * `onlyMembershipFee === false`; missing = true) − Σ existing rebate positions. Above `feeCap`
 * (a fixed CHF amount; 0 or missing = no cap) the difference becomes one rebate position, stored
 * positive like every fee-row rebate (`billedPositions` turns it negative on the invoice).
 */
export function applyHouseholdFeeCap(
  positions: MemberFeePosition[], feeCap: number | undefined, onlyMembershipFee: boolean | undefined,
): MemberFeePosition | undefined {
  const cap = Number(feeCap) || 0;
  if (cap <= 0) return undefined;
  const onlyFee = onlyMembershipFee !== false;
  const counted = positions.filter(p => p.type !== 'rebate' && (!onlyFee || p.usage === DEFAULT_INVOICE_POSITION_USAGE));
  const rebates = positions.filter(p => p.type === 'rebate').reduce((s, p) => s + Math.abs(Number(p.amount) || 0), 0);
  const sum = counted.reduce((s, p) => s + (Number(p.amount) || 0), 0) - rebates;
  if (sum <= cap) return undefined;
  const rebate = rebatePosition(round2(sum - cap), 'family', counted);
  return rebate ? { ...rebate, label: HOUSEHOLD_REBATE_LABEL } : undefined;
}

/** The parts of a postal address `sameAddress` compares (a subset of mailing-letters' `PostalFields`). */
export interface ComparablePostal {
  streetName: string;
  streetNumber: string;
  zipCode: string;
}

const norm = (s: string | undefined): string => (s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * Whether every person lives at the same address: street, house number and zip of the favourite
 * postal address, trimmed and case-insensitive. False when anyone has no postal address. Only this
 * yes/no leaves the fee run; no address value is logged or written.
 */
export function sameAddress(postals: (ComparablePostal | undefined)[]): boolean {
  if (postals.length === 0 || postals.some(p => p === undefined)) return false;
  const key = (p: ComparablePostal) => [norm(p.streetName), norm(p.streetNumber), norm(p.zipCode)].join('|');
  const first = key(postals[0] as ComparablePostal);
  return postals.every(p => key(p as ComparablePostal) === first);
}

/** `notes` with the address-mismatch note appended, once only. */
export function withReviewNote(notes: string | undefined): string {
  const current = notes ?? '';
  if (current.includes(ADDRESS_MISMATCH_NOTE)) return current;
  return current.trim().length === 0 ? ADDRESS_MISMATCH_NOTE : `${current}\n${ADDRESS_MISMATCH_NOTE}`;
}

const fullName = (a: AvatarInfo | undefined): string =>
  [a?.name1 ?? '', a?.name2 ?? ''].join(' ').trim() || (a?.label ?? '');

/** An invoice position of a household invoice, with the person it is billed for. */
export type HouseholdInvoicePosition = MemberFeePosition & { member: AvatarInfo | undefined };

/**
 * The invoice DRAFT of one household group (spec 1.168 §5): `receiver` = the payer, the billed
 * positions of every row (description = the member's full name, then a pro-rata note if any), plus
 * the cap rebate billed to the payer. Unnumbered like `memberFeeDraft`; a treasurer issues it.
 */
export function householdInvoiceDraft(
  group: HouseholdFeeGroup,
  payer: AvatarInfo,
  o: {
    tenantId: string; accountingTenantId: string; year: number; invoiceDate: string; dueDate: string;
    feeCap?: number; feeCapOnlyMembershipFee?: boolean;
  },
): { invoice: InvoiceModel; positions: HouseholdInvoicePosition[] } {
  const positions: HouseholdInvoicePosition[] = [];
  for (const row of group.rows) {
    const name = fullName(row.member);
    for (const p of billedPositions(row)) {
      const description = p.description ? `${name} – ${p.description}` : name;
      positions.push({ ...p, description, member: row.member });
    }
  }
  const rebate = applyHouseholdFeeCap(group.rows.flatMap(r => r.positions ?? []), o.feeCap, o.feeCapOnlyMembershipFee);
  if (rebate) positions.push({ ...rebate, amount: -Math.abs(rebate.amount), description: '', member: payer });

  const invoice = new InvoiceModel(o.tenantId);
  invoice.accountingTenantId = o.accountingTenantId;
  invoice.receiver = payer;
  invoice.state = 'draft';
  invoice.invoiceNo = 0;
  invoice.invoiceId = '';
  invoice.invoiceDate = o.invoiceDate;
  invoice.dueDate = o.dueDate;
  invoice.title = `${o.year} ${group.household.name || payer.label || ''}`.trim();
  const totalChf = positions.reduce((s, p) => s + p.amount, 0);
  invoice.totalAmount = { amount: Math.round(totalChf * 100), currency: 'CHF', periodicity: 'one-time' };
  invoice.index = getInvoiceIndex(invoice);
  return { invoice, positions };
}
