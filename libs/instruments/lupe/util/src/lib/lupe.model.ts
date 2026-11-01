/** A zoom range; `step` is the finest increment the slider moves by. */
export interface ZoomRange {
  min: number;
  max: number;
  step: number;
}

/**
 * The subset of `MediaTrackCapabilities` the Lupe reads. `zoom` and `torch` are part of the
 * Image Capture spec and missing from TypeScript's `lib.dom`, so they are declared here.
 * Chrome on Android reports both; iOS Safari reports neither (digital zoom only, no flashlight).
 */
export interface CameraCapabilities {
  zoom?: { min?: number; max?: number; step?: number };
  torch?: boolean;
}

/** `MediaTrackConstraintSet` plus the Image Capture fields the Lupe sets through `applyConstraints`. */
export type ImageCaptureConstraintSet = MediaTrackConstraintSet & { zoom?: number | boolean; torch?: boolean };

/** What survives a reload, per device (local storage) — never stored in Firestore. */
export interface LupeSettings {
  zoom: number;
  torch: boolean;
}

/** Digital zoom (CSS scale on the video) where the camera has no hardware zoom. */
export const DIGITAL_ZOOM_RANGE: ZoomRange = { min: 1, max: 8, step: 0.1 };

/**
 * Upper cap on the native zoom (camera-preview plugin): an iPhone reports up to 100× digital zoom,
 * which turns the slider into a few useful millimetres; the iOS Magnifier stops around 15×.
 */
export const NATIVE_ZOOM_MAX = 15;

/** The `–`/`+` buttons move the slider by one tenth of its range. */
export const ZOOM_NOTCHES = 10;

export const DEFAULT_LUPE_SETTINGS: LupeSettings = { zoom: 1, torch: false };
