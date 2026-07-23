import { WhiteboardItem } from '@okr/shared-models';

/**
 * A named region of a template's canvas. Zones make the blank whiteboard into a Persona / Journey /
 * Context / … canvas without new code (spec "Templates"). Which zone an item belongs to is derived
 * from its position (`zoneAtPoint`), never stored — dragging a sticker from zone A to zone B is
 * therefore a reclassification for free, not extra logic.
 *
 * Rectangles are in the same **unscaled canvas coordinates** as `WhiteboardItem` positions.
 */
export interface WhiteboardZone {
  id: string;        // stable zone key
  labelKey: string;  // i18n key for the zone caption (resolved via the store pattern, tenant-overridable)
  hintKey: string;   // i18n key for an optional coaching hint; '' = none
  x: number;         // zone rectangle, canvas coordinates
  y: number;
  w: number;
  h: number;
  color: string;     // zone tint; '' = no tint
}

/**
 * A declarative whiteboard template: a background (image/SVG url or drawn zones), a canvas size,
 * named zones and optional starter items. `WhiteboardModel.templateKey` references `key`.
 *
 * Templates are **code constants** in this lib (the shape is code; the placed items are data),
 * mirroring how the grid instruments keep their `GridDefinition`s in `util`. A future tenant-override
 * / CMS catalogue can layer on top without changing this contract.
 */
export interface WhiteboardTemplate {
  key: string;             // referenced by WhiteboardModel.templateKey; '' = the blank canvas
  labelKey: string;        // template display name (i18n key)
  descriptionKey: string;  // instruction / description (i18n key); '' = none
  backgroundUrl: string;   // background image/SVG url; '' = none (zones are drawn instead)
  width: number;           // canvas width in canvas units
  height: number;          // canvas height in canvas units
  zones: WhiteboardZone[];
  defaultItems: WhiteboardItem[]; // starter stickers/labels cloned onto a new board
}
