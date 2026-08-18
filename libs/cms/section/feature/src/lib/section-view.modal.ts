import { Component, computed, inject, input } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { Header, HeaderI18n } from '@okr/shared-ui';
import { SectionModel } from '@okr/shared-models';
import { AppStore } from '@okr/shared-feature';

import { SectionDispatcher } from "./section-dispatcher";

@Component( {
  selector: 'okr-section-view-modal',
  standalone: true,
  imports: [
    IonContent,
    SectionDispatcher, Header
],
  template: `
    <okr-header [i18n]="headerI18n()" [isModal]="true" />
    <ion-content>
      <okr-section-dispatcher [section]="section()" [currentUser]="appStore.currentUser()" [editMode]="false" />
    </ion-content>
  `
} )
export class SectionViewModal {
  private readonly modalController = inject(ModalController);
  protected readonly appStore = inject(AppStore);

  // inputs
  public section = input.required<SectionModel>();
  public title = input.required<string>();

  // derived
  protected readonly headerI18n = computed(() => ({ title: this.title() } as HeaderI18n));

  public close(): void {
    this.modalController.dismiss(null, 'cancel');
  }
}
