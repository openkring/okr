import { IonContent } from '@ionic/angular';
import { fragmentScrollTop } from '@okr/cms-page-util';

export interface FragmentScrollOptions {
  /** px to keep free above the target (e.g. a sticky filter bar); read at every measurement */
  stickyOffset?: () => number;
  /** how long to wait for the target to appear in the DOM (ms) */
  findTimeoutMs?: number;
  /** how long to keep the target in place while images above it load and shift the layout (ms) */
  settleMs?: number;
}

const POLL_MS = 100;
const SMOOTH_MS = 400;
const TOLERANCE_PX = 4;
/** any of these on the scroll container means the user scrolls on their own */
const USER_EVENTS = ['touchstart', 'wheel', 'pointerdown', 'keydown'] as const;

/**
 * Scrolls `content` so that the element with id `fragment` (searched inside `host` only:
 * ion-router-outlet keeps the previous, hidden pages in the DOM) sits at the top.
 *
 * A single scroll after a fixed delay is not enough on slow devices (old iPhones):
 * - the target may not be rendered yet, or the ion-content not ready, during the page-enter
 *   transition → we poll until both exist (up to `findTimeoutMs`);
 * - images of the articles ABOVE the target load after the scroll and push it down →
 *   we keep correcting the position for `settleMs`, until the user touches/scrolls.
 *
 * Returns a cancel function (call it on destroy).
 */
export function scrollToFragment(
  host: HTMLElement,
  getContent: () => IonContent | undefined,
  fragment: string,
  options: FragmentScrollOptions = {}
): () => void {
  const findTimeoutMs = options.findTimeoutMs ?? 5000;
  const settleMs = options.settleMs ?? 3000;
  const stickyOffset = options.stickyOffset ?? (() => 0);
  const selector = `#${CSS.escape(fragment)}`;
  const started = Date.now();
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let scrollEl: HTMLElement | undefined;

  const stop = (): void => {
    cancelled = true;
    if (timer) clearTimeout(timer);
    if (scrollEl) USER_EVENTS.forEach(e => scrollEl?.removeEventListener(e, stop));
  };

  const targetTop = (el: HTMLElement, sEl: HTMLElement): number =>
    fragmentScrollTop(el.getBoundingClientRect().top, sEl.getBoundingClientRect().top, sEl.scrollTop, stickyOffset());

  // phase 2: hold the target in place while the layout settles
  const settle = (content: IonContent, sEl: HTMLElement, settleStart: number): void => {
    if (cancelled) return;
    if (Date.now() - settleStart > settleMs) { stop(); return; }
    // re-query every tick: a live Firestore update may re-render the sections (new nodes)
    const el = host.querySelector<HTMLElement>(selector);
    if (el) {
      const top = targetTop(el, sEl);
      if (Math.abs(top - sEl.scrollTop) > TOLERANCE_PX) void content.scrollToPoint(0, top, 0);
    }
    timer = setTimeout(() => settle(content, sEl, settleStart), POLL_MS);
  };

  // phase 1: wait for the target and the scroll container, then scroll smoothly once
  const find = async (): Promise<void> => {
    if (cancelled) return;
    const el = host.querySelector<HTMLElement>(selector);
    const content = getContent();
    if (!el || !content) {
      if (Date.now() - started > findTimeoutMs) {
        console.warn(`scrollToFragment: target #${fragment} not found after ${findTimeoutMs}ms`);
        stop();
        return;
      }
      timer = setTimeout(() => void find(), POLL_MS);
      return;
    }
    const sEl = await content.getScrollElement();
    if (cancelled) return;
    scrollEl = sEl;
    // the user takes over: stop correcting as soon as they touch or scroll themselves
    USER_EVENTS.forEach(e => sEl.addEventListener(e, stop, { passive: true, once: true }));
    void content.scrollToPoint(0, targetTop(el, sEl), SMOOTH_MS);
    timer = setTimeout(() => settle(content, sEl, Date.now()), SMOOTH_MS + POLL_MS);
  };

  timer = setTimeout(() => void find(), POLL_MS);
  return stop;
}
