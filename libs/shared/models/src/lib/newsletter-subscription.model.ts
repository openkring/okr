import { DEFAULT_KEY, DEFAULT_TENANTS } from '@okr/shared-constants';
import { OkrModel } from './base.model';

/** Where a subscription came from: the public sign-up form, a Mailchimp import, or an admin in the app. */
export type NewsletterSource = 'form' | 'import' | 'app';

/**
 * A newsletter subscription (spec 1.169 §5.1): one person's membership of one newsletter group
 * (`groups.kind == 'newsletter'`). Written only by Cloud Functions (subscribe / confirm / unsubscribe
 * / import); a client never writes one.
 *
 * Readable by privileged / memberAdmin of the tenant, by the admin of the group (`groupKey`) and by
 * the subscriber (`personKey`). A subscription is active while `dateOfExit` is empty.
 */
export class NewsletterSubscriptionModel implements OkrModel {
  public okey = DEFAULT_KEY;
  public tenants = DEFAULT_TENANTS;   // exactly one tenant
  public isArchived = false;
  /** search string, built from personName and groupName */
  public index = '';

  /** FK -> persons */
  public personKey = '';
  public personName = '';
  /** FK -> groups (kind 'newsletter') */
  public groupKey = '';
  public groupName = '';

  /** StoreDate (yyyyMMdd); '' = none */
  public dateOfEntry = '';
  /** StoreDate (yyyyMMdd); '' = still subscribed */
  public dateOfExit = '';

  public source: NewsletterSource = 'app';
  /** FK -> the form-builder form the sign-up came from; '' unless source is 'form' */
  public formKey = '';
  /** StoreDateTime (yyyyMMddHHmmss) of the double-opt-in confirmation; '' = not confirmed through the form */
  public confirmedAt = '';
  /** Mailchimp OPTIN_TIME / CONFIRM_TIME as given by the export; '' unless source is 'import' */
  public importOptinAt = '';
  public importConfirmAt = '';

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const NewsletterSubscriptionCollection = 'newsletterSubscriptions';
export const NewsletterSubscriptionModelName = 'newsletterSubscription';
