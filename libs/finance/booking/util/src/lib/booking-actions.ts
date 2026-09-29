import { BookingAction } from './booking-action.model';

/**
 * Config-driven booking actions, matched by (accountingTenantId, any of accountIds).
 * Code registry for now; shaped so it can move to a Firestore collection later
 * without changing matchActions / runAction.
 */
export const BOOKING_ACTIONS: BookingAction[] = [
  {
    id: 'gss-spende-receipt',
    type: 'generateDocument',
    // Mitgliederbeiträge and Spenden are both tax-deductible; the receipt lists every payment
    // of the counterparty on either account within the selected year.
    trigger: { accountingTenantId: 'gss', accountIds: ['3401', '3407'] },
    templateId: 'gss-spendenbestaetigung',
    accountLabels: { '3401': 'Mitgliederbeitrag', '3407': 'Spende' },
    outputFormat: 'pdf',
    staticPayload: { logoUrl: 'https://bkaiser.imgix.net/tenant/scs/logo/gss.png' },
    labelKey: '@finance/booking/feature.action.createReceipt',
    icon: 'document',
  },
];
