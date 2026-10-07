import { omitWhen, staticSuite, test, enforce } from 'vest';

import { VideoSection } from '@okr/shared-models';
import { stringValidations } from '@okr/shared-util-core';
import { URL_LENGTH, WORD_LENGTH } from '@okr/shared-constants';

import { baseSectionValidations } from './base-section.validations';

const DOCUMENT_KEY_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export const videoSectionValidations = staticSuite((model: VideoSection) => {

  baseSectionValidations(model);

    // album source (spec 1.82): a stored documentKey replaces the YouTube url, which is then not required
    const documentKey = model.properties?.documentKey ?? '';
    const isAlbum = documentKey !== '';
    omitWhen(isAlbum, () => {
      stringValidations('url', model.properties?.url, URL_LENGTH);
    });
    test('documentKey', 'video.documentKey.invalid', () => {
      enforce(DOCUMENT_KEY_PATTERN.test(documentKey) || !isAlbum).isTruthy();
    });
    stringValidations('width', model.properties?.width, WORD_LENGTH);
    stringValidations('height', model.properties?.height, WORD_LENGTH);
    stringValidations('frameborder', model.properties?.frameborder, WORD_LENGTH);
    stringValidations('baseUrl', model.properties?.baseUrl, URL_LENGTH);
    // tbd: check for kmz, json, csv
});
