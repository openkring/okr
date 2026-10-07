import { staticSuite } from 'vest';

import { PeopleSection } from '@okr/shared-models';

import { baseSectionValidations } from './base-section.validations';

export const peopleSectionValidations = staticSuite((model: PeopleSection) => {
    baseSectionValidations(model);

    // tbd: avatar: AvatarConfig
    // tbd: persons AvatarInfo[]
});
