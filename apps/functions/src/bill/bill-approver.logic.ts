// apps/functions/src/bill/bill-approver.logic.ts
//
// The daily payment_approver digest (spec 1.94 §3.3–§3.4), pure: which bills were booked on a day, for the
// books with the setting on, grouped by the account of ours that will pay them.

export const APPROVER_DIGEST_MESSAGE_KEY = '@workflow.bill.approverDigest';
export const APPROVER_DIGEST_FALLBACK = 'Kreditoren prüfen: {count} gebucht am {date}, total {total} CHF';

export interface HistoryRow { parentKey?: string; tags?: string; tenants?: string[]; creationDateTime?: string }
export interface DigestBill {
  okey: string; accountingTenantId: string; vendorName: string; billId: string; amount: number;
  dueDate: string; state: string; bookingKeys: string[]; tenants: string[]; paymentAccountKey: string;
}
export interface PayingAccount { key: string; name: string; iban: string }
export interface BooksConfig { accountingTenantId: string; enabled: boolean; paymentAccountKeys: string[]; accounts: PayingAccount[] }
export interface DigestGroup { heading: string; count: number; total: number; bills: DigestBill[] }
export interface BooksDigest {
  accountingTenantId: string; date: string; count: number; total: number;
  groups: DigestGroup[]; lines: string; links: { key: string; label: string }[];
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** `name1 name2` of the vendor, else the bill's title (legacy docs lack the vendor). */
export function vendorNameOf(b: Record<string, unknown>): string {
  const v = (b['vendor'] ?? {}) as { name1?: unknown; name2?: unknown };
  return `${str(v.name1)} ${str(v.name2)}`.trim() || str(b['title']);
}

/** A raw bills doc as the digest sees it; legacy docs lack fields (Firestore reads skip model defaults). */
export function toDigestBill(okey: string, b: Record<string, unknown>): DigestBill {
  return {
    okey, accountingTenantId: str(b['accountingTenantId']), vendorName: vendorNameOf(b), billId: str(b['billId']),
    amount: num((b['totalAmount'] as { amount?: unknown } | undefined)?.amount), dueDate: str(b['dueDate']),
    state: str(b['state']), bookingKeys: strList(b['bookingKeys']), tenants: strList(b['tenants']),
    paymentAccountKey: str(b['paymentAccountKey']),
  };
}

export const NO_PAYMENT_ACCOUNT = 'Ohne Zahlungskonto';

/**
 * The digest lines capped to `max` characters (the task form validates notes against DESCRIPTION_LENGTH, so an
 * uncapped day would make the task unsavable): longer text is cut to `max - 1` characters plus «…».
 */
export function capNotes(text: string, max: number): string {
  if (max <= 0) return '';
  return text.length <= max ? text : text.slice(0, max - 1) + '…';
}

export function dayWindow(day: string): { from: string; to: string } {
  return { from: `${day}000000`, to: `${day}235959` };
}

export function digestRelatedKey(books: string, day: string): string {
  return `billDigest.${books}_${day}`;
}

export function bookedBillKeys(rows: HistoryRow[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const r of rows) {
    const parentKey = r.parentKey ?? '';
    const tenantId = (r.tenants ?? [])[0] ?? '';
    if (!(r.tags ?? '').split(',').includes('billBooked') || !parentKey.startsWith('bill.') || !tenantId) continue;
    const key = parentKey.slice('bill.'.length);
    const list = out.get(tenantId) ?? [];
    if (!list.includes(key)) list.push(key);
    out.set(tenantId, list);
  }
  return out;
}

/** Still booked: its own booking is linked and it is no longer a draft (a deleted booking returns it to draft). */
export function selectDigestBills(bills: DigestBill[]): DigestBill[] {
  return bills.filter(b => b.state !== 'draft' && b.bookingKeys.includes(`bill-${b.okey}`));
}

export function formatChf(minor: number): string {
  return ((minor || 0) / 100).toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function displayDate(storeDate: string): string {
  return /^\d{8}$/.test(storeDate) ? `${storeDate.slice(6, 8)}.${storeDate.slice(4, 6)}.${storeDate.slice(0, 4)}` : '';
}

export function formatIban(iban: string): string {
  return (iban ?? '').replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();
}

function billLabel(b: DigestBill): string {
  const due = displayDate(b.dueDate);
  return [b.vendorName || b.billId, `${formatChf(b.amount)} CHF`, due ? `fällig ${due}` : ''].filter(Boolean).join(' · ');
}

function groupHeading(name: string, iban: string, bills: DigestBill[]): string {
  const total = bills.reduce((s, b) => s + (b.amount || 0), 0);
  const what = bills.length === 1 ? '1 Kreditor' : `${bills.length} Kreditoren`;
  return `${[name, iban ? formatIban(iban) : ''].filter(Boolean).join(' · ')} — ${what}, ${formatChf(total)} CHF`;
}

/** One digest per enabled set of books with at least one bill booked that day. */
export function buildDigests(day: string, bills: DigestBill[], books: BooksConfig[]): BooksDigest[] {
  const out: BooksDigest[] = [];
  for (const cfg of books) {
    if (!cfg.enabled) continue;
    const own = selectDigestBills(bills).filter(b => b.accountingTenantId === cfg.accountingTenantId);
    if (own.length === 0) continue;
    const groups: DigestGroup[] = [];
    for (const key of cfg.paymentAccountKeys) {
      const list = own.filter(b => b.paymentAccountKey === key);
      if (list.length === 0) continue;
      const acc = cfg.accounts.find(a => a.key === key);
      groups.push({ heading: groupHeading(acc?.name || key, acc?.iban ?? '', list), count: list.length,
        total: list.reduce((s, b) => s + (b.amount || 0), 0), bills: list });
    }
    const rest = own.filter(b => !cfg.paymentAccountKeys.includes(b.paymentAccountKey));
    if (rest.length > 0) {
      groups.push({ heading: groupHeading(NO_PAYMENT_ACCOUNT, '', rest), count: rest.length,
        total: rest.reduce((s, b) => s + (b.amount || 0), 0), bills: rest });
    }
    const links: { key: string; label: string }[] = [];
    const lines: string[] = [];
    groups.forEach((g, i) => {
      links.push({ key: `heading.${i}`, label: g.heading });
      lines.push(g.heading);
      for (const b of g.bills) {
        links.push({ key: `bill.${b.okey}`, label: billLabel(b) });
        lines.push(`  ${billLabel(b)}${b.billId ? ` (Beleg ${b.billId})` : ''}`);
      }
    });
    out.push({ accountingTenantId: cfg.accountingTenantId, date: displayDate(day), count: own.length,
      total: own.reduce((s, b) => s + (b.amount || 0), 0), groups, lines: lines.join('\n'), links });
  }
  return out;
}
