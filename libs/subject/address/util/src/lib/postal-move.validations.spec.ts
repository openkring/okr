import '@angular/compiler';
import { describe, it, expect } from 'vitest';

import { newPostalMoveFormModel, PostalMoveFormModel, postalMoveValidations, SwissAddressHit } from './postal-move.validations';

const HIT: SwissAddressHit = {
  egaid: '101', streetName: 'Bahnhofstrasse', streetNumber: '3', zipCode: '8712', city: 'Stäfa',
  latitude: 47.24, longitude: 8.72, label: 'Bahnhofstrasse 3 8712 Stäfa',
};

function withHit(validFrom = '20270301'): PostalMoveFormModel {
  return { ...newPostalMoveFormModel(validFrom), hit: HIT };
}

function manual(zipCode: string, countryCode = 'CH'): PostalMoveFormModel {
  const model = newPostalMoveFormModel('20270301', countryCode);
  model.manual = { streetName: 'Seestrasse', streetNumber: '12', zipCode, city: 'Stäfa', countryCode };
  return model;
}

describe('postalMoveValidations', () => {
  it('requires validFrom in move mode', () => {
    expect(postalMoveValidations(withHit(''), 'move').hasErrors('validFrom')).toBe(true);
  });

  it('requires validFrom in edit-move mode', () => {
    expect(postalMoveValidations(withHit(''), 'edit-move').hasErrors('validFrom')).toBe(true);
  });

  it('rejects a validFrom that is not a date', () => {
    expect(postalMoveValidations(withHit('2027'), 'move').hasErrors('validFrom')).toBe(true);
  });

  it('accepts a correction without a date', () => {
    expect(postalMoveValidations(withHit(''), 'correct').hasErrors()).toBe(false);
  });

  it('accepts a chosen swisstopo hit without manual fields', () => {
    expect(postalMoveValidations(withHit(), 'move').hasErrors()).toBe(false);
  });

  it('needs either a hit or the manual fields', () => {
    const result = postalMoveValidations(newPostalMoveFormModel('20270301'), 'move');
    expect(result.hasErrors('manual.streetName')).toBe(true);
    expect(result.hasErrors('manual.zipCode')).toBe(true);
    expect(result.hasErrors('manual.city')).toBe(true);
  });

  it('rejects a Swiss manual zip that is not 4 digits', () => {
    expect(postalMoveValidations(manual('871'), 'move').hasErrors('manual.zipCode')).toBe(true);
  });

  it('accepts a complete Swiss manual address', () => {
    expect(postalMoveValidations(manual('8712'), 'move').hasErrors()).toBe(false);
  });

  it('accepts a foreign zip of another length', () => {
    expect(postalMoveValidations(manual('80331', 'DE'), 'move').hasErrors()).toBe(false);
  });

  it('accepts a manual address without a street number', () => {
    const model = manual('8712');
    model.manual.streetNumber = '';
    expect(postalMoveValidations(model, 'move').hasErrors()).toBe(false);
  });
});
