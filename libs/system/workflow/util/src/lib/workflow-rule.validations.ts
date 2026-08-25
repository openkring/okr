import { enforce, only, staticSuite, test } from 'vest';

import { LONG_NAME_LENGTH, NAME_LENGTH, SHORT_NAME_LENGTH } from '@okr/shared-constants';
import { WorkflowRuleModel } from '@okr/shared-models';
import { baseValidations, numberValidations, stringValidations } from '@okr/shared-util-core';

import { actionNeedsArg, probeNeedsArg } from './workflow-rule.util';

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

  const steps = model.steps ?? [];
  // a rule with no consequence is a rule that does nothing — the engine logs and skips it
  test('steps', 'mandatory', () => { enforce(steps.length).greaterThan(0); });
  steps.forEach((s, i) => {
    stringValidations(`steps[${i}].action`, s.action, SHORT_NAME_LENGTH, 0, true);
    // mandatory exactly when the form shows the field, same rule as probeArg
    stringValidations(`steps[${i}].actionArg`, s.actionArg, LONG_NAME_LENGTH, 0, actionNeedsArg(s.action));
    // openChat is the one action whose message may be empty: an empty key is what makes the
    // reporter's OWN text the opening message of the chat (engine.ts falls back to
    // ctx.params['notes']). Requiring it here made both live production rules unsaveable —
    // the form shows no error note, so the change-confirmation bar simply never appeared.
    // The mirror lives here rather than beside `actionNeedsArg` in workflow-rule.util.ts on
    // purpose: it is a validation rule about a field, not a fact the form asks about to
    // decide what to render.
    stringValidations(`steps[${i}].messageKey`, s.messageKey, LONG_NAME_LENGTH, 0, s.action !== 'openChat');
    // a task due more than a year out is a data-entry slip, not a policy
    numberValidations(`steps[${i}].dueInDays`, s.dueInDays, true, 0, 365);
  });
});
