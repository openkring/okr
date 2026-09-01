import { enforce, only, staticSuite, test } from 'vest';

import { SHORT_NAME_LENGTH } from '@okr/shared-constants';
import { stringValidations } from '@okr/shared-util-core';

import { ADHOC_CHAT_MAX_MEMBERS, AdhocChatFormModel } from './adhoc-chat.model';

/**
 * Der Name ist optional (leer = aus den Mitgliedern abgeleitet), mindestens eine weitere
 * Person ist Pflicht: ein Chat mit einer einzigen Person ist eine Direktnachricht und laeuft
 * ueber `createDirectRoom`.
 */
export const adhocChatValidations = staticSuite((model: AdhocChatFormModel, field?: string) => {
  if (field) only(field);

  stringValidations('name', model.name, SHORT_NAME_LENGTH);

  test('members', 'membersRequired', () => {
    enforce(model.members?.length ?? 0).greaterThanOrEquals(1);
  });
  test('members', 'membersMax', () => {
    enforce(model.members?.length ?? 0).lessThanOrEquals(ADHOC_CHAT_MAX_MEMBERS - 1);
  });
});
