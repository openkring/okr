import { only, staticSuite } from 'vest';

import { MapSection } from '@bk2/shared-models';
import { booleanValidations, numberValidations } from '@bk2/shared-util-core';

import { baseSectionValidations } from './base-section.validations';

export const mapSectionValidations = staticSuite((model: MapSection, field?: string) => {
    if (field) only(field);

    baseSectionValidations(model, field);

    numberValidations('centerLatitude', model.properties?.centerLatitude, false, -90, 90);
    numberValidations('centerLongitude', model.properties?.centerLongitude, false, -180, 180);
    numberValidations('zoom', model.properties?.zoom, true, 0, 20);
    booleanValidations('useCurrentLocationAsCenter', model.properties?.useCurrentLocationAsCenter);

});
