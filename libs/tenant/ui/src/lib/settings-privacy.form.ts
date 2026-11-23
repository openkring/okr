import { Component, computed, input } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular';

import { NAME_LENGTH, SHORT_NAME_LENGTH } from '@okr/shared-constants';
import { EmailInput, ErrorNote, StringSelect, TextInput } from '@okr/shared-ui';
import { SETTINGS_AUDIENCES, SETTINGS_EMAIL_LENGTH, SETTINGS_GROUPS, settingsAudienceKey } from '@okr/tenant-util';
import type { SettingsPageOption } from '@okr/tenant-util';

import { SettingsFormBase } from './settings-form.base';
import { SettingsPublicNote } from './settings-public-note';

/** Settings group «Datenschutz»: the contact, the privacy policy, and who may see which detail of a person. */
@Component({
  selector: 'okr-settings-privacy-form',
  standalone: true,
  imports: [
    EmailInput, ErrorNote, SettingsPublicNote, StringSelect, TextInput,
    IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonRow,
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
                  <okr-text-input [i18n]="fields()['dpoName']" [value]="values()['dpoName']"
                    (valueChange)="onFieldChange('dpoName', $event)"
                    [autofocus]="true" [maxLength]="nameLength" [showHelper]="true" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="errors()['dpoName']" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-email [i18n]="fields()['dpoEmail']" [value]="values()['dpoEmail']"
                    (valueChange)="onFieldChange('dpoEmail', $event)"
                    [maxLength]="emailLength" [copyable]="false" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="errors()['dpoEmail']" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-string-select [i18n]="fields()['privacyPolicyPageKey']" [selectedString]="values()['privacyPolicyPageKey']"
                    (selectedStringChange)="onFieldChange('privacyPolicyPageKey', $event)"
                    [stringList]="pageKeys()" [labels]="pageLabels()" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="errors()['privacyPolicyPageKey']" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="fields()['privacyPolicyVersion']" [value]="values()['privacyPolicyVersion']"
                    (valueChange)="onFieldChange('privacyPolicyVersion', $event)"
                    [maxLength]="versionLength" [showHelper]="true" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="errors()['privacyPolicyVersion']" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>

        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ text('audience_title') }}</ion-card-title>
          </ion-card-header>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                @for (field of audienceFields; track field) {
                  <ion-col size="12" size-md="6">
                    <okr-string-select [i18n]="fields()[field]" [selectedString]="values()[field]"
                      (selectedStringChange)="onFieldChange(field, $event)"
                      [stringList]="audiences" [labels]="audienceLabels()" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="errors()[field]" />
                  </ion-col>
                }
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
      </form>
    }
  `,
})
export class SettingsPrivacyForm extends SettingsFormBase {
  /** the pages of the tenant, the stored one always among them (`settingsPageOptions`) */
  public readonly pageOptions = input<SettingsPageOption[]>([]);

  /** kept in step with the caps the Vest suite enforces on these fields */
  protected readonly nameLength = NAME_LENGTH;
  protected readonly emailLength = SETTINGS_EMAIL_LENGTH;
  protected readonly versionLength = SHORT_NAME_LENGTH;

  protected readonly audienceFields = SETTINGS_GROUPS.privacy.filter((field) => field.startsWith('show'));
  protected readonly audiences: string[] = [...SETTINGS_AUDIENCES];
  protected readonly audienceLabels = computed(() => this.audiences.map((audience) => this.text(settingsAudienceKey(audience))));

  protected readonly pageKeys = computed(() => ['', ...this.pageOptions().map((option) => option.key)]);
  protected readonly pageLabels = computed(() => [this.text('page_none'), ...this.pageOptions().map((option) => option.label)]);

  protected get group(): 'privacy' { return 'privacy'; }
}
