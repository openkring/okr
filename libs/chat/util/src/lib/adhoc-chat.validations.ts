import { enforce, only, staticSuite, test } from 'vest';

import { SHORT_NAME_LENGTH } from '@okr/shared-constants';
import { stringValidations } from '@okr/shared-util-core';

import { ADHOC_CHAT_MAX_MEMBERS, AdhocChatFormModel } from './adhoc-chat.model';

/**
 * Mindestens eine weitere Person ist Pflicht. Was daraus entsteht, haengt an der Anzahl:
 *
 * - **genau eine** weitere Person → eine Direktnachricht (`createDirectRoom`, find-or-create).
 *   Ein Name ist dort bedeutungslos, das Formularfeld wird ignoriert.
 * - **zwei oder mehr** → ein Ad-hoc-Chat, und der braucht einen Namen. Abgeleitet waere er
 *   eine Aufzaehlung von Vornamen, die in der Raumliste niemand wiedererkennt, und er
 *   veraltet, sobald jemand geht.
 */
export const adhocChatValidations = staticSuite((model: AdhocChatFormModel, field?: string) => {
  if (field) only(field);

  const memberCount = model.members?.length ?? 0;

  stringValidations('name', model.name, SHORT_NAME_LENGTH);

  test('name', 'nameRequired', () => {
    enforce(memberCount < 2 || (model.name ?? '').trim().length > 0).isTruthy();
  });

  test('members', 'membersRequired', () => {
    enforce(memberCount).greaterThanOrEquals(1);
  });
  test('members', 'membersMax', () => {
    enforce(memberCount).lessThanOrEquals(ADHOC_CHAT_MAX_MEMBERS - 1);
  });
});
