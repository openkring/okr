import { Component, inject, input } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { HeaderComponent } from '@bk2/shared-ui';
import { SectionModel } from '@bk2/shared-models';

import { SectionDispatcher } from "./section-dispatcher";

@Component( {
  selector: 'bk-section-view-modal',
  standalone: true,
  imports: [
    IonContent,
    SectionDispatcher, HeaderComponent
],
  template: `
    <bk-header [title]="title()" [isModal]="true" />
    <ion-content>
      <bk-section-dispatcher [section]="section()" [currentUser]="undefined" [editMode]="false" />
    </ion-content>
  `
} )
export class SectionViewModal {
  private modalController = inject(ModalController);

  // inputs
  public section = input.required<SectionModel>();
  public title = input('Preview');

  public close(): void {
    this.modalController.dismiss(null, 'cancel');
  }
}
