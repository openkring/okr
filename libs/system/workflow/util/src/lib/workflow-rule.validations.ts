import { only, staticSuite } from 'vest';

import { LONG_NAME_LENGTH, NAME_LENGTH, SHORT_NAME_LENGTH } from '@okr/shared-constants';
import { WorkflowRuleModel } from '@okr/shared-models';
import { baseValidations, numberValidations, stringValidations } from '@okr/shared-util-core';

import { probeNeedsArg } from './workflow-rule.util';

export const workflowRuleValidations = staticSuite((model: WorkflowRuleModel, tenants: string, tags: string, field?: string) => {
  if (field) only(field);

  baseValidations(model, tenants, tags, field);
  // the limits mirror the form's maxLength per field. They used to be SHORT_NAME_LENGTH (30)
  // across the board, which every real rule exceeded on `name` ('Kategoriewechsel → Materialwart'),
  // `probe` ('categoryIs:passive,hasActiveOwnerships') and `messageKey` (a scoped i18n key) — the
  // form has no error note, so it just went invalid and the change-confirmation bar never appeared.
  stringValidations('name', model.name, NAME_LENGTH, 0, true);
  stringValidations('event', model.event, NAME_LENGTH, 0, true);
  stringValidations('probe', model.probe, LONG_NAME_LENGTH);
  // mandatory exactly when the form shows the field: a probe that consumes an argument and
  // does not carry an inline one would otherwise be saved half-configured (categoryIs with no
  // category matches nothing, so the rule silently never fires).
  stringValidations('probeArg', model.probeArg, SHORT_NAME_LENGTH, 0, probeNeedsArg(model.probe));
  stringValidations('responsibilityKey', model.responsibilityKey, SHORT_NAME_LENGTH, 0, true);
  stringValidations('messageKey', model.messageKey, LONG_NAME_LENGTH, 0, true);
  // a task due more than a year out is a data-entry slip, not a policy
  numberValidations('dueInDays', model.dueInDays, true, 0, 365);
});
