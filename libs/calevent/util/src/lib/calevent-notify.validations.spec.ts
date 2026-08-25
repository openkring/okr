import { describe, expect, it } from 'vitest';

import { calEventNotifyValidations } from './calevent-notify.validations';
import { CalEventNotifyFormData, MAX_NOTIFY_MESSAGE_LENGTH, newCalEventNotifyFormData } from './calevent-notify.model';

const data = (patch: Partial<CalEventNotifyFormData> = {}): CalEventNotifyFormData =>
  ({ ...newCalEventNotifyFormData([], false), ...patch });

describe('calEventNotifyValidations', () => {
  it('accepts a normal notice', () => {
    expect(calEventNotifyValidations(data({ message: 'Training faellt aus.' })).isValid()).toBe(true);
  });

  it('rejects an empty message', () => {
    expect(calEventNotifyValidations(data({ message: '' })).isValid()).toBe(false);
  });

  it('rejects a message of only whitespace', () => {
    expect(calEventNotifyValidations(data({ message: '   \n ' })).isValid()).toBe(false);
  });

  it('rejects a message beyond the length the Cloud Function accepts', () => {
    const tooLong = 'x'.repeat(MAX_NOTIFY_MESSAGE_LENGTH + 1);
    expect(calEventNotifyValidations(data({ message: tooLong })).isValid()).toBe(false);
  });

  it('accepts a message exactly at the cap', () => {
    const atCap = 'x'.repeat(MAX_NOTIFY_MESSAGE_LENGTH);
    expect(calEventNotifyValidations(data({ message: atCap })).isValid()).toBe(true);
  });
});

describe('newCalEventNotifyFormData', () => {
  it('starts on the single-occurrence scope', () => {
    expect(newCalEventNotifyFormData([], true).scope).toBe('event');
  });

  it('carries the recipient preview and the series flag', () => {
    const model = newCalEventNotifyFormData(['Anna B.', 'Carl D.'], true);
    expect(model.recipientNames).toEqual(['Anna B.', 'Carl D.']);
    expect(model.hasSeries).toBe(true);
  });

  it('can be seeded with a prefilled message (the cancellation case)', () => {
    expect(newCalEventNotifyFormData([], false, 'Faellt aus').message).toBe('Faellt aus');
  });
});
