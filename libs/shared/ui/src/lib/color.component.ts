import { AsyncPipe } from '@angular/common';
import { Component, inject, input, model, output } from '@angular/core';
import { IonChip, IonItem, IonLabel, ModalController } from '@ionic/angular/standalone';
import { vestFormsViewProviders } from 'ngx-vest-forms';

import { TranslatePipe } from '@bk2/shared-i18n';
import { error } from '@bk2/shared-util-angular';
import { ColorSelectModalComponent } from './color-select.modal';

/**
 * Color is in hex format e.g. #FF0000 for red.
 * The color picker is a simple input field with a color picker.
 */
@Component({
  selector: 'bk-color',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    IonItem, IonLabel, IonChip
  ],
  styles: [`
    ion-chip {
      width: 32px;
      border-color: black;
      border-style: solid;
      border-width: 1px;
    }
  `],
  viewProviders: [vestFormsViewProviders],
  template: `
    <ion-item lines="none">
      <ion-label>{{ label() | translate | async }}</ion-label>
      <ion-chip (click)="selectColor()" style="background-color: {{ hexColor() }}" />
      <ion-label>{{ hexColor() }}</ion-label>
    </ion-item>
  `
})
export class ColorComponent {
  private readonly modalController = inject(ModalController);

  public hexColor = model<string | undefined>('#ffffcc');
  public label = input('@input.color.label');
  public changed = output<string>();
  public readOnly = input(false);

  public async selectColor(): Promise<void> {
    if (this.readOnly() === false) {
      const _modal = await this.modalController.create({
        component: ColorSelectModalComponent,
        cssClass: 'color-modal',
        componentProps: {
          hexColor: this.hexColor()
        }
      });
      _modal.present();
      try {
        const { data, role} = await _modal.onWillDismiss();
        if (role === 'confirm') {
          this.hexColor.set(data);
          this.changed.emit(data);
        }
      }
      catch (_ex) {
        error(undefined, 'BkColorComponent.selectColor -> ERROR: ' + JSON.stringify(_ex));
      }
    }
  }
}
