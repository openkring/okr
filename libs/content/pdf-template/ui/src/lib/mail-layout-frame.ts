// libs/content/pdf-template/ui/src/lib/mail-layout-frame.ts
import { Component, computed, DestroyRef, ElementRef, inject, input, signal, viewChild } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';

import { MAIL_LAYOUT_SLOT_ID } from '@okr/content-pdf-template-util';

/**
 * The head or the foot of the mail's template (Vorlage), shown in the editor above and below the blocks, so the sender writes
 * inside the frame the recipient will see (no separate preview segment any more).
 *
 * `html` is the template as the server renders it, with an empty marker (`MAIL_LAYOUT_SLOT_ID`) where the mail goes
 * (`withLayoutSlot`). Both parts show the same document: the head is cut off at the marker, the foot is scrolled to it.
 * The frame runs no script (sandbox without `allow-scripts`); `allow-same-origin` only lets this component measure it.
 * It takes no clicks: a link of the template is not meant to be followed while writing.
 */
@Component({
  selector: 'okr-mail-layout-frame',
  standalone: true,
  styles: [`
    :host { display: block; }
    iframe { display: block; width: 100%; border: 0; pointer-events: none; background: transparent; }
  `],
  template: `
    <iframe #frame [title]="title()" sandbox="allow-same-origin" scrolling="no" tabindex="-1" aria-hidden="true"
      [srcdoc]="doc()" [style.height.px]="height()" (load)="measure()"></iframe>
  `,
})
export class MailLayoutFrame {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly frame = viewChild.required<ElementRef<HTMLIFrameElement>>('frame');

  /** the rendered template with the marker */
  public readonly html = input.required<string>();
  /** 'top': what stands above the mail, 'foot': what stands below it */
  public readonly part = input.required<'top' | 'foot'>();
  public readonly title = input('');

  protected readonly height = signal(0);
  /** the parts never scroll inside the frame; the canvas scrolls them with the blocks */
  protected readonly doc = computed(() => this.sanitizer.bypassSecurityTrustHtml(
    this.html().replace(/<\/head>/i, '<style>html,body{overflow:hidden!important}</style></head>')));
  private resizeObserver: ResizeObserver | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.resizeObserver?.disconnect());
  }

  /** On load and whenever the frame's width changes (the device of the canvas): the height of the part, and the foot scrolled to it. */
  protected measure(): void {
    const iframe = this.frame().nativeElement;
    const doc = iframe.contentDocument;
    const slot = doc?.getElementById(MAIL_LAYOUT_SLOT_ID);
    if (!doc || !slot) return this.height.set(0);
    if (!this.resizeObserver) {
      this.resizeObserver = new ResizeObserver(() => this.measure());
      this.resizeObserver.observe(iframe);
    }
    const top = Math.round(slot.getBoundingClientRect().top + (iframe.contentWindow?.scrollY ?? 0));
    const total = Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight ?? 0);
    if (this.part() === 'top') {
      this.height.set(top);
    } else {
      this.height.set(Math.max(0, total - top));
      iframe.contentWindow?.scrollTo(0, top);
    }
  }
}
