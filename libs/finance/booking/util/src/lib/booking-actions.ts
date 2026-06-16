import { BookingAction } from './booking-action.model';

/**
 * Config-driven booking actions, matched by (accountingTenantId, accountId).
 * Code registry for now; shaped so it can move to a Firestore collection later
 * without changing matchActions / runAction.
 */
export const BOOKING_ACTIONS: BookingAction[] = [
  {
    id: 'gss-spende-receipt',
    type: 'generateDocument',
    trigger: { accountingTenantId: 'gss', accountId: '3407' },
    templateId: 'gss-spendenbestaetigung',
    outputFormat: 'pdf',
    staticPayload: { logoUrl: 'https://bkaiser.imgix.net/tenant/scs/logo/gss.png' },
    labelKey: '@finance/booking/feature.action.createReceipt',
    icon: 'document',
  },
];
