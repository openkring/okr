import { computed } from '@angular/core';
import { MaskitoOptions } from '@maskito/core';
import { maskitoDateOptionsGenerator, maskitoNumberOptionsGenerator, maskitoTimeOptionsGenerator } from '@maskito/kit';

// 1) Word masks
export const LowercaseWordMask: MaskitoOptions = {
  mask: /^[a-z0-9-_]+$/i,
};
export const UppercaseWordMask: MaskitoOptions = {
  mask: /^[A-Z0-9-_]+$/i,
};
export const CaseInsensitiveWordMask: MaskitoOptions = {
  mask: /^[a-zA-Z0-9-_]+$/,
};

// 2) Text masks
export const LowercaseTextMask: MaskitoOptions = {  
  mask: /^[a-z0-9-_ ]+$/,
};
export const UppercaseTextMask: MaskitoOptions = {
  mask: /^[A-Z0-9-_ ]+$/,
};
export const CaseInsensitiveTextMask: MaskitoOptions = {
  mask: /^[a-zA-Z0-9-_ ]+$/,
};
export const AnyCharacterMask: MaskitoOptions = {
  mask: /^[\s\S]+$/i,
};

// 3) HTML text masks (this is not matching emojis, foreign characters, only typical western html code is matched)
export const HtmlTextMask: MaskitoOptions = {
  mask: /^[a-zA-Z0-9 !-/:-@[-`{-~]+$/,
};
// 3) Number masks or special characters
export const SizeMask: MaskitoOptions = {
  mask: /^\d{1,3}$/,
};
export const BexioIdMask: MaskitoOptions = {
  mask: /^\d{1,6}$/,
};
export const ZoomMask: MaskitoOptions = {
  mask: [/\d/, /\d/]
};
export const What3WordMask: MaskitoOptions = {
  mask: [/\w+/, /\./, /\w+/, /\./, /\w+/]
};
export const ChVatMask: MaskitoOptions = {
  mask: ['C', 'H', 'E', '-', /\d/, /\d/, /\d/, '.', /\d/, /\d/, /\d/, '.', /\d/, /\d/, /\d/, ' ', 'M', 'W', 'S', 'T'],
};
export const ChSsnMask: MaskitoOptions = {
  mask: ['7', '5', '6', '.', /\d/, /\d/, /\d/, /\d/, '.', /\d/, /\d/, /\d/, /\d/, '.', /\d/, /\d/],
};
export const ChZipCodeMask: MaskitoOptions = {
  mask: /^\d{1,4}$/,
};

// passwordMask is used as default in bk-password-input
export const PasswordMask: MaskitoOptions = {
  mask: /^[a-zA-Z0-9_!@?:;äüö$*+&()=]+$/,
};

export const ChIbanMask: MaskitoOptions = {
  mask: ['C', 'H', /\d/, /\d/, ' ', /\d/, /\d/, /\d/, /\d/, ' ', /\d/, /\w/, /\w/, /\w/, ' ', /\w/, /\w/, /\w/, /\w/, ' ', /\w/, /\w/, /\w/, /\w/, ' ', /\w/],
};

// coordinates: latitude, longitude, altitude
// + northern hemisphere, - southern hemisphere
export const LatitudeMask = maskitoNumberOptionsGenerator({
    maximumFractionDigits: 5,
    decimalSeparator: '.',
    min: -90,
    max: 90
});

// longitude: + east of Greenwich, - west of Greenwich
export const LongitudeMask = maskitoNumberOptionsGenerator({
  maximumFractionDigits: 6,
  decimalSeparator: '.',
  min: -180,
  max: 180
});

// altitude: + above sea level, - below sea level
export const AltitudeMask = maskitoNumberOptionsGenerator({
  maximumFractionDigits: 0,
  min: -10928,
  max: +8849
});
 // tbd: solve this based on the locale. Currently, we only support the swiss locale.
 export const ChAnyDate = maskitoDateOptionsGenerator({
  mode: 'dd/mm/yyyy',
  separator: '.',
  min: new Date(1850, 0, 1)
});

export const ChPastDate = maskitoDateOptionsGenerator({
  mode: 'dd/mm/yyyy',
  separator: '.',
  min: new Date(1900, 0, 1),
  max: new Date(),
});

export const ChFutureDate = maskitoDateOptionsGenerator({
  mode: 'dd/mm/yyyy',
  separator: '.',
  min: new Date()
});

export const ChTimeMask = maskitoTimeOptionsGenerator({
  mode: 'HH:MM',
  step: 1
});

/*
  Phone Masks
  tbd: replace with dynamic maskito masks based on countryCode:

  import {maskitoPhoneOptionsGenerator} from '@maskito/phone';
  import metadata from 'libphonenumber-js/mobile/metadata';
 
  export default maskitoPhoneOptionsGenerator({countryIsoCode: 'HU', metadata});
  we did not yet implement this, because we ran into problems with the imports and need to investigate a bit.
  */

export const UsPhoneMask: MaskitoOptions = {
  mask: ['+', '1', ' ', '(', /\d/, /\d/, /\d/, ')', ' ', /\d/, /\d/, /\d/, '-', /\d/, /\d/, /\d/, /\d/],
};

export const ChPhoneMask: MaskitoOptions = {
  mask: ['+', '4', '1', ' ', /[1-9]/, /\d/, ' ', /[1-9]/, /\d/, /\d/, ' ', /\d/, /\d/, /\d/, /\d/],
};