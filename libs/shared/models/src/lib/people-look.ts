import type { AvatarConfig, PeopleFill, PeopleShape, PeopleSize, PeopleTextPosition } from './section.model';
import { PEOPLE_FILLS, PEOPLE_SHAPES, PEOPLE_SIZES, PEOPLE_TEXT_POSITIONS } from './section.model';

export interface PeopleLook {
  size: PeopleSize;
  shape: PeopleShape;
  fill: PeopleFill;
  grayscale: boolean;
  textPosition: PeopleTextPosition;
}

export const PEOPLE_SIZE_PX: Record<PeopleSize, number> = { S: 120, M: 200, L: 300 };
export const PEOPLE_SHAPE_RADIUS: Record<PeopleShape, string> = { round: '50%', rounded: '5px', square: '0' };

function sizeOf(stored: Partial<AvatarConfig>): PeopleSize {
  if (stored.size && PEOPLE_SIZES.includes(stored.size)) return stored.size;
  const w = stored.imgWidth;
  if (typeof w !== 'number' || !Number.isFinite(w) || w <= 160) return 'S';
  return w <= 250 ? 'M' : 'L';
}

function shapeOf(stored: Partial<AvatarConfig>): PeopleShape {
  if (stored.shape && PEOPLE_SHAPES.includes(stored.shape)) return stored.shape;
  const r = (stored.imgRadius ?? '').trim();
  if (r === '' || r === '50%') return 'round';
  if (r === '0' || r === '0px') return 'square';
  return 'rounded';
}

function fillOf(stored: Partial<AvatarConfig>): PeopleFill {
  if (stored.fill && PEOPLE_FILLS.includes(stored.fill)) return stored.fill;
  if (stored.background !== 'orgColor') return 'original';
  return stored.bgOrgColor === 'alternating' ? 'alternating' : 'primary';
}

function textPositionOf(stored: Partial<AvatarConfig>): PeopleTextPosition {
  if (stored.textPosition && PEOPLE_TEXT_POSITIONS.includes(stored.textPosition)) return stored.textPosition;
  switch (stored.infoPosition) {
    case 'right':
    case 'left':
      return 'right';
    case 'overlayTop':
    case 'overlayBottom':
      return 'overlay';
    default:
      return 'below';
  }
}

/** The look of a people section: a stored new field wins, else it is derived from the old fields, else the default. */
export function resolvePeopleLook(stored?: Partial<AvatarConfig>): PeopleLook {
  const s = stored ?? {};
  return {
    size: sizeOf(s),
    shape: shapeOf(s),
    fill: fillOf(s),
    grayscale: s.grayscale === true,
    textPosition: textPositionOf(s),
  };
}
