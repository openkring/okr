import { Component, computed, input } from '@angular/core';

/**
 * Read-only display of stored rich text (spec 1.170 §6.4). Bound with [innerHTML] WITHOUT bypassing
 * Angular's sanitizer, so scripts, event handlers and style attributes never reach the page — the same
 * rule the old editor's read-only mode and article-section follow.
 */
@Component({
  selector: 'okr-rich-text-view',
  standalone: true,
  styles: [`
    :host { display: block; }
    .content {
      -webkit-user-select: text; user-select: text;
      /* brand navy; mirrored for dark mode below (contrast 8.55:1 on #121212) */
      --okr-rich-text-heading-color: #25265e;
    }
    .content ::ng-deep h1, .content ::ng-deep h2, .content ::ng-deep h3,
    .content ::ng-deep h4, .content ::ng-deep h5, .content ::ng-deep h6 { color: var(--okr-rich-text-heading-color); margin: 16px 0 8px; }
    .content ::ng-deep p { margin: 0 0 12px; line-height: 1.5; }
    .content ::ng-deep ul, .content ::ng-deep ol { padding-left: 24px; margin: 0 0 12px; }
    .content ::ng-deep blockquote { margin: 0 0 12px; padding-left: 12px; border-left: 3px solid var(--ion-color-step-300, #b3b3b3); }
    .content ::ng-deep img { max-width: 100%; }
    @media (prefers-color-scheme: dark) {
      .content { --okr-rich-text-heading-color: #a9abe0; }
    }
  `],
  template: `
    @if (hasContent()) {
      <div class="content" [innerHTML]="value()"></div>
    }
  `,
})
export class RichTextView {
  /** Stored HTML. */
  public readonly value = input<string | undefined>('');

  protected readonly hasContent = computed(() => {
    const html = (this.value() ?? '').trim();
    return html.length > 0 && html !== '<p></p>';
  });
}
