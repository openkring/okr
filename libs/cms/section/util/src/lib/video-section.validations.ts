import { omitWhen, staticSuite, test, enforce } from 'vest';

import { VIDEO_ASPECT_RATIOS, VideoSection } from '@okr/shared-models';
import { getSafeEmbedUrl, stringValidations } from '@okr/shared-util-core';
import { URL_LENGTH } from '@okr/shared-constants';

import { baseSectionValidations } from './base-section.validations';
import { JOURNAL_VIDEO_CLIPS_MAX } from './journal-mode.util';

const DOCUMENT_KEY_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export const videoSectionValidations = staticSuite((model: VideoSection) => {
  baseSectionValidations(model);

    // album source (spec 1.82): a stored documentKey replaces the YouTube url, which is then not required
    const documentKey = model.properties?.documentKey ?? '';
    const isAlbum = documentKey !== '';
    omitWhen(isAlbum, () => {
      stringValidations('url', model.properties?.url, URL_LENGTH);
      stringValidations('baseUrl', model.properties?.baseUrl, URL_LENGTH);
    });
    // a video section without a video shows nothing; a journal's plays its clips instead (spec 1.154 §10)
    omitWhen(isAlbum || !!model.journalKey || model.properties?.clips !== undefined, () => {
      test('url', '@cms/section/feature.validation.videoRequired', () => {
        enforce(model.properties?.url ?? '').isNotBlank();
      });
      omitWhen(!model.properties?.url, () => {
        test('url', '@cms/section/feature.validation.videoLinkInvalid', () => {
          enforce(getSafeEmbedUrl((model.properties?.baseUrl ?? '') + model.properties?.url)).isNotNull();
        });
      });
    });
    test('documentKey', '@cms/section/feature.validation.documentKeyInvalid', () => {
      enforce(DOCUMENT_KEY_PATTERN.test(documentKey) || !isAlbum).isTruthy();
    });
    // absent on a section stored before 2026-11-27: then 16:9
    const aspectRatio = model.properties?.aspectRatio;
    omitWhen(aspectRatio === undefined, () => {
      test('aspectRatio', '@cms/section/feature.validation.aspectRatioInvalid', () => {
        enforce(VIDEO_ASPECT_RATIOS.includes(aspectRatio as never)).isTruthy();
      });
    });
    // travel journal (spec 1.154 §10): a video section plays at most JOURNAL_VIDEO_CLIPS_MAX clips
    const clips = model.properties?.clips;
    omitWhen(clips === undefined, () => {
      test('clips', '@cms/section/feature.validation.clipsTooMany', () => {
        enforce(Array.isArray(clips) && clips.length <= JOURNAL_VIDEO_CLIPS_MAX).isTruthy();
      });
    });
    // tbd: check for kmz, json, csv
});
