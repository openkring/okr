import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { AvailableLanguages } from '@okr/shared-models';
import { TextInput, TextInputI18n } from '@okr/shared-ui';
import { coerceBoolean } from '@okr/shared-util-core';
import { validateVestTree } from '@okr/shared-util-angular';

import { TagStringFormData, tagStringValidations } from '@okr/aoc-util';

/**
 * One tag string of a tag definition plus its label per supported language.
 *
 * The labels are deliberately NOT translated keys: 'Key' and the language abbreviations
 * (DE/EN/…) are the same in every language, so they are literals rather than i18n keys.
 * `showLabels` hides the language fields for legacy raw entries (no '@' prefix), which have
 * no translation to edit.
 */
@Component({
  selector: 'okr-tag-string-form',
  standalone: true,
  imports: [
    TextInput,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12">
                  <okr-text-input [i18n]="keyI18n()" [value]="key()" (valueChange)="onFieldChange('key', $event)"
                    [autofocus]="true" [maxLength]="50" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
              @if (showLabels()) {
                <ion-row>
                  @for (lang of languages; track lang) {
                    <ion-col size="12" size-md="6">
                      <okr-text-input [i18n]="langI18n()[lang]" [value]="labelOf(lang)"
                        (valueChange)="onFieldChange(lang, $event)"
                        [maxLength]="50" [readOnly]="isReadOnly()" />
                    </ion-col>
                  }
                </ion-row>
              }
            </ion-grid>
          </ion-card-content>
        </ion-card>
      </form>
    }
  `
})
export class TagStringForm {
  // inputs
  public formData = model.required<TagStringFormData>();
  public readonly showLabels = input(true);
  public readonly readOnly = input(false);
  public readonly showForm = input(true);

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  // signal form — wraps formData with Vest validation
  protected readonly tagStringForm = form(this.formData, (path) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    validateVestTree(path, tagStringValidations as any),
  );

  constructor() {
    effect(() => this.valid.emit(this.tagStringForm().valid()));
  }

  protected readonly languages = AvailableLanguages;
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly key = computed(() => this.formData()?.key ?? '');

  protected keyI18n = computed(() => ({
    name: 'key', label: 'Key', placeholder: '@tag.name', helper: ''
  } as TextInputI18n));

  /** One TextInputI18n per language, labelled with its uppercase abbreviation (DE, EN, …). */
  protected langI18n = computed(() => Object.fromEntries(
    this.languages.map(lang => [lang, { name: lang, label: lang.toUpperCase(), placeholder: '', helper: '' } as TextInputI18n])
  ) as Record<string, TextInputI18n>);

  protected labelOf(lang: string): string {
    return (this.formData() as unknown as Record<string, string>)[lang] ?? '';
  }

  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }
}
