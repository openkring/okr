import { only, staticSuite } from 'vest';

import { DESCRIPTION_LENGTH } from '@okr/shared-constants';
import { WhiteboardItem } from '@okr/shared-models';
import { stringValidations } from '@okr/shared-util-core';

/**
 * One canvas item as the item modal edits it: its text and — for stickers — its colour.
 * Position, size, kind and owner are set by the canvas, not typed, so they carry no rules here.
 * The colour comes from the picker ('' = theme default), so it is checked for type only, never capped.
 */
export const whiteboardItemValidations = staticSuite((item: WhiteboardItem, field?: string) => {
  if (field) only(field);

  stringValidations('text', item.text, DESCRIPTION_LENGTH);
  stringValidations('color', item.color);
});
