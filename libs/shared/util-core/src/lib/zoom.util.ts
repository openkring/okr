/**
 * Pure geometry for in-app pinch/pan zoom of a letterboxed image.
 *
 * Why this exists: the full-screen image viewer used to have no zoom of its own, so a pinch was
 * handled by the BROWSER as a page zoom. On iOS that scales the visual viewport while Ionic's
 * `position: fixed` shell stays put — the UI looks frozen at an offset the user cannot scroll
 * back from, and WebKit later snaps the page scale back to 1 on the next relayout (which reads
 * like the view "rebooted"). Owning the gesture keeps the browser out of it.
 *
 * The view transform is `translate(x px, y px) scale(scale)` with `transform-origin: center`,
 * so all coordinates here are CSS pixels relative to the CENTRE of the viewport.
 */
export interface ZoomState {
  /** 1 = fit (no zoom). */
  scale: number;
  /** horizontal offset in css pixels, relative to the centred image */
  x: number;
  /** vertical offset in css pixels */
  y: number;
}

/** The unzoomed state — also what every image change resets to. */
export const NO_ZOOM: ZoomState = { scale: 1, x: 0, y: 0 };

/** Upper bound of the zoom factor: beyond this the imgix rendition (w=2000) only gets blurrier. */
export const MAX_ZOOM_SCALE = 5;

/** Zoom factor a double-tap jumps to. */
export const DOUBLE_TAP_ZOOM_SCALE = 2.5;

/**
 * Rendered size of the letterboxed image and of the viewport around it, in css pixels.
 * The image is `object-fit: contain`, so at scale 1 it is fully visible and the offsets are 0.
 */
export interface ZoomBounds {
  imageWidth: number;
  imageHeight: number;
  viewWidth: number;
  viewHeight: number;
}

/** One point of a gesture, in css pixels relative to the centre of the viewport. */
export interface ZoomPoint {
  x: number;
  y: number;
}

/** The two-finger gesture state: midpoint (relative to the viewport centre) and finger distance. */
export interface PinchSample extends ZoomPoint {
  distance: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Largest offset that still keeps the scaled image covering the viewport on that axis.
 * When the scaled image is smaller than the viewport (an axis that is still letterboxed) the
 * only valid offset is 0 — the image stays centred instead of drifting into the black bars.
 */
function maxOffset(imageSize: number, viewSize: number, scale: number): number {
  return Math.max(0, (imageSize * scale - viewSize) / 2);
}

/**
 * Clamp a state into the valid range: scale within [1, MAX_ZOOM_SCALE], offsets within the
 * overhang of the scaled image. Every other function in this file ends with this, so an
 * out-of-range intermediate result can never reach the view.
 */
export function clampZoom(state: ZoomState, bounds: ZoomBounds): ZoomState {
  const scale = clamp(state.scale, 1, MAX_ZOOM_SCALE);
  const limitX = maxOffset(bounds.imageWidth, bounds.viewWidth, scale);
  const limitY = maxOffset(bounds.imageHeight, bounds.viewHeight, scale);
  return {
    scale,
    // `+ 0` normalises the -0 that clamping a negative offset to a 0 limit produces
    x: clamp(state.x, -limitX, limitX) + 0,
    y: clamp(state.y, -limitY, limitY) + 0,
  };
}

/** True once the user has zoomed in — the caller uses it to decide whether a drag pans or not. */
export function isZoomed(state: ZoomState): boolean {
  return state.scale > 1;
}

/**
 * Apply one pinch step: scale by the change in finger distance and follow the change in midpoint,
 * keeping the image point under the fingers under the fingers (focal-point zoom).
 *
 * With `p = translate + scale * u` (p = screen point, u = image point), holding `u` fixed while
 * the midpoint moves from `previous` to `current` gives
 * `translate' = current - scale' * (previous - translate) / scale`.
 *
 * A `previous.distance` of 0 (never produced by two distinct touches) would divide by zero, so
 * the step degenerates to a pure pan.
 */
export function applyPinch(state: ZoomState, previous: PinchSample, current: PinchSample, bounds: ZoomBounds): ZoomState {
  const factor = previous.distance > 0 ? current.distance / previous.distance : 1;
  const scale = clamp(state.scale * factor, 1, MAX_ZOOM_SCALE);
  // the effective factor after clamping — using the raw one would drift the focal point at the limits
  const applied = scale / state.scale;
  return clampZoom({
    scale,
    x: current.x - applied * (previous.x - state.x),
    y: current.y - applied * (previous.y - state.y),
  }, bounds);
}

/** Apply one pan step (a one-finger drag while zoomed in). */
export function applyPan(state: ZoomState, deltaX: number, deltaY: number, bounds: ZoomBounds): ZoomState {
  return clampZoom({ scale: state.scale, x: state.x + deltaX, y: state.y + deltaY }, bounds);
}

/**
 * Double-tap: zoom to DOUBLE_TAP_ZOOM_SCALE centred on the tapped point when fitted, back to fit
 * when already zoomed (at any level — a second double-tap always returns to the whole image).
 */
export function toggleZoomAt(state: ZoomState, point: ZoomPoint, bounds: ZoomBounds): ZoomState {
  if (isZoomed(state)) return NO_ZOOM;
  // at scale 1 the offsets are 0, so the image point under the tap is the tap itself
  return clampZoom({
    scale: DOUBLE_TAP_ZOOM_SCALE,
    x: -point.x * (DOUBLE_TAP_ZOOM_SCALE - 1),
    y: -point.y * (DOUBLE_TAP_ZOOM_SCALE - 1),
  }, bounds);
}

/** The css `transform` for a state — `transform-origin: center` is assumed. */
export function zoomTransform(state: ZoomState): string {
  return `translate(${state.x}px, ${state.y}px) scale(${state.scale})`;
}

/** Distance between two pointer positions (css pixels). */
export function pointerDistance(a: ZoomPoint, b: ZoomPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Midpoint between two pointer positions (css pixels). */
export function pointerMidpoint(a: ZoomPoint, b: ZoomPoint): ZoomPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
