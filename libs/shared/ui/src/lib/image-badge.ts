import { Component, input } from '@angular/core';

/** The badge text of an image label, own keys only (a label like 'constructor' must not yield a function). */
export function badgeFor(badges: Record<string, string>, label: string): string | undefined {
  return Object.hasOwn(badges, label) ? badges[label] || undefined : undefined;
}

/**
 * A small rounded text badge laid over the bottom-right corner of an image (e.g. «❤ 2 · 💬 1»).
 * Defined once for `okr-img` and `okr-image-grid`; the host element must be positioned
 * (`position: relative`) unless `inline` is set, in which case the badge sits in the normal flow
 * (list rows). Dark pill with white text, so it stays readable on any photo.
 */
@Component({
  selector: 'okr-image-badge',
  standalone: true,
  styles: [`
    :host {
      position: absolute; right: 6px; bottom: 6px; z-index: 1;
      padding: 2px 8px; border-radius: 999px;
      background: rgba(0, 0, 0, 0.6); color: #fff;
      font-size: 0.75rem; line-height: 1.4; white-space: nowrap;
      pointer-events: none;
    }
    :host(.inline) { position: static; }
  `],
  host: { '[class.inline]': 'inline()' },
  template: `{{ text() }}`
})
export class ImageBadge {
  public text = input.required<string>();
  /** in the normal flow instead of laid over a corner */
  public inline = input(false);
}
