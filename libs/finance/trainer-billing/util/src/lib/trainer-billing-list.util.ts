import { AccountingBackend, TrainerAgreementModel, TrainerInvoiceModel, TrainerInvoiceState } from '@okr/shared-models';

/**
 * The treasurer's page «Trainer» (spec 1.167 §7.1, §7.5): which actions a trainer invoice offers, its state colour and
 * the trainer's name. Pure, so the list only renders what these decide.
 */

/** An action on a trainer invoice of the treasurer's list. */
export type TrainerInvoiceAction = 'download' | 'toBill' | 'reject' | 'markPaid';

/**
 * The actions of a trainer invoice, in the order of the ActionSheet:
 * - `download`: its PDF, whenever one was filed;
 * - `toBill`: the Kreditor, only in native books and while the invoice has one (a rejection deletes it);
 * - `reject`: only while `sent` — a booked Kreditor must first lose its booking (§7.5), the callable says so;
 * - `markPaid`: only in external (bexio) books while `sent`, where no Kreditor mirrors the state.
 * A missing backend counts as native (legacy config docs lack the field).
 */
export function trainerInvoiceActions(invoice: TrainerInvoiceModel, backend: AccountingBackend | undefined): TrainerInvoiceAction[] {
  const isNative = (backend ?? 'native') === 'native';
  const actions: TrainerInvoiceAction[] = [];
  if (invoice.documentKey ?? '') actions.push('download');
  if (isNative && (invoice.billKey ?? '')) actions.push('toBill');
  if (invoice.state === 'sent') {
    actions.push('reject');
    if (!isNative) actions.push('markPaid');
  }
  return actions;
}

/** The ionic colour of a trainer invoice state chip. */
export function trainerInvoiceStateColor(state: TrainerInvoiceState): string {
  switch (state) {
    case 'sent': return 'warning';
    case 'booked': return 'primary';
    case 'paid': return 'success';
    case 'rejected': return 'danger';
    default: return 'medium';
  }
}

/**
 * The trainer's name of an invoice: from its agreement, else from another agreement of the same person, else ''.
 * An anonymised agreement (empty personKey, §10) never matches by person.
 */
export function trainerNameOf(invoice: TrainerInvoiceModel, agreements: TrainerAgreementModel[]): string {
  const personKey = invoice.personKey ?? '';
  const agreement = agreements.find(a => a.okey === invoice.agreementKey)
    ?? (personKey ? agreements.find(a => (a.personKey ?? '') === personKey) : undefined);
  return `${agreement?.person?.name1 ?? ''} ${agreement?.person?.name2 ?? ''}`.trim();
}

/** The longest reason `rejectTrainerInvoice` accepts (it refuses longer ones with `invalid-reason`). */
export const TRAINER_REJECT_REASON_MAX = 500;

/** The reason as the callable takes it (trimmed), or '' when it is blank or longer than {@link TRAINER_REJECT_REASON_MAX}. */
export function rejectReasonOf(input: string | undefined): string {
  const reason = (input ?? '').trim();
  return reason.length > TRAINER_REJECT_REASON_MAX ? '' : reason;
}
