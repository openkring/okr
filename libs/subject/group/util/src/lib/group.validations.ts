import { enforce, omitWhen, staticSuite, test } from 'vest';

import { DESCRIPTION_LENGTH, LONG_NAME_LENGTH, SHORT_NAME_LENGTH } from '@okr/shared-constants';
import { GroupModel } from '@okr/shared-models';
import { booleanValidations, stringValidations } from '@okr/shared-util-core';

/** `#RRGGBB` — the card colour of a group on the website */
export const GROUP_COLOR_LENGTH = 7;

export const groupValidations = staticSuite((model: GroupModel, tenants: string, tags: string) => {
  stringValidations('okey', model.okey);
  stringValidations('name', model.name, SHORT_NAME_LENGTH, 3, true);
  stringValidations('notes', model.notes, DESCRIPTION_LENGTH);
  // legacy groups lack both fields: read as ''
  stringValidations('subTitle', model.subTitle ?? '', LONG_NAME_LENGTH);
  stringValidations('color', model.color ?? '', GROUP_COLOR_LENGTH);
  omitWhen(!model.color?.trim(), () => {
    test('color', 'invalidValue', () => {
      enforce(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(model.color?.trim() ?? '')).isTruthy();
    });
  });
  //tagValidations('tags', model.tags);
  booleanValidations('hasContent', model.hasContent);
  booleanValidations('hasChat', model.hasChat);
  booleanValidations('hasCalendar', model.hasCalendar);
  booleanValidations('hasTasks', model.hasTasks);
  booleanValidations('hasFiles', model.hasFiles);
  booleanValidations('hasMembers', model.hasMembers);
  stringValidations('parentKey', model.parentKey);
  stringValidations('parentName', model.parentName, SHORT_NAME_LENGTH);
  stringValidations('parentModelType', model.parentModelType);

});
