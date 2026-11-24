import { Component, computed, input } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonItem, IonLabel, IonNote, IonRow } from '@ionic/angular';

import { INT_LENGTH, LONG_NAME_LENGTH, URL_LENGTH } from '@okr/shared-constants';
import { Checkbox, ErrorNote, NumberInput, StringSelect, TextInput } from '@okr/shared-ui';
import type { CheckboxI18n } from '@okr/shared-ui';
import {
  emailProviderLabel, integrationRows, processorNames, SETTINGS_DOMAIN_LENGTH, SETTINGS_EMAIL_PROVIDERS, SETTINGS_MAX_WEATHER_HOURS, withIntegration, withStored,
} from '@okr/tenant-util';
import type { IntegrationOption } from '@okr/tenant-util';

import { SettingsFormBase } from './settings-form.base';
import { SettingsPublicNote } from './settings-public-note';

/**
 * Settings group «Plattform»: what only the operator changes, for any tenant (`/operator/settings`). Text, number and
 * switches only, because the pickers of another tenant cannot be reached.
 */
@Component({
  selector: 'okr-settings-platform-form',
  standalone: true,
  imports: [
    Checkbox, ErrorNote, NumberInput, SettingsPublicNote, StringSelect, TextInput,
    IonCard, IonCardContent, IonCol, IonGrid, IonItem, IonLabel, IonNote, IonRow,
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
                @for (item of texts; track item.field; let first = $first) {
                  <ion-col size="12" size-md="6">
                    <okr-text-input [i18n]="fields()[item.field]" [value]="values()[item.field]"
                      (valueChange)="onFieldChange(item.field, $event)"
                      [autofocus]="first" [maxLength]="item.maxLength" [showHelper]="!item.isNoted" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="errors()[item.field]" />
                    @if (item.isNoted) {
                      <!-- always shown, whatever the helper setting: a wrong value locks people out -->
                      <ion-item lines="none" [button]="false">
                        <ion-note class="ion-text-wrap">{{ fields()[item.field].helper }}</ion-note>
                      </ion-item>
                    }
                  </ion-col>
                }
                <ion-col size="12" size-md="6">
                  <okr-string-select [i18n]="fields()['emailProvider']" [selectedString]="values()['emailProvider']"
                    (selectedStringChange)="onFieldChange('emailProvider', $event)"
                    [stringList]="providers()" [labels]="providerLabels()" [showHelper]="false" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="errors()['emailProvider']" />
                  <!-- always shown: the wrong service stops the mails -->
                  <ion-item lines="none" [button]="false">
                    <ion-note class="ion-text-wrap">{{ fields()['emailProvider'].helper }}</ion-note>
                  </ion-item>
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-number-input [i18n]="fields()['weatherIntervalHours']" [value]="weatherIntervalHours()"
                    (valueChange)="onFieldChange('weatherIntervalHours', $event)"
                    [maxLength]="numberLength" [integer]="true" [min]="1" [max]="maxWeatherHours" [showHelper]="true" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="errors()['weatherIntervalHours']" />
                </ion-col>
                @for (item of switches(); track item.field) {
                  <ion-col size="12" size-md="6">
                    <okr-checkbox [i18n]="item.i18n" [checked]="item.checked" [toggle]="true"
                      (checkedChange)="onFieldChange(item.field, $event)" [showHelper]="item.field !== 'isArchived'" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="errors()[item.field]" />
                    @if (item.field === 'isArchived') {
                      <!-- always shown, whatever the helper setting: the switch does less than its name says -->
                      <ion-item lines="none" [button]="false">
                        <ion-note class="ion-text-wrap">{{ item.i18n.helper }}</ion-note>
                      </ion-item>
                    }
                  </ion-col>
                }
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>

        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <ion-item lines="none" [button]="false">
                    <ion-label>{{ fields()['integrations'].label }}</ion-label>
                  </ion-item>
                  <div role="group" [attr.aria-label]="fields()['integrations'].label">
                    @for (row of integrations(); track row.key) {
                      @if (row.known) {
                        <okr-checkbox [i18n]="row.i18n" [checked]="row.on" [toggle]="true"
                          (checkedChange)="onIntegrationChange(row.key, $event)" [readOnly]="isReadOnly()" />
                      } @else {
                        <ion-item lines="none" [button]="false">
                          <ion-label class="ion-text-wrap">
                            <h3>{{ row.key }}: {{ text(row.on ? 'yes' : 'no') }}</h3>
                            <p>{{ text('integration_unknown') }}</p>
                          </ion-label>
                        </ion-item>
                      }
                    }
                  </div>
                  <!-- always shown: the switch does less than it looks like -->
                  <ion-item lines="none" [button]="false">
                    <ion-note class="ion-text-wrap">{{ text('integrations_note') }}</ion-note>
                  </ion-item>
                  @if (helperVisibility.showHelpers()) {
                    <ion-item lines="none" [button]="false">
                      <ion-note class="ion-text-wrap">{{ fields()['integrations'].helper }}</ion-note>
                    </ion-item>
                  }
                </ion-col>
                <ion-col size="12" size-md="6">
                  <ion-item lines="none" [button]="false">
                    <ion-label>{{ fields()['additionalProcessors'].label }}</ion-label>
                  </ion-item>
                  @for (name of processors(); track $index) {
                    <ion-item lines="none" [button]="false">
                      <ion-label class="ion-text-wrap">{{ name }}</ion-label>
                    </ion-item>
                  } @empty {
                    <ion-item lines="none" [button]="false">
                      <ion-label><i>{{ text('empty') }}</i></ion-label>
                    </ion-item>
                  }
                  <ion-item lines="none" [button]="false">
                    <ion-note class="ion-text-wrap">{{ text('processors_note') }}</ion-note>
                  </ion-item>
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
      </form>
    }
  `,
})
export class SettingsPlatformForm extends SettingsFormBase {
  /** the services that can be switched on (the register's catalogue); any other stored key is shown and kept */
  public readonly integrationOptions = input<readonly IntegrationOption[]>([]);

  /** `maxLength` is kept in step with the caps of the Vest suite; `isNoted`: the helper text is always shown, not only on request */
  protected readonly texts = [
    { field: 'appDomain', maxLength: SETTINGS_DOMAIN_LENGTH, isNoted: true },
    { field: 'emailDomain', maxLength: SETTINGS_DOMAIN_LENGTH, isNoted: false },
    { field: 'mailtrapPasswordResetTemplate', maxLength: LONG_NAME_LENGTH, isNoted: false },
    { field: 'loginUrl', maxLength: URL_LENGTH, isNoted: true },
    { field: 'passwordResetUrl', maxLength: URL_LENGTH, isNoted: false },
    { field: 'logoUrl', maxLength: URL_LENGTH, isNoted: false },
    { field: 'ownerOrgId', maxLength: LONG_NAME_LENGTH, isNoted: false },
    { field: 'ownerUserId', maxLength: LONG_NAME_LENGTH, isNoted: false },
    { field: 'defaultAccountingTenantId', maxLength: LONG_NAME_LENGTH, isNoted: false },
    { field: 'gitRepo', maxLength: LONG_NAME_LENGTH, isNoted: false },
    { field: 'gitOrg', maxLength: LONG_NAME_LENGTH, isNoted: false },
  ] as const;
  protected readonly numberLength = INT_LENGTH;
  protected readonly maxWeatherHours = SETTINGS_MAX_WEATHER_HOURS;

  /** A stored unknown service stays a choice; «not set» is one only while nothing is stored, the operator names a service otherwise. */
  protected readonly providers = computed(() => {
    const stored = this.context().before.emailProvider;
    return stored === '' ? ['', ...SETTINGS_EMAIL_PROVIDERS] : withStored(SETTINGS_EMAIL_PROVIDERS, stored);
  });
  protected readonly providerLabels = computed(() => this.providers().map((provider) => emailProviderLabel(provider, this.text('provider_test')) || this.text('empty')));

  /** an emptied number field holds '' until a number is typed; the suite refuses it, the field shows nothing */
  protected readonly weatherIntervalHours = computed(() => {
    const value: unknown = this.formData().weatherIntervalHours;
    return (typeof value === 'number' ? value : null) as number;
  });

  protected readonly switches = computed(() => (['personLookupEnabled', 'showDebugInfo', 'isArchived'] as const).map((field) => ({
    field,
    checked: this.formData()[field] === true,
    i18n: { name: field, label: this.fields()[field].label, helper: this.fields()[field].helper } as CheckboxI18n,
  })));

  protected readonly integrations = computed(() => integrationRows(this.formData().integrations, this.integrationOptions()).map((row) => ({
    ...row, i18n: { name: `integration-${row.key}`, label: row.name, helper: '' } as CheckboxI18n,
  })));

  protected readonly processors = computed(() => processorNames(this.formData().additionalProcessors));

  protected get group(): 'platform' { return 'platform'; }

  protected onIntegrationChange(key: string, on: boolean): void {
    this.onFieldChange('integrations', withIntegration(this.formData().integrations, this.context().before.integrations, key, on));
  }
}
