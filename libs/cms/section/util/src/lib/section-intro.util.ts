import { ImageActionType, ImageStyle, SectionIntroPosition } from '@okr/shared-models';

/** The intro of a section, resolved for display. */
export interface SectionIntro {
  text: string;
  position: SectionIntroPosition;
}

interface IntroSource {
  type?: string;
  intro?: string;
  introPosition?: SectionIntroPosition;
  properties?: unknown;
}

/**
 * The intro a section shows and where. Sections stored before the intro took over the «Überzeile» still carry it as
 * `properties.kicker` (hero, article, events, news); until the migration has run that text is shown above the title.
 */
export function getSectionIntro(section: IntroSource | undefined): SectionIntro {
  const intro = section?.intro?.trim() ?? '';
  if (intro) return { text: intro, position: section?.introPosition === 'above' ? 'above' : 'below' };
  if (section?.type === 'tiles') return { text: '', position: 'below' };   // a tiles kicker becomes its subtitle (migrate-tiles-section-fields)
  const legacy = (section?.properties as { kicker?: unknown } | undefined)?.kicker;
  const kicker = typeof legacy === 'string' ? legacy.trim() : '';
  return kicker ? { text: kicker, position: 'above' } : { text: '', position: 'below' };
}

/**
 * The hero background fills its container: no frame, no caption and no click action (a first section loads it first). Of the stored
 * image style only the extra imgix parameters reach it (the rest of the style belongs to the logo).
 */
export function heroBackgroundStyle(style: ImageStyle, extraImgIxParams = ''): ImageStyle {
  return {
    ...style,
    imgIxParams: [style.imgIxParams, extraImgIxParams].filter(Boolean).join('&'),
    width: '100%',
    height: 'auto',
    border: 'none',
    borderRadius: '0',
    isThumbnail: false,
    action: ImageActionType.None,
    captionPosition: 'none',
  };
}

/** The logo over the hero: width, border and corner radius from the stored style; never clickable, no caption. */
export function heroLogoStyle(style: ImageStyle): ImageStyle {
  return { ...style, isThumbnail: false, action: ImageActionType.None, captionPosition: 'none' };
}
