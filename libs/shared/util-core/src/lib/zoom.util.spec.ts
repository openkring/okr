import { describe, expect, it } from 'vitest';

import {
  applyPan, applyPinch, clampZoom, DOUBLE_TAP_ZOOM_SCALE, isZoomed, MAX_ZOOM_SCALE, NO_ZOOM,
  pointerDistance, pointerMidpoint, toggleZoomAt, ZoomBounds, zoomTransform
} from './zoom.util';

// a 800x600 image letterboxed into a 800x1000 viewport (portrait phone, landscape photo)
const BOUNDS: ZoomBounds = { imageWidth: 800, imageHeight: 600, viewWidth: 800, viewHeight: 1000 };

describe('clampZoom', () => {
  it('never scales below fit', () => {
    expect(clampZoom({ scale: 0.2, x: 0, y: 0 }, BOUNDS).scale).toBe(1);
  });

  it('caps the scale at MAX_ZOOM_SCALE', () => {
    expect(clampZoom({ scale: 42, x: 0, y: 0 }, BOUNDS).scale).toBe(MAX_ZOOM_SCALE);
  });

  it('keeps a fitted image centred — no drift into the letterbox bars', () => {
    expect(clampZoom({ scale: 1, x: 300, y: -200 }, BOUNDS)).toEqual(NO_ZOOM);
  });

  it('allows exactly the overhang of the scaled image', () => {
    // at scale 2 the image is 1600x1200 -> overhang (1600-800)/2 = 400 horizontally,
    // (1200-1000)/2 = 100 vertically
    expect(clampZoom({ scale: 2, x: 999, y: 999 }, BOUNDS)).toEqual({ scale: 2, x: 400, y: 100 });
    expect(clampZoom({ scale: 2, x: -999, y: -999 }, BOUNDS)).toEqual({ scale: 2, x: -400, y: -100 });
  });

  it('pins an axis that is still letterboxed at 0', () => {
    // at scale 1.2 the image is 960x720 — taller than 720 is still below the 1000 viewport
    expect(clampZoom({ scale: 1.2, x: 0, y: 50 }, BOUNDS).y).toBe(0);
  });
});

describe('applyPinch', () => {
  it('scales by the ratio of the finger distances', () => {
    const zoomed = applyPinch(NO_ZOOM, { x: 0, y: 0, distance: 100 }, { x: 0, y: 0, distance: 200 }, BOUNDS);
    expect(zoomed.scale).toBe(2);
  });

  it('keeps the pinched image point under the fingers', () => {
    // pinch centred 100px right of the middle, doubling the scale, fingers staying put:
    // the image point at +100 must still sit at +100 -> offset = 100 - 2*100 = -100
    const zoomed = applyPinch(NO_ZOOM, { x: 100, y: 0, distance: 100 }, { x: 100, y: 0, distance: 200 }, BOUNDS);
    expect(zoomed.scale).toBe(2);
    expect(zoomed.x).toBe(-100);
  });

  it('follows the midpoint when the fingers move without changing distance', () => {
    const zoomed = { scale: 2, x: 0, y: 0 };
    const panned = applyPinch(zoomed, { x: 0, y: 0, distance: 100 }, { x: 30, y: 20, distance: 100 }, BOUNDS);
    expect(panned.scale).toBe(2);
    expect(panned.x).toBe(30);
    expect(panned.y).toBe(20);
  });

  it('does not drift the focal point when the scale is clamped at the maximum', () => {
    const atMax = { scale: MAX_ZOOM_SCALE, x: 0, y: 0 };
    const pinched = applyPinch(atMax, { x: 0, y: 0, distance: 100 }, { x: 0, y: 0, distance: 400 }, BOUNDS);
    expect(pinched).toEqual(atMax);
  });

  it('degenerates to a pan when the previous distance is zero', () => {
    const pinched = applyPinch({ scale: 2, x: 0, y: 0 }, { x: 0, y: 0, distance: 0 }, { x: 10, y: 0, distance: 50 }, BOUNDS);
    expect(pinched.scale).toBe(2);
    expect(pinched.x).toBe(10);
  });

  it('cannot be pinched out past fit', () => {
    const pinched = applyPinch({ scale: 1.5, x: 100, y: 0 }, { x: 0, y: 0, distance: 300 }, { x: 0, y: 0, distance: 10 }, BOUNDS);
    expect(pinched).toEqual(NO_ZOOM);
  });
});

describe('applyPan', () => {
  it('moves by the drag delta', () => {
    expect(applyPan({ scale: 2, x: 0, y: 0 }, 50, -40, BOUNDS)).toEqual({ scale: 2, x: 50, y: -40 });
  });

  it('stops at the image edge instead of dragging the image off screen', () => {
    expect(applyPan({ scale: 2, x: 380, y: 0 }, 100, 0, BOUNDS).x).toBe(400);
  });

  it('is a no-op while fitted', () => {
    expect(applyPan(NO_ZOOM, 80, 80, BOUNDS)).toEqual(NO_ZOOM);
  });
});

describe('toggleZoomAt', () => {
  it('zooms to the tapped point when fitted', () => {
    const zoomed = toggleZoomAt(NO_ZOOM, { x: 100, y: 50 }, BOUNDS);
    expect(zoomed.scale).toBe(DOUBLE_TAP_ZOOM_SCALE);
    expect(zoomed.x).toBe(-100 * (DOUBLE_TAP_ZOOM_SCALE - 1));
  });

  it('returns to fit from any zoom level', () => {
    expect(toggleZoomAt({ scale: 1.2, x: 10, y: 0 }, { x: 0, y: 0 }, BOUNDS)).toEqual(NO_ZOOM);
    expect(toggleZoomAt({ scale: MAX_ZOOM_SCALE, x: 0, y: 0 }, { x: 0, y: 0 }, BOUNDS)).toEqual(NO_ZOOM);
  });
});

describe('isZoomed', () => {
  it('is false at fit and true above it', () => {
    expect(isZoomed(NO_ZOOM)).toBe(false);
    expect(isZoomed({ scale: 1.01, x: 0, y: 0 })).toBe(true);
  });
});

describe('zoomTransform', () => {
  it('renders translate before scale so the offsets stay in screen pixels', () => {
    expect(zoomTransform({ scale: 2, x: 10, y: -5 })).toBe('translate(10px, -5px) scale(2)');
  });
});

describe('pointer helpers', () => {
  it('computes distance and midpoint of two pointers', () => {
    expect(pointerDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(pointerMidpoint({ x: 0, y: 0 }, { x: 10, y: 20 })).toEqual({ x: 5, y: 10 });
  });
});
