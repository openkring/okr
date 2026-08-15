import { only, staticSuite } from 'vest';

import { SHORT_NAME_LENGTH } from '@okr/shared-constants';
import { WorkflowRuleModel } from '@okr/shared-models';
import { baseValidations, numberValidations, stringValidations } from '@okr/shared-util-core';

export const workflowRuleValidations = staticSuite((model: WorkflowRuleModel, tenants: string, tags: string, field?: string) => {
  if (field) only(field);

  baseValidations(model, tenants, tags, field);
  stringValidations('name', model.name, SHORT_NAME_LENGTH, 0, true);
  stringValidations('event', model.event, SHORT_NAME_LENGTH, 0, true);
  stringValidations('probe', model.probe, SHORT_NAME_LENGTH);
  stringValidations('probeArg', model.probeArg, SHORT_NAME_LENGTH);
  stringValidations('responsibilityKey', model.responsibilityKey, SHORT_NAME_LENGTH, 0, true);
  stringValidations('messageKey', model.messageKey, SHORT_NAME_LENGTH, 0, true);
  // a task due more than a year out is a data-entry slip, not a policy
  numberValidations('dueInDays', model.dueInDays, true, 0, 365);
});
