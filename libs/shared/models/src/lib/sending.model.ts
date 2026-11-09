import { DEFAULT_KEY, DEFAULT_TENANTS } from '@okr/shared-constants';
import { OkrModel } from './base.model';

export const SendingCollection = 'sendings';
export const SendingModelName = 'sending';

/**
 * `submitting` is claimed by the submit trigger just before it calls Pingen (queued -> submitting); it is
 * left only by the trigger (submitted / failed) or by a Pingen webhook. A record found here was claimed by an
 * attempt that may or may not have reached Pingen.
 */
export type SendingState = 'queued' | 'submitting' | 'submitted' | 'sent' | 'delivered' | 'failed' | 'undeliverable';

/** How a letter is printed and delivered; tenant defaults live in `AppConfig.post*`. */
export interface PostOptions {
  deliveryProduct: 'fast' | 'cheap';
  printSpectrum: 'color' | 'grayscale';
  printMode: 'simplex' | 'duplex';
}

export const DEFAULT_POST_OPTIONS: PostOptions = {
  deliveryProduct: 'cheap',
  printSpectrum: 'grayscale',
  printMode: 'simplex',
};

export interface SendingHistoryEntry {
  state: SendingState;
  /** ISO timestamp */
  at: string;
  detail?: string;
}

/**
 * A physical letter handed to the post provider (spec 1.150, Postversand via Pingen).
 * Written by Cloud Functions only. `price` is what the tenant is charged, in Rappen.
 * bkaiser's own cost is NOT on this document: see `SendingCost`.
 */
export class SendingModel implements OkrModel {
  public okey = DEFAULT_KEY;
  public tenants = DEFAULT_TENANTS;
  public isArchived = false;

  public channel: 'post' = 'post';
  /** '<modelType>.<okey>' of what produced the letter, e.g. an invoice or a mailing. */
  public source = '';
  /** '<modelType>.<okey>' of the recipient (person or org). */
  public recipientKey = '';
  public recipientName = '';
  /** Storage path of the PDF that was sent. */
  public storagePath = '';
  public options: PostOptions = { ...DEFAULT_POST_OPTIONS };
  public pages = 0;
  /** Rappen */
  public price = 0;
  public provider: 'pingen' = 'pingen';
  public providerId = '';
  public state: SendingState = 'queued';
  public history: SendingHistoryEntry[] = [];
  public trackingNumber = '';
  /**
   * Why a `failed` letter failed, machine-readable: 'address' = the post provider refused the recipient's
   * address (counts towards holding a Versand), 'other' = anything else. Absent on letters that did not fail.
   */
  public failReason?: 'address' | 'other';
  /** ISO */
  public createdAt = '';
  /** ISO */
  public updatedAt = '';

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

/** bkaiser's cost, in sub-document `sendings/{id}/private/cost` — functions only, never read by a client (spec §7). */
export interface SendingCost {
  /** Rappen */
  providerPrice: number;
  currency: string;
}
