import { enforce, staticSuite, test } from 'vest';

import { DESCRIPTION_LENGTH } from '@okr/shared-constants';
import { stringValidations } from '@okr/shared-util-core';

/** Scoped keys — `okr-error-note` resolves a bare key against the app's main bundle, which has none of these. */
const VPFX = '@chat/feature.validation.';

/** «Mitteilung ändern»: the new text of an own message. */
export interface MessageEditFormModel {
  body: string;
}

/** The edited text must not be empty; the cap is the one the textarea shows. */
export const messageEditValidations = staticSuite((model: MessageEditFormModel) => {
  stringValidations('body', model.body, DESCRIPTION_LENGTH);
  test('body', VPFX + 'bodyRequired', () => {
    enforce((model.body ?? '').trim().length).greaterThan(0);
  });
});
