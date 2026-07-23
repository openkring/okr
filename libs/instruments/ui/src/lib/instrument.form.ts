import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { DEFAULT_NOTES } from '@okr/shared-constants';
import { InstrumentModel } from '@okr/shared-models';
import { NotesInput, NotesInputI18n, TextInput, TextInputI18n } from '@okr/shared-ui';
import { coerceBoolean } from '@okr/shared-util-core';
import { validateVestTree } from '@okr/shared-util-angular';

import { InstrumentI18n, instrumentValidations } from '@okr/instruments-util';

/**
 * Pure form for an instrument's metadata (name + description). The board itself is the detail page;
 * this form only names/describes the instrument (create + edit). Signal Forms + Vest, no submit
 * button — the parent modal drives saving.
 */
@Component({
  selector: 'okr-instrument-form',
  standalone: true,
  imports: [TextInput, NotesInput, IonGrid, IonRow, IonCol, IonCard, IonCardContent],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px; } }`],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12">
                  <okr-text-input [i18n]="nameI18n()" [value]="name()" (valueChange)="onFieldChange('name', $event)"
                    [autofocus]="true" [maxLength]="50" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="12">
                  <okr-notes-input [i18n]="descriptionI18n()" [value]="description()" (valueChange)="onFieldChange('description', $event)"
                    [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
      </form>
    }
  `,
})
export class InstrumentForm {
  public readonly i18n = input.required<InstrumentI18n>();
  public formData = model.required<InstrumentModel>();
  public readonly readOnly = input(true);
  public readonly showForm = input(true);

  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  protected readonly instrumentForm = form(this.formData, (path) =>
    validateVestTree(path, instrumentValidations as any),
  );

  constructor() {
    effect(() => this.valid.emit(this.instrumentForm().valid()));
  }

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly name = computed(() => this.formData()?.name ?? '');
  protected readonly description = computed(() => this.formData()?.description ?? DEFAULT_NOTES);

  protected nameI18n = computed(() => ({
    name: 'name',
    label: this.i18n().name_label(),
    placeholder: this.i18n().name_placeholder(),
    helper: this.i18n().name_helper(),
  } as TextInputI18n));

  protected descriptionI18n = computed(() => ({
    name: 'description',
    label: this.i18n().description_label(),
    placeholder: this.i18n().description_placeholder(),
  } as NotesInputI18n));

  protected onFieldChange(fieldName: 'name' | 'description', fieldValue: string): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }
}
