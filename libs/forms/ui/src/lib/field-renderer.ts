import { Component, computed, effect, input, signal, untracked } from '@angular/core';
import { FormControl } from '@angular/forms';
import { IonItem, IonLabel } from '@ionic/angular';
import {
  CategorySelect, Checkbox, CheckboxGroup, CheckboxGroupI18n, CheckboxI18n, FileInput, FileInputI18n, RadioGroup, RadioGroupI18n, DateInput, DateInputI18n, EmailInput, EmailInputI18n, ErrorNote,
  IbanInput, IbanInputI18n, NotesInput, NotesInputI18n, NumberInput, NumberInputI18n, PasswordInput, PasswordInputI18n,
  PhoneInput, PhoneInputI18n, StringSelect, StringSelectI18n, TextInput, TextInputI18n, TimeInput, TimeInputI18n,
} from '@okr/shared-ui';
import { ChSsnMask } from '@okr/shared-config';
import { SSN_LENGTH } from '@okr/shared-constants';
import { CategoryListModel, Field, OTHER_OPTION_VALUE } from '@okr/shared-models';
import { AhvFormat, FORM_OTHER_TEXT_MAX, PublicCourseOption, fill, formatAhv, formatCourseRange } from '@okr/shared-util-core';

/** Angular validator error → `validation.*` key of the main i18n bundle (resolved by okr-error-note). */
const ERROR_KEYS: [string, string][] = [
  ['required', 'required'],
  ['email', 'validEmailFormat'],
  ['minlength', 'tooShort'],
  ['maxlength', 'tooLong'],
  ['phone', 'addressInvalidPhoneFormat'],
  ['iban', 'validIban'],
  ['ibanCountry', 'validIban'],
  ['ssn', 'validSSN'],
  ['min', 'minWrong'],
  ['max', 'maxWrong'],
  ['minDate', 'minWrong'],
  ['maxDate', 'maxWrong'],
];

/** The labels of the «Andere …» choice and its text (spec §9) — resolved by the host from `FORM_I18N_KEYS`. */
export interface FieldOtherI18n {
  /** the last option, e.g. «Andere …» */
  option: string;
  /** the placeholder of its text input, e.g. «Deine Antwort» */
  placeholder: string;
}

/** The fallback for a host that passes no labels (the German texts of `field_other_option` / `field_other_placeholder`). */
export const DEFAULT_FIELD_OTHER_I18N: FieldOtherI18n = { option: 'Andere …', placeholder: 'Deine Antwort' };

/** The texts of the course choice (1.152) — resolved by the host from `FORM_I18N_KEYS`. */
export interface FieldCourseI18n {
  /** shown while the applicant type is unknown, e.g. «Sobald du dein Geburtsdatum angegeben hast …» */
  hint: string;
  /** «noch {count} Plätze» */
  places: string;
  /** «noch 1 Platz» */
  placesOne: string;
  /** «ausgebucht» */
  full: string;
}

/** The fallback for a host that passes no labels (the German texts). */
export const DEFAULT_FIELD_COURSE_I18N: FieldCourseI18n = {
  hint: 'Sobald du dein Geburtsdatum angegeben hast, siehst du hier die passenden Kurse.',
  places: 'noch {count} Plätze',
  placesOne: 'noch 1 Platz',
  full: 'ausgebucht',
};

/** The usual Swiss example number, shown while an AHV field is empty. */
const SSN_PLACEHOLDER = '756.1234.5678.97';

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
    .paragraph { margin: 0; padding: 8px 16px; white-space: pre-wrap; }
    .paragraph.indented { padding-left: 32px; }
    .paragraph.small { font-size: 0.85em; color: var(--ion-color-medium-shade); }
    .field-divider { border: none; border-top: 1px solid var(--ion-color-step-200, #ccc); margin: 12px 16px; }
  `],
  template: `
    @switch (field().type) {
      @case ('text') {
        @if ($any(field()).multiline) {
          <okr-notes-input [i18n]="notesI18n()" [value]="strValue()" (valueChange)="setValue($event)" [readOnly]="readOnly()" />
        } @else {
          <okr-text-input [i18n]="textI18n()" [value]="strValue()" (valueChange)="setValue($event)" [readOnly]="readOnly()" />
        }
      }
      @case ('email') {
        <okr-email [i18n]="emailI18n()" [value]="strValue()" (valueChange)="setValue($event)" [readOnly]="readOnly()" [copyable]="false" />
      }
      @case ('iban') {
        <okr-iban [i18n]="ibanI18n()" [value]="strValue()" (valueChange)="setValue($event)" [readOnly]="readOnly()" [copyable]="false" />
      }
      @case ('ssn') {
        <okr-text-input [i18n]="ssnI18n()" [value]="ssnValue()" (valueChange)="setValue($event)"
          [maxLength]="ssnLength" [mask]="ssnMask" [readOnly]="readOnly()" />
      }
      @case ('phone') {
        <okr-phone [i18n]="phoneI18n()" [value]="strValue()" (valueChange)="setValue($event)" [readOnly]="readOnly()" [copyable]="false" />
      }
      @case ('password') {
        <okr-password-input [i18n]="passwordI18n()" [value]="strValue()" (valueChange)="setValue($event)" [copyable]="false" />
      }
      @case ('number') {
        <okr-number-input [i18n]="numberI18n()" [value]="$any(control().value)" (valueChange)="setValue($event)" [readOnly]="readOnly()"
          [min]="$any(field()).min" [max]="$any(field()).max" [integer]="$any(field()).integer ?? false" />
      }
      @case ('date') {
        <okr-date-input [i18n]="dateI18n()" [storeDate]="strValue()" (storeDateChange)="setValue($event)" [readOnly]="readOnly()" />
      }
      @case ('time') {
        <okr-time-input [i18n]="timeI18n()" [value]="strValue()" (valueChange)="setValue($event)" [readOnly]="readOnly()" locale="de-ch" />
      }
      @case ('dropdown') {
        <okr-string-select [i18n]="selectI18n()" [stringList]="optionValues()" [labels]="optionLabels()"
          [selectedString]="strValue()" (selectedStringChange)="setValue($event)" [readOnly]="readOnly()" />
      }
      @case ('category') {
        @if (category(); as category) {
          <okr-cat-select [category]="category" [selectedItemName]="strValue()" (selectedItemNameChange)="setValue($event)"
            [readOnly]="readOnly()" [fieldStyle]="true" [label]="fieldLabel()" />
        }
      }

      @case ('checkbox') {
        @if ($any(field()).options?.length) {
          <okr-checkbox-group [i18n]="groupI18n()" [stringList]="optionValues()" [labels]="optionLabels()"
            [selectedStrings]="arrValue()" (selectedStringsChange)="setValue($event)" [readOnly]="readOnly()" />
        } @else {
          <okr-checkbox [i18n]="checkboxI18n()" [checked]="boolValue()" (checkedChange)="setValue($event)" [readOnly]="readOnly()" />
        }
      }
      @case ('radio') {
        <okr-radio-group [i18n]="groupI18n()" [stringList]="optionValues()" [labels]="optionLabels()"
          [selectedString]="strValue()" (selectedStringChange)="setValue($event)" [readOnly]="readOnly()" />
      }
      @case ('file') {
        <okr-file-input [i18n]="fileI18n()" [accept]="$any(field()).accept ?? '*/*'" [multiple]="maxCount() > 1"
          (filesChange)="onFilesChange($event)" [readOnly]="readOnly()" />
      }
      @case ('images') {
        <okr-file-input [i18n]="fileI18n()" accept="image/*" [multiple]="maxCount() > 1"
          (filesChange)="onFilesChange($event)" [readOnly]="readOnly()" />
      }
      @case ('label') {
        <div class="static-label">{{ field().label }}</div>
      }
      @case ('paragraph') {
        <p class="paragraph" [class.indented]="$any(field()).isIndented !== false" [class.small]="$any(field()).isSmall !== false">{{ field().label }}</p>
      }
      @case ('divider') {
        <hr class="field-divider" />
      }
      @case ('course') {
        <!-- the course choice (1.152): one checkbox per course, ticking one unticks the others -->
        @if (!audienceKnown()) {
          <div class="static-label">{{ field().label }}</div>
          <div class="help-text">{{ courseI18n().hint }}</div>
        } @else if (courses().length > 0) {
          <div class="static-label">{{ field().label }}</div>
          @for (c of courses(); track c.key) {
            <okr-checkbox [i18n]="courseCheckboxI18n(c)" [checked]="courseValue() === c.key"
              (checkedChange)="pickCourse(c.key, $event)" [readOnly]="readOnly() || c.isFull" />
          }
        }
      }
      @case ('implicit') {
        <!-- never rendered: the value comes from the section or the link (1.125 B) -->
      }
      @default {
        <ion-item lines="none">
          <ion-label color="medium">{{ field().label }} ({{ field().type }})</ion-label>
        </ion-item>
      }
    }
    <!-- «Andere …» picked: its own required text, stored under <key>Other (spec §9) -->
    @if (otherSelected()) {
      @if (otherControl(); as other) {
        <okr-text-input [i18n]="otherTextI18n()" [value]="otherValue()" (valueChange)="setOtherValue($event)"
          [maxLength]="otherTextMax" [readOnly]="readOnly()" />
        <okr-error-note [errors]="errorKeysOf(other)" />
      }
    }
    @if (field().type !== 'implicit') {
      @if (field().helpText) {
        <div class="help-text">{{ field().helpText }}</div>
      }
      <okr-error-note [errors]="errorKeys()" />
    }
  `,
})
export class FieldRenderer {
  public readonly field = input.required<Field>();
  public readonly control = input.required<FormControl>();
  /** the category list of a 'category' field (looked up by the parent from field.categoryName) */
  public readonly category = input<CategoryListModel | undefined>();
  /** shown but not changeable — a field a link pre-filled with `lockWhenPrefilled` (spec §8); its value still submits */
  public readonly readOnly = input(false);
  /** the `<key>Other` control of a field with `allowOther`; absent otherwise */
  public readonly otherControl = input<FormControl | undefined>();
  public readonly otherI18n = input<FieldOtherI18n>(DEFAULT_FIELD_OTHER_I18N);
  /** the courses offered to the applicant (already filtered by type) — a 'course' field only */
  public readonly courses = input<PublicCourseOption[]>([]);
  /** the applicant type is known; until then a 'course' field shows its hint */
  public readonly audienceKnown = input(false);
  public readonly courseI18n = input<FieldCourseI18n>(DEFAULT_FIELD_COURSE_I18N);

  /** mirror of the control's value: the parent may clear it from outside an event */
  protected readonly courseValue = signal('');

  constructor() {
    effect((onCleanup) => {
      const control = this.control();
      untracked(() => {
        this.courseValue.set(typeof control.value === 'string' ? control.value : '');
        const sub = control.valueChanges.subscribe(v => this.courseValue.set(typeof v === 'string' ? v : ''));
        onCleanup(() => sub.unsubscribe());
      });
    });

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
  protected readonly ssnI18n = computed<TextInputI18n>(() => ({
    name: this.field().key, label: this.fieldLabel(), placeholder: this.field().placeholder || SSN_PLACEHOLDER, helper: '',
  }));
  /** the AHV mask and the length cap the person form uses for the same number */
  protected readonly ssnMask = ChSsnMask;
  protected readonly ssnLength = SSN_LENGTH;
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
  /** «Andere …» is offered: `allowOther` on a choice field with options, and the parent gave it a text control */
  private readonly hasOther = computed(() => {
    const f = this.field();
    const allows = (f.type === 'dropdown' || f.type === 'radio' || f.type === 'checkbox') && f.allowOther === true;
    return allows && this.options().length > 0 && !!this.otherControl();
  });
  protected readonly optionValues = computed(() =>
    [...this.options().map(o => o.value), ...(this.hasOther() ? [OTHER_OPTION_VALUE] : [])]
  );
  protected readonly optionLabels = computed(() =>
    [...this.options().map(o => o.label), ...(this.hasOther() ? [this.otherI18n().option] : [])]
  );
  protected readonly otherTextI18n = computed<TextInputI18n>(() => ({
    name: this.field().key + 'Other', label: this.otherI18n().option + ' *', placeholder: this.otherI18n().placeholder, helper: '',
  }));
  /** the same cap the server enforces on an «Andere» text */
  protected readonly otherTextMax = FORM_OTHER_TEXT_MAX;

  // bridge: primitives emit (value/checked)Change → write back into the FormControl
  protected strValue(): string { return (this.control().value ?? '') as string; }
  /** a complete number shows as 756.1234.5678.97; a half-typed one is handed back unchanged (formatAhv) */
  protected ssnValue(): string { return formatAhv(this.strValue(), AhvFormat.Friendly); }
  protected boolValue(): boolean { return !!this.control().value; }
  protected arrValue(): string[] { return Array.isArray(this.control().value) ? this.control().value as string[] : []; }
  protected setValue(value: string | string[] | boolean | number | File | File[] | null): void {
    this.control().setValue(value);
    this.control().markAsDirty();
    this.control().markAsTouched();
  }

  /** «Name · 12.03.–30.04.2027», with «noch 3 Plätze» / «ausgebucht» when the course is limited */
  protected courseCheckboxI18n(course: PublicCourseOption): CheckboxI18n {
    const i18n = this.courseI18n();
    let places = '';
    if (course.isFull) places = i18n.full;
    else if (course.remaining === 1) places = i18n.placesOne;
    else if (course.remaining > 1) places = fill(i18n.places, { count: course.remaining });
    const range = formatCourseRange(course.startDate, course.endDate);
    const label = [course.name, range].filter(Boolean).join(' · ') + (places ? ' – ' + places : '');
    return { name: this.field().key + '-' + course.key, label, helper: '' };
  }

  /** single choice in checkbox look: ticking sets the key (the others untick), unticking empties it */
  protected pickCourse(key: string, checked: boolean): void {
    if (checked) this.setValue(key);
    else if (this.courseValue() === key) this.setValue('');
  }

  /** whether the answer is «Andere …» (the reserved value, or a list holding it) */
  protected otherSelected(): boolean {
    if (!this.hasOther()) return false;
    const value = this.control().value;
    return Array.isArray(value) ? value.includes(OTHER_OPTION_VALUE) : value === OTHER_OPTION_VALUE;
  }
  protected otherValue(): string { return (this.otherControl()?.value ?? '') as string; }
  protected setOtherValue(value: string): void {
    const other = this.otherControl();
    if (!other) return;
    other.setValue(value);
    other.markAsDirty();
    other.markAsTouched();
  }

  /** The first validation error as a `validation.*` key; empty until the user has touched the field. */
  protected errorKeys(): string[] {
    return this.errorKeysOf(this.control());
  }

  protected errorKeysOf(control: FormControl): string[] {
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
