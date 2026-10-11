import { enforce, staticSuite, test } from 'vest';

import { DESCRIPTION_LENGTH, SHORT_NAME_LENGTH } from '@okr/shared-constants';
import { stringValidations } from '@okr/shared-util-core';

import { ADHOC_CHAT_MAX_MEMBERS, AdhocChatFormModel } from './adhoc-chat.model';

/**
 * Je Raumtyp (`roomType`) gelten andere Regeln:
 *
 * - **direct** — genau eine weitere Person → eine Direktnachricht (`createDirectRoom`,
 *   find-or-create). Ein Name ist dort bedeutungslos und wird ignoriert.
 * - **adhoc** — zwei bis 19 weitere Personen und ein Name. Abgeleitet waere der Name eine
 *   Aufzaehlung von Vornamen, die in der Raumliste niemand wiedererkennt.
 * - **pinboard** — ein Name und mindestens eine Quellgruppe; keine einzeln gewaehlten Personen,
 *   die Mitglieder ergeben sich aus den Gruppen. Die Beschreibung ist optional, aber begrenzt.
 */
export const adhocChatValidations = staticSuite((model: AdhocChatFormModel) => {
  const type = model.roomType ?? 'direct';
  const memberCount = model.members?.length ?? 0;

  stringValidations('name', model.name, SHORT_NAME_LENGTH);
  test('name', 'nameRequired', () => {
    enforce(type === 'direct' || (model.name ?? '').trim().length > 0).isTruthy();
  });

  if (type === 'direct') {
    test('members', 'directOne', () => {
      enforce(memberCount).equals(1);
    });
  }
  if (type === 'adhoc') {
    test('members', 'adhocTwo', () => {
      enforce(memberCount).greaterThanOrEquals(2);
    });
    test('members', 'membersMax', () => {
      enforce(memberCount).lessThanOrEquals(ADHOC_CHAT_MAX_MEMBERS - 1);
    });
  }
  if (type === 'pinboard') {
    stringValidations('description', model.description, DESCRIPTION_LENGTH);
    test('sourceGroups', 'sourceGroupsRequired', () => {
      enforce(model.sourceGroups?.length ?? 0).greaterThanOrEquals(1);
    });
  }
});
