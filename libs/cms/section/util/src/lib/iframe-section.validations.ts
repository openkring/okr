import { enforce, omitWhen, staticSuite, test } from 'vest';

import { IFRAME_HEIGHTS, IframeSection } from '@okr/shared-models';
import { getSafeEmbedUrl, stringValidations } from '@okr/shared-util-core';
import { URL_LENGTH } from '@okr/shared-constants';

import { baseSectionValidations } from './base-section.validations';

export const iframeSectionValidations = staticSuite((model: IframeSection) => {
  baseSectionValidations(model);

  // the cap mirrors the maxLength of the link field in okr-iframe-panel
  stringValidations('url', model.properties?.url, URL_LENGTH);
  // an iframe section without a page shows nothing
  test('url', '@cms/section/feature.validation.iframeRequired', () => {
    enforce(model.properties?.url ?? '').isNotBlank();
  });
  // the app shows only pages on the embed allowlist (getSafeEmbedUrl, frame-src of the CSP); another one would stay blank
  omitWhen(!model.properties?.url, () => {
    test('url', '@cms/section/feature.validation.iframeHostNotAllowed', () => {
      enforce(getSafeEmbedUrl(model.properties?.url)).isNotNull();
    });
  });
  // absent on a section stored before 2026-11-27: then derived from its style
  const height = model.properties?.height;
  omitWhen(height === undefined, () => {
    test('height', '@cms/section/feature.validation.iframeHeightInvalid', () => {
      enforce(IFRAME_HEIGHTS.includes(height as never)).isTruthy();
    });
  });
});
