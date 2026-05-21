import { Component, computed, inject, input, model } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { ResponsibilityConfig, UserModel } from '@bk2/shared-models';
import { Checkbox, CheckboxI18n, TextInput, TextInputI18n } from '@bk2/shared-ui';
import { coerceBoolean } from '@bk2/shared-util-core';
import { I18nService } from '@bk2/shared-i18n';

import { PFX } from './scope';

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
  private readonly i18nService = inject(I18nService);

  public formData = model.required<ResponsibilityConfig>();
  public currentUser = input.required<UserModel | undefined>();
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  protected bkey = computed(() => this.formData().bkey ?? '');
  protected showAvatar = computed(() => this.formData().showAvatar ?? true);
  protected showName = computed(() => this.formData().showName ?? true);
  protected showDescription = computed(() => this.formData().showDescription ?? true);

  protected readonly fieldI18n = this.i18nService.translateAll({
    bkey_label:              PFX + 'bkey.label',
    bkey_placeholder:        PFX + 'bkey.placeholder',
    bkey_helper:             PFX + 'bkey.helper',
    showAvatar_label:        PFX + 'showAvatar.label',
    showAvatar_helper:       PFX + 'showAvatar.helper',
    showName_label:          PFX + 'showName.label',
    showName_helper:         PFX + 'showName.helper',
    showDescription_label:   PFX + 'showDescription.label',
    showDescription_helper:  PFX + 'showDescription.helper',
  });

  protected bkeyI18n = computed(() => ({
    name: 'bkey',
    label: this.fieldI18n.bkey_label(),
    placeholder: this.fieldI18n.bkey_placeholder(),
    helper: this.fieldI18n.bkey_helper(),
  } as TextInputI18n));

  protected showAvatarI18n = computed(() => ({
    name: 'showAvatar',
    label: this.fieldI18n.showAvatar_label(),
    helper: this.fieldI18n.showAvatar_helper(),
  } as CheckboxI18n));

  protected showNameI18n = computed(() => ({
    name: 'showName',
    label: this.fieldI18n.showName_label(),
    helper: this.fieldI18n.showName_helper(),
  } as CheckboxI18n));

  protected showDescriptionI18n = computed(() => ({
    name: 'showDescription',
    label: this.fieldI18n.showDescription_label(),
    helper: this.fieldI18n.showDescription_helper(),
  } as CheckboxI18n));

  protected onFieldChange(fieldName: string, fieldValue: string | boolean): void {
    this.formData.update(vm => ({ ...vm, [fieldName]: fieldValue }));
  }
}
