import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { TemplateModel } from '@okr/shared-models';
import { isEmailTemplate, templateKindOf } from './email-template.util';

describe('templateKindOf', () => {
  it('treats a legacy doc without kind as pdf', () => {
    expect(templateKindOf({} as TemplateModel)).toBe('pdf');
  });

  it('returns the stored kind', () => {
    expect(templateKindOf({ kind: 'emailLayout' } as TemplateModel)).toBe('emailLayout');
  });
});

describe('isEmailTemplate', () => {
  it('is true for the two email kinds', () => {
    expect(isEmailTemplate({ kind: 'emailText' } as TemplateModel)).toBe(true);
    expect(isEmailTemplate({ kind: 'emailLayout' } as TemplateModel)).toBe(true);
  });

  it('is false for pdf and for a legacy doc without kind', () => {
    expect(isEmailTemplate({ kind: 'pdf' } as TemplateModel)).toBe(false);
    expect(isEmailTemplate({} as TemplateModel)).toBe(false);
  });
});
