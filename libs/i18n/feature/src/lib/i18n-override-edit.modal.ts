import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonButton, IonButtons, IonContent, IonInput, IonItem,
  IonLabel, IonTextarea, IonToggle, IonToolbar, ModalController,
} from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { Header } from '@bk2/shared-ui';
import { I18nTenantOverrideModel } from '@bk2/shared-models';
import { deepEqual, safeStructuredClone } from '@bk2/shared-util-core';

@Component({
  selector: 'bk-i18n-override-edit-modal',
  standalone: true,
  imports: [
    AsyncPipe, FormsModule, TranslatePipe,
    Header,
    IonContent, IonToolbar, IonButtons, IonButton,
    IonItem, IonLabel, IonInput, IonTextarea, IonToggle,
  ],
  template: `
    <bk-header title="@i18n.override.edit.title" [isModal]="true" />
    <ion-content class="ion-padding">
      <ion-item>
        <ion-label position="stacked">{{ '@i18n.override.module.label' | translate | async }}</ion-label>
        <ion-input [value]="formData().module" (ionInput)="onInput($event, 'module')" />
      </ion-item>
      <ion-item>
        <ion-label position="stacked">{{ '@i18n.override.key.label' | translate | async }}</ion-label>
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
        <ion-label>{{ '@i18n.override.isHtml.label' | translate | async }}</ion-label>
      </ion-item>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button (click)="cancel()">{{ '@general.operation.cancel' | translate | async }}</ion-button>
        </ion-buttons>
        <ion-buttons slot="end">
          <ion-button [disabled]="!isDirty()" (click)="save()" color="primary">
            {{ '@general.operation.save' | translate | async }}
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-content>
  `,
})
export class I18nOverrideEditModal {
  private readonly modalController = inject(ModalController);

  public item = input.required<I18nTenantOverrideModel>();

  protected formData = linkedSignal(() => safeStructuredClone(this.item()) ?? {} as I18nTenantOverrideModel);
  protected isDirty = computed(() => !deepEqual(this.formData(), safeStructuredClone(this.item())));

  protected onInput(event: Event, field: keyof I18nTenantOverrideModel): void {
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
