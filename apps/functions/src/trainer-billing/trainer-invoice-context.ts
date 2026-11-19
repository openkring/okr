/**
 * Trainer-Abrechnung (spec 1.167 §7.4): everything `previewTrainerInvoice` and `sendTrainerInvoice` read
 * before they decide, and the one PDF render both share. The callables own authentication; the refusal
 * rules (who may send what) live in `planSend` (send-trainer-invoice.ts), which this context feeds.
 */
import type { Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

import {
  AccountingConfigCollection, AddressCollection, AddressModel, OrgCollection, TrainerAgreementCollection, TrainerAgreementModel,
  TrainerProfileCollection, TrainerProfileModel, VatCodeCollection, WorkEntryCollection, WorkEntryModel,
} from '@okr/shared-models';
import { buildTrainerInvoicePayload, PricedInvoice } from '@okr/finance-trainer-billing-util';
import { zurichStoreDate } from '@okr/shared-util-core';
import { pickFavoriteByChannel, QrPayee, scopeToTenant } from '@okr/shared-util-functions';

import { resolveTreasurer } from '../ocr/resolve-treasurer';
import { resolvePersonPayee } from '../pdf/qr-slip';
import { renderDocument, RenderSink } from '../pdf/render-document';

/** The global template of the invoice (seeded by scripts/seed-trainer-invoice-template.mjs). */
export const TRAINER_INVOICE_TEMPLATE_ID = 'trainer-invoice';
/** The public imgix source of the default bucket, as the other server code builds it (vcard, news, calendar). */
const IMGIX_BASE = 'https://bkaiser.imgix.net';

export interface InvoiceContext {
  uid: string;
  tenantId: string;
  callerPersonKey: string;
  agreementKey: string;
  month: string;
  /** StoreDate, Zurich wall clock: the invoice date of a send */
  today: string;
  agreement?: TrainerAgreementModel;
  profile?: TrainerProfileModel;
  /** every entry stored under the agreement; `planSend` keeps the open ones of the month */
  entries: WorkEntryModel[];
  booksTenants: string[];
  nativeBooks: boolean;
  defaultAccountKey: string;
  vatRatePercentByCode: Record<string, number>;
  /** the trainer as QR payee: own bank + postal address only (resolvePersonPayee) */
  payee: QrPayee;
  postalOk: boolean;
  trainerName: string;
  recipientName: string;
  recipientAddress: string[];
  logoUrl: string;
  treasurer: { key: string; name1: string; name2: string } | null;
}

const asStrings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** `2026-07` with a real month; anything else is not a month. */
export function isMonth(month: unknown): month is string {
  return typeof month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
}

/** A Firestore document id the client may name (no path separators, bounded). */
export function isDocKey(key: unknown): key is string {
  return typeof key === 'string' && key.length > 0 && key.length <= 200 && !key.includes('/') && key !== '.' && key !== '..';
}

/**
 * The imgix PNG URL of the profile logo, or '' when the stored path is not the trainer's own upload. The logo
 * is a storage path written by the trainer; only a path under the person's own upload prefix
 * (`tenant/<tenantId>/person/<personKey>/…`, the avatar layout) is printed, so a profile cannot pull another
 * file of the bucket into the PDF.
 */
export function trainerLogoUrl(logoPath: unknown, tenantId: string, personKey: string): string {
  if (typeof logoPath !== 'string' || !tenantId || !personKey) return '';
  const prefix = `tenant/${tenantId}/person/${personKey}/`;
  if (!logoPath.startsWith(prefix) || logoPath.length === prefix.length) return '';
  const segments = logoPath.split('/');
  if (segments.some((s) => s === '' || s === '.' || s === '..')) return '';
  return `${IMGIX_BASE}/${segments.map(encodeURIComponent).join('/')}?fm=png&w=600`;
}

/** `Seestrasse 12`, `8712 Stäfa` — the empty parts left out. */
export function addressLines(a: { street: string; buildingNumber: string; zip: string; city: string }): string[] {
  return [`${a.street} ${a.buildingNumber}`.trim(), `${a.zip} ${a.city}`.trim()].filter((l) => !!l);
}

/** The VAT rate (percent) of each live VAT code of the books, by okey. */
async function loadVatRates(db: Firestore, accountingTenantId: string): Promise<Record<string, number>> {
  const snap = await db.collection(VatCodeCollection).where('accountingTenantId', '==', accountingTenantId).get();
  const rates: Record<string, number> = {};
  for (const d of snap.docs) {
    const v = d.data();
    if (v['isArchived'] === true || typeof v['rate'] !== 'number' || !Number.isFinite(v['rate'])) continue;
    rates[d.id] = v['rate'];
  }
  return rates;
}

/** The recipient of the invoice: the org of the books (`orgs/<books>`), its postal address, to the treasurer. */
async function loadRecipient(db: Firestore, tenantId: string, books: string, treasurer: InvoiceContext['treasurer']):
  Promise<{ name: string; address: string[] }> {
  const org = (await db.collection(OrgCollection).doc(books).get()).data();
  const snap = await db.collection(AddressCollection).where('parentKey', '==', `org.${books}`).get();
  const all = snap.docs.map((d) => ({ ...d.data(), okey: d.id }) as AddressModel);
  const own = scopeToTenant(all, tenantId);
  const postal = pickFavoriteByChannel(own.length > 0 ? own : all, 'postal', zurichStoreDate());
  const treasurerName = treasurer ? `${treasurer.name1} ${treasurer.name2}`.trim() : '';
  const attention = treasurerName ? `z. Hd. ${treasurerName}` : '';
  const lines = postal
    ? addressLines({ street: postal.streetName ?? '', buildingNumber: postal.streetNumber ?? '', zip: postal.zipCode ?? '', city: postal.city ?? '' })
    : [];
  return { name: str(org?.['name']), address: [attention, ...lines].filter((l) => !!l) };
}

/**
 * Reads what a preview or a send of `agreementKey × month` needs: the caller (users/{uid}: personKey,
 * tenants[0]), the agreement, the profile, the agreement's entries, the books (tenants, backend, default
 * compensation account, VAT codes), the trainer's own bank + postal address and the club as recipient.
 * An agreement that is missing or not the caller's stops the reads early (`planSend` refuses `not-owner`):
 * nothing about a foreign agreement is loaded.
 */
export async function loadInvoiceContext(db: Firestore, args: { uid: string; agreementKey: string; month: string }, now = new Date()): Promise<InvoiceContext> {
  const { uid, agreementKey, month } = args;
  const user = (await db.collection('users').doc(uid).get()).data() ?? {};
  const tenantId = asStrings(user['tenants'])[0] ?? '';
  if (!tenantId) throw new HttpsError('failed-precondition', 'User is not linked to a tenant.');
  const callerPersonKey = str(user['personKey']);

  const ctx: InvoiceContext = {
    uid, tenantId, callerPersonKey, agreementKey, month, today: zurichStoreDate(now),
    entries: [], booksTenants: [], nativeBooks: true, defaultAccountKey: '', vatRatePercentByCode: {},
    payee: { name: '', iban: '', qrIban: '', regularIban: '', street: '', buildingNumber: '', zip: '', city: '', country: 'CH' },
    postalOk: false, trainerName: '', recipientName: '', recipientAddress: [], logoUrl: '', treasurer: null,
  };

  const agreementSnap = await db.collection(TrainerAgreementCollection).doc(agreementKey).get();
  if (!agreementSnap.exists) return ctx;
  const agreement = { ...agreementSnap.data(), okey: agreementSnap.id } as TrainerAgreementModel;
  // a foreign agreement (another person's, or of another tenant) is treated as missing: planSend refuses not-owner
  if (!callerPersonKey || agreement.personKey !== callerPersonKey || !asStrings(agreement.tenants).includes(tenantId)) return ctx;
  ctx.agreement = agreement;
  ctx.trainerName = `${agreement.person?.name1 ?? ''} ${agreement.person?.name2 ?? ''}`.trim();

  const books = str(agreement.accountingTenantId);
  const [profileSnap, entrySnap, configSnap] = await Promise.all([
    db.collection(TrainerProfileCollection).doc(callerPersonKey).get(),
    db.collection(WorkEntryCollection).where('agreementKey', '==', agreementKey).get(),
    books ? db.collection(AccountingConfigCollection).doc(books).get() : Promise.resolve(undefined),
  ]);
  ctx.profile = profileSnap.exists ? ({ ...profileSnap.data(), okey: profileSnap.id } as TrainerProfileModel) : undefined;
  ctx.entries = entrySnap.docs.map((d) => ({ ...d.data(), okey: d.id }) as WorkEntryModel);
  const config = configSnap?.data();
  ctx.booksTenants = asStrings(config?.['tenants']);
  // only the books that list the caller's tenant are read any further (the "Buch passt" gate)
  if (!books || !ctx.booksTenants.includes(tenantId)) return ctx;
  ctx.nativeBooks = (config?.['accountingBackend'] ?? 'native') === 'native';
  ctx.defaultAccountKey = str(config?.['defaultCompensationAccountKey']);

  const profile = ctx.profile;
  const senderName = profile?.companyName || ctx.trainerName;
  const [vatRates, payee, treasurer] = await Promise.all([
    loadVatRates(db, books),
    resolvePersonPayee(db, senderName, str(profile?.bankAddressKey), str(profile?.postalAddressKey), callerPersonKey),
    resolveTreasurer(tenantId, str(config?.['reviewAssigneePersonKey'])),
  ]);
  ctx.vatRatePercentByCode = vatRates;
  ctx.payee = payee;
  ctx.postalOk = !!(payee.street && payee.zip && payee.city);
  ctx.treasurer = treasurer;
  const recipient = await loadRecipient(db, tenantId, books, treasurer);
  ctx.recipientName = recipient.name;
  ctx.recipientAddress = recipient.address;
  ctx.logoUrl = trainerLogoUrl(profile?.logoUrl, tenantId, callerPersonKey);
  return ctx;
}

/** The single VAT rate printed on the VAT line, when every billed service uses the same code. */
function singleVatRate(ctx: InvoiceContext, priced: PricedInvoice): number | undefined {
  const codes = [...new Set(priced.billLines.map((l) => l.vatCodeKey).filter((c) => !!c))];
  return codes.length === 1 ? ctx.vatRatePercentByCode[codes[0]] : undefined;
}

/** Why rendering refused, as a send refusal reason; '' = not a refusal of ours. */
export function renderRefusal(e: unknown): 'qr-iban-only' | 'no-iban' | '' {
  const reason = e instanceof HttpsError ? (e.details as { reason?: string } | undefined)?.reason : undefined;
  if (reason === 'qr-iban-needs-reference') return 'qr-iban-only';
  if (reason === 'no-payee-iban') return 'no-iban';
  return '';
}

/**
 * Renders the invoice PDF of `ctx` into `sink` (the private bucket). `draft` prints the «Entwurf» watermark
 * (preview). No `invoiceKey` in the payload and an empty slip reference: the slip is a plain IBAN slip with
 * the message «Rechnung <Nr.>». A QR-IBAN-only trainer is refused (`qr-iban-only`).
 */
export async function renderTrainerInvoicePdf(ctx: InvoiceContext, p: {
  invoiceNo: string; invoiceDate: string; dueDate: string; priced: PricedInvoice; draft: boolean; sink: RenderSink; filename: string;
}): Promise<{ sizeBytes: number }> {
  const profile = ctx.profile as TrainerProfileModel;
  const payload = buildTrainerInvoicePayload({
    invoiceNo: p.invoiceNo,
    invoiceDate: p.invoiceDate,
    dueDate: p.dueDate,
    month: ctx.month,
    profile,
    trainerName: ctx.trainerName,
    trainerAddress: addressLines(ctx.payee),
    recipientName: ctx.recipientName,
    recipientAddress: ctx.recipientAddress,
    priced: p.priced,
    iban: ctx.payee.iban,
    vatRatePercent: singleVatRate(ctx, p.priced),
    bankName: '',
    logoUrl: ctx.logoUrl,
  });
  try {
    const rendered = await renderDocument({
      templateId: TRAINER_INVOICE_TEMPLATE_ID,
      payload: { ...payload, draft: p.draft },
      options: { outputFormat: 'pdf', filename: p.filename, storageMode: 'ephemeral', margin: { top: '0', bottom: '0', left: '0', right: '0' } },
    }, ctx.uid, ctx.tenantId, p.sink, '', { payee: ctx.payee, attachQrSlip: profile.showQrSlip !== false });
    return { sizeBytes: rendered.sizeBytes };
  } catch (e) {
    const reason = renderRefusal(e);
    if (reason) throw new HttpsError('failed-precondition', `trainer invoice cannot be rendered: ${reason}`, { reason });
    throw e;
  }
}
