// libs/content/pdf-template/util/src/lib/template-publish.validations.ts
import { enforce, staticSuite, test } from 'vest';
import { DESCRIPTION_LENGTH } from '@okr/shared-constants';
import { stringValidations } from '@okr/shared-util-core';

// Vest messages are i18n keys: okr-error-note resolves any message starting with '@'.

/** Form model backing the "publish version N" modal. */
export interface TemplatePublishFormModel {
  changelog: string;   // what changed in this version (mandatory)
}

export function newTemplatePublishFormModel(): TemplatePublishFormModel {
  return { changelog: '' };
}

export const templatePublishValidations = staticSuite((model: TemplatePublishFormModel) => {
  stringValidations('changelog', model.changelog, DESCRIPTION_LENGTH);
  test('changelog', '@content/pdf-template/feature.validation.changelog_required', () => {
    enforce(model.changelog).isNotBlank();
  });
});
