import { Component, computed } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular';

import { CITY_LENGTH, LONG_NAME_LENGTH, SHORT_NAME_LENGTH, STREET_LENGTH, URL_LENGTH } from '@okr/shared-constants';
import { CountrySelect, EmailInput, ErrorNote, TextInput, UrlInput } from '@okr/shared-ui';
import type { CountrySelectI18n } from '@okr/shared-ui';
import { SETTINGS_EMAIL_LENGTH } from '@okr/tenant-util';

import { SettingsFormBase } from './settings-form.base';
import { SettingsPublicNote } from './settings-public-note';

/** Settings group «Betreiber»: who runs this app, and where errors are reported. */
@Component({
  selector: 'okr-settings-operator-form',
  standalone: true,
  imports: [
    CountrySelect, EmailInput, ErrorNote, SettingsPublicNote, TextInput, UrlInput,
    IonCard, IonCardContent, IonCol, IonGrid, IonRow,
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
                  <okr-text-input [i18n]="fields()['opName']" [value]="values()['opName']"
                    (valueChange)="onFieldChange('opName', $event)"
                    [autofocus]="true" [maxLength]="longNameLength" [showHelper]="true" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="errors()['opName']" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-email [i18n]="fields()['opEmail']" [value]="values()['opEmail']"
                    (valueChange)="onFieldChange('opEmail', $event)"
                    [maxLength]="emailLength" [copyable]="false" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="errors()['opEmail']" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="fields()['opStreet']" [value]="values()['opStreet']"
                    (valueChange)="onFieldChange('opStreet', $event)"
                    [maxLength]="streetLength" [showHelper]="true" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="errors()['opStreet']" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="fields()['opZipCode']" [value]="values()['opZipCode']"
                    (valueChange)="onFieldChange('opZipCode', $event)"
                    [maxLength]="zipLength" [showHelper]="true" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="errors()['opZipCode']" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="fields()['opCity']" [value]="values()['opCity']"
                    (valueChange)="onFieldChange('opCity', $event)"
                    [maxLength]="cityLength" [showHelper]="true" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="errors()['opCity']" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-country-select [i18n]="countryI18n()" [value]="values()['opCountryCode']"
                    (valueChange)="onFieldChange('opCountryCode', $event)" [showHelper]="true" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="errors()['opCountryCode']" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-url [i18n]="fields()['opWebUrl']" [value]="values()['opWebUrl']"
                    (valueChange)="onFieldChange('opWebUrl', $event)"
                    [maxLength]="urlLength" [copyable]="false" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="errors()['opWebUrl']" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-url [i18n]="fields()['issueUrl']" [value]="values()['issueUrl']"
                    (valueChange)="onFieldChange('issueUrl', $event)"
                    [maxLength]="urlLength" [copyable]="false" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="errors()['issueUrl']" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
      </form>
    }
  `,
})
export class SettingsOperatorForm extends SettingsFormBase {
  /** kept in step with the caps the Vest suite enforces on these fields */
  protected readonly longNameLength = LONG_NAME_LENGTH;
  protected readonly emailLength = SETTINGS_EMAIL_LENGTH;
  protected readonly streetLength = STREET_LENGTH;
  protected readonly zipLength = SHORT_NAME_LENGTH;
  protected readonly cityLength = CITY_LENGTH;
  protected readonly urlLength = URL_LENGTH;

  protected readonly countryI18n = computed((): CountrySelectI18n => ({
    ...this.fields()['opCountryCode'], search: this.text('country_search'), empty: this.text('country_empty'),
  }));

  protected get group(): 'operator' { return 'operator'; }
}
