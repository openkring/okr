import { each, enforce, omitWhen, staticSuite, test } from 'vest';

import { ARTICLE_TEXT_COLORS, ArticleSection, SLIDESHOW_EFFECTS } from '@okr/shared-models';
import { resolveImageStyle } from '@okr/shared-util-core';

import { articleBlocksValidations } from './article-blocks.validations';
import { baseSectionValidations } from './base-section.validations';
import { isSectionCtaUrl } from './section-cta.util';
import { imageConfigValidations, imageStyleValidations } from './image.validations';
import { isImageLayoutId } from './image-layout.util';
import { SLIDESHOW_DURATION_MAX, SLIDESHOW_DURATION_MIN, SLIDESHOW_INTERVAL_MAX, SLIDESHOW_INTERVAL_MIN } from './slideshow.util';

export const articleSectionValidations = staticSuite((model: ArticleSection) => {
  baseSectionValidations(model);

  // With `blocks` (spec 1.173) the fixed fields below are replaced and ignored by every reader, so a broken stored
  // value in them must not block saving. note: omitWhen runs its callback anyway, so it stays null-safe.
  const hasBlocks = Array.isArray(model.properties?.blocks);
  omitWhen(hasBlocks, () => {
    // images: ImageConfig[]
    // note: omitWhen always runs its callback (it only omits the tests inside), so the iterated value must be
    // null-safe — older sections may lack `images`, and with `blocks` the stored ones are not looked at at all.
    omitWhen(!model.properties?.images?.length, () => {
      each(hasBlocks ? [] : model.properties?.images ?? [], (image, index) => {
        imageConfigValidations(`images[${index}]`, image);
      });
    });

    // imageStyle: Partial<ImageStyle> — an article stores only what differs from the defaults (spec 1.171 D1b),
    // so the stored fields are checked on top of the defaults; a missing field is a default, not an error.
    // note: omitWhen always runs its callback, so guard every access with `?.`.
    omitWhen(!model.properties?.imageStyle, () => {
      imageStyleValidations(resolveImageStyle(model.properties?.imageStyle));
    });

    // imageLayout: a known layout id (spec 1.154 §5); absent = the slider. Which ids suit the image count is resolved
    // at render time (resolveImageLayout), so any known id is accepted here. Below two images the layout is ignored,
    // so an unknown id must not block saving.
    const imageLayout = model.properties?.imageLayout;
    omitWhen(imageLayout === undefined || (model.properties?.images?.length ?? 0) < 2, () => {
      test('imageLayout', 'invalidValue', () => {
        enforce(isImageLayoutId(imageLayout)).isTruthy();
      });
    });

    // slideshow: a known effect and times inside the ranges the editor offers; absent = swipe only
    const slideshow = model.properties?.slideshow;
    omitWhen(!slideshow, () => {
      test('slideshow.effect', 'invalidValue', () => {
        enforce((SLIDESHOW_EFFECTS as readonly string[]).includes(slideshow?.effect ?? '')).isTruthy();
      });
      test('slideshow.interval', 'invalidValue', () => {
        enforce(slideshow?.interval).isNumber().greaterThanOrEquals(SLIDESHOW_INTERVAL_MIN).lessThanOrEquals(SLIDESHOW_INTERVAL_MAX);
      });
      test('slideshow.duration', 'invalidValue', () => {
        enforce(slideshow?.duration).isNumber().greaterThanOrEquals(SLIDESHOW_DURATION_MIN).lessThanOrEquals(SLIDESHOW_DURATION_MAX);
      });
    });
  });

  articleBlocksValidations(model.properties);

  // background: a css hex value (it goes into a style attribute); absent or '' = no own background
  const background = model.properties?.background;
  omitWhen(!background?.trim(), () => {
    test('background', 'invalidValue', () => {
      enforce(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(background?.trim() ?? '')).isTruthy();
    });
  });

  // textColor: absent = automatic, otherwise a known value
  const textColor = model.properties?.textColor;
  omitWhen(textColor === undefined, () => {
    test('textColor', 'invalidValue', () => {
      enforce((ARTICLE_TEXT_COLORS as readonly string[]).includes(textColor ?? '')).isTruthy();
    });
  });

  omitWhen(hasBlocks, () => {
    // cta: label and url both or neither; a set url must be a safe target
    const cta = model.properties?.cta;
    omitWhen(!cta?.label?.trim() && !cta?.url?.trim(), () => {
      test('cta.label', 'required', () => {
        enforce(cta?.label?.trim()).isNotEmpty();
      });
      test('cta.url', 'required', () => {
        enforce(cta?.url?.trim()).isNotEmpty();
      });
      omitWhen(!cta?.url?.trim(), () => {
        test('cta.url', 'invalidValue', () => {
          enforce(isSectionCtaUrl(cta?.url ?? '')).isTruthy();
        });
      });
    });
  });
});
