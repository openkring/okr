import { CameraCapabilities, DIGITAL_ZOOM_RANGE, NATIVE_ZOOM_MAX, ZOOM_NOTCHES, ZoomRange } from './lupe.model';

function isFinitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * The hardware zoom range the camera reports, or `undefined` when it has none (iOS Safari, most
 * desktop webcams) or only a single fixed level — the caller then falls back to digital zoom.
 */
export function hardwareZoomRange(capabilities: CameraCapabilities | undefined): ZoomRange | undefined {
  const zoom = capabilities?.zoom;
  if (!zoom || !isFinitePositive(zoom.min) || !isFinitePositive(zoom.max) || zoom.max <= zoom.min) return undefined;
  const step = isFinitePositive(zoom.step) ? zoom.step : 0.1;
  return { min: zoom.min, max: zoom.max, step };
}

/**
 * The slider range for the native camera-preview plugin (`getZoom()` min/max). Starts at 1× even
 * when an ultra-wide lens reports 0.5× (a magnifier never zooms out) and stops at `NATIVE_ZOOM_MAX`.
 * `undefined` when nothing above 1× is left.
 */
export function nativeZoomRange(min: number | undefined, max: number | undefined): ZoomRange | undefined {
  if (!isFinitePositive(min) || !isFinitePositive(max)) return undefined;
  const lower = Math.max(1, min);
  const upper = Math.min(NATIVE_ZOOM_MAX, max);
  return upper > lower ? { min: lower, max: upper, step: 0.1 } : undefined;
}

export function hasTorch(capabilities: CameraCapabilities | undefined): boolean {
  return capabilities?.torch === true;
}

/** The range the slider shows: hardware zoom when available, digital zoom otherwise. */
export function zoomRangeFor(capabilities: CameraCapabilities | undefined): ZoomRange {
  return hardwareZoomRange(capabilities) ?? DIGITAL_ZOOM_RANGE;
}

/** Clamps into the range and snaps to its step (rounded to avoid 1.2000000000000002). */
export function clampZoom(value: number, range: ZoomRange): number {
  if (!Number.isFinite(value)) return range.min;
  const clamped = Math.min(range.max, Math.max(range.min, value));
  const snapped = range.min + Math.round((clamped - range.min) / range.step) * range.step;
  return Math.round(Math.min(range.max, snapped) * 1000) / 1000;
}

/** One `–` (`direction = -1`) or `+` (`direction = 1`) press: a tenth of the range, at least one step. */
export function stepZoom(value: number, range: ZoomRange, direction: 1 | -1): number {
  const notch = Math.max(range.step, (range.max - range.min) / ZOOM_NOTCHES);
  return clampZoom(value + direction * notch, range);
}

/** «2.5×» — at most one decimal, no trailing «.0». */
export function formatZoom(value: number): string {
  return `${Math.round(value * 10) / 10}×`;
}
