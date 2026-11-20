import { CalEventModel, TrainerAgreementModel, WorkEntryModel } from '@okr/shared-models';

import { defaultQuantity, isAgreementActiveOn } from './trainer-billing.util';
import { WORK_ENTRY_LABEL_LENGTH } from './trainer-billing.validations';

/**
 * «Einsatz erfassen» at a calendar event (spec 1.167 §7.3): which agreements the caller may record work under at an
 * event, and the entry the modal opens with. Pure, so the calendar can call it after a dynamic import.
 */

/**
 * The caller's agreements he may record work under at `e`: active on the event's start date (live, self-employment
 * confirmed, within the validity) and sharing a tenant with the event.
 */
export function recordableAgreements(agreements: TrainerAgreementModel[], e: Pick<CalEventModel, 'startDate' | 'tenants'>): TrainerAgreementModel[] {
  const date = e.startDate ?? '';
  if (!date) return [];
  const tenants = e.tenants ?? [];
  return (agreements ?? []).filter(a => isAgreementActiveOn(a, date) && (a.tenants ?? []).some(t => tenants.includes(t)));
}

/** The first agreement the caller may record work under at `e`, or undefined: then the action is not offered. */
export function canRecordWork(agreements: TrainerAgreementModel[], e: Pick<CalEventModel, 'startDate' | 'tenants'>): TrainerAgreementModel | undefined {
  return recordableAgreements(agreements, e)[0];
}

/** The service of the caller's latest entry under `agreementKey` ('' without one): the modal proposes it again. */
export function lastServiceKeyOf(entries: WorkEntryModel[], agreementKey: string): string {
  const own = (entries ?? []).filter(e => e.agreementKey === agreementKey && !!e.serviceKey);
  own.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  return own[0]?.serviceKey ?? '';
}

/** The days an entry of `e` may be dated on: start…end of a multi-day event, else the start day. */
export function eventDateRange(e: Pick<CalEventModel, 'startDate' | 'endDate'>): { from: string; to: string } {
  const from = e.startDate ?? '';
  const end = e.endDate ?? '';
  return { from, to: end && end > from ? end : from };
}

/**
 * A new entry at event `e` under `agreement`: dated on the event's start, the text is the event's location (else its
 * name), the service the last used one (else the first live service) and the quantity the event's duration in that
 * service's unit (`defaultQuantity`).
 */
export function workEntryForEvent(e: CalEventModel, agreement: TrainerAgreementModel, lastServiceKey: string, personKey: string): WorkEntryModel {
  const live = (agreement.services ?? []).filter(s => !s.isArchived);
  const service = live.find(s => s.key === lastServiceKey) ?? live[0];
  const label = (e.locations?.[0]?.name1 || e.name || '').substring(0, WORK_ENTRY_LABEL_LENGTH);
  return {
    ...new WorkEntryModel(agreement.tenants?.[0] ?? ''),
    okey: '',
    tenants: [...(agreement.tenants ?? [])],
    accountingTenantId: agreement.accountingTenantId ?? '',
    personKey,
    agreementKey: agreement.okey,
    date: e.startDate ?? '',
    calEventKey: e.okey ?? '',
    label,
    serviceKey: service?.key ?? '',
    quantity: service ? defaultQuantity(e, service.unit) : 0,
    state: 'open',
    invoiceKey: '',
    isArchived: false,
  };
}
