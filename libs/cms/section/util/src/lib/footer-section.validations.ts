import { enforce, omitWhen, staticSuite, test } from 'vest';

import { FOOTER_MAX_COLUMNS, FooterItem, FooterSection } from '@okr/shared-models';
import { stringValidations } from '@okr/shared-util-core';
import { COMMENT_LENGTH, LONG_NAME_LENGTH, URL_LENGTH } from '@okr/shared-constants';

import { baseSectionValidations } from './base-section.validations';
import { footerItemField, isFooterItemType, isFooterLogoHeight, isFooterUrl } from './footer.util';

/** The bottom line («© 2026 …»); the configuration's `[maxLength]` binds to this very constant. */
export const FOOTER_BOTTOM_LINE_LENGTH = LONG_NAME_LENGTH;
/** Title, link text, icon caption and logo alt text. */
export const FOOTER_LABEL_LENGTH = LONG_NAME_LENGTH;
/** A text item may hold an address or a short tagline. */
export const FOOTER_TEXT_LENGTH = COMMENT_LENGTH;
export const FOOTER_URL_LENGTH = URL_LENGTH;

/** the label cap of an item, by type: the configuration binds `[maxLength]` to this */
export function footerLabelLength(item: Pick<FooterItem, 'type'>): number {
  return item.type === 'text' ? FOOTER_TEXT_LENGTH : FOOTER_LABEL_LENGTH;
}

// Item field names carry column and index (footer.c<col>.i<idx>.<field>, see footerItemField), so
// the error note shows under the very item that is wrong. The messages reuse the generic
// `validation.*` keys every app bundle already has.
export const footerSectionValidations = staticSuite((model: FooterSection) => {
  baseSectionValidations(model);
  const config = model.properties;

  test('footer.columnCount', 'invalidValue', () => {
    const count = config?.columnCount;
    enforce(Number.isInteger(count) && count >= 1 && count <= FOOTER_MAX_COLUMNS).isTruthy();
  });

  stringValidations('footer.bottomLine', config?.bottomLine, FOOTER_BOTTOM_LINE_LENGTH);

  (config?.columns ?? []).slice(0, FOOTER_MAX_COLUMNS).forEach((column, c) => {
    (column?.items ?? []).forEach((item, i) => itemValidations(item, c, i));
  });
});

function itemValidations(item: FooterItem, c: number, i: number): void {
  const field = (name: keyof FooterItem) => footerItemField(c, i, name);

  test(field('type'), 'invalidEnum', () => {
    enforce(isFooterItemType(item.type)).isTruthy();
  });

  // a title, text or link without words shows nothing; icon and logo may go without a caption
  const needsLabel = item.type === 'title' || item.type === 'text' || item.type === 'link';
  stringValidations(field('label'), item.label, footerLabelLength(item), 0, needsLabel);

  // a link needs a target; icon and logo may have one
  stringValidations(field('url'), item.url, FOOTER_URL_LENGTH, 0, item.type === 'link');
  omitWhen(!item.url, () => {
    test(field('url'), 'invalidValue', () => {
      enforce(isFooterUrl(item.url)).isTruthy();
    });
  });

  stringValidations(field('icon'), item.icon, FOOTER_LABEL_LENGTH, 0, item.type === 'icon');
  stringValidations(field('image'), item.image, FOOTER_URL_LENGTH, 0, item.type === 'logo');

  omitWhen(item.type !== 'logo', () => {
    test(field('height'), 'invalidEnum', () => {
      enforce(isFooterLogoHeight(item.height)).isTruthy();
    });
  });
}
