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
