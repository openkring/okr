import { Component, inject, input } from '@angular/core';
import { IonIcon, ModalController } from '@ionic/angular/standalone';

import { SvgIconPipe } from '@okr/shared-pipes';

/**
 * The info-circle of a menu row or sub-menu header (`MenuItemModel.info`). Place it with
 * `slot="end"` inside the `ion-item`; render it only when there is a text.
 *
 * The tap stops propagation, so it neither triggers the row's action, nor toggles an accordion,
 * nor lets a surrounding context-menu popover's `dismissOnSelect` close the menu. The HTML opens
 * in `MenuInfoModal`, imported on the first tap so it stays out of the boot bundle.
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
  /** the info as HTML (already translated) */
  public readonly text = input.required<string>();
  /** the menu item's label, shown as the modal title */
  public readonly title = input('');

  private readonly modalController = inject(ModalController);

  protected async show(event: Event): Promise<void> {
    event.stopPropagation();
    event.preventDefault();
    const { MenuInfoModal } = await import('./menu-info.modal');
    const modal = await this.modalController.create({
      component: MenuInfoModal,
      componentProps: { html: this.text(), title: this.title() },
    });
    await modal.present();
  }
}
