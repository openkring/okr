import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { DESCRIPTION_LENGTH, LONG_NAME_LENGTH } from '@okr/shared-constants';
import { Checkbox, CheckboxI18n, ErrorNote, NotesInput, NotesInputI18n, TextInput, TextInputI18n } from '@okr/shared-ui';
import { validateVestTree, vestErrors } from '@okr/shared-util-angular';
import { coerceBoolean } from '@okr/shared-util-core';
import { I18nEntryFormModel, I18nEntryI18n, i18nEntryValidations } from '@okr/i18n-util';

/**
 * One translation row: module · key, the five language texts and the HTML flag.
 * Serves both the default catalogue (`I18nDefaultModel`) and the tenant overrides
 * (`I18nTenantOverrideModel`) — both carry exactly these fields. The parent modal drives saving.
 */
@Component({
  selector: 'okr-i18n-entry-form',
  standalone: true,
  imports: [TextInput, NotesInput, Checkbox, ErrorNote, IonGrid, IonRow, IonCol, IonCard, IonCardContent],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="moduleI18n()" [value]="module()"
                    (valueChange)="onFieldChange('module', $event)"
                    [autofocus]="true" [maxLength]="longNameLength" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="moduleErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="keyI18n()" [value]="key()"
                    (valueChange)="onFieldChange('key', $event)"
                    [maxLength]="longNameLength" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="keyErrors()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12">
                  <okr-notes-input [i18n]="deI18n()" [value]="de()"
                    (valueChange)="onFieldChange('de', $event)"
                    [maxLength]="descriptionLength" [errors]="deErrors()" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="12">
                  <okr-notes-input [i18n]="enI18n()" [value]="en()"
                    (valueChange)="onFieldChange('en', $event)"
                    [maxLength]="descriptionLength" [errors]="enErrors()" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="12">
                  <okr-notes-input [i18n]="frI18n()" [value]="fr()"
                    (valueChange)="onFieldChange('fr', $event)"
                    [maxLength]="descriptionLength" [errors]="frErrors()" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="12">
                  <okr-notes-input [i18n]="esI18n()" [value]="es()"
                    (valueChange)="onFieldChange('es', $event)"
                    [maxLength]="descriptionLength" [errors]="esErrors()" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="12">
                  <okr-notes-input [i18n]="itI18n()" [value]="it()"
                    (valueChange)="onFieldChange('it', $event)"
                    [maxLength]="descriptionLength" [errors]="itErrors()" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12">
                  <okr-checkbox [i18n]="isHtmlI18n()" [checked]="isHtml()"
                    (checkedChange)="onFieldChange('isHtml', $event)"
                    [toggle]="true" [showHelper]="true" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
      </form>
    }
  `,
})
export class I18nEntryForm {
  // inputs
  public readonly i18n = input.required<I18nEntryI18n>();
  public formData = model.required<I18nEntryFormModel>();
  public readonly readOnly = input(false);
  public readonly showForm = input(true);   // toggled by the parent to reset Vest state on cancel

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected readonly entryForm = form(this.formData, (path) => validateVestTree(path, i18nEntryValidations as any));

  constructor() {
    effect(() => this.valid.emit(this.entryForm().valid()));
  }

  /** kept in step with the caps the Vest suite enforces on these fields */
  protected readonly longNameLength = LONG_NAME_LENGTH;
  protected readonly descriptionLength = DESCRIPTION_LENGTH;

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // field accessors
  protected readonly module = computed(() => this.formData()?.module ?? '');
  protected readonly key = computed(() => this.formData()?.key ?? '');
  protected readonly de = computed(() => this.formData()?.de ?? '');
  protected readonly en = computed(() => this.formData()?.en ?? '');
  protected readonly fr = computed(() => this.formData()?.fr ?? '');
  protected readonly es = computed(() => this.formData()?.es ?? '');
  protected readonly it = computed(() => this.formData()?.it ?? '');
  protected readonly isHtml = computed(() => this.formData()?.isHtml ?? false);

  // per-field errors, straight from the suite
  private readonly validationResult = vestErrors(this.entryForm);
  protected readonly moduleErrors = computed(() => this.validationResult().getErrors('module'));
  protected readonly keyErrors = computed(() => this.validationResult().getErrors('key'));
  protected readonly deErrors = computed(() => this.validationResult().getErrors('de'));
  protected readonly enErrors = computed(() => this.validationResult().getErrors('en'));
  protected readonly frErrors = computed(() => this.validationResult().getErrors('fr'));
  protected readonly esErrors = computed(() => this.validationResult().getErrors('es'));
  protected readonly itErrors = computed(() => this.validationResult().getErrors('it'));

  // i18n at the shared/ui boundary
  protected readonly moduleI18n = computed(() => ({
    name: 'module',
    label: this.i18n().module_label(),
    placeholder: this.i18n().module_placeholder(),
    helper: this.i18n().module_helper(),
  } as TextInputI18n));
  protected readonly keyI18n = computed(() => ({
    name: 'key',
    label: this.i18n().key_label(),
    placeholder: this.i18n().key_placeholder(),
    helper: this.i18n().key_helper(),
  } as TextInputI18n));
  protected readonly deI18n = computed(() => this.textI18n('de', this.i18n().de_label()));
  protected readonly enI18n = computed(() => this.textI18n('en', this.i18n().en_label()));
  protected readonly frI18n = computed(() => this.textI18n('fr', this.i18n().fr_label()));
  protected readonly esI18n = computed(() => this.textI18n('es', this.i18n().es_label()));
  protected readonly itI18n = computed(() => this.textI18n('it', this.i18n().it_label()));
  protected readonly isHtmlI18n = computed(() => ({
    name: 'isHtml',
    label: this.i18n().is_html_label(),
    helper: this.i18n().is_html_helper(),
  } as CheckboxI18n));

  private textI18n(name: string, label: string): NotesInputI18n {
    return { name, label, placeholder: this.i18n().text_placeholder() };
  }

  protected onFieldChange(fieldName: keyof I18nEntryFormModel, fieldValue: string | boolean): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }
}
