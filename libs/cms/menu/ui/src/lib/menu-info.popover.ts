import { Component, input } from '@angular/core';

/**
 * The info text of a menu row, opened from its info-circle (see `MultiAvatar`).
 * Created through `PopoverController`, not inline: an inline `ion-popover` inside a context menu
 * (itself a popover) becomes a nested popover — no backdrop, and dismissing it closes the menu too.
 */
@Component({
  selector: 'okr-menu-info-popover',
  standalone: true,
  styles: [`
    .info { padding: 12px 16px; max-width: 18rem; white-space: pre-line; line-height: 1.4; }
  `],
  template: `<div class="info">{{ text() }}</div>`,
})
export class MenuInfoPopover {
  public readonly text = input.required<string>();
}
