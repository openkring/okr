import { DestroyRef, ElementRef, Signal, afterNextRender, inject, signal } from '@angular/core';

/**
 * The host element's width in px, kept current by a ResizeObserver. 0 until the first render
 * (and on the server). Call from a constructor / field initializer — it needs an injection
 * context.
 *
 * The weather charts draw in real pixels rather than a fixed viewBox: a scaled viewBox shrinks
 * every axis label along with the chart, to ~3 px on a phone.
 */
export function hostWidth(): Signal<number> {
  const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  const destroyRef = inject(DestroyRef);
  const width = signal(0);
  afterNextRender(() => {
    width.set(host.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      // sub-pixel jitter would rebuild every chart for nothing
      if (Math.abs(w - width()) >= 1) width.set(w);
    });
    observer.observe(host);
    destroyRef.onDestroy(() => observer.disconnect());
  });
  return width.asReadonly();
}
