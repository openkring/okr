import { Signal } from '@angular/core';

/**
 * MUST mirror the lib's physical path under `libs/` — `libs/business/ticket/util` →
 * `'@business/ticket/util.'`. A wrong prefix makes every key 404 at runtime and nothing in the
 * build or the test suite catches it.
 */
const PFX = '@business/ticket/util.';

export const TICKET_I18N_KEYS = {
  plural:                    PFX + 'plural',
  empty:                     PFX + 'empty',
  view:                      PFX + 'view.label',

  header_name:               PFX + 'header.name',
  header_partner:            PFX + 'header.partner',
  header_version:            PFX + 'header.version',
  header_status:             PFX + 'header.status',
  header_class:              PFX + 'header.classification',
  header_sla:                PFX + 'header.sla',

  status_submitted:          PFX + 'status.submitted.label',
  status_accepted:           PFX + 'status.accepted.label',
  status_waiting:            PFX + 'status.waiting-on-partner.label',
  status_resolved:           PFX + 'status.resolved.label',
  status_closed:             PFX + 'status.closed.label',
  status_rejected:           PFX + 'status.rejected.label',

  class_unclassified:        PFX + 'classification.unclassified.label',
  class_defect:              PFX + 'classification.defect.label',
  class_misconfiguration:    PFX + 'classification.misconfiguration.label',
  class_howto:               PFX + 'classification.how-to.label',

  classification_label:      PFX + 'classification.label',
  severity_label:            PFX + 'severity.label',
  severity_blocking:         PFX + 'severity.blocking.label',
  severity_nonblocking:      PFX + 'severity.non-blocking.label',

  // --- the §3 submission, read-only on our side: the partner filled it in, we do not edit it.
  appVersion_label:          PFX + 'appVersion.label',
  appVersion_placeholder:    PFX + 'appVersion.placeholder',
  appVersion_helper:         PFX + 'appVersion.helper',
  affectedTenantId_label:    PFX + 'affectedTenantId.label',
  affectedTenantId_placeholder: PFX + 'affectedTenantId.placeholder',
  affectedTenantId_helper:   PFX + 'affectedTenantId.helper',
  firebaseProjectId_label:   PFX + 'firebaseProjectId.label',
  firebaseProjectId_placeholder: PFX + 'firebaseProjectId.placeholder',
  firebaseProjectId_helper:  PFX + 'firebaseProjectId.helper',
  sentryEventUrl_label:      PFX + 'sentryEventUrl.label',
  sentryEventUrl_placeholder: PFX + 'sentryEventUrl.placeholder',
  sentryEventUrl_helper:     PFX + 'sentryEventUrl.helper',
  platform_label:            PFX + 'platform.label',
  platform_placeholder:      PFX + 'platform.placeholder',
  platform_helper:           PFX + 'platform.helper',
  feature_label:             PFX + 'feature.label',
  feature_placeholder:       PFX + 'feature.placeholder',
  feature_helper:            PFX + 'feature.helper',
  reproSteps_label:          PFX + 'reproSteps.label',
  reproSteps_placeholder:    PFX + 'reproSteps.placeholder',
  description_label:         PFX + 'description.label',
  description_placeholder:   PFX + 'description.placeholder',

  // --- the triage block: the only editable half.
  classificationReason_label: PFX + 'classificationReason.label',
  classificationReason_placeholder: PFX + 'classificationReason.placeholder',
  classificationReason_helper: PFX + 'classificationReason.helper',
  fixVersion_label:          PFX + 'fixVersion.label',
  fixVersion_placeholder:    PFX + 'fixVersion.placeholder',
  fixVersion_helper:         PFX + 'fixVersion.helper',

  as_title:                  PFX + 'as.title',
  as_open:                   PFX + 'as.open',
  as_accept:                 PFX + 'as.accept',
  as_wait:                   PFX + 'as.wait',
  as_resume:                 PFX + 'as.resume',
  as_workaround:             PFX + 'as.workaround',
  as_fix:                    PFX + 'as.fix',
  as_close:                  PFX + 'as.close',
  as_comment:                PFX + 'as.comment',
  cancel:                    PFX + 'as.cancel',

  comment_prompt:            PFX + 'comment.prompt',
  comment_conf:              PFX + 'comment.conf',
  comment_thread:            PFX + 'comment.thread',
  triage_conf:               PFX + 'triage.conf',
  triage_error:              PFX + 'triage.error',
  classify_conf:             PFX + 'classify.conf',
  classify_error:            PFX + 'classify.error',
  /** Shown when a save was attempted with an unexplained classification — the audit refusal. */
  classify_needsReason:      PFX + 'classify.needsReason',

  changeConfirmation_cancel: PFX + 'changeConfirmation.cancel',
  changeConfirmation_ok:     PFX + 'changeConfirmation.ok',
} satisfies Record<string, string>;

export type TicketI18n = { [K in keyof typeof TICKET_I18N_KEYS]: Signal<string> };
