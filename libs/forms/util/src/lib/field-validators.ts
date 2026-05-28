import { AbstractControl, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { parsePhoneNumber } from 'libphonenumber-js';
import { Field } from '@bk2/shared-models';

export function validatorsFor(field: Field): ValidatorFn[] {
  const fns: ValidatorFn[] = [];
  if (field.required) fns.push(Validators.required);

  switch (field.type) {
    case 'text':
      if (field.minLength) fns.push(Validators.minLength(field.minLength));
      if (field.maxLength) fns.push(Validators.maxLength(field.maxLength));
      if (field.pattern) fns.push(Validators.pattern(field.pattern));
      break;
    case 'email':
      fns.push(Validators.email);
      break;
    case 'number':
      if (field.min !== undefined) fns.push(Validators.min(field.min));
      if (field.max !== undefined) fns.push(Validators.max(field.max));
      break;
    case 'phone':
      fns.push(phoneValidator(field.region));
      break;
    case 'iban':
      fns.push(ibanValidator(field.countryWhitelist));
      break;
    case 'password':
      if (field.minLength) fns.push(Validators.minLength(field.minLength));
      fns.push(passwordComplexityValidator(field));
      break;
    case 'date':
      if (field.min) fns.push(minDateValidator(field.min));
      if (field.max) fns.push(maxDateValidator(field.max));
      break;
    case 'rating':
      break;
  }
  return fns;
}

export function defaultFor(field: Field): unknown {
  switch (field.type) {
    case 'checkbox': return field.options ? [] : false;
    case 'number': return null;
    case 'rating': return null;
    default: return '';
  }
}

function phoneValidator(region?: string): ValidatorFn {
  return (ctrl: AbstractControl): ValidationErrors | null => {
    const val = ctrl.value as string;
    if (!val) return null;
    try {
      const parsed = parsePhoneNumber(val, (region ?? 'CH') as Parameters<typeof parsePhoneNumber>[1]);
      return parsed.isValid() ? null : { phone: true };
    } catch {
      return { phone: true };
    }
  };
}

function ibanValidator(countryWhitelist?: string[]): ValidatorFn {
  return (ctrl: AbstractControl): ValidationErrors | null => {
    const raw = (ctrl.value as string)?.replace(/\s/g, '').toUpperCase();
    if (!raw) return null;
    if (countryWhitelist?.length && !countryWhitelist.includes(raw.substring(0, 2))) {
      return { ibanCountry: true };
    }
    return isValidIban(raw) ? null : { iban: true };
  };
}

function isValidIban(iban: string): boolean {
  if (iban.length < 15 || iban.length > 34) return false;
  const rearranged = iban.substring(4) + iban.substring(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, ch => String(ch.charCodeAt(0) - 55));
  let remainder = 0;
  for (const ch of numeric) {
    remainder = (remainder * 10 + parseInt(ch, 10)) % 97;
  }
  return remainder === 1;
}

function passwordComplexityValidator(field: { requireUppercase?: boolean; requireNumber?: boolean; requireSymbol?: boolean }): ValidatorFn {
  return (ctrl: AbstractControl): ValidationErrors | null => {
    const val = ctrl.value as string;
    if (!val) return null;
    const errors: ValidationErrors = {};
    if (field.requireUppercase && !/[A-Z]/.test(val)) errors['passwordUppercase'] = true;
    if (field.requireNumber && !/[0-9]/.test(val)) errors['passwordNumber'] = true;
    if (field.requireSymbol && !/[^A-Za-z0-9]/.test(val)) errors['passwordSymbol'] = true;
    return Object.keys(errors).length ? errors : null;
  };
}

function minDateValidator(min: string): ValidatorFn {
  return (ctrl: AbstractControl): ValidationErrors | null => {
    const val = ctrl.value as string;
    if (!val) return null;
    return val >= min ? null : { minDate: { min, actual: val } };
  };
}

function maxDateValidator(max: string): ValidatorFn {
  return (ctrl: AbstractControl): ValidationErrors | null => {
    const val = ctrl.value as string;
    if (!val) return null;
    return val <= max ? null : { maxDate: { max, actual: val } };
  };
}
