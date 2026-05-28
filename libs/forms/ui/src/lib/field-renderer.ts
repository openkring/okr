import { Component, input } from '@angular/core';
import { ReactiveFormsModule, FormControl } from '@angular/forms';
import {
  IonCheckbox, IonInput, IonItem, IonLabel, IonNote,
  IonRadio, IonRadioGroup, IonSelect, IonSelectOption, IonTextarea, IonToggle,
} from '@ionic/angular/standalone';
import { Field } from '@bk2/shared-models';

@Component({
  selector: 'bk-field-renderer',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    IonItem, IonLabel, IonNote,
    IonInput, IonTextarea, IonCheckbox, IonToggle,
    IonSelect, IonSelectOption, IonRadioGroup, IonRadio,
  ],
  styles: [`
    .field-full  { width: 100%; }
    .field-half  { width: 50%; }
    .field-third { width: 33.33%; }
    .help-text   { font-size: 12px; color: var(--ion-color-medium); padding: 2px 16px 4px; }
  `],
  template: `
    @switch (field().type) {
      @case ('text') {
        <ion-item [class]="'field-' + field().width">
          <ion-label position="stacked">{{ field().label }}@if(field().required){<span> *</span>}</ion-label>
          @if ($any(field()).multiline) {
            <ion-textarea [formControl]="control()" [placeholder]="field().placeholder ?? ''" [rows]="4" auto-grow />
          } @else {
            <ion-input [formControl]="control()" [placeholder]="field().placeholder ?? ''" type="text" />
          }
        </ion-item>
      }
      @case ('email') {
        <ion-item [class]="'field-' + field().width">
          <ion-label position="stacked">{{ field().label }}@if(field().required){<span> *</span>}</ion-label>
          <ion-input [formControl]="control()" [placeholder]="field().placeholder ?? ''" type="email" />
        </ion-item>
      }
      @case ('number') {
        <ion-item [class]="'field-' + field().width">
          <ion-label position="stacked">{{ field().label }}@if(field().required){<span> *</span>}</ion-label>
          <ion-input [formControl]="control()" [placeholder]="field().placeholder ?? ''" type="number"
            [min]="$any(field()).min ?? null" [max]="$any(field()).max ?? null" [step]="$any(field()).step ?? 1" />
        </ion-item>
      }
      @case ('phone') {
        <ion-item [class]="'field-' + field().width">
          <ion-label position="stacked">{{ field().label }}@if(field().required){<span> *</span>}</ion-label>
          <ion-input [formControl]="control()" [placeholder]="field().placeholder ?? '+41 ...'" type="tel" />
        </ion-item>
      }
      @case ('iban') {
        <ion-item [class]="'field-' + field().width">
          <ion-label position="stacked">{{ field().label }}@if(field().required){<span> *</span>}</ion-label>
          <ion-input [formControl]="control()" [placeholder]="field().placeholder ?? 'CH..'" type="text" />
        </ion-item>
      }
      @case ('password') {
        <ion-item [class]="'field-' + field().width">
          <ion-label position="stacked">{{ field().label }}@if(field().required){<span> *</span>}</ion-label>
          <ion-input [formControl]="control()" type="password" />
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
          <ion-item [class]="'field-' + field().width">
            <ion-label>{{ field().label }}@if(field().required){<span> *</span>}</ion-label>
            <ion-toggle [formControl]="control()" slot="end" />
          </ion-item>
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
