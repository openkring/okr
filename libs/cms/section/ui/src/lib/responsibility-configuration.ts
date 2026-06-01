import { Component, computed, input, model, Signal } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { ResponsibilityConfig, UserModel } from '@bk2/shared-models';
import { Checkbox, CheckboxI18n, TextInput, TextInputI18n } from '@bk2/shared-ui';
import { coerceBoolean } from '@bk2/shared-util-core';

interface ResponsibilityConfigI18n {
  bkey_label:              Signal<string>;
  bkey_placeholder:        Signal<string>;
  bkey_helper:             Signal<string>;
  showAvatar_label:        Signal<string>;
  showAvatar_helper:       Signal<string>;
  showName_label:          Signal<string>;
  showName_helper:         Signal<string>;
  showDescription_label:   Signal<string>;
  showDescription_helper:  Signal<string>;
}

@Component({
  selector: 'bk-responsibility-config',
  standalone: true,
  imports: [
    Checkbox, TextInput,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonGrid, IonRow, IonCol,
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px; } }`],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ '@content.section.type.responsibility.edit' }}</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        <ion-grid>
          <ion-row>
            <ion-col size="12">
              <bk-text-input [i18n]="bkeyI18n()" [value]="bkey()" (valueChange)="onFieldChange('bkey', $event)" [readOnly]="isReadOnly()" [showHelper]="true" />
            </ion-col>
            <ion-col size="12" size-md="4">
              <bk-checkbox [i18n]="showAvatarI18n()" [checked]="showAvatar()" (checkedChange)="onFieldChange('showAvatar', $event)" [readOnly]="isReadOnly()" />
            </ion-col>
            <ion-col size="12" size-md="4">
              <bk-checkbox [i18n]="showNameI18n()" [checked]="showName()" (checkedChange)="onFieldChange('showName', $event)" [readOnly]="isReadOnly()" />
            </ion-col>
            <ion-col size="12" size-md="4">
              <bk-checkbox [i18n]="showDescriptionI18n()" [checked]="showDescription()" (checkedChange)="onFieldChange('showDescription', $event)" [readOnly]="isReadOnly()" />
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>
  `,
})
export class ResponsibilityConfiguration {
  // inputs
  public formData = model.required<ResponsibilityConfig>();
  public currentUser = input.required<UserModel | undefined>();
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  public readonly i18n = input.required<ResponsibilityConfigI18n>();

  protected bkey = computed(() => this.formData().bkey ?? '');
  protected showAvatar = computed(() => this.formData().showAvatar ?? true);
  protected showName = computed(() => this.formData().showName ?? true);
  protected showDescription = computed(() => this.formData().showDescription ?? true);

  protected bkeyI18n = computed(() => ({
    name: 'bkey',
    label: this.i18n().bkey_label(),
    placeholder: this.i18n().bkey_placeholder(),
    helper: this.i18n().bkey_helper(),
  } as TextInputI18n));

  protected showAvatarI18n = computed(() => ({
    name: 'showAvatar',
    label: this.i18n().showAvatar_label(),
    helper: this.i18n().showAvatar_helper(),
  } as CheckboxI18n));

  protected showNameI18n = computed(() => ({
    name: 'showName',
    label: this.i18n().showName_label(),
    helper: this.i18n().showName_helper(),
  } as CheckboxI18n));

  protected showDescriptionI18n = computed(() => ({
    name: 'showDescription',
    label: this.i18n().showDescription_label(),
    helper: this.i18n().showDescription_helper(),
  } as CheckboxI18n));

  protected onFieldChange(fieldName: string, fieldValue: string | boolean): void {
    this.formData.update(vm => ({ ...vm, [fieldName]: fieldValue }));
  }
}
