import { WhiteboardItem, WhiteboardItemKind, WhiteboardModel } from '@okr/shared-models';
import { addIndexElement, isType } from '@okr/shared-util-core';

import { WhiteboardTemplate } from './whiteboard-template.model';
import { getWhiteboardTemplate } from './whiteboard-templates';

/*-------------------------- default item sizes --------------------------------*/

/** Default sticker footprint (canvas units) — a roughly square Post-it. */
export const DEFAULT_STICKER_WIDTH = 160;
export const DEFAULT_STICKER_HEIGHT = 120;
/** Default label footprint — a wide, short text line. */
export const DEFAULT_LABEL_WIDTH = 220;
export const DEFAULT_LABEL_HEIGHT = 44;

/*-------------------------- type guard --------------------------------*/

export function isWhiteboard(whiteboard: unknown, tenantId: string): whiteboard is WhiteboardModel {
  return isType(whiteboard, new WhiteboardModel(tenantId));
}

/*-------------------------- factories --------------------------------*/

/**
 * A new whiteboard for the tenant, optionally seeded from a template. The template's `defaultItems`
 * are cloned in with fresh keys so two boards from the same template never share item ids.
 */
export function createWhiteboard(tenantId: string, name = '', templateKey = ''): WhiteboardModel {
  const whiteboard = new WhiteboardModel(tenantId);
  whiteboard.name = name;
  whiteboard.templateKey = templateKey;
  const template = getWhiteboardTemplate(templateKey);
  whiteboard.items = template.defaultItems.map(item => ({ ...item, key: crypto.randomUUID() }));
  return whiteboard;
}

/** A new canvas item of the given kind at (x, y), sized to the kind's default footprint. */
export function createItem(kind: WhiteboardItemKind, x: number, y: number, text = ''): WhiteboardItem {
  const isLabel = kind === 'label';
  return {
    key: crypto.randomUUID(),
    kind,
    text,
    x,
    y,
    w: isLabel ? DEFAULT_LABEL_WIDTH : DEFAULT_STICKER_WIDTH,
    h: isLabel ? DEFAULT_LABEL_HEIGHT : DEFAULT_STICKER_HEIGHT,
    color: '',
    ownerKey: '',
  };
}

/** A new sticker at (x, y). */
export function createSticker(x: number, y: number, text = ''): WhiteboardItem {
  return createItem('sticker', x, y, text);
}

/** A new free-text label at (x, y). */
export function createLabel(x: number, y: number, text = ''): WhiteboardItem {
  return createItem('label', x, y, text);
}

/*-------------------------- geometry / zone hit-test --------------------------------*/

/** The centre point of an item (used for zone hit-testing). */
export function itemCenter(item: WhiteboardItem): { x: number; y: number } {
  return { x: item.x + item.w / 2, y: item.y + item.h / 2 };
}

/**
 * The id of the template zone containing point (x, y), or `''` if none. First match wins, so zones
 * should not overlap. This is the whole of "which quadrant is this sticker in" — a move recomputes
 * it for free, no persisted zone field (spec "Zone-Zuordnung … ergibt sich aus seiner Position").
 */
export function zoneAtPoint(template: WhiteboardTemplate, x: number, y: number): string {
  const zone = template.zones.find(z => x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h);
  return zone?.id ?? '';
}

/** The zone an item currently sits in (by its centre), or `''`. */
export function zoneOfItem(template: WhiteboardTemplate, item: WhiteboardItem): string {
  const center = itemCenter(item);
  return zoneAtPoint(template, center.x, center.y);
}

/**
 * Clamp an item's top-left so the item stays fully inside the template's canvas. Returns a new
 * `{ x, y }`; callers apply it on drag-end before persisting.
 */
export function clampToCanvas(template: WhiteboardTemplate, item: WhiteboardItem): { x: number; y: number } {
  const maxX = Math.max(0, template.width - item.w);
  const maxY = Math.max(0, template.height - item.h);
  return {
    x: Math.min(Math.max(0, item.x), maxX),
    y: Math.min(Math.max(0, item.y), maxY),
  };
}

/*-------------------------- search index --------------------------------*/

/** Build the search index for a whiteboard from its name and item texts. */
export function getWhiteboardIndex(whiteboard: WhiteboardModel): string {
  let index = '';
  index = addIndexElement(index, 'n', whiteboard.name);
  const texts = whiteboard.items.map(item => item.text).filter(text => text.length > 0).join(' ');
  if (texts.length > 0) {
    index = addIndexElement(index, 'it', texts);
  }
  return index;
}

/** Human-readable explanation of the index structure (for GUI info boxes). */
export function getWhiteboardIndexInfo(): string {
  return 'n:name, it:itemTexts';
}
