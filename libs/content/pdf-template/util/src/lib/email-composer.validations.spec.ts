import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { emailComposerValidations, EmailComposerFormModel } from './email-composer.validations';

function model(over: Partial<EmailComposerFormModel> = {}): EmailComposerFormModel {
  return { to: 'a@x.ch', from: 'app@seeclub.org', cc: '', bcc: '', subject: 'Hi', body: '<p>x</p>', layout: 'standard', caleventKeys: [], ...over };
}

describe('emailComposerValidations', () => {
  it('passes for a complete, valid model', () => {
    expect(emailComposerValidations(model()).isValid()).toBe(true);
  });

  it('requires at least one recipient', () => {
    const r = emailComposerValidations(model({ to: '' }));
    expect(r.isValid()).toBe(false);
    expect(r.getErrors('to').length).toBeGreaterThan(0);
  });

  it('rejects an invalid recipient address', () => {
    expect(emailComposerValidations(model({ to: 'not-an-email' })).isValid()).toBe(false);
  });

  it('accepts multiple comma-separated recipients', () => {
    expect(emailComposerValidations(model({ to: 'a@x.ch, b@y.ch' })).isValid()).toBe(true);
  });

  it('requires a from address', () => {
    expect(emailComposerValidations(model({ from: '' })).isValid()).toBe(false);
  });

  it('requires a subject', () => {
    expect(emailComposerValidations(model({ subject: '' })).isValid()).toBe(false);
  });

  it('requires a body with text or an image', () => {
    for (const body of ['', '<p></p>', '<p> </p>', '<p>&nbsp;</p>', '<p><br></p>']) {
      const r = emailComposerValidations(model({ body }));
      expect(r.isValid()).toBe(false);
      expect(r.getErrors('body').length).toBeGreaterThan(0);
    }
    expect(emailComposerValidations(model({ body: '<p><img src="https://a.ch/a.png"></p>' })).isValid()).toBe(true);
  });

  it('lets an attachment stand in for the body', () => {
    expect(emailComposerValidations(model({ body: '<p></p>' }), true).isValid()).toBe(true);
    expect(emailComposerValidations(model({ body: '<p></p>' }), false).isValid()).toBe(false);
  });

  it('allows empty cc/bcc but rejects malformed ones', () => {
    expect(emailComposerValidations(model({ cc: '', bcc: '' })).isValid()).toBe(true);
    expect(emailComposerValidations(model({ cc: 'bad' })).isValid()).toBe(false);
  });
});
