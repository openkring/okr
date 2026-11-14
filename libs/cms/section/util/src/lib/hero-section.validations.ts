import { each, enforce, omitWhen, staticSuite, test } from 'vest';

import { HeroSection } from '@okr/shared-models';
import { numberValidations, stringValidations } from '@okr/shared-util-core';

import { baseSectionValidations } from './base-section.validations';
import { isSectionCtaUrl } from './section-cta.util';
import { HERO_FOCUSES, HERO_HEIGHTS, HERO_OVERLAY_DARKENING_MAX, HERO_OVERLAY_FONT_SIZES, HERO_OVERLAY_LABEL_LENGTH, HERO_OVERLAY_POSITIONS } from './hero.util';
import { imageStyleValidations, optionalImageSlotValidations } from './image.validations';

export const heroSectionValidations = staticSuite((model: HeroSection) => {
  baseSectionValidations(model);

  // logo / hero: ImageConfig — both single slots, both optional on older stored sections.
  optionalImageSlotValidations('logo', model.properties?.logo);
  optionalImageSlotValidations('hero', model.properties?.hero);

  // imageStyle: ImageStyle
  omitWhen(!model.properties?.imageStyle, () => {
    imageStyleValidations(model.properties?.imageStyle);
  });

  // ctas: at most two buttons, each with a label and a safe target (all optional on older sections)
  omitWhen(!model.properties?.ctas?.length, () => {
    test('ctas', 'invalidValue', () => {
      enforce((model.properties?.ctas ?? []).length).lessThanOrEquals(2);
    });
    each(model.properties?.ctas ?? [], (cta, index) => {
      test(`ctas[${index}].label`, 'required', () => {
        enforce(cta?.label?.trim()).isNotEmpty();
      });
      test(`ctas[${index}].url`, 'invalidValue', () => {
        enforce(isSectionCtaUrl(cta?.url ?? '')).isTruthy();
      });
    });
  });

  // overlay / height / focus: all optional — an absent field keeps the classic hero (travel journal, spec 1.154)
  omitWhen(!model.properties?.overlay, () => {
    const overlay = model.properties.overlay;
    numberValidations('overlay.darkening', overlay?.darkening, true, 0, HERO_OVERLAY_DARKENING_MAX);
    stringValidations('overlay.label', overlay?.label, HERO_OVERLAY_LABEL_LENGTH);
    test('overlay.color', 'invalidValue', () => {
      enforce(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(overlay?.color ?? '')).isTruthy();
    });
    test('overlay.position', 'invalidValue', () => {
      enforce((HERO_OVERLAY_POSITIONS as readonly string[]).includes(overlay?.position as string)).isTruthy();
    });
    test('overlay.fontSize', 'invalidValue', () => {
      enforce((HERO_OVERLAY_FONT_SIZES as readonly string[]).includes(overlay?.fontSize as string)).isTruthy();
    });
  });
  omitWhen(model.properties?.height === undefined, () => {
    const height = model.properties.height;
    test('height', 'invalidValue', () => {
      const named = (HERO_HEIGHTS as readonly unknown[]).includes(height);
      enforce(named || (typeof height === 'number' && Number.isInteger(height) && height > 0)).isTruthy();
    });
  });
  omitWhen(model.properties?.focus === undefined, () => {
    test('focus', 'invalidValue', () => {
      enforce((HERO_FOCUSES as readonly unknown[]).includes(model.properties.focus)).isTruthy();
    });
  });

  // tbd: display: ImageDisplayConfig
  // tbd: action: ImageActionConfig
});
