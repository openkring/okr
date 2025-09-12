import { AsyncPipe } from '@angular/common';
import { Component, inject, input, output } from '@angular/core';
import { IonButton, IonIcon, IonItem, IonLabel, ModalController } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { string2stringArray } from '@bk2/shared-util-core';
import { ChipSelectModalComponent } from './chip-select.modal';

@Component({
  selector: 'bk-single-tag',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe,
    IonButton, IonIcon, IonLabel, IonItem
  ],
  template: `
  <ion-item lines="none">
  @if (tag) {
    <ion-button color="light" size="default" (click)="remove()">
      <ion-icon src="{{'close_cancel_circle' | svgIcon }}" />
      <ion-label>{{ tag | translate | async }}</ion-label>
    </ion-button>
  } @else {
    <ion-button color="light" size="default" (click)="addTag()">
      <ion-icon src="{{'search' | svgIcon }}" />
      <ion-label>{{ searchLabel() | translate | async }}</ion-label>
    </ion-button>
  }
  </ion-item>
  `
})
export class SingleTagComponent {
  protected modalController = inject(ModalController);
  public tags = input.required<string>(); // the list of available tag names, separated by comma
  public searchLabel = input('@general.operation.search.byTag');
  public selectedTag = output<string>(); // the selected tag name

  public tag = '';   // the model, ie the currently selected tag value

  public remove(): void {
    this.tag = '';
    this.selectedTag.emit('');
  }

  public async addTag() {
    const _modal = await this.modalController.create({
      component: ChipSelectModalComponent,
      cssClass: 'tag-modal',
      componentProps: {
        chips: string2stringArray(this.tags()),
        chipName: 'tag'
      }
    });
    _modal.present();
    const { data, role } = await _modal.onWillDismiss();
    if (role === 'confirm') {
      this.tag = data as string;
      this.selectedTag.emit(this.tag);
    }
  }
}
