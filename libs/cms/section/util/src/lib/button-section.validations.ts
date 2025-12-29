import { only, staticSuite } from 'vest';

import { ButtonAction, ButtonSection, ColorIonic } from '@bk2/shared-models';
import { categoryValidations, stringValidations } from '@bk2/shared-util-core';
import { LONG_NAME_LENGTH, SHORT_NAME_LENGTH, WORD_LENGTH } from '@bk2/shared-constants';

import { baseSectionValidations } from './base-section.validations';

export const buttonSectionValidations = staticSuite((model: ButtonSection, field?: string) => {
    if (field) only(field);

    baseSectionValidations(model, field);

    stringValidations('icon.name', model.properties?.icon.name, SHORT_NAME_LENGTH);
    stringValidations('icon.size', model.properties?.icon.size, WORD_LENGTH);   // tbd check icon.size for small, default, large
    stringValidations('icon.slot', model.properties?.icon.slot, WORD_LENGTH);   // tbd check icon.slot for start, end, icon-only

    stringValidations('style.label', model.properties?.style.label, LONG_NAME_LENGTH);
    stringValidations('style.shape', model.properties?.style.shape, WORD_LENGTH);  // tbd: test style.shape  for round or default
    stringValidations('style.fill', model.properties?.style.fill, WORD_LENGTH);   // tbd: test  style.shape for solid, outline, clear
    stringValidations('style.width', model.properties?.style.width, WORD_LENGTH);
    stringValidations('style.height', model.properties?.style.height, WORD_LENGTH);
    categoryValidations('style.color', model.properties?.style.color, ColorIonic);

    categoryValidations('action.type', model.properties?.action.type, ButtonAction); 
    stringValidations('action.url', model.properties?.action.url, LONG_NAME_LENGTH);
    stringValidations('action.altText', model.properties?.action.altText, LONG_NAME_LENGTH);
 });
