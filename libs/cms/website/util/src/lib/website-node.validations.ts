import { enforce, omitWhen, only, staticSuite, test } from 'vest';

import { isAllowedLinkUrl } from '@okr/cms-website-render';
import type { WebsiteNodeType } from '@okr/shared-models';

import { WEBSITE_I18N_KEYS as K } from './website-i18n';

export { isAllowedLinkUrl };

export const LABEL_LENGTH = 60;

export interface WebsiteNodeFormModel {
  type: WebsiteNodeType;
  label: string;
  slug: string;
  url: string;
  style: 'default' | 'button';
}

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const websiteNodeValidations = staticSuite((model: WebsiteNodeFormModel, field?: string) => {
  only(field);
  const label = (model.label ?? '').trim();
  test('label', K.validation_labelRequired, () => { enforce(label.length).greaterThan(0); });
  test('label', K.validation_labelTooLong, () => { enforce(label.length).lessThanOrEquals(LABEL_LENGTH); });

  omitWhen(model.type !== 'page', () => {
    test('slug', K.validation_slugRequired, () => { enforce((model.slug ?? '').length).greaterThan(0); });
    test('slug', K.validation_slugPattern, () => { enforce(SLUG_PATTERN.test(model.slug ?? '')).isTruthy(); });
  });

  // a link needs a url; a menu may carry one (its own link) and then it must be as safe
  const url = (model.url ?? '').trim();
  omitWhen(model.type !== 'link', () => {
    test('url', K.validation_urlRequired, () => { enforce(url.length).greaterThan(0); });
  });
  omitWhen(!(model.type === 'link' || (model.type === 'menu' && url.length > 0)), () => {
    test('url', K.validation_urlPrefix, () => { enforce(isAllowedLinkUrl(model.url)).isTruthy(); });
  });
});
