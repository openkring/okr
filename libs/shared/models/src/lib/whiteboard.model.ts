import { DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_TAGS, DEFAULT_TENANTS } from '@okr/shared-constants';
import { AvatarInfo } from './avatar-info';
import { NamedModel, OkrModel, PersistedModel, SearchableModel, TaggedModel } from './base.model';

/**
 * The kind of free-canvas object on a whiteboard.
 *
 * - `sticker` — a Post-it: a coloured card with wrapped text and a size (the default object).
 * - `label`   — standalone free text without card chrome (v1 scope: "stickers + labels").
 *
 * Arrows / connectors / freehand / images are deliberately NOT part of v1 — they would push the
 * renderer towards a canvas library (Konva). See the whiteboard spec, "Bibliotheken-Evaluation".
 */
export type WhiteboardItemKind = 'sticker' | 'label';

/**
 * One object on the canvas. Embedded in `WhiteboardModel.items` (D: embedded array, not a
 * subcollection — a board is small and always loaded whole, mirroring `InstrumentModel.topics`).
 *
 * Positions are in **unscaled canvas coordinates** (the pan/zoom transform lives on the viewport
 * wrapper, not on the item), so `x`/`y`/`w`/`h` are template-relative and stable across zoom.
 *
 * A move (drag) writes only `{ x, y }` back — last-write-wins per item on `pointerup` (no live
 * presence in v1). Which template **zone** an item sits in is NOT stored: it is derived from the
 * position via `zoneAtPoint` (@okr/instruments-whiteboard-util) — "drag from zone A to B =
 * reclassification" is a side effect of the hit-test, not extra state.
 */
export interface WhiteboardItem {
  key: string;              // local id, unique within the document
  kind: WhiteboardItemKind;
  text: string;             // sticker / label text ('' when unset)
  x: number;                // canvas x of the item's top-left (unscaled)
  y: number;                // canvas y of the item's top-left (unscaled)
  w: number;                // width in canvas units
  h: number;                // height in canvas units
  color: string;            // sticker fill tint / label text colour; '' = theme default
  ownerKey: string;         // optional person okey the item is assigned to; '' = unassigned
}

/**
 * A free-canvas whiteboard: a wall of draggable stickers and labels over an optional template
 * background. The **blank canvas** is the baseline for all designabetterbusiness.tools canvases —
 * a `templateKey` turns it into a Persona / Customer Journey / … canvas without new code.
 *
 * This is a SEPARATE primitive from the grid instruments (SWOT / PESTEL / BMC / Eisenhower, see
 * `InstrumentModel`): grids are list-per-cell with fractional ranks, the whiteboard is free x/y.
 * They may share the topic-card look and model factories, never the renderer (spec D1).
 */
export class WhiteboardModel implements OkrModel, PersistedModel, NamedModel, SearchableModel, TaggedModel {
  public okey = DEFAULT_KEY;
  public tenants = DEFAULT_TENANTS;
  public isArchived = false;
  public name = DEFAULT_NAME;
  public index = DEFAULT_INDEX;
  public tags = DEFAULT_TAGS;
  public notes = DEFAULT_NOTES;

  public description = '';
  public templateKey = '';               // WhiteboardTemplate key (@okr/instruments-whiteboard-util); '' = blank canvas

  public author: AvatarInfo | undefined; // the person who created/owns the whiteboard
  public visibility = '';                // extends visibility beyond author + privileged (see group.model)

  public items: WhiteboardItem[] = [];

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const WhiteboardCollection = 'whiteboards';
export const WhiteboardModelName = 'whiteboard';
