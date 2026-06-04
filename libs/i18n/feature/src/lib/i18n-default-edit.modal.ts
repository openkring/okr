import { Component, computed, inject, input, linkedSignal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonButton, IonButtons, IonContent, IonInput, IonItem, IonLabel, IonTextarea, IonToggle, IonToolbar, ModalController } from '@ionic/angular/standalone';

import { Header } from '@bk2/shared-ui';
import { I18nDefaultModel } from '@bk2/shared-models';
import { deepEqual, safeStructuredClone } from '@bk2/shared-util-core';
import { I18nDefaultStore } from './i18n-default.store';

@Component({
  selector: 'bk-i18n-default-edit-modal',
  standalone: true,
  imports: [
    FormsModule,
    Header,
    IonContent, IonToolbar, IonButtons, IonButton,
    IonItem, IonLabel, IonInput, IonTextarea, IonToggle,
  ],
  providers: [I18nDefaultStore],
  template: `
    <bk-header [i18n]="{ title: '@i18n.default.edit.title' }" [isModal]="true" />
    <ion-content class="ion-padding">
      <ion-item>
        <ion-label position="stacked">{{ store.i18n.module() }}</ion-label>
        <ion-input [value]="formData().module" (ionInput)="onInput($event, 'module')" />
      </ion-item>
      <ion-item>
        <ion-label position="stacked">{{ store.i18n.key() }}</ion-label>
        <ion-input [value]="formData().key" (ionInput)="onInput($event, 'key')" />
      </ion-item>
      <ion-item>
        <ion-label position="stacked">DE</ion-label>
        <ion-textarea [value]="formData().de" (ionInput)="onInput($event, 'de')" autoGrow="true" />
      </ion-item>
      <ion-item>
        <ion-label position="stacked">EN</ion-label>
        <ion-textarea [value]="formData().en" (ionInput)="onInput($event, 'en')" autoGrow="true" />
      </ion-item>
      <ion-item>
        <ion-label position="stacked">FR</ion-label>
        <ion-textarea [value]="formData().fr" (ionInput)="onInput($event, 'fr')" autoGrow="true" />
      </ion-item>
      <ion-item>
        <ion-label position="stacked">ES</ion-label>
        <ion-textarea [value]="formData().es" (ionInput)="onInput($event, 'es')" autoGrow="true" />
      </ion-item>
      <ion-item>
        <ion-label position="stacked">IT</ion-label>
        <ion-textarea [value]="formData().it" (ionInput)="onInput($event, 'it')" autoGrow="true" />
      </ion-item>
      <ion-item>
        <ion-toggle [checked]="formData().isHtml" (ionChange)="onToggle($event)" />
        <ion-label>{{ store.i18n.is_html() }}</ion-label>
      </ion-item>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button (click)="cancel()">{{ store.i18n.cancel() }}</ion-button>
        </ion-buttons>
        <ion-buttons slot="end">
          <ion-button [disabled]="!isDirty()" (click)="save()" color="primary">
            {{ store.i18n.save() }}
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-content>
  `,
})
export class I18nDefaultEditModal {
  protected readonly store = inject(I18nDefaultStore);
  private readonly modalController = inject(ModalController);

  public item = input.required<I18nDefaultModel>();

  protected formData = linkedSignal(() => safeStructuredClone(this.item()) ?? {} as I18nDefaultModel);
  protected isDirty = computed(() => !deepEqual(this.formData(), safeStructuredClone(this.item())));

  protected onInput(event: Event, field: keyof I18nDefaultModel): void {
    this.formData.update(d => ({ ...d, [field]: (event as CustomEvent).detail.value ?? '' }));
  }

  protected onToggle(event: Event): void {
    this.formData.update(d => ({ ...d, isHtml: (event as CustomEvent).detail.checked }));
  }

  protected async save(): Promise<void> {
    await this.modalController.dismiss(this.formData(), 'confirm');
  }

  protected cancel(): void {
    this.modalController.dismiss(null, 'cancel');
  }
}
