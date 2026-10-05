import { Component, computed, effect, input, untracked } from '@angular/core';
import { FormControl } from '@angular/forms';
import { IonItem, IonLabel } from '@ionic/angular/standalone';
import {
  CategorySelect, Checkbox, CheckboxGroup, CheckboxGroupI18n, CheckboxI18n, FileInput, FileInputI18n, RadioGroup, RadioGroupI18n, DateInput, DateInputI18n, EmailInput, EmailInputI18n, ErrorNote,
  IbanInput, IbanInputI18n, NotesInput, NotesInputI18n, NumberInput, NumberInputI18n, PasswordInput, PasswordInputI18n,
  PhoneInput, PhoneInputI18n, StringSelect, StringSelectI18n, TextInput, TextInputI18n, TimeInput, TimeInputI18n,
} from '@okr/shared-ui';
import { CategoryListModel, Field } from '@okr/shared-models';

/** Angular validator error → `validation.*` key of the main i18n bundle (resolved by okr-error-note). */
const ERROR_KEYS: [string, string][] = [
  ['required', 'required'],
  ['email', 'validEmailFormat'],
  ['minlength', 'tooShort'],
  ['maxlength', 'tooLong'],
  ['phone', 'addressInvalidPhoneFormat'],
  ['iban', 'validIban'],
  ['ibanCountry', 'validIban'],
  ['min', 'minWrong'],
  ['max', 'maxWrong'],
  ['minDate', 'minWrong'],
  ['maxDate', 'maxWrong'],
];

/**
 * Renders one form-builder field. The width (full/half/third) is applied by the parent
 * FormRenderer on this host element, so consecutive narrow fields share a line.
 */
@Component({
  selector: 'okr-field-renderer',
  standalone: true,
  imports: [
    IonItem, IonLabel,
    TextInput, NotesInput, EmailInput, PhoneInput, IbanInput, PasswordInput, NumberInput,
    DateInput, TimeInput, Checkbox, CheckboxGroup, RadioGroup, FileInput, StringSelect, CategorySelect, ErrorNote,
  ],
  styles: [`
    :host { display: block; }
    .help-text   { font-size: 12px; color: var(--ion-color-medium); padding: 2px 16px 4px; }
    .static-label { padding: 8px 16px; white-space: pre-wrap; }
    .field-divider { border: none; border-top: 1px solid var(--ion-color-step-200, #ccc); margin: 12px 16px; }
  `],
  template: `
    @switch (field().type) {
      @case ('text') {
        @if ($any(field()).multiline) {
          <okr-notes-input [i18n]="notesI18n()" [value]="strValue()" (valueChange)="setValue($event)" [readOnly]="false" />
        } @else {
          <okr-text-input [i18n]="textI18n()" [value]="strValue()" (valueChange)="setValue($event)" [readOnly]="false" />
        }
      }
      @case ('email') {
        <okr-email [i18n]="emailI18n()" [value]="strValue()" (valueChange)="setValue($event)" [readOnly]="false" [copyable]="false" />
      }
      @case ('iban') {
        <okr-iban [i18n]="ibanI18n()" [value]="strValue()" (valueChange)="setValue($event)" [readOnly]="false" [copyable]="false" />
      }
      @case ('phone') {
        <okr-phone [i18n]="phoneI18n()" [value]="strValue()" (valueChange)="setValue($event)" [readOnly]="false" [copyable]="false" />
      }
      @case ('password') {
        <okr-password-input [i18n]="passwordI18n()" [value]="strValue()" (valueChange)="setValue($event)" [copyable]="false" />
      }
      @case ('number') {
        <okr-number-input [i18n]="numberI18n()" [value]="$any(control().value)" (valueChange)="setValue($event)" [readOnly]="false"
          [min]="$any(field()).min" [max]="$any(field()).max" [integer]="$any(field()).integer ?? false" />
      }
      @case ('date') {
        <okr-date-input [i18n]="dateI18n()" [storeDate]="strValue()" (storeDateChange)="setValue($event)" [readOnly]="false" />
      }
      @case ('time') {
        <okr-time-input [i18n]="timeI18n()" [value]="strValue()" (valueChange)="setValue($event)" [readOnly]="false" locale="de-ch" />
      }
      @case ('dropdown') {
        <okr-string-select [i18n]="selectI18n()" [stringList]="optionValues()" [labels]="optionLabels()"
          [selectedString]="strValue()" (selectedStringChange)="setValue($event)" [readOnly]="false" />
      }
      @case ('category') {
        @if (category(); as category) {
          <okr-cat-select [category]="category" [selectedItemName]="strValue()" (selectedItemNameChange)="setValue($event)"
            [readOnly]="false" [fieldStyle]="true" [label]="fieldLabel()" />
        }
      }

      @case ('checkbox') {
        @if ($any(field()).options?.length) {
          <okr-checkbox-group [i18n]="groupI18n()" [stringList]="optionValues()" [labels]="optionLabels()"
            [selectedStrings]="arrValue()" (selectedStringsChange)="setValue($event)" [readOnly]="false" />
        } @else {
          <okr-checkbox [i18n]="checkboxI18n()" [checked]="boolValue()" (checkedChange)="setValue($event)" [readOnly]="false" />
        }
      }
      @case ('radio') {
        <okr-radio-group [i18n]="groupI18n()" [stringList]="optionValues()" [labels]="optionLabels()"
          [selectedString]="strValue()" (selectedStringChange)="setValue($event)" [readOnly]="false" />
      }
      @case ('file') {
        <okr-file-input [i18n]="fileI18n()" [accept]="$any(field()).accept ?? '*/*'" [multiple]="maxCount() > 1"
          (filesChange)="onFilesChange($event)" [readOnly]="false" />
      }
      @case ('images') {
        <okr-file-input [i18n]="fileI18n()" accept="image/*" [multiple]="maxCount() > 1"
          (filesChange)="onFilesChange($event)" [readOnly]="false" />
      }
      @case ('label') {
        <div class="static-label">{{ field().label }}</div>
      }
      @case ('divider') {
        <hr class="field-divider" />
      }
      @default {
        <ion-item lines="none">
          <ion-label color="medium">{{ field().label }} ({{ field().type }})</ion-label>
        </ion-item>
      }
    }
    @if (field().helpText) {
      <div class="help-text">{{ field().helpText }}</div>
    }
    <okr-error-note [errors]="errorKeys()" />
  `,
})
export class FieldRenderer {
  public readonly field = input.required<Field>();
  public readonly control = input.required<FormControl>();
  /** the category list of a 'category' field (looked up by the parent from field.categoryName) */
  public readonly category = input<CategoryListModel | undefined>();

  constructor() {
    // a category select always shows an item: store the first one until the user picks another
    effect(() => {
      const category = this.category();
      if (this.field().type !== 'category' || !category?.items.length) return;
      untracked(() => {
        if (!this.control().value) this.control().setValue(category.items[0].name);
      });
    });
  }

  // required marker appended to the primitive's own label
  protected readonly fieldLabel = computed(() => this.field().label + (this.field().required ? ' *' : ''));

  protected readonly textI18n = computed<TextInputI18n>(() => ({
    name: this.field().key, label: this.fieldLabel(), placeholder: this.field().placeholder ?? '', helper: '',
  }));
  protected readonly notesI18n = computed<NotesInputI18n>(() => ({
    name: this.field().key, label: this.fieldLabel(), placeholder: this.field().placeholder ?? '',
  }));
  protected readonly emailI18n = computed<EmailInputI18n>(() => ({
    name: this.field().key, label: this.fieldLabel(), placeholder: this.field().placeholder ?? '',
  }));
  protected readonly ibanI18n = computed<IbanInputI18n>(() => ({
    name: this.field().key, label: this.fieldLabel(), placeholder: this.field().placeholder ?? '',
  }));
  protected readonly phoneI18n = computed<PhoneInputI18n>(() => ({
    name: this.field().key, label: this.fieldLabel(), placeholder: this.field().placeholder ?? '',
  }));
  protected readonly passwordI18n = computed<PasswordInputI18n>(() => ({
    name: this.field().key, label: this.fieldLabel(), placeholder: this.field().placeholder ?? '',
  }));
  protected readonly numberI18n = computed<NumberInputI18n>(() => ({
    name: this.field().key, label: this.fieldLabel(), placeholder: this.field().placeholder ?? '', helper: '',
  }));
  protected readonly dateI18n = computed<DateInputI18n>(() => ({
    name: this.field().key, label: this.fieldLabel(), placeholder: this.field().placeholder ?? '',
  }));
  protected readonly timeI18n = computed<TimeInputI18n>(() => ({
    name: this.field().key, label: this.fieldLabel(), placeholder: this.field().placeholder ?? '',
  }));
  protected readonly selectI18n = computed<StringSelectI18n>(() => ({
    name: this.field().key, label: this.fieldLabel(),
  }));
  protected readonly checkboxI18n = computed<CheckboxI18n>(() => ({
    name: this.field().key, label: this.fieldLabel(), helper: '',
  }));

  protected readonly groupI18n = computed<RadioGroupI18n & CheckboxGroupI18n>(() => ({
    name: this.field().key, label: this.fieldLabel(),
  }));
  protected readonly fileI18n = computed<FileInputI18n>(() => ({
    name: this.field().key, label: this.fieldLabel(),
  }));

  private readonly options = computed(() => {
    const f = this.field();
    return f.type === 'dropdown' || f.type === 'radio' || f.type === 'checkbox' ? f.options ?? [] : [];
  });
  protected readonly maxCount = computed(() => {
    const f = this.field();
    return f.type === 'file' || f.type === 'images' ? f.maxCount ?? 1 : 1;
  });
  protected readonly optionValues = computed(() => this.options().map(o => o.value));
  protected readonly optionLabels = computed(() => this.options().map(o => o.label));

  // bridge: primitives emit (value/checked)Change → write back into the FormControl
  protected strValue(): string { return (this.control().value ?? '') as string; }
  protected boolValue(): boolean { return !!this.control().value; }
  protected arrValue(): string[] { return Array.isArray(this.control().value) ? this.control().value as string[] : []; }
  protected setValue(value: string | string[] | boolean | number | File | File[] | null): void {
    this.control().setValue(value);
    this.control().markAsDirty();
    this.control().markAsTouched();
  }

  /** The first validation error as a `validation.*` key; empty until the user has touched the field. */
  protected errorKeys(): string[] {
    const control = this.control();
    if (!control.invalid || !control.touched || !control.errors) return [];
    const errors = control.errors;
    const match = ERROR_KEYS.find(([error]) => errors[error]);
    return [match ? match[1] : 'invalidValue'];
  }

  /** a single File, or File[] when the field allows several — uploaded on submit by FormSubmitService */
  protected onFilesChange(files: File[]): void {
    if (files.length === 0) this.setValue(null);
    else this.setValue(this.maxCount() > 1 ? files : files[0]);
  }
}
