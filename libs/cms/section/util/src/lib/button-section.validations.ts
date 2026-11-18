
import { omitWhen, staticSuite } from 'vest';

import { ButtonAction, ButtonSection, ColorIonic } from '@okr/shared-models';
import { categoryValidations, numberValidations, stringValidations } from '@okr/shared-util-core';
import { COMMENT_LENGTH, LONG_NAME_LENGTH, NAME_LENGTH, URL_LENGTH, WORD_LENGTH } from '@okr/shared-constants';

import { baseSectionValidations } from './base-section.validations';

/** icon size in px when a button's icon carries none */
export const DEFAULT_BUTTON_ICON_SIZE = 20;

export const buttonSectionValidations = staticSuite((model: ButtonSection) => {
    baseSectionValidations(model);

    // guard nested config objects with ?. — older stored sections may lack icon/style/action.
    // A button without an icon is valid: its size and slot are then irrelevant (the size falls back to
    // DEFAULT_BUTTON_ICON_SIZE). The name is picked from the icon collection, so it carries no length cap.
    const icon = model.properties?.icon;
    omitWhen(!icon?.name, () => {
      stringValidations('icon.name', icon?.name);
      omitWhen(icon?.size === undefined || icon?.size === null, () => {
        numberValidations('icon.size', icon?.size, true, 0);   // icon size in px (IconConfig.size is a number)
      });
      stringValidations('icon.slot', icon?.slot);   // tbd check icon.slot for start, end, icon-only
    });

    stringValidations('style.label', model.properties?.style?.label, LONG_NAME_LENGTH);
    stringValidations('style.shape', model.properties?.style?.shape, WORD_LENGTH);  // tbd: test style.shape  for round or default
    stringValidations('style.fill', model.properties?.style?.fill, WORD_LENGTH);   // tbd: test  style.shape for solid, outline, clear
    stringValidations('style.width', model.properties?.style?.width, NAME_LENGTH);
    stringValidations('style.height', model.properties?.style?.height, NAME_LENGTH);
    categoryValidations('style.color', model.properties?.style?.color, ColorIonic);

    categoryValidations('action.type', model.properties?.action?.type, ButtonAction);
    const isContractDocument = model.properties?.action?.type === ButtonAction.ContractDocument;
    // a URL the author types: capped; a contractKey picked from a list (spec 1.97): a foreign key, mandatory and uncapped
    omitWhen(isContractDocument, () => {
      stringValidations('action.url', model.properties?.action?.url, URL_LENGTH);
    });
    omitWhen(!isContractDocument, () => {
      stringValidations('action.url', model.properties?.action?.url, undefined, 0, true);
    });
    // the alt text is optional: an empty one falls back to the label, then to the name of the action (ButtonWidget)
    const altText = model.properties?.action?.altText;
    omitWhen(altText === undefined || altText === null, () => {
      stringValidations('action.altText', altText, COMMENT_LENGTH);
    });
 });
