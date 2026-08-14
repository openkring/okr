import { Component, computed, inject, input, linkedSignal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonButton, IonContent, IonInput, IonItem, IonLabel,
  IonList, IonSelect, IonSelectOption, IonToggle,
  ModalController,
} from '@ionic/angular/standalone';

import { Header } from '@okr/shared-ui';
import { Field } from '@okr/shared-models';
import { safeStructuredClone } from '@okr/shared-util-core';
import { isDisplayField, FORM_I18N_KEYS, FormI18n } from '@okr/forms-util';
import { I18nService } from '@okr/shared-i18n';

@Component({
  selector: 'okr-field-config-modal',
  standalone: true,
  imports: [
    FormsModule, Header,
    IonContent, IonList, IonItem, IonLabel, IonInput, IonToggle, IonSelect, IonSelectOption, IonButton,
  ],
  template: `
    <okr-header [i18n]="{ title: i18n.field_title() }" [isModal]="true" />
    <ion-content class="ion-padding">
      <ion-list lines="full">

        @if (fieldData().type !== 'divider') {
          <ion-item>
            <ion-label position="stacked">{{ fieldData().type === 'label' ? i18n.field_text() : i18n.field_label() }}</ion-label>
            <ion-input [(ngModel)]="fieldData().label" />
          </ion-item>
        }

        @if (!isDisplay()) {
          <ion-item>
            <ion-label position="stacked">{{ i18n.field_key() }}</ion-label>
            <ion-input [(ngModel)]="fieldData().key" placeholder="my_field" />
          </ion-item>
        }

        <ion-item>
          <ion-label position="stacked">{{ i18n.width() }}</ion-label>
          <ion-select [(ngModel)]="fieldData().width">
            <ion-select-option value="full">{{ i18n.field_width_full() }}</ion-select-option>
            <ion-select-option value="half">{{ i18n.field_width_half() }}</ion-select-option>
            <ion-select-option value="third">{{ i18n.field_width_third() }}</ion-select-option>
          </ion-select>
        </ion-item>

        @if (!isDisplay()) {
          <ion-item>
            <ion-label>{{ i18n.required() }}</ion-label>
            <ion-toggle [(ngModel)]="fieldData().required" slot="end" />
          </ion-item>

          <ion-item>
            <ion-label position="stacked">{{ i18n.help() }}</ion-label>
            <ion-input [(ngModel)]="fieldData().helpText" />
          </ion-item>

          <ion-item>
            <ion-label position="stacked">{{ i18n.field_placeholder() }}</ion-label>
            <ion-input [(ngModel)]="fieldData().placeholder" />
          </ion-item>
        }

      </ion-list>

      <ion-button expand="block" [disabled]="!isValid()" (click)="save()" style="margin: 16px;">
        {{ i18n.field_apply() }}
      </ion-button>
    </ion-content>
  `,
})
export class FieldConfigModal {
  private readonly modalController = inject(ModalController);

  public readonly field = input.required<Field>();

  // Direct inject (no store): the store opens this modal, importing it back would be circular.
  protected readonly i18n = inject(I18nService).translateAll(FORM_I18N_KEYS) as FormI18n;

  protected fieldData = linkedSignal(() => safeStructuredClone(this.field()) ?? this.field());

  protected readonly isDisplay = computed(() => isDisplayField(this.fieldData().type));

  protected readonly isValid = computed(() => {
    const fd = this.fieldData();
    if (fd.type === 'divider') return true;
    if (fd.type === 'label') return !!fd.label.trim();
    return !!fd.label.trim() && !!fd.key.trim();
  });

  public async save(): Promise<void> {
    await this.modalController.dismiss(this.fieldData(), 'confirm');
  }
}
