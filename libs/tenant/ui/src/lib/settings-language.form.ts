import { Component, computed } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonItem, IonLabel, IonNote, IonRow } from '@ionic/angular';

import { AvailableLanguages } from '@okr/shared-models';
import { Checkbox, ErrorNote, StringSelect } from '@okr/shared-ui';
import type { CheckboxI18n } from '@okr/shared-ui';
import { SETTINGS_LOCALES, settingsLocaleKey, withLanguage, withStored } from '@okr/tenant-util';

import { SettingsFormBase } from './settings-form.base';
import { SettingsPublicNote } from './settings-public-note';

/** Settings group «Sprache»: the format of dates and times, and the languages the app offers. */
@Component({
  selector: 'okr-settings-language-form',
  standalone: true,
  imports: [
    Checkbox, ErrorNote, SettingsPublicNote, StringSelect,
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
                <ion-col size="12" size-md="6">
                  <okr-string-select [i18n]="fields()['locale']" [selectedString]="values()['locale']"
                    (selectedStringChange)="onFieldChange('locale', $event)"
                    [stringList]="locales()" [labels]="localeLabels()" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="errors()['locale']" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <ion-item lines="none" [button]="false">
                    <ion-label>{{ fields()['enabledLanguages'].label }}</ion-label>
                  </ion-item>
                  <div role="group" [attr.aria-label]="fields()['enabledLanguages'].label">
                    @for (language of languages(); track language.code) {
                      <okr-checkbox [i18n]="language.i18n" [checked]="language.enabled"
                        (checkedChange)="onLanguageChange(language.code, $event)" [readOnly]="isReadOnly()" />
                    }
                  </div>
                  <okr-error-note [errors]="errors()['enabledLanguages']" />
                  @if (helperVisibility.showHelpers()) {
                    <ion-item lines="none" [button]="false">
                      <ion-note class="ion-text-wrap">{{ fields()['enabledLanguages'].helper }}</ion-note>
                    </ion-item>
                  }
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
      </form>
    }
  `,
})
export class SettingsLanguageForm extends SettingsFormBase {
  /** a stored locale the list does not know stays the first choice, also after another one was picked */
  protected readonly locales = computed(() => withStored(SETTINGS_LOCALES, this.context().before.locale));
  protected readonly localeLabels = computed(() => this.locales().map((locale) => this.text(settingsLocaleKey(locale))));

  private readonly enabled = computed(() => this.formData().enabledLanguages ?? []);
  protected readonly languages = computed(() => AvailableLanguages.map((code) => ({
    code,
    enabled: this.enabled().includes(code),
    i18n: { name: `language-${code}`, label: this.text(`language_${code}`), helper: '' } as CheckboxI18n,
  })));

  protected get group(): 'language' { return 'language'; }

  protected onLanguageChange(code: string, enabled: boolean): void {
    this.onFieldChange('enabledLanguages', withLanguage(this.enabled(), code, enabled));
  }
}
