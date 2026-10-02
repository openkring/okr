/**
 * Scroll-freeze instrumentation.
 *
 * Symptom this exists for: occasionally the app stops scrolling — in a modal or on a list —
 * while clicks keep working, and only a browser reload restores it. A live session on
 * 2026-10-01 (`/accounting/scs/account/c-account`) measured the frozen state and ruled out
 * every static explanation:
 *
 * - `<body class="">` — Ionic's `backdrop-no-scroll` lock was NOT leaked.
 * - the page's own `.inner-scroll` was healthy: `overflow-y: auto`, `touch-action: manipulation`,
 *   5139px of content in an 884px box, and `el.scrollTop = 0` scrolled it VISIBLY.
 * - no overlay, no `ion-backdrop`, and `elementFromPoint` over the list returned the ordinary
 *   `ion-item` of that very list — nothing was covering it.
 *
 * So the scroller is fine and simply never receives the input. The one measurement that
 * separates the two remaining explanations could not be taken after the fact: a bubble-phase
 * `window.onwheel` counter read 0 while frozen and 363 after a reload, but a bubble handler
 * cannot distinguish "no wheel event was generated at all" from "a capture-phase listener
 * called stopPropagation() before the event reached window". That distinction needs a listener
 * installed BEFORE the freeze, in the capture phase on `window` — which is the first position
 * in the dispatch order, so nothing can hide an event from it.
 *
 * Hence this module: two always-on passive counters, plus `__okrScrollState()` to read the
 * whole picture in one call at the moment of the next freeze.
 *
 * The listeners are `passive: true` and never call `preventDefault`/`stopPropagation`, so the
 * instrument cannot itself become the cause. `capture: true` is what makes the reading
 * trustworthy.
 */

type WheelWitness = {
  /** Events seen in the capture phase on `window` — the earliest observable point. */
  seen: number;
  /** How many of those already had `defaultPrevented` set when they passed `window`. */
  prevented: number;
  /** Tag name of the last event target, to confirm the pointer was over the app. */
  lastTarget: string;
  /** `performance.now()` of the last event; stale value ⇒ nothing arrived recently. */
  lastAtMs: number;
};

const wheel: WheelWitness = { seen: 0, prevented: 0, lastTarget: '', lastAtMs: 0 };
const touch: WheelWitness = { seen: 0, prevented: 0, lastTarget: '', lastAtMs: 0 };

function record(witness: WheelWitness, event: Event): void {
  witness.seen++;
  if (event.defaultPrevented) witness.prevented++;
  witness.lastTarget = (event.target as Element | null)?.tagName ?? '';
  witness.lastAtMs = Math.round(performance.now());
}

/** One `ion-content` and the state of the scroll part inside its shadow root. */
function describeContent(content: Element, index: number) {
  const scroll = content.shadowRoot?.querySelector('.inner-scroll');
  if (!scroll) return { index, note: 'no .inner-scroll (not hydrated?)' };
  const style = getComputedStyle(scroll);
  return {
    index,
    // scrollHeight === clientHeight means there is genuinely nothing to scroll — a collapsed
    // layout, NOT a blocked scroller. The two look identical to the user.
    scrollHeight: scroll.scrollHeight,
    clientHeight: scroll.clientHeight,
    scrollTop: scroll.scrollTop,
    overflowY: style.overflowY,
    touchAction: style.touchAction,
    overscrollBehaviorY: style.overscrollBehaviorY,
    /** Which page it belongs to — a hidden page's content is expected to be unreachable. */
    pageHidden: !!content.closest('.ion-page.ion-page-hidden'),
  };
}

function scrollState() {
  const contents = Array.from(document.querySelectorAll('ion-content'));
  return {
    wheel: { ...wheel },
    touchmove: { ...touch },
    bodyClass: document.body.className,
    bodyOverflow: getComputedStyle(document.body).overflow,
    htmlOverflow: getComputedStyle(document.documentElement).overflow,
    // Ionic hides inactive routed views with `ion-page-hidden`. More than one page WITHOUT it
    // means several views are displayed at once — the signature of an interrupted transition.
    pages: Array.from(document.querySelectorAll('.ion-page')).map(p => p.className),
    contents: contents.map(describeContent),
    overlays: Array.from(document.querySelectorAll('ion-modal,ion-popover,ion-action-sheet,ion-alert,ion-loading,ion-backdrop'))
      .map(e => `${e.tagName}${e.classList.contains('overlay-hidden') ? ':hidden' : ':VISIBLE'}`),
  };
}

/**
 * Arms the counters and hangs `__okrScrollState()` / `__okrScrollReset()` on `window`.
 *
 * WHY CALLED FROM A FUNCTION AND NOT AT MODULE LEVEL: `libs/shared/util-angular/package.json`
 * declares `"sideEffects": false`, so a module-level registration is free to be dropped by the
 * bundler — exactly what happened to the Firestore monitor in v7.19.3/v7.19.4 (see
 * `registerConsoleAccess` in `@okr/shared-data-access`). Called from `AppStore`'s `onInit`, the
 * registration hangs off a genuinely used export and survives tree-shaking.
 *
 * Deliberately armed in production builds too: the freeze has only been seen in dev so far, but
 * nothing established that it is dev-only, and a dev-only instrument would be unavailable on the
 * day it happens live. It reads nothing but its own counters and public layout geometry.
 */
export function installScrollDiagnostics(): void {
  if (typeof window === 'undefined') return;
  const w = window as unknown as Record<string, unknown>;
  // The registration is its own guard — no extra module flag, which tests could not reset.
  if (typeof w['__okrScrollState'] === 'function') return;

  window.addEventListener('wheel', e => record(wheel, e), { capture: true, passive: true });
  window.addEventListener('touchmove', e => record(touch, e), { capture: true, passive: true });

  w['__okrScrollState'] = () => scrollState();
  w['__okrScrollReset'] = () => {
    Object.assign(wheel, { seen: 0, prevented: 0, lastTarget: '', lastAtMs: 0 });
    Object.assign(touch, { seen: 0, prevented: 0, lastTarget: '', lastAtMs: 0 });
  };

  // One line so a captured console proves the instrument was loaded, rather than leaving
  // "no counters" ambiguous between missing and unread.
  console.info('[okr] Scroll-Diagnose bereit: __okrScrollState() · __okrScrollReset()');
}
