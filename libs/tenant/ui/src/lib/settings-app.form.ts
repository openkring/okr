import { Component, computed } from '@angular/core';
import { IonButton, IonCard, IonCardContent, IonCol, IonGrid, IonItem, IonNote, IonRow } from '@ionic/angular';

import { DESCRIPTION_LENGTH, LONG_NAME_LENGTH, NAME_LENGTH } from '@okr/shared-constants';
import { Color, ErrorNote, TextareaInput, TextInput } from '@okr/shared-ui';

import { SettingsFormBase } from './settings-form.base';
import { SettingsPublicNote } from './settings-public-note';

/** The neutral blue the mails use without a brand colour (`DEFAULT_BRAND_COLOR` in apps/functions/src/calendar/mail.ts). */
const NEUTRAL_COLOR = '#1f6feb';

/** Settings group «App»: name, title, subtitle, description and brand colour. */
@Component({
  selector: 'okr-settings-app-form',
  standalone: true,
  imports: [
    Color, ErrorNote, SettingsPublicNote, TextareaInput, TextInput,
    IonButton, IonCard, IonCardContent, IonCol, IonGrid, IonItem, IonNote, IonRow,
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <okr-settings-public-note [text]="publicNote()" />
            <ion-grid>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="fields()['appName']" [value]="values()['appName']"
                    (valueChange)="onFieldChange('appName', $event)"
                    [autofocus]="true" [maxLength]="nameLength" [showHelper]="true" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="errors()['appName']" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="fields()['appTitle']" [value]="values()['appTitle']"
                    (valueChange)="onFieldChange('appTitle', $event)"
                    [maxLength]="longNameLength" [showHelper]="true" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="errors()['appTitle']" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="fields()['appSubtitle']" [value]="values()['appSubtitle']"
                    (valueChange)="onFieldChange('appSubtitle', $event)"
                    [maxLength]="longNameLength" [showHelper]="true" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="errors()['appSubtitle']" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-color [label]="fields()['brandColor'].label" [hexColor]="shownColor()"
                    (hexColorChange)="onFieldChange('brandColor', $event)" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="errors()['brandColor']" />
                  @if (values()['brandColor'] && !isReadOnly()) {
                    <ion-button fill="clear" size="small" (click)="onFieldChange('brandColor', '')">{{ text('color_remove') }}</ion-button>
                  }
                  @if (helperVisibility.showHelpers()) {
                    <ion-item lines="none" [button]="false">
                      <ion-note class="ion-text-wrap">{{ fields()['brandColor'].helper }}</ion-note>
                    </ion-item>
                  }
                </ion-col>
                <ion-col size="12">
                  <okr-textarea-input [i18n]="fields()['description']" [value]="values()['description']"
                    (valueChange)="onFieldChange('description', $event)" [errors]="errors()['description']"
                    [maxLength]="descriptionLength" [rows]="3" [showHelper]="true" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
      </form>
    }
  `,
})
export class SettingsAppForm extends SettingsFormBase {
  /** kept in step with the caps the Vest suite enforces on these fields */
  protected readonly nameLength = NAME_LENGTH;
  protected readonly longNameLength = LONG_NAME_LENGTH;
  protected readonly descriptionLength = DESCRIPTION_LENGTH;

  /** Without a brand colour the field shows the colour that applies then; nothing is stored by that. */
  protected readonly shownColor = computed(() => this.values()['brandColor'] || NEUTRAL_COLOR);

  protected get group(): 'app' { return 'app'; }
}
