import { Component, computed, inject, input } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { Header, HeaderI18n } from '@bk2/shared-ui';
import { SectionModel } from '@bk2/shared-models';

import { SectionDispatcher } from "./section-dispatcher";

@Component( {
  selector: 'bk-section-view-modal',
  standalone: true,
  imports: [
    IonContent,
    SectionDispatcher, Header
],
  template: `
    <bk-header [i18n]="headerI18n()" [isModal]="true" />
    <ion-content>
      <bk-section-dispatcher [section]="section()" [currentUser]="undefined" [editMode]="false" />
    </ion-content>
  `
} )
export class SectionViewModal {
  private modalController = inject(ModalController);

  // inputs
  public section = input.required<SectionModel>();
  public title = input.required<string>();

  // derived
  protected readonly headerI18n = computed(() => ({ title: this.title() } as HeaderI18n));

  public close(): void {
    this.modalController.dismiss(null, 'cancel');
  }
}
