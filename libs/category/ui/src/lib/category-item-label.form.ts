import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular';

import { CategoryI18n, CategoryItemLabel, categoryItemLabelValidations } from '@okr/category-util';
import { NAME_LENGTH } from '@okr/shared-constants';
import { AvailableLanguages } from '@okr/shared-models';
import { ErrorNote, TextInput, TextInputI18n } from '@okr/shared-ui';
import { validateVestTree, vestErrors } from '@okr/shared-util-angular';

/** The tenant's label of one category item, one field per language (labelled DE, EN, … in every language). */
@Component({
  selector: 'okr-category-item-label-form',
  standalone: true,
  imports: [ErrorNote, TextInput, IonGrid, IonRow, IonCol, IonCard, IonCardContent],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                @for (lang of languages; track lang; let first = $first) {
                  <ion-col size="12" size-md="6">
                    <okr-text-input [i18n]="langI18n()[lang]" [value]="labelOf(lang)" (valueChange)="onFieldChange(lang, $event)"
                      [autofocus]="first" [showHelper]="first" [maxLength]="nameLength" [readOnly]="false" />
                    <okr-error-note [errors]="errorsOf(lang)" />
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
export class CategoryItemLabelForm {
  /** kept in step with the cap the Vest suite enforces on these fields */
  protected readonly nameLength = NAME_LENGTH;
  protected readonly languages = AvailableLanguages;

  // inputs
  public readonly i18n = input.required<CategoryI18n>();
  public formData = model.required<CategoryItemLabel>();
  public readonly showForm = input(true);

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  protected readonly labelForm = form(this.formData, (path) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    validateVestTree(path, categoryItemLabelValidations as any));
  private readonly validationResult = vestErrors(this.labelForm);

  constructor() {
    effect(() => this.valid.emit(this.labelForm().valid()));
  }

  protected readonly langI18n = computed(() => Object.fromEntries(this.languages.map((lang, index) => [lang, {
    name: lang, label: lang.toUpperCase(), placeholder: '', helper: index === 0 ? this.i18n().item_label_helper() : '',
  } as TextInputI18n])) as Record<string, TextInputI18n>);

  protected labelOf(lang: string): string {
    return this.formData()[lang as keyof CategoryItemLabel] ?? '';
  }

  protected errorsOf(lang: string): string[] {
    return this.validationResult().getErrors(lang);
  }

  protected onFieldChange(lang: string, value: string): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [lang]: value }));
  }
}
