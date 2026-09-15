/**
 * Scroll position (scrollTop of the ion-content scroll element) that puts a fragment target
 * at the top of the visible area.
 *
 * Both rects are viewport-relative (`getBoundingClientRect().top`). Measuring the target
 * AGAINST the scroll container — instead of against the viewport — cancels everything that
 * sits above or moves the container: the ion-toolbar height and the translate of the
 * page-enter transition that is still running when the fragment effect fires.
 * Using the viewport top directly overshot by the toolbar height (+ the transition offset),
 * which hid the article's title/subtitle and, on short articles, showed the next article.
 */
export function fragmentScrollTop(targetTop: number, scrollElTop: number, scrollTop: number, stickyOffset = 0): number {
  return Math.max(0, targetTop - scrollElTop + scrollTop - stickyOffset);
}
