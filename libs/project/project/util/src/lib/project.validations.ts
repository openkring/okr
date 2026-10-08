import { enforce, omitWhen, only, staticSuite, test } from 'vest';

import { DESCRIPTION_LENGTH, LONG_NAME_LENGTH } from '@okr/shared-constants';
import { dateValidations, stringValidations } from '@okr/shared-util-core';

import { PROJECT_I18N_KEYS } from './project-i18n';

export interface ProjectFormModel {
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  state: string;
}

export const PROJECT_NAME_LENGTH = LONG_NAME_LENGTH;

export const projectValidations = staticSuite((model: ProjectFormModel, field?: string) => {
  if (field) only(field);

  stringValidations('name', model.name, PROJECT_NAME_LENGTH, 1, true);
  stringValidations('description', model.description, DESCRIPTION_LENGTH);
  dateValidations('startDate', model.startDate);
  dateValidations('endDate', model.endDate);
  // state is chosen from the project_state category: no length cap (see building-forms skill).
  stringValidations('state', model.state);

  omitWhen(!model.startDate || !model.endDate, () => {
    test('endDate', PROJECT_I18N_KEYS.validation_endBeforeStart, () => {
      enforce(model.endDate >= model.startDate).isTruthy();
    });
  });
});
