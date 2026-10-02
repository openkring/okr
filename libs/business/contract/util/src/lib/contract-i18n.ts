import { Signal } from '@angular/core';
import { CONTRACT_STATES, CONTRACT_TYPES } from '@okr/shared-models';

import {
  CONFIDENTIALITY_LEVELS, LOAN_DIRECTIONS, NOTICE_ANCHORS, NOTICE_UNITS, PARTY_ROLES, REPAYMENT_KINDS,
} from './contract-options';
import { CONTRACT_DOC_STATES, CONTRACT_DOCUMENT_ROLES, DEADLINE_KINDS } from './contract-dossier.util';

/** MUST mirror the lib's physical path under `libs/` (libs/business/contract/util). */
export const PFX = '@business/contract/util.';

/** `{ type_loan: PFX + 'type.loan', … }` for a catalogue of ids — one label key per select option. */
function optionKeys<P extends string, T extends string>(prefix: P, ids: readonly T[], path: string = prefix) {
  return Object.fromEntries(ids.map((id) => [`${prefix}_${id}`, `${PFX}${path}.${id}`])) as { [K in T as `${P}_${K}`]: string };
}

export const CONTRACT_I18N_KEYS = {
  plural: PFX + 'plural', add: PFX + 'add', edit: PFX + 'edit', myPlural: PFX + 'myPlural',
  view: PFX + 'view', cancel: PFX + 'cancel', save: PFX + 'save', select: PFX + 'select',
  create_conf: PFX + 'create.conf', create_error: PFX + 'create.error',
  update_conf: PFX + 'update.conf', update_error: PFX + 'update.error',
  archive_confirm: PFX + 'archive.confirm', notice_title: PFX + 'notice.title',
  summarize: PFX + 'summarize', summarizeError: PFX + 'summarizeError',
  dossier: PFX + 'dossier', deadlines: PFX + 'deadlines',
  upload: PFX + 'upload', priorVersions: PFX + 'priorVersions', empty: PFX + 'empty',

  // form sections
  section_general: PFX + 'section.general', section_parties: PFX + 'section.parties',
  section_term: PFX + 'section.term', section_loan: PFX + 'section.loan', section_abstract: PFX + 'section.abstract',

  // field labels
  name_label: PFX + 'name.label', name_placeholder: PFX + 'name.placeholder',
  contractType_label: PFX + 'contractType.label', contractNumber_label: PFX + 'contractNumber.label',
  state_label: PFX + 'state.label', confidentiality_label: PFX + 'confidentiality.label',
  responsible_label: PFX + 'responsible.label', responsible_note: PFX + 'responsible.note',
  parties_addPerson: PFX + 'parties.addPerson', parties_addOrg: PFX + 'parties.addOrg',
  parties_role: PFX + 'parties.role', parties_remove: PFX + 'parties.remove',
  signingDate_label: PFX + 'signingDate.label', startDate_label: PFX + 'startDate.label',
  endDate_label: PFX + 'endDate.label', endDate_helper: PFX + 'endDate.helper',
  autoRenewMonths_label: PFX + 'autoRenewMonths.label', autoRenewMonths_helper: PFX + 'autoRenewMonths.helper',
  noticeOurs_label: PFX + 'noticeOurs.label', noticeTheirs_label: PFX + 'noticeTheirs.label',
  noticeUnit_label: PFX + 'noticeUnit.label', noticeTo_label: PFX + 'noticeTo.label',
  reminderLeadDays_label: PFX + 'reminderLeadDays.label', reminderLeadDays_helper: PFX + 'reminderLeadDays.helper',
  loan_direction_label: PFX + 'loan.direction.label', loan_principal_label: PFX + 'loan.principal.label',
  loan_interestRate_label: PFX + 'loan.interestRate.label', loan_rateFixedUntil_label: PFX + 'loan.rateFixedUntil.label',
  loan_repayment_label: PFX + 'loan.repayment.label', loan_repaymentAmount_label: PFX + 'loan.repaymentAmount.label',
  loan_repaymentIntervalMonths_label: PFX + 'loan.repaymentIntervalMonths.label',
  loan_maturityDate_label: PFX + 'loan.maturityDate.label', loan_accountNo_label: PFX + 'loan.accountNo.label',
  loan_collateral_label: PFX + 'loan.collateral.label', loan_outstanding_label: PFX + 'loan.outstanding.label',
  loan_outstandingAsOf_label: PFX + 'loan.outstandingAsOf.label',
  abstract_label: PFX + 'abstract.label', abstract_helper: PFX + 'abstract.helper', abstract_ai: PFX + 'abstract.ai',
  notes_label: PFX + 'notes.label', notes_placeholder: PFX + 'notes.placeholder',

  // notice modal
  notice_date: PFX + 'notice.date', notice_by: PFX + 'notice.by', notice_byUs: PFX + 'notice.byUs',
  notice_byThem: PFX + 'notice.byThem', notice_effectiveEnd: PFX + 'notice.effectiveEnd',

  // dossier (file list + upload modal)
  file_empty: PFX + 'file.empty', file_signError: PFX + 'file.signError', file_uploading: PFX + 'file.uploading',
  file_uploadError: PFX + 'file.uploadError', file_open: PFX + 'file.open',
  file_role_label: PFX + 'file.role.label', file_docState_label: PFX + 'file.docState.label',
  file_title_label: PFX + 'file.title.label', file_title_placeholder: PFX + 'file.title.placeholder',
  file_title_helper: PFX + 'file.title.helper', file_prior_label: PFX + 'file.prior.label',
  file_prior_none: PFX + 'file.prior.none', file_pick_label: PFX + 'file.pick.label', file_pick_helper: PFX + 'file.pick.helper',

  // deadline panel
  deadline_next: PFX + 'deadline.next', deadline_none: PFX + 'deadline.none', deadline_notSet: PFX + 'deadline.notSet',
  deadline_earliestTermination: PFX + 'deadline.earliestTermination', deadline_remindersSent: PFX + 'deadline.remindersSent',
  deadline_reminder: PFX + 'deadline.reminder',

  // select option labels
  ...optionKeys('role', CONTRACT_DOCUMENT_ROLES),
  ...optionKeys('docState', CONTRACT_DOC_STATES),
  ...optionKeys('deadlineKind', DEADLINE_KINDS),
  ...optionKeys('type', CONTRACT_TYPES),
  ...optionKeys('state', CONTRACT_STATES),
  ...optionKeys('confidentiality', CONFIDENTIALITY_LEVELS),
  ...optionKeys('partyRole', PARTY_ROLES),
  ...optionKeys('unit', NOTICE_UNITS),
  ...optionKeys('noticeTo', NOTICE_ANCHORS),
  ...optionKeys('direction', LOAN_DIRECTIONS, 'loan.direction'),
  ...optionKeys('repayment', REPAYMENT_KINDS, 'loan.repayment'),
} as const;

export type ContractI18n = { [K in keyof typeof CONTRACT_I18N_KEYS]: Signal<string> };
