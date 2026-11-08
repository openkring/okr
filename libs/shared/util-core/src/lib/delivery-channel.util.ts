import { DEFAULT_DELIVERY_CHANNELS, DeliveryChannel } from '@okr/shared-models';

/**
 * The legacy numeric `DeliveryType` values, in their original order.
 * `SmsNotification` (2) folds into email: there never was an SMS send path, and email is
 * what those users actually received.
 */
const LEGACY_BY_INDEX: DeliveryChannel[] = [
  DeliveryChannel.Post,   // 0 Mail
  DeliveryChannel.Email,  // 1 EmailAttachment
  DeliveryChannel.Email,  // 2 SmsNotification
  DeliveryChannel.Email,  // 3 EmailNotification
  DeliveryChannel.Chat,   // 4 InAppNotification
];

const CANONICAL_ORDER: DeliveryChannel[] = [DeliveryChannel.Post, DeliveryChannel.Email, DeliveryChannel.Chat];

function isChannel(value: unknown): value is DeliveryChannel {
  return typeof value === 'string' && CANONICAL_ORDER.includes(value as DeliveryChannel);
}

/**
 * Anything a `users` document might hold in `newsDelivery` / `invoiceDelivery` → a valid,
 * non-empty channel list.
 *
 * Needed because Firestore reads bypass the model's field defaults: a document written
 * before the migration still returns a number, and a tenant whose one-off migration has
 * not run yet returns one for every user. Without this the form would render no selection
 * and store nonsense on the first edit.
 */
export function toDeliveryChannels(raw: unknown): DeliveryChannel[] {
  if (isChannel(raw)) return [raw];
  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 && raw < LEGACY_BY_INDEX.length) {
    return [LEGACY_BY_INDEX[raw]];
  }
  if (Array.isArray(raw)) {
    const found = CANONICAL_ORDER.filter((channel) => raw.includes(channel));
    if (found.length > 0) return found;
  }
  return [...DEFAULT_DELIVERY_CHANNELS];
}

/**
 * Normalises a `newsDelivery` / `invoiceDelivery` value for an editable form field.
 *
 * A legacy (non-array) value is converted via {@link toDeliveryChannels}, but an already
 * migrated array is passed through UNCHANGED — including an empty one. This is the
 * deliberate inverse of `toDeliveryChannels` for the empty-array case: that function
 * replaces `[]` with the default (`[email, chat]`), which is right for reads of possibly
 * unmigrated documents, but wrong here — it would silently resurrect a selection the user
 * just cleared and make the `empty` validation error unreachable.
 */
export function toEditableChannels(raw: unknown): DeliveryChannel[] {
  return Array.isArray(raw) ? (raw as DeliveryChannel[]) : toDeliveryChannels(raw);
}

/** The delivery types a Versand offers, in the column order of its Zustellung table (spec 1.145 §4.3). */
export const MAILING_CHANNELS: DeliveryChannel[] = [DeliveryChannel.Chat, DeliveryChannel.Email, DeliveryChannel.Post];

/**
 * The comm center reaches persons and orgs. A recipient key (the `personKey` field of the Versand
 * types, kept under that name on the wire so older clients and stored mailings stay valid) is
 * either a bare person okey or `org.<okey>`. An org has no account, so it is reached by email or
 * post only, and it never gets answer links.
 */
export const ORG_RECIPIENT_PREFIX = 'org.';

/** The recipient key of an org. */
export function orgRecipientKey(orgKey: string): string {
  return `${ORG_RECIPIENT_PREFIX}${orgKey}`;
}

/** Whether a recipient key names an org rather than a person. */
export function isOrgRecipient(key: string): boolean {
  return key.startsWith(ORG_RECIPIENT_PREFIX);
}

/** The address `parentKey` of a recipient: `org.<okey>` as it is, a bare person okey as `person.<okey>`. */
export function recipientParentKey(key: string): string {
  return isOrgRecipient(key) ? key : `person.${key}`;
}

/** What the server knows about one Versand recipient — never an address value (privacy-model skill). */
export interface MailingRecipientFacts {
  personKey: string;
  /** an account in the sending tenant: only then is In-App possible and the profile read */
  hasAccount: boolean;
  /** the account's `newsDelivery`, raw as stored; ignored without an account */
  newsDelivery?: unknown;
  hasEmail: boolean;
  hasPostal: boolean;
}

/** One recipient's row in the Zustellung table: which ways are possible, and which are ticked at the start. */
export interface MailingRecipientChannels {
  personKey: string;
  possible: DeliveryChannel[];
  initial: DeliveryChannel[];
}

/**
 * The delivery types of one Versand recipient (spec 1.145 §5). With an account in the tenant, the
 * profile's choice, as far as it is possible. Without one: email if there is an address, else post.
 * A profile choice that is not possible (post without a postal address) is dropped, so the recipient
 * shows as unreachable instead of as served.
 */
export function mailingChannels(facts: MailingRecipientFacts): MailingRecipientChannels {
  const possible = MAILING_CHANNELS.filter((channel) =>
    channel === DeliveryChannel.Chat ? facts.hasAccount
      : channel === DeliveryChannel.Email ? facts.hasEmail
        : facts.hasPostal);
  let initial: DeliveryChannel[];
  if (facts.hasAccount) {
    const profile = toDeliveryChannels(facts.newsDelivery);
    initial = possible.filter((channel) => profile.includes(channel));
  } else {
    initial = facts.hasEmail ? [DeliveryChannel.Email] : facts.hasPostal ? [DeliveryChannel.Post] : [];
  }
  return { personKey: facts.personKey, possible, initial };
}
