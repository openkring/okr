import { DEFAULT_KEY, DEFAULT_TENANTS } from '@okr/shared-constants';

import { OkrModel } from './base.model';

/** subscriptions: doc id = tenantId. */
export const SubscriptionCollection = 'subscriptions';
export const SubscriptionModelName = 'subscription';
export const PaymentAttemptCollection = 'payment-attempts';
export const PaymentAttemptModelName = 'paymentAttempt';
/** subscriptions/{tenantId}/billing-runs/{period}: doc id = period yyyyMM; the run's idempotency record (Cloud Functions only). */
export const BillingRunSubcollection = 'billing-runs';
/** credit-accounts: doc id = tenantId; sub-collection 'entries' holds the CreditEntry ledger. */
export const CreditAccountCollection = 'credit-accounts';
export const CreditAccountModelName = 'creditAccount';
export const CreditEntrySubcollection = 'entries';
/** credit-accounts/{tenantId}/auto-top-up/request holds the AutoTopUpRequest (Cloud Functions only). */
export const CreditAutoTopUpSubcollection = 'auto-top-up';
export const CreditAutoTopUpRequestDocId = 'request';
/** platform-config: doc 'billing' holds PlatformBillingConfig. */
export const PlatformConfigCollection = 'platform-config';
export const PlatformConfigBillingDocId = 'billing';

export type BillingMode = 'exempt' | 'stripe';
/** Subscription lifecycle: active -> pastDue (payment failed) -> closing -> closed; cancelled = ended by the tenant. */
export type SubscriptionState = 'active' | 'pastDue' | 'closing' | 'closed' | 'cancelled';
/**
 * A pricing band id (KringXXS ... KringXXXL). Declared as string here: the canonical `BandId` union lives in
 * @okr/business-metering-util, which shared-models must not depend on (cycle).
 */
export type BillingBandId = string;

export interface SubscriptionMeasurement {
  period: string; // yyyyMM
  totalUsers: number;
  privilegedUsers: number;
  weighted: number;
}

export type PaymentMethodType = 'card' | 'paypal';

export interface SavedPaymentMethod {
  type: PaymentMethodType;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  email: string;
  stripePaymentMethodId: string;
  consentAt: string; // StoreDateTime
}

export interface AutoTopUp {
  enabled: boolean;
  threshold: number; // Rappen
  amount: number; // Rappen
}

/** How a tenant pays bkaiser. okey = tenantId. Plan 2 adds state, band history, options. */
export class SubscriptionModel implements OkrModel {
  public okey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;

  public billing: BillingMode = 'exempt';
  public stripeCustomerId = '';
  public billingEmail = '';
  public paymentMethod: SavedPaymentMethod | null = null;
  public autopay = false;
  public autoTopUp: AutoTopUp = { enabled: false, threshold: 0, amount: 0 };

  // Plan 2 (monthly billing run). Firestore reads skip these defaults: consumers coalesce (?? 'active', ?? []).
  public state: SubscriptionState = 'active';
  public billingStart = ''; // StoreDate; first billed month = month after billingStart's month (that month if billingStart is its 1st)
  public options: string[] = []; // paid option ids (keys of ADD_ON_PRICES); source of truth
  public bandHistory: BillingBandId[] = []; // measured bands, newest first, max 3
  public currentBand: BillingBandId | '' = '';
  public lastMeasurement: SubscriptionMeasurement | null = null;
  public lastRunPeriod = ''; // yyyyMM of the last issued monthly invoice
  public pastDueSince = ''; // StoreDate, '' when not pastDue
  public closingSince = ''; // StoreDate
  public cancelledAt = ''; // StoreDate

  constructor(tenantId: string) {
    this.okey = tenantId;
    this.tenants = [tenantId];
  }
}

export type PaymentPurpose = 'invoice' | 'topup';
export type PaymentAttemptState = 'open' | 'succeeded' | 'failed' | 'requires_action' | 'overpaid' | 'expired' | 'refunded' | 'disputed';

export class PaymentAttemptModel implements OkrModel {
  public okey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS; // holds the operator tenant (the books' owner), not the payer
  public payerTenantId = ''; // the paying tenant
  public isArchived = false;

  public accountingTenantId = '';
  public purpose: PaymentPurpose = 'invoice';
  public invoiceKey = '';
  public amount = 0; // Rappen
  public currency = 'CHF';
  public state: PaymentAttemptState = 'open';
  public offSession = false;
  public stripeCheckoutSessionId = '';
  public createdBy = ''; // uid of the caller who opened the session; a session is reused only by the same caller
  public offerSave = false; // whether the session offers to save the payment method
  public checkoutUrl = ''; // hosted Checkout URL, reused while the session is open (spec 1.149 R11)
  public expiresAt = ''; // StoreDateTime (UTC): our reuse window for checkoutUrl, createdAt + 23 h
  public stripePaymentIntentId = '';
  public stripeChargeId = '';
  public fee = 0; // Rappen
  public paymentBookingKey = '';
  public feeBookingKey = '';
  public createdAt = ''; // StoreDateTime
  public updatedAt = ''; // StoreDateTime
  public error = '';
  public retryCount = 0; // off-session re-charges after a decline
  public nextRetryAt = ''; // StoreDate

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export type CreditEntryKind = 'topup' | 'deduction' | 'reversal' | 'correction';

/** One ledger line in credit-accounts/{tenantId}/entries. */
export interface CreditEntry {
  kind: CreditEntryKind;
  amount: number; // signed Rappen
  balanceAfter: number;
  date: string; // StoreDateTime
  product: string;
  units: number;
  pages: number;
  unitPrice: number;
  pagePrice: number;
  reference: string; // invoiceKey or send-job key
  reason: string;
  bookingKey: string;
  createdBy: string;
  /** Deductions only: the sum of the reversals of this entry so far (Rappen, positive), kept by the ledger. */
  reversedAmount?: number;
}

export class CreditAccountModel implements OkrModel {
  public okey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;

  public balance = 0; // Rappen
  public updatedAt = ''; // StoreDateTime

  constructor(tenantId: string) {
    this.okey = tenantId;
    this.tenants = [tenantId];
  }
}

/**
 * The open auto top-up of a tenant. Kept out of the credit account so the heavy auto top-up trigger fires only
 * when a request changes, not on every balance change. At most one auto top-up is pending.
 */
export interface AutoTopUpRequest {
  /** Stamped by a deduction that took the balance below the threshold; '' = no request. StoreDateTime. */
  requestedAt: string;
  /** The top-up invoice being charged; '' = none. Older than 24 h (by requestedAt): stale, re-run with this key. */
  pendingInvoiceKey: string;
  /** Re-charges of the pending invoice after a declined/canceled charge (idempotency key `<invoiceKey>-r<n>`); 0 = none. */
  retryCount: number;
}

/** platform-config/billing: which tenant and books bill the other tenants. */
export interface PlatformBillingConfig {
  operatorTenantId: string;
  accountingTenantId: string;
}
