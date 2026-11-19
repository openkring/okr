import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular';

import { Checkbox, CheckboxI18n, ErrorNote, TextareaInput, TextInputI18n } from '@okr/shared-ui';
import { validateVestTree, vestErrors } from '@okr/shared-util-angular';

import {
  AocCookieBannerI18n,
  COOKIE_BANNER_LANGUAGES,
  COOKIE_BANNER_TEXT_LENGTH,
  CookieBannerLanguage,
  CookieBannerSettings,
  cookieBannerSettingsValidations,
} from '@okr/aoc-util';

/**
 * AOC «Datenschutz»: the cookie notice of this tenant — on/off and its text per language
 * (`app-config.cookieBannerEnabled` / `cookieBannerText`). An `AppConfig` settings patch, not a
 * Firestore model — no `okey`/`tenants`/`tags`, no chips/notes.
 */
@Component({
  selector: 'okr-cookie-banner-settings-form',
  standalone: true,
  imports: [Checkbox, ErrorNote, TextareaInput, IonGrid, IonRow, IonCol, IonCard, IonCardContent],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12">
                  <okr-checkbox [i18n]="enabledI18n()" [checked]="cookieBannerEnabled()"
                    (checkedChange)="onFieldChange('cookieBannerEnabled', $event)"
                    [toggle]="true" justify="space-between" [showHelper]="true" [readOnly]="false" />
                  <okr-error-note [errors]="enabledErrors()" />
                </ion-col>
              </ion-row>
              <ion-row>
                @for (lang of languages; track lang; let first = $first) {
                  <ion-col size="12" size-md="6">
                    <okr-textarea-input [i18n]="textI18n()[lang]" [value]="text(lang)"
                      (valueChange)="onFieldChange(textField(lang), $event)"
                      [maxLength]="textLength" [rows]="4" [showHelper]="first" [readOnly]="false" />
                    <okr-error-note [errors]="textErrors()[lang]" />
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
export class CookieBannerSettingsForm {
  /** bound to the Vest suite's own constant (building-forms rule 2) — never a copied literal */
  protected readonly textLength = COOKIE_BANNER_TEXT_LENGTH;
  protected readonly languages = COOKIE_BANNER_LANGUAGES;

  // inputs
  public readonly i18n = input.required<AocCookieBannerI18n>();
  public formData = model.required<CookieBannerSettings>();
  public readonly showForm = input(true);

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  // signal form — wraps formData with Vest validation
  protected readonly settingsForm = form(this.formData, (path) =>
    validateVestTree(path, cookieBannerSettingsValidations as any));

  private readonly validationResult = vestErrors(this.settingsForm);
  protected readonly enabledErrors = computed(() => this.validationResult().getErrors('cookieBannerEnabled'));
  protected readonly textErrors = computed(() => {
    const result = this.validationResult();
    return Object.fromEntries(COOKIE_BANNER_LANGUAGES.map(lang => [lang, result.getErrors(this.textField(lang))])) as
      Record<CookieBannerLanguage, string[]>;
  });

  constructor() {
    effect(() => this.valid.emit(this.settingsForm().valid()));
  }

  // computed field accessors
  protected readonly cookieBannerEnabled = computed(() => this.formData()?.cookieBannerEnabled === true);
  protected text(lang: CookieBannerLanguage): string {
    return this.formData()?.[this.textField(lang)] ?? '';
  }
  protected textField(lang: CookieBannerLanguage): `text_${CookieBannerLanguage}` {
    return `text_${lang}`;
  }

  protected readonly enabledI18n = computed(() => ({
    name: 'cookieBannerEnabled',
    label: this.i18n().enabled_label(),
    helper: this.i18n().enabled_helper(),
  } as CheckboxI18n));

  protected readonly textI18n = computed(() => {
    const i18n = this.i18n();
    const labels: Record<CookieBannerLanguage, string> = {
      de: i18n.text_de_label(), en: i18n.text_en_label(), fr: i18n.text_fr_label(),
      es: i18n.text_es_label(), it: i18n.text_it_label(),
    };
    return Object.fromEntries(COOKIE_BANNER_LANGUAGES.map(lang => [lang, {
      name: this.textField(lang),
      label: labels[lang],
      placeholder: i18n.text_placeholder(),
      helper: i18n.text_helper(),
    } as TextInputI18n])) as Record<CookieBannerLanguage, TextInputI18n>;
  });

  protected onFieldChange(fieldName: keyof CookieBannerSettings, fieldValue: string | boolean): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }
}
