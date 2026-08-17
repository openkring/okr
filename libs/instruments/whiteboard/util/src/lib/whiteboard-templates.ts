import { WhiteboardTemplate } from './whiteboard-template.model';

/**
 * The blank canvas — the baseline for every whiteboard. No zones, no background: a plain wall to
 * stick notes on. `WhiteboardModel.templateKey === ''` resolves here.
 */
export const BLANK_WHITEBOARD: WhiteboardTemplate = {
  key: '',
  labelKey: '@instruments/whiteboard/util.template.blank.label',
  descriptionKey: '@instruments/whiteboard/util.template.blank.desc',
  backgroundUrl: '',
  width: 1920,
  height: 1080,
  zones: [],
  defaultItems: [],
};

/**
 * A simple 2×2 quadrant template (e.g. value/effort, impact/effort). Proves the zone hit-test:
 * dragging a sticker across the axis reclassifies it. Zone tints match the four Ionic accent hints.
 */
export const FOUR_QUADRANT_WHITEBOARD: WhiteboardTemplate = {
  key: 'four-quadrant',
  labelKey: '@instruments/whiteboard/util.template.fourQuadrant.label',
  descriptionKey: '@instruments/whiteboard/util.template.fourQuadrant.desc',
  backgroundUrl: '',
  width: 1600,
  height: 1000,
  zones: [
    { id: 'q1', labelKey: '@instruments/whiteboard/util.template.fourQuadrant.q1', hintKey: '', x: 0,   y: 0,   w: 800, h: 500, color: 'var(--ion-color-success)' },
    { id: 'q2', labelKey: '@instruments/whiteboard/util.template.fourQuadrant.q2', hintKey: '', x: 800, y: 0,   w: 800, h: 500, color: 'var(--ion-color-warning)' },
    { id: 'q3', labelKey: '@instruments/whiteboard/util.template.fourQuadrant.q3', hintKey: '', x: 0,   y: 500, w: 800, h: 500, color: 'var(--ion-color-tertiary)' },
    { id: 'q4', labelKey: '@instruments/whiteboard/util.template.fourQuadrant.q4', hintKey: '', x: 800, y: 500, w: 800, h: 500, color: 'var(--ion-color-medium)' },
  ],
  defaultItems: [],
};

/** The v1 template catalogue (code constants; tenant/CMS overrides can layer on later). */
export const WHITEBOARD_TEMPLATES: WhiteboardTemplate[] = [BLANK_WHITEBOARD, FOUR_QUADRANT_WHITEBOARD];

/** Resolve a template by key. Unknown keys (incl. `''`) fall back to the blank canvas. */
export function getWhiteboardTemplate(key: string): WhiteboardTemplate {
  return WHITEBOARD_TEMPLATES.find(template => template.key === key) ?? BLANK_WHITEBOARD;
}
