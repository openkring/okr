import { Component, computed, inject, input, linkedSignal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonButton, IonContent, IonInput, IonItem, IonLabel,
  IonList, IonSelect, IonSelectOption, IonToggle,
  ModalController,
} from '@ionic/angular/standalone';

import { Header } from '@bk2/shared-ui';
import { Field } from '@bk2/shared-models';
import { safeStructuredClone } from '@bk2/shared-util-core';

@Component({
  selector: 'bk-field-config-modal',
  standalone: true,
  imports: [
    FormsModule, Header,
    IonContent, IonList, IonItem, IonLabel, IonInput, IonToggle, IonSelect, IonSelectOption, IonButton,
  ],
  template: `
    <bk-header [i18n]="{ title: 'Feld konfigurieren' }" [isModal]="true" />
    <ion-content class="ion-padding">
      <ion-list lines="full">

        <ion-item>
          <ion-label position="stacked">Label *</ion-label>
          <ion-input [(ngModel)]="fieldData().label" />
        </ion-item>

        <ion-item>
          <ion-label position="stacked">Feldname (snake_case) *</ion-label>
          <ion-input [(ngModel)]="fieldData().key" placeholder="my_field" />
        </ion-item>

        <ion-item>
          <ion-label position="stacked">Breite</ion-label>
          <ion-select [(ngModel)]="fieldData().width">
            <ion-select-option value="full">Ganz (100%)</ion-select-option>
            <ion-select-option value="half">Halb (50%)</ion-select-option>
            <ion-select-option value="third">Drittel (33%)</ion-select-option>
          </ion-select>
        </ion-item>

        <ion-item>
          <ion-label>Pflichtfeld</ion-label>
          <ion-toggle [(ngModel)]="fieldData().required" slot="end" />
        </ion-item>

        <ion-item>
          <ion-label position="stacked">Hilfetext</ion-label>
          <ion-input [(ngModel)]="fieldData().helpText" />
        </ion-item>

        <ion-item>
          <ion-label position="stacked">Platzhalter</ion-label>
          <ion-input [(ngModel)]="fieldData().placeholder" />
        </ion-item>

      </ion-list>

      <ion-button expand="block" [disabled]="!isValid()" (click)="save()" style="margin: 16px;">
        Übernehmen
      </ion-button>
    </ion-content>
  `,
})
export class FieldConfigModal {
  private readonly modalController = inject(ModalController);

  public readonly field = input.required<Field>();
  protected fieldData = linkedSignal(() => safeStructuredClone(this.field()) ?? this.field());

  protected readonly isValid = computed(() => {
    const fd = this.fieldData();
    return !!fd.label.trim() && !!fd.key.trim();
  });

  public async save(): Promise<void> {
    await this.modalController.dismiss(this.fieldData(), 'confirm');
  }
}
