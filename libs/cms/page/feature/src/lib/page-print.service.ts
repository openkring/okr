import { Injectable } from '@angular/core';
import { SectionModel } from '@bk2/shared-models';
import {
  PagePrintContext,
  PagePrintPayload,
  PagePrintSection,
  assemblePagePrintPayload,
  isPrintableSectionType,
  serializeComputedStyle,
  canvasToImg,
} from '@bk2/cms-page-util';

/**
 * Builds the page-print payload from the already-rendered page DOM (Approach A).
 * It walks the rendered `bk-section-dispatcher` hosts inside `root`, pairs them
 * with the ordered visible sections, captures each printable section's markup
 * (computed styles inlined, canvases converted to images, scripts stripped),
 * and assembles the pre-formatted payload for the `page-print` template.
 */
@Injectable({ providedIn: 'root' })
export class PagePrintService {

  public buildPayload(
    root: HTMLElement,
    visibleSections: SectionModel[],
    ctx: PagePrintContext,
  ): PagePrintPayload {
    // Only top-level section hosts: a nested accordion section renders as a
    // <bk-section-dispatcher> inside its parent's host, so we exclude any host
    // that has an ancestor host. The remaining top-level hosts line up 1:1 with
    // `visibleSections` (which the caller already filtered for nesting + state).
    const hosts = Array.from(root.querySelectorAll('bk-section-dispatcher'))
      .filter(h => h.parentElement?.closest('bk-section-dispatcher') == null);
    const sections: PagePrintSection[] = [];

    hosts.forEach((host, i) => {
      const model = visibleSections[i];
      if (!model || !isPrintableSectionType(model.type)) return;
      const html = this.captureSectionHtml(host as HTMLElement);
      if (html.trim().length === 0) return;
      sections.push({ title: model.title ?? '', html });
    });

    return assemblePagePrintPayload(ctx, sections);
  }

  /** Clone a section host, inline computed styles, convert canvases, strip scripts. */
  private captureSectionHtml(hostEl: HTMLElement): string {
    const clone = hostEl.cloneNode(true) as HTMLElement;
    // Order matters: inline styles first (relies on original↔clone node lists
    // staying index-aligned), THEN replace canvases — which mutates the clone's
    // structure and would break that alignment if run first.
    this.inlineStylesDeep(hostEl, clone);
    this.replaceCanvases(hostEl, clone);
    clone.querySelectorAll('script').forEach(el => el.remove());
    return clone.innerHTML;
  }

  /** Copy computed styles from each original element onto the matching clone. */
  private inlineStylesDeep(original: HTMLElement, clone: HTMLElement): void {
    const originals = [original, ...Array.from(original.querySelectorAll<HTMLElement>('*'))];
    const clones = [clone, ...Array.from(clone.querySelectorAll<HTMLElement>('*'))];
    for (let i = 0; i < originals.length && i < clones.length; i++) {
      const css = serializeComputedStyle(window.getComputedStyle(originals[i]));
      const existing = clones[i].getAttribute('style') ?? '';
      clones[i].setAttribute('style', existing + css);
    }
  }

  /** Replace each <canvas> in the clone with an <img> snapshot of the original. */
  private replaceCanvases(original: HTMLElement, clone: HTMLElement): void {
    const origCanvases = Array.from(original.querySelectorAll('canvas'));
    const cloneCanvases = Array.from(clone.querySelectorAll('canvas'));
    for (let i = 0; i < origCanvases.length && i < cloneCanvases.length; i++) {
      try {
        const img = canvasToImg(origCanvases[i] as HTMLCanvasElement, document);
        cloneCanvases[i].replaceWith(img);
      } catch {
        cloneCanvases[i].remove(); // tainted/empty canvas — best-effort
      }
    }
  }
}
