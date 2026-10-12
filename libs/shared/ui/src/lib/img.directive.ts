import { booleanAttribute, Directive, ElementRef, inject, input } from '@angular/core';

import { ENV } from '@okr/shared-config';
import { getDefaultIconUrl, getImgFallbackSrc } from '@okr/shared-util-core';

/**
 * Native replacement for the deprecated `ion-img` (removed in Ionic 10).
 * - lazy-loads and decodes off the main thread (`loading="lazy"`, `decoding="async"`);
 *   pass `eager` for images that are visible on first paint (logo, banner)
 * - swaps a broken image for `fallback` (default: the generic `other` icon) instead of
 *   showing the browser's broken-image glyph
 *
 * The host stays a plain `<img>`, so `ion-avatar` / `ion-thumbnail` size and crop it via their
 * `::slotted(img)` rules. Note that CSS like `ion-avatar img { … }` applies to it, while it never
 * reached the shadow-DOM image inside `ion-img`.
 * Like `ion-img` it renders as a block (an inline image leaves a baseline gap inside an avatar);
 * the inline style beats component CSS, so bind `[style.display]` to change it.
 *
 * Usage: <ion-avatar><img okrImg src="{{ key | avatar }}" alt="Avatar" /></ion-avatar>
 */
@Directive({
  selector: 'img[okrImg]',
  standalone: true,
  host: {
    '[attr.loading]': "eager() ? 'eager' : 'lazy'",
    'decoding': 'async',
    'style': 'display: block',
    '(error)': 'onError()',
  },
})
export class ImgDirective {
  private readonly env = inject(ENV);
  private readonly host = inject<ElementRef<HTMLImageElement>>(ElementRef);

  public readonly eager = input(false, { transform: booleanAttribute });
  public readonly fallback = input<string>();

  protected onError(): void {
    const img = this.host.nativeElement;
    const fallback = this.fallback() ?? getDefaultIconUrl(this.env.services.imgixBaseUrl);
    const next = getImgFallbackSrc(img.src, new URL(fallback, document.baseURI).href);
    if (next) img.src = next;
  }
}
