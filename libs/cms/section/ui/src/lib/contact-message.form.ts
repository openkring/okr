import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';

import { ContactFormField, ContactFormFieldName } from '@okr/shared-models';
import { EmailInput, EmailInputI18n, ErrorNote, PhoneInput, PhoneInputI18n, TextareaInput, TextInput, TextInputI18n } from '@okr/shared-ui';
import { validateVestTree, vestErrors } from '@okr/shared-util-angular';
import { CONTACT_FORM_MAX_LENGTH, ContactFormModel, contactFormValidations, SectionI18n } from '@okr/cms-section-util';

/**
 * The visitor's message form of a contact section: up to five fields (first and last name,
 * email, phone, message), shown and required as the section configures them. No submit button:
 * the section sends (it owns the recipient), this form reports `valid`.
 */
@Component({
  selector: 'okr-contact-message-form',
  standalone: true,
  imports: [TextInput, EmailInput, PhoneInput, TextareaInput, ErrorNote],
  styles: [`
    .names { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); column-gap: 8px; }
  `],
  template: `
    <form novalidate>
      <div class="names">
        @if(isShown('firstName')) {
          <div>
            <okr-text-input [i18n]="textI18n().firstName" [value]="formData().firstName" (valueChange)="onFieldChange('firstName', $event)"
              [maxLength]="maxLength.firstName" autocomplete="given-name" [readOnly]="readOnly()" />
            <okr-error-note [errors]="errorsFor('firstName')" />
          </div>
        }
        @if(isShown('lastName')) {
          <div>
            <okr-text-input [i18n]="textI18n().lastName" [value]="formData().lastName" (valueChange)="onFieldChange('lastName', $event)"
              [maxLength]="maxLength.lastName" autocomplete="family-name" [readOnly]="readOnly()" />
            <okr-error-note [errors]="errorsFor('lastName')" />
          </div>
        }
      </div>
      @if(isShown('email')) {
        <okr-email [i18n]="emailI18n()" [value]="formData().email" (valueChange)="onFieldChange('email', $event)"
          [maxLength]="maxLength.email" [copyable]="false" [showHelper]="false" [readOnly]="readOnly()" />
        <okr-error-note [errors]="errorsFor('email')" />
      }
      @if(isShown('phone')) {
        <okr-phone [i18n]="phoneI18n()" [value]="formData().phone" (valueChange)="onFieldChange('phone', $event)"
          [maxLength]="maxLength.phone" [copyable]="false" [showHelper]="false" [readOnly]="readOnly()" />
        <okr-error-note [errors]="errorsFor('phone')" />
      }
      @if(isShown('message')) {
        <okr-textarea-input [i18n]="textI18n().message" [value]="formData().message" (valueChange)="onFieldChange('message', $event)"
          [maxLength]="maxLength.message" [rows]="5" [readOnly]="readOnly()" />
        <okr-error-note [errors]="errorsFor('message')" />
      }
    </form>
  `,
})
export class ContactMessageForm {
  public formData = model.required<ContactFormModel>();
  public readonly fields = input.required<ContactFormField[]>();
  public readonly i18n = input.required<SectionI18n>();
  public readonly readOnly = input(false);

  public readonly valid = output<boolean>();
  public readonly dirty = output<boolean>();

  protected readonly maxLength = CONTACT_FORM_MAX_LENGTH;

  // the suite also reads the field configuration; Signal Forms re-runs it when that changes
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected readonly messageForm = form(this.formData, (path) => validateVestTree(path, ((m: ContactFormModel) => contactFormValidations(m, this.fields())) as any));
  private readonly validationResult = vestErrors(this.messageForm);

  public constructor() {
    effect(() => this.valid.emit(this.messageForm().valid()));
  }

  protected readonly textI18n = computed(() => {
    const i = this.i18n();
    const entry = (name: ContactFormFieldName, label: string) => ({ name, label: this.label(name, label), placeholder: '', helper: '' } as TextInputI18n);
    return {
      firstName: entry('firstName', i.contact_field_firstName()),
      lastName: entry('lastName', i.contact_field_lastName()),
      message: entry('message', i.contact_field_message()),
    };
  });
  protected readonly emailI18n = computed(() => ({
    name: 'email', label: this.label('email', this.i18n().contact_field_email()), placeholder: '',
  } as EmailInputI18n));
  protected readonly phoneI18n = computed(() => ({
    name: 'phone', label: this.label('phone', this.i18n().contact_field_phone()), placeholder: '',
  } as PhoneInputI18n));

  protected isShown(name: ContactFormFieldName): boolean {
    return this.fields().some(f => f.name === name && f.isVisible);
  }

  protected errorsFor(name: ContactFormFieldName): string[] {
    return this.validationResult().getErrors(name);
  }

  protected onFieldChange(name: ContactFormFieldName, value: string): void {
    this.dirty.emit(true);
    this.formData.update(vm => ({ ...vm, [name]: value ?? '' }));
  }

  /** a required field carries an asterisk */
  private label(name: ContactFormFieldName, label: string): string {
    return this.fields().some(f => f.name === name && f.isRequired) ? `${label} *` : label;
  }
}
