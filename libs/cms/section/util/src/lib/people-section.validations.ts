import { only, staticSuite } from 'vest';

import { PeopleSection } from '@bk2/shared-models';

import { baseSectionValidations } from './base-section.validations';

export const peopleSectionValidations = staticSuite((model: PeopleSection, field?: string) => {
    if (field) only(field);

    baseSectionValidations(model, field);

    // tbd: avatar: AvatarConfig
    // tbd: persons AvatarInfo[]
});
