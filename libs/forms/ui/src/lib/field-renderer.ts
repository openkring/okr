import { Component, computed, input } from '@angular/core';
import { ReactiveFormsModule, FormControl } from '@angular/forms';
import { IonCheckbox, IonInput, IonItem, IonLabel, IonNote, IonRadio, IonRadioGroup, IonSelect, IonSelectOption } from '@ionic/angular/standalone';
import {
  Checkbox, CheckboxI18n, NotesInput, NotesInputI18n, PasswordInput, PasswordInputI18n,
  PhoneInput, PhoneInputI18n, TextInput, TextInputI18n,
} from '@bk2/shared-ui';
import { Field } from '@bk2/shared-models';

@Component({
  selector: 'bk-field-renderer',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    IonItem, IonLabel, IonNote, IonInput, IonCheckbox,
    IonSelect, IonSelectOption, IonRadioGroup, IonRadio,
    TextInput, NotesInput, PhoneInput, PasswordInput, Checkbox,
  ],
  styles: [`
    .field-full  { width: 100%; }
    .field-half  { width: 50%; }
    .field-third { width: 33.33%; }
    .help-text   { font-size: 12px; color: var(--ion-color-medium); padding: 2px 16px 4px; }
    .static-label { padding: 8px 16px; white-space: pre-wrap; }
    .field-divider { border: none; border-top: 1px solid var(--ion-color-step-200, #ccc); margin: 12px 16px; }
  `],
  template: `
    @switch (field().type) {
      <!-- migrated to shared/ui primitives (bridged back to the FormControl) -->
      @case ('text') {
        <div [class]="'field-' + field().width">
          @if ($any(field()).multiline) {
            <bk-notes-input [i18n]="notesI18n()" [value]="strValue()" (valueChange)="setValue($event)" [readOnly]="false" />
          } @else {
            <bk-text-input [i18n]="textI18n()" [value]="strValue()" (valueChange)="setValue($event)" [readOnly]="false" />
          }
        </div>
      }
      @case ('email') {
        <div [class]="'field-' + field().width">
          <bk-text-input [i18n]="textI18n()" [value]="strValue()" (valueChange)="setValue($event)" [readOnly]="false" inputMode="email" />
        </div>
      }
      @case ('iban') {
        <div [class]="'field-' + field().width">
          <bk-text-input [i18n]="textI18n()" [value]="strValue()" (valueChange)="setValue($event)" [readOnly]="false" />
        </div>
      }
      @case ('phone') {
        <div [class]="'field-' + field().width">
          <bk-phone [i18n]="phoneI18n()" [value]="strValue()" (valueChange)="setValue($event)" [readOnly]="false" />
        </div>
      }
      @case ('password') {
        <div [class]="'field-' + field().width">
          <bk-password-input [i18n]="passwordI18n()" [value]="strValue()" (valueChange)="setValue($event)" />
        </div>
      }

      <!-- raw controls: a primitive would change stored format or required semantics -->
      @case ('number') {
        <ion-item [class]="'field-' + field().width">
          <ion-label position="stacked">{{ field().label }}@if(field().required){<span> *</span>}</ion-label>
          <ion-input [formControl]="control()" [placeholder]="field().placeholder ?? ''" type="number"
            [min]="$any(field()).min ?? null" [max]="$any(field()).max ?? null" [step]="$any(field()).step ?? 1" />
        </ion-item>
      }
      @case ('dropdown') {
        <ion-item [class]="'field-' + field().width">
          <ion-label position="stacked">{{ field().label }}@if(field().required){<span> *</span>}</ion-label>
          <ion-select [formControl]="control()" [placeholder]="field().placeholder ?? ''">
            @for (opt of $any(field()).options; track opt.value) {
              <ion-select-option [value]="opt.value">{{ opt.label }}</ion-select-option>
            }
          </ion-select>
        </ion-item>
      }
      @case ('checkbox') {
        @if ($any(field()).options?.length) {
          @for (opt of $any(field()).options; track opt.value) {
            <ion-item>
              <ion-label>{{ opt.label }}</ion-label>
              <ion-checkbox slot="end" />
            </ion-item>
          }
        } @else {
          <div [class]="'field-' + field().width">
            <bk-checkbox [i18n]="checkboxI18n()" [checked]="boolValue()" (checkedChange)="setValue($event)" [readOnly]="false" />
          </div>
        }
      }
      @case ('radio') {
        <ion-item>
          <ion-label position="stacked">{{ field().label }}@if(field().required){<span> *</span>}</ion-label>
        </ion-item>
        <ion-radio-group [formControl]="control()">
          @for (opt of $any(field()).options; track opt.value) {
            <ion-item>
              <ion-radio [value]="opt.value" />
              <ion-label>{{ opt.label }}</ion-label>
            </ion-item>
          }
        </ion-radio-group>
      }
      @case ('date') {
        <ion-item [class]="'field-' + field().width">
          <ion-label position="stacked">{{ field().label }}@if(field().required){<span> *</span>}</ion-label>
          <ion-input [formControl]="control()" type="date"
            [min]="$any(field()).min ?? null" [max]="$any(field()).max ?? null" />
        </ion-item>
      }
      @case ('time') {
        <ion-item [class]="'field-' + field().width">
          <ion-label position="stacked">{{ field().label }}@if(field().required){<span> *</span>}</ion-label>
          <ion-input [formControl]="control()" type="time"
            [min]="$any(field()).min ?? null" [max]="$any(field()).max ?? null" />
        </ion-item>
      }
      @case ('file') {
        <ion-item [class]="'field-' + field().width">
          <ion-label position="stacked">{{ field().label }}@if(field().required){<span> *</span>}</ion-label>
          <input
            type="file"
            style="padding: 8px 0; width: 100%;"
            [attr.accept]="$any(field()).accept ?? '*/*'"
            [multiple]="($any(field()).maxCount ?? 1) > 1"
            (change)="onFileChange($event)"
          />
        </ion-item>
      }
      @case ('images') {
        <ion-item [class]="'field-' + field().width">
          <ion-label position="stacked">{{ field().label }}@if(field().required){<span> *</span>}</ion-label>
          <input
            type="file"
            style="padding: 8px 0; width: 100%;"
            accept="image/*"
            [multiple]="($any(field()).maxCount ?? 1) > 1"
            (change)="onFileChange($event)"
          />
        </ion-item>
      }
      @case ('label') {
        <div [class]="'static-label field-' + field().width">{{ field().label }}</div>
      }
      @case ('divider') {
        <hr class="field-divider" />
      }
      @default {
        <ion-item>
          <ion-label color="medium">{{ field().label }} ({{ field().type }} — not rendered yet)</ion-label>
        </ion-item>
      }
    }
    @if (field().helpText) {
      <div class="help-text">{{ field().helpText }}</div>
    }
    @if (control().invalid && control().touched) {
      <ion-note color="danger" style="padding: 2px 16px 4px;">
        @if (control().hasError('required')) { This field is required. }
        @else if (control().hasError('email')) { Enter a valid email address. }
        @else if (control().hasError('minlength')) { Too short. }
        @else if (control().hasError('maxlength')) { Too long. }
        @else if (control().hasError('phone')) { Enter a valid phone number. }
        @else if (control().hasError('iban')) { Enter a valid IBAN. }
        @else { Invalid value. }
      </ion-note>
    }
  `,
})
export class FieldRenderer {
  public readonly field = input.required<Field>();
  public readonly control = input.required<FormControl>();

  // required marker appended to the primitive's own label
  protected readonly fieldLabel = computed(() => this.field().label + (this.field().required ? ' *' : ''));

  protected readonly textI18n = computed<TextInputI18n>(() => ({
    name: this.field().key, label: this.fieldLabel(),
    placeholder: this.field().placeholder ?? '', helper: this.field().helpText ?? '',
  }));
  protected readonly notesI18n = computed<NotesInputI18n>(() => ({
    name: this.field().key, label: this.fieldLabel(), placeholder: this.field().placeholder ?? '',
  }));
  protected readonly phoneI18n = computed<PhoneInputI18n>(() => ({
    name: this.field().key, label: this.fieldLabel(), placeholder: this.field().placeholder ?? '',
  }));
  protected readonly passwordI18n = computed<PasswordInputI18n>(() => ({
    name: this.field().key, label: this.fieldLabel(), placeholder: this.field().placeholder ?? '',
  }));
  protected readonly checkboxI18n = computed<CheckboxI18n>(() => ({
    name: this.field().key, label: this.fieldLabel(), helper: this.field().helpText ?? '',
  }));

  // bridge: primitives emit (value/checked)Change → write back into the FormControl
  protected strValue(): string { return (this.control().value ?? '') as string; }
  protected boolValue(): boolean { return !!this.control().value; }
  protected setValue(value: string | boolean): void {
    this.control().setValue(value);
    this.control().markAsDirty();
  }

  protected onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (!files || files.length === 0) {
      this.control().setValue(null);
      return;
    }
    // Store single File or FileList depending on maxCount
    const maxCount = (this.field() as unknown as { maxCount?: number }).maxCount ?? 1;
    this.control().setValue(maxCount > 1 ? Array.from(files) : files[0]);
    this.control().markAsDirty();
  }
}
