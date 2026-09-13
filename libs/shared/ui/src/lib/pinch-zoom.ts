import { Directive, ElementRef, HostListener, effect, inject, input, signal, untracked } from '@angular/core';

import {
  applyPan, applyPinch, isZoomed, NO_ZOOM, PinchSample, pointerDistance, pointerMidpoint,
  toggleZoomAt, ZoomBounds, zoomTransform, ZoomPoint, ZoomState
} from '@okr/shared-util-core';

/** Two taps closer together than this (and barely moved) count as a double-tap. */
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_SLOP_PX = 24;

/**
 * Pinch-to-zoom and drag-to-pan for a single image, owned by the app instead of the browser.
 *
 * Put it on the element that frames the image and hand it the image itself:
 * `<div class="zoom-surface" [okrPinchZoom]="img" [resetKey]="url()"><img #img ... /></div>`.
 *
 * Why not just let the browser zoom the page: in an Ionic shell every layer is `position: fixed`,
 * so a browser pinch scales the visual viewport while the shell stays where it is — on iOS the UI
 * ends up stuck at an offset the user cannot scroll back from, and WebKit snaps the page scale
 * back to 1 on the next relayout, which looks like the view restarted. `touch-action: none` on the
 * surface plus the `gesture*` guards below keep WebKit out of the gesture entirely.
 *
 * The directive writes `transform` straight onto the target element (no change detection needed
 * for a 60 fps gesture) and resets to fit whenever `resetKey` changes, i.e. on every image change.
 */
@Directive({
  selector: '[okrPinchZoom]',
  standalone: true,
  host: {
    // the browser must not claim the touches for page scrolling/zooming — we handle them
    style: 'touch-action: none;',
  },
})
export class PinchZoom {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** The element that is transformed — normally the `<img>` inside the surface. */
  public target = input.required<HTMLElement>({ alias: 'okrPinchZoom' });
  /** Any value that identifies the shown image: when it changes, the zoom resets to fit. */
  public resetKey = input<unknown>(null);

  private readonly state = signal<ZoomState>(NO_ZOOM);
  /** live pointer positions, in css pixels relative to the centre of the surface */
  private readonly pointers = new Map<number, ZoomPoint>();
  private pinch: PinchSample | undefined;
  private drag: ZoomPoint | undefined;
  private lastTapAt = 0;
  private lastTapPoint: ZoomPoint | undefined;

  constructor() {
    // resetKey is the ONLY dependency: render() reads `state`, so without untracked every
    // gesture step would re-run this effect and snap the zoom back to fit.
    effect(() => {
      this.resetKey();
      untracked(() => this.reset());
    });
  }

  /** Back to the whole image — also called by the viewer before it pages to another image. */
  public reset(): void {
    this.state.set(NO_ZOOM);
    this.render();
  }

  /** True while the image is magnified; the viewer uses it to keep paging gestures out of the way. */
  public get zoomed(): boolean {
    return isZoomed(this.state());
  }

  @HostListener('pointerdown', ['$event'])
  protected onPointerDown(event: PointerEvent): void {
    (event.target as Element).setPointerCapture?.(event.pointerId);
    this.pointers.set(event.pointerId, this.toLocal(event));
    this.startGesture();
  }

  @HostListener('pointermove', ['$event'])
  protected onPointerMove(event: PointerEvent): void {
    if (!this.pointers.has(event.pointerId)) return;
    this.pointers.set(event.pointerId, this.toLocal(event));
    const bounds = this.bounds();
    if (!bounds) return;

    const points = [...this.pointers.values()];
    if (points.length >= 2 && this.pinch) {
      const current = this.sample(points[0], points[1]);
      this.state.set(applyPinch(this.state(), this.pinch, current, bounds));
      this.pinch = current;
      this.render();
    } else if (points.length === 1 && this.drag && this.zoomed) {
      const [point] = points;
      this.state.set(applyPan(this.state(), point.x - this.drag.x, point.y - this.drag.y, bounds));
      this.drag = point;
      this.render();
    }
  }

  @HostListener('pointerup', ['$event'])
  @HostListener('pointercancel', ['$event'])
  protected onPointerUp(event: PointerEvent): void {
    const released = this.pointers.get(event.pointerId);
    this.pointers.delete(event.pointerId);
    // one finger lifted off a pinch: re-seed from the fingers that are still down
    this.startGesture();
    if (event.type === 'pointerup' && released) this.handleTap(released);
  }

  /**
   * Safari zooms the PAGE on a two-finger gesture even with `touch-action: none`; only
   * preventing its proprietary gesture events stops that. Unknown outside WebKit — harmless.
   */
  @HostListener('gesturestart', ['$event'])
  @HostListener('gesturechange', ['$event'])
  @HostListener('gestureend', ['$event'])
  protected onGesture(event: Event): void {
    event.preventDefault();
  }

  /** (Re-)seed the in-flight gesture from the pointers that are currently down. */
  private startGesture(): void {
    const points = [...this.pointers.values()];
    this.pinch = points.length >= 2 ? this.sample(points[0], points[1]) : undefined;
    this.drag = points.length === 1 ? points[0] : undefined;
  }

  private sample(a: ZoomPoint, b: ZoomPoint): PinchSample {
    return { ...pointerMidpoint(a, b), distance: pointerDistance(a, b) };
  }

  /** Double-tap toggles between fit and a magnified view centred on the tapped point. */
  private handleTap(point: ZoomPoint): void {
    const now = Date.now();
    const previous = this.lastTapPoint;
    const isDouble = previous !== undefined && now - this.lastTapAt < DOUBLE_TAP_MS
      && pointerDistance(previous, point) < DOUBLE_TAP_SLOP_PX;
    this.lastTapAt = isDouble ? 0 : now;
    this.lastTapPoint = isDouble ? undefined : point;
    const bounds = this.bounds();
    if (!isDouble || !bounds) return;
    this.state.set(toggleZoomAt(this.state(), point, bounds));
    this.render();
  }

  /** Pointer position in css pixels relative to the centre of the surface. */
  private toLocal(event: PointerEvent): ZoomPoint {
    const rect = this.host.nativeElement.getBoundingClientRect();
    return { x: event.clientX - (rect.left + rect.width / 2), y: event.clientY - (rect.top + rect.height / 2) };
  }

  /**
   * Layout size of image and surface. `offsetWidth`/`offsetHeight` — NOT `getBoundingClientRect()`,
   * which already includes the transform we are about to recompute.
   */
  private bounds(): ZoomBounds | undefined {
    const target = this.target();
    const surface = this.host.nativeElement;
    if (!target.offsetWidth || !surface.clientWidth) return undefined;
    return {
      imageWidth: target.offsetWidth,
      imageHeight: target.offsetHeight,
      viewWidth: surface.clientWidth,
      viewHeight: surface.clientHeight,
    };
  }

  private render(): void {
    const target = this.target();
    const state = this.state();
    target.style.transform = zoomTransform(state);
    target.style.transformOrigin = 'center';
    target.style.willChange = isZoomed(state) ? 'transform' : '';
  }
}
