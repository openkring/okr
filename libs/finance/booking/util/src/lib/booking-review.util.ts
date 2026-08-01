import { BookingModel, BookingStatus, CategoryItemModel, CategoryListModel, UserModel } from '@okr/shared-models';
import { hasRole } from '@okr/shared-util-core';

/**
 * May this user decide on this booking? Mirrors the `reviewBooking` Cloud Function's own guard —
 * the CF is authoritative; this only decides whether the actions are offered in the UI.
 *
 * `hasRole('treasurer', …)` resolves to treasurer OR admin (see auth.util.ts), matching
 * `isTreasurerGuard` and the firestore.rules ocr-rules condition.
 */
export function canReviewBooking(booking: BookingModel, currentUser: UserModel | undefined, isReadOnly = false): boolean {
  if (isReadOnly) return false;                       // ledger owned by an external backend (e.g. Bexio)
  if (booking.status !== 'forReview') return false;
  return hasRole('treasurer', currentUser);
}

export const BOOKING_STATUSES: BookingStatus[] = ['draft', 'forReview', 'posted', 'cancelled'];

const STATUS_ICONS: Record<BookingStatus, string> = {
  draft:     'create',
  forReview: 'alert-circle',
  posted:    'checkmark-circle',
  cancelled: 'close-circle',
};

/**
 * The status filter for okr-list-filter, built in code rather than read from the `categories`
 * collection: BookingStatus is a compile-time union owned by shared-models, so a per-tenant
 * category document could drift out of sync with it. `getItemLabel` resolves each item to
 * `@finance/booking/feature.status.<item>.label` — the keys in BOOKING_I18N_KEYS.
 */
export function bookingStatusCategory(tenantId: string): CategoryListModel {
  const category = new CategoryListModel(tenantId);
  category.name = 'status';
  category.i18n = '@finance/booking/feature';
  category.translateItems = true;
  category.items = BOOKING_STATUSES.map(s => new CategoryItemModel(s, STATUS_ICONS[s]));
  return category;
}

/** True when the row should be highlighted as awaiting a treasurer decision. */
export function isForReview(booking: BookingModel): boolean {
  return booking.status === 'forReview';
}
