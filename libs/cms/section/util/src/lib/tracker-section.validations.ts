import { staticSuite } from 'vest';

import { TrackerSection } from '@okr/shared-models';
import { booleanValidations, numberValidations, stringValidations } from '@okr/shared-util-core';
import { WORD_LENGTH } from '@okr/shared-constants';

import { baseSectionValidations } from './base-section.validations';

export const trackerSectionValidations = staticSuite((model: TrackerSection) => {

  baseSectionValidations(model);

    booleanValidations('autostart', model.properties?.autostart);
    numberValidations('intervalInSeconds', model.properties?.intervalInSeconds, true, 0, 9000);
    booleanValidations('enableHighAccuracy', model.properties?.enableHighAccuracy);
    numberValidations('maximumAge', model.properties?.maximumAge, true, 0, 9000);
    stringValidations('exportFormat', model.properties?.exportFormat, WORD_LENGTH);
    // tbd: check for kmz, json, csv
});
