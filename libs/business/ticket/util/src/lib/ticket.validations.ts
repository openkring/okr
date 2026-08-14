import { enforce, only, staticSuite, test } from 'vest';

import { SHORT_NAME_LENGTH } from '@okr/shared-constants';
import { TicketModel } from '@okr/shared-models';
import { baseValidations, stringValidations } from '@okr/shared-util-core';

/**
 * The triage form's rules. Only the fields bkaiser actually edits are validated.
 *
 * Nothing from the §3 submission is checked here — the partner filled it in, `validateSubmission`
 * already refused it if it was incomplete, and a rule on a field this form cannot change would
 * block a save on data the operator has no way to fix. Same reasoning as `partnerValidations` and
 * the ingest-written heartbeat.
 */
export const ticketValidations = staticSuite(
  (model: TicketModel, tenants: string, tags: string, field?: string) => {
    if (field) only(field);

    baseValidations(model, tenants, tags, field);
    stringValidations('name', model.name, SHORT_NAME_LENGTH);
    stringValidations('fixVersion', model.fixVersion, SHORT_NAME_LENGTH);

    // The audit rule, in the form as well as in `classifyTicket`: a classification decides free vs.
    // chargeable, so it may never be recorded without a reason. Enforced twice on purpose — the
    // callable is the authority (a form cannot be trusted), the form is what stops the operator
    // finding out only after pressing save.
    test('classificationReason', '@business/ticket/util.validation.classificationReason', () => {
      if (model.classification === 'unclassified') return;
      enforce(model.classificationReason?.trim() ?? '').isNotEmpty();
    });
  });
