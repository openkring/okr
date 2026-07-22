import { describe, expect, it } from 'vitest';

import {
  clampToCanvas,
  createItem,
  createLabel,
  createSticker,
  createWhiteboard,
  DEFAULT_LABEL_HEIGHT,
  DEFAULT_STICKER_WIDTH,
  getWhiteboardIndex,
  getWhiteboardIndexInfo,
  isWhiteboard,
  itemCenter,
  zoneAtPoint,
  zoneOfItem,
} from './whiteboard.util';
import { FOUR_QUADRANT_WHITEBOARD, getWhiteboardTemplate } from './whiteboard-templates';

const TENANT = 'scs';

describe('createWhiteboard', () => {
  it('creates an empty blank board for the tenant by default', () => {
    const wb = createWhiteboard(TENANT, 'My board');
    expect(wb.name).toBe('My board');
    expect(wb.templateKey).toBe('');
    expect(wb.tenants).toEqual([TENANT]);
    expect(wb.items).toEqual([]);
  });

  it('clones template default items with fresh keys', () => {
    const template = getWhiteboardTemplate('four-quadrant');
    template.defaultItems = [createSticker(10, 10, 'seed')];
    const a = createWhiteboard(TENANT, 'A', 'four-quadrant');
    const b = createWhiteboard(TENANT, 'B', 'four-quadrant');
    expect(a.items).toHaveLength(1);
    expect(a.items[0].key).not.toBe(b.items[0].key); // fresh keys, no shared ids
    template.defaultItems = []; // restore the shared constant for other tests
  });
});

describe('createItem / createSticker / createLabel', () => {
  it('creates a sticker with the default sticker footprint', () => {
    const s = createSticker(100, 200, 'hello');
    expect(s.kind).toBe('sticker');
    expect(s.text).toBe('hello');
    expect(s.x).toBe(100);
    expect(s.y).toBe(200);
    expect(s.w).toBe(DEFAULT_STICKER_WIDTH);
  });

  it('creates a label with the default label height', () => {
    const l = createLabel(0, 0);
    expect(l.kind).toBe('label');
    expect(l.h).toBe(DEFAULT_LABEL_HEIGHT);
  });

  it('gives every item a distinct key', () => {
    expect(createItem('sticker', 0, 0).key).not.toBe(createItem('sticker', 0, 0).key);
  });
});

describe('itemCenter', () => {
  it('returns the geometric centre', () => {
    const s = { ...createSticker(0, 0), w: 100, h: 40 };
    expect(itemCenter(s)).toEqual({ x: 50, y: 20 });
  });
});

describe('zoneAtPoint / zoneOfItem', () => {
  const t = FOUR_QUADRANT_WHITEBOARD;

  it('maps points to the containing quadrant', () => {
    expect(zoneAtPoint(t, 10, 10)).toBe('q1');
    expect(zoneAtPoint(t, 900, 10)).toBe('q2');
    expect(zoneAtPoint(t, 10, 600)).toBe('q3');
    expect(zoneAtPoint(t, 900, 600)).toBe('q4');
  });

  it('returns "" for a point outside every zone', () => {
    expect(zoneAtPoint(t, 5000, 5000)).toBe('');
  });

  it('classifies an item by its centre — dragging across the axis reclassifies it', () => {
    const s = { ...createSticker(700, 400), w: 100, h: 40 }; // centre (750,420) → q1
    expect(zoneOfItem(t, s)).toBe('q1');
    const moved = { ...s, x: 800 }; // centre (850,420) → q2
    expect(zoneOfItem(t, moved)).toBe('q2');
  });
});

describe('clampToCanvas', () => {
  it('keeps an item fully inside the canvas', () => {
    const t = FOUR_QUADRANT_WHITEBOARD; // 1600 x 1000
    const off = { ...createSticker(-50, -50), w: 160, h: 120 };
    expect(clampToCanvas(t, off)).toEqual({ x: 0, y: 0 });
    const over = { ...createSticker(2000, 2000), w: 160, h: 120 };
    expect(clampToCanvas(t, over)).toEqual({ x: 1440, y: 880 });
  });
});

describe('isWhiteboard', () => {
  it('accepts a real whiteboard model', () => {
    expect(isWhiteboard(createWhiteboard(TENANT, 'x'), TENANT)).toBe(true);
  });

  it('rejects nullish and primitive values', () => {
    expect(isWhiteboard(null, TENANT)).toBe(false);
    expect(isWhiteboard(undefined, TENANT)).toBe(false);
    expect(isWhiteboard('nope', TENANT)).toBe(false);
    expect(isWhiteboard(42, TENANT)).toBe(false);
  });
});

describe('getWhiteboardIndex', () => {
  it('indexes the name and item texts', () => {
    const wb = createWhiteboard(TENANT, 'Retro');
    wb.items = [createSticker(0, 0, 'Keep'), createLabel(0, 0, 'Stop')];
    const index = getWhiteboardIndex(wb);
    expect(index).toContain('n:Retro');
    expect(index).toContain('Keep');
    expect(index).toContain('Stop');
  });

  it('omits the item segment when no item has text', () => {
    const wb = createWhiteboard(TENANT, 'Empty');
    expect(getWhiteboardIndex(wb)).not.toContain('it:');
  });
});

describe('getWhiteboardIndexInfo', () => {
  it('describes the index segments', () => {
    expect(getWhiteboardIndexInfo()).toContain('n:name');
    expect(getWhiteboardIndexInfo()).toContain('it:itemTexts');
  });
});
