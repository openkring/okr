import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { LONG_NAME_LENGTH, NAME_LENGTH } from '@okr/shared-constants';
import { Field } from '@okr/shared-models';
import {
  Checkbox, CheckboxI18n, ErrorNote, NotesInput, NotesInputI18n,
  StringSelect, StringSelectI18n, TextInput, TextInputI18n,
} from '@okr/shared-ui';
import { coerceBoolean } from '@okr/shared-util-core';
import { validateVestTree } from '@okr/shared-util-angular';

import { fieldConfigValidations, fieldLabelLength, FormI18n, isDisplayField } from '@okr/forms-util';

const FIELD_WIDTHS: Field['width'][] = ['full', 'half', 'third'];

/** Configures one form-builder field: label/text, key, width, required, category, paragraph style, help and placeholder. */
@Component({
  selector: 'okr-field-config-form',
  standalone: true,
  imports: [
    ErrorNote, TextInput, NotesInput, StringSelect, Checkbox,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent,
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              @if (isTextElement()) {
                <ion-row>
                  <ion-col size="12">
                    <okr-notes-input [i18n]="textI18n()" [value]="label()" (valueChange)="onFieldChange('label', $event)"
                      [maxLength]="labelLength()" [readOnly]="isReadOnly()" [errors]="labelErrors()" />
                  </ion-col>
                </ion-row>
              }
              @if (formData().type === 'paragraph') {
                <ion-row>
                  <ion-col size="12" size-md="6">
                    <okr-checkbox [i18n]="isIndentedI18n()" [checked]="isIndented()" (checkedChange)="onFieldChange('isIndented', $event)"
                      [toggle]="true" justify="space-between" labelPlacement="start" [readOnly]="isReadOnly()" />
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <okr-checkbox [i18n]="isSmallI18n()" [checked]="isSmall()" (checkedChange)="onFieldChange('isSmall', $event)"
                      [toggle]="true" justify="space-between" labelPlacement="start" [readOnly]="isReadOnly()" />
                  </ion-col>
                </ion-row>
              }
              @if (!isDisplay()) {
                <ion-row>
                  <ion-col size="12" size-md="6">
                    <okr-text-input [i18n]="labelI18n()" [value]="label()" (valueChange)="onFieldChange('label', $event)"
                      [autofocus]="true" [maxLength]="labelLength()" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="labelErrors()" />
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <okr-text-input [i18n]="keyI18n()" [value]="key()" (valueChange)="onFieldChange('key', $event)"
                      [maxLength]="nameLength" [showHelper]="true" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="keyErrors()" />
                  </ion-col>
                </ion-row>
              }
              @if (formData().type === 'category') {
                <ion-row>
                  <ion-col size="12">
                    <okr-string-select [i18n]="categoryI18n()" [stringList]="categoryNames()"
                      [selectedString]="categoryName()" (selectedStringChange)="onFieldChange('categoryName', $event)"
                      [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="categoryNameErrors()" />
                  </ion-col>
                </ion-row>
              }
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-string-select [i18n]="widthI18n()" [stringList]="widths" [labels]="widthLabels()"
                    [selectedString]="width()" (selectedStringChange)="onFieldChange('width', $event)"
                    [readOnly]="isReadOnly()" />
                </ion-col>
                @if (!isDisplay()) {
                  <ion-col size="12" size-md="6">
                    <okr-checkbox [i18n]="requiredI18n()" [checked]="required()" (checkedChange)="onFieldChange('required', $event)"
                      [toggle]="true" justify="space-between" labelPlacement="start" [readOnly]="isReadOnly()" />
                  </ion-col>
                }
              </ion-row>
              @if (!isDisplay()) {
                <ion-row>
                  <ion-col size="12" size-md="6">
                    <okr-text-input [i18n]="helpI18n()" [value]="helpText()" (valueChange)="onFieldChange('helpText', $event)"
                      [maxLength]="longNameLength" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="helpTextErrors()" />
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <okr-text-input [i18n]="placeholderI18n()" [value]="placeholder()" (valueChange)="onFieldChange('placeholder', $event)"
                      [maxLength]="nameLength" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="placeholderErrors()" />
                  </ion-col>
                </ion-row>
              }
            </ion-grid>
          </ion-card-content>
        </ion-card>
      </form>
    }
  `,
})
export class FieldConfigForm {
  /** kept in step with the caps the Vest suite enforces on these fields */
  protected readonly nameLength = NAME_LENGTH;
  protected readonly longNameLength = LONG_NAME_LENGTH;
  protected readonly widths = FIELD_WIDTHS;

  // inputs
  public readonly i18n = input.required<FormI18n>();
  public formData = model.required<Field>();
  /** names of the selectable category lists (`categories` collection), for a 'category' field */
  public readonly categoryNames = input<string[]>([]);
  public readonly readOnly = input(false);
  public readonly showForm = input(true);

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  // signal form — wraps formData with Vest validation
  protected readonly fieldConfigForm = form(this.formData, (path) =>
    validateVestTree(path, fieldConfigValidations as any),
  );

  // per-field Vest errors for the notes under each field
  private readonly validationResult = computed(() => fieldConfigValidations(this.formData()));
  protected labelErrors = computed(() => this.validationResult().getErrors('label'));
  protected keyErrors = computed(() => this.validationResult().getErrors('key'));
  protected categoryNameErrors = computed(() => this.validationResult().getErrors('categoryName'));
  protected helpTextErrors = computed(() => this.validationResult().getErrors('helpText'));
  protected placeholderErrors = computed(() => this.validationResult().getErrors('placeholder'));

  constructor() {
    effect(() => this.valid.emit(this.fieldConfigForm().valid()));
  }

  // computed field accessors
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly isDisplay = computed(() => isDisplayField(this.formData().type));
  /** display elements whose static text is entered as prose */
  protected readonly isTextElement = computed(() => this.formData().type === 'label' || this.formData().type === 'paragraph');
  // a paragraph is indented and small unless switched off
  protected readonly isIndented = computed(() => {
    const fd = this.formData();
    return fd.type === 'paragraph' ? fd.isIndented !== false : false;
  });
  protected readonly isSmall = computed(() => {
    const fd = this.formData();
    return fd.type === 'paragraph' ? fd.isSmall !== false : false;
  });
  protected readonly labelLength = computed(() => fieldLabelLength(this.formData()));
  protected readonly label = computed(() => this.formData().label ?? '');
  protected readonly key = computed(() => this.formData().key ?? '');
  protected readonly width = computed(() => this.formData().width ?? 'full');
  protected readonly required = computed(() => this.formData().required === true);
  protected readonly helpText = computed(() => this.formData().helpText ?? '');
  protected readonly placeholder = computed(() => this.formData().placeholder ?? '');
  protected readonly categoryName = computed(() => {
    const fd = this.formData();
    return fd.type === 'category' ? fd.categoryName ?? '' : '';
  });

  protected readonly textI18n = computed<NotesInputI18n>(() => ({
    name: 'label', label: this.i18n().field_text(), placeholder: '',
  }));
  protected readonly labelI18n = computed<TextInputI18n>(() => ({
    name: 'label', label: this.i18n().field_label(), placeholder: '', helper: '',
  }));
  protected readonly keyI18n = computed<TextInputI18n>(() => ({
    name: 'key', label: this.i18n().field_key(), placeholder: 'firstName', helper: this.i18n().field_key_helper(),
  }));
  protected readonly categoryI18n = computed<StringSelectI18n>(() => ({
    name: 'categoryName', label: this.i18n().field_category(), helper: this.i18n().field_category_helper(),
  }));
  protected readonly widthI18n = computed<StringSelectI18n>(() => ({
    name: 'width', label: this.i18n().width(),
  }));
  protected readonly widthLabels = computed(() => [
    this.i18n().field_width_full(), this.i18n().field_width_half(), this.i18n().field_width_third(),
  ]);
  protected readonly isIndentedI18n = computed<CheckboxI18n>(() => ({
    name: 'isIndented', label: this.i18n().field_is_indented(), helper: '',
  }));
  protected readonly isSmallI18n = computed<CheckboxI18n>(() => ({
    name: 'isSmall', label: this.i18n().field_is_small(), helper: '',
  }));
  protected readonly requiredI18n = computed<CheckboxI18n>(() => ({
    name: 'required', label: this.i18n().required(), helper: '',
  }));
  protected readonly helpI18n = computed<TextInputI18n>(() => ({
    name: 'helpText', label: this.i18n().help(), placeholder: '', helper: '',
  }));
  protected readonly placeholderI18n = computed<TextInputI18n>(() => ({
    name: 'placeholder', label: this.i18n().field_placeholder(), placeholder: '', helper: '',
  }));

  protected onFieldChange(fieldName: string, fieldValue: string | boolean): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }) as Field);
  }
}
