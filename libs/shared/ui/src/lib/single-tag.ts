import { Component, inject, input, model } from '@angular/core';
import { IonButton, IonIcon, IonLabel, ModalController } from '@ionic/angular/standalone';

import { SvgIconPipe } from '@bk2/shared-pipes';
import { string2stringArray } from '@bk2/shared-util-core';

import { ChipSelectModal } from './chip-select.modal';

@Component({
  selector: 'bk-single-tag',
  standalone: true,
  imports: [
    SvgIconPipe,
    IonButton, IonIcon, IonLabel
  ],
  template: `
  @if (selectedTag()) {
    <ion-button (click)="remove()" fill="clear">
      <ion-icon src="{{'cancel' | svgIcon }}" />
      <ion-label>{{ selectedTag() }}</ion-label>
    </ion-button>
  } @else {
    <ion-button (click)="add()" fill="clear">
      <ion-icon src="{{'search' | svgIcon }}" />
      <ion-label>{{ searchLabel() }}</ion-label>
    </ion-button>
  }
  `
})
export class SingleTag {
  protected modalController = inject(ModalController);

  // inputs
  public selectedTag = model.required<string>(); // the selected tag name
  public tags = input.required<string>(); // the list of available tag names, separated by comma
  public searchLabel = input('@general.operation.search.byTag');

  public remove(): void {
    this.selectedTag.set('');
  }

  public async add() {
    const modal = await this.modalController.create({
      component: ChipSelectModal,
      cssClass: 'tag-modal',
      componentProps: {
        chips: string2stringArray(this.tags()),
        chipName: 'tag'
      }
    });
    modal.present();
    const { data, role } = await modal.onWillDismiss();
    if (role === 'confirm') {
      this.selectedTag.set(data as string);
    }
  }
}
