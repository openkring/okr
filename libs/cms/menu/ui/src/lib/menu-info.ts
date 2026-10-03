import { Component, inject, input } from '@angular/core';
import { IonIcon, PopoverController } from '@ionic/angular/standalone';

import { SvgIconPipe } from '@okr/shared-pipes';

import { MenuInfoPopover } from './menu-info.popover';

/**
 * The info-circle of a menu row or sub-menu header (`MenuItemModel.info`). Place it with
 * `slot="end"` inside the `ion-item`; render it only when there is a text.
 *
 * The tap stops propagation, so it neither triggers the row's action, nor toggles an accordion,
 * nor lets a surrounding context-menu popover's `dismissOnSelect` close the menu. The text opens
 * through `PopoverController`, not an inline `ion-popover`: inside a context menu an inline one
 * becomes a nested popover — no backdrop, and dismissing it closes the menu too.
 *
 * Colour: `--okr-menu-info-color` (default medium), e.g. the contrast colour on a primary header.
 */
@Component({
  selector: 'okr-menu-info',
  standalone: true,
  imports: [IonIcon, SvgIconPipe],
  styles: [`
    :host { display: flex; align-items: center; margin-inline-start: 8px; }
    ion-icon { color: var(--okr-menu-info-color, var(--ion-color-medium)); cursor: pointer; font-size: 20px; }
  `],
  template: `
    <ion-icon src="{{ 'info-circle' | svgIcon }}" role="button" tabindex="0"
      [attr.aria-label]="text()" (click)="show($event)" (keydown.enter)="show($event)" />
  `,
})
export class MenuInfo {
  public readonly text = input.required<string>();

  private readonly popoverController = inject(PopoverController);

  protected async show(event: Event): Promise<void> {
    event.stopPropagation();
    event.preventDefault();
    const popover = await this.popoverController.create({
      component: MenuInfoPopover,
      componentProps: { text: this.text() },
      event,
      side: 'bottom',
      alignment: 'end',
    });
    await popover.present();
  }
}
