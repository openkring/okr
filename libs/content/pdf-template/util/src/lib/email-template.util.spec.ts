import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { TemplateModel } from '@okr/shared-models';
import {
  canDeleteEmailTemplate, emailCopyKey, emailCopyPlan, emailPublishProblem, isEmailTemplate, templateKindOf,
} from './email-template.util';

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

describe('emailPublishProblem', () => {
  it('needs the content slot in both layout halves', () => {
    const kind = { okey: 'email-layout_scs', kind: 'emailLayout' } as const;
    expect(emailPublishProblem(kind, { html: '{{{content}}}', text: 'x', subject: '' })).toBe('no_content');
    expect(emailPublishProblem(kind, { html: 'x', text: '{{{content}}}', subject: '' })).toBe('no_content');
    expect(emailPublishProblem(kind, { html: '{{{content}}}', text: '{{{content}}}', subject: '' })).toBeUndefined();
  });

  it('needs url in both halves and a subject for the reset text', () => {
    const kind = { okey: 'email-text-password-reset_scs', kind: 'emailText' } as const;
    expect(emailPublishProblem(kind, { html: '{{url}}', text: 'x', subject: 'S' })).toBe('no_link');
    expect(emailPublishProblem(kind, { html: '{{{url}}}', text: '{{url}}', subject: '' })).toBe('no_subject');
    expect(emailPublishProblem(kind, { html: '{{{url}}}', text: '{{url}}', subject: 'S' })).toBeUndefined();
  });

  it('checks the shared reset text as well as the tenant copy', () => {
    const kind = { okey: 'email-text-password-reset', kind: 'emailText' } as const;
    expect(emailPublishProblem(kind, { html: 'x', text: 'x', subject: 'S' })).toBe('no_link');
  });

  it('asks nothing of other texts and of pdf templates', () => {
    const other = { okey: 'email-text-welcome_scs', kind: 'emailText' } as const;
    expect(emailPublishProblem(other, { html: 'x', text: 'x', subject: '' })).toBeUndefined();
    const pdf = { okey: 'abc', kind: 'pdf' } as const;
    expect(emailPublishProblem(pdf, { html: 'x', text: '', subject: '' })).toBeUndefined();
    expect(emailPublishProblem({ okey: 'abc' } as TemplateModel,{ html: 'x', text: '', subject: '' })).toBeUndefined();
  });
});

describe('canDeleteEmailTemplate', () => {
  it('never allows deleting a standard layout', () => {
    expect(canDeleteEmailTemplate('email-layout')).toBe(false);
    expect(canDeleteEmailTemplate('email-layout_scs')).toBe(false);
    expect(canDeleteEmailTemplate('email-layout-plain')).toBe(false);
    expect(canDeleteEmailTemplate('email-text-password-reset')).toBe(false);
    expect(canDeleteEmailTemplate('email-layout-plain_scs')).toBe(true);
    expect(canDeleteEmailTemplate('email-text-password-reset_scs')).toBe(true);
  });
});

describe('emailCopyPlan', () => {
  const live = { isArchived: false, currentVersion: 1, draftVersion: undefined };

  it('plans the copy from what exists', () => {
    expect(emailCopyPlan(undefined)).toBe('create');
    expect(emailCopyPlan(live)).toBe('open');
    expect(emailCopyPlan({ ...live, isArchived: true })).toBe('reset');
  });

  it('opens a copy that is not yet active but has a draft', () => {
    expect(emailCopyPlan({ isArchived: false, currentVersion: 0, draftVersion: 1 })).toBe('open');
  });

  it('resets a live doc with neither pointer, left by an interrupted copy', () => {
    expect(emailCopyPlan({ isArchived: false, currentVersion: 0, draftVersion: undefined })).toBe('reset');
    expect(emailCopyPlan({ isArchived: false, currentVersion: 0, draftVersion: null as unknown as undefined })).toBe('reset');
  });
});

describe('emailCopyKey', () => {
  it('appends the tenant to a shared key', () => {
    expect(emailCopyKey('email-layout', 'scs')).toBe('email-layout_scs');
  });

  it('keeps a key that already names the tenant copy', () => {
    expect(emailCopyKey('email-layout_scs', 'scs')).toBe('email-layout_scs');
  });

  it('still appends for another tenant', () => {
    expect(emailCopyKey('email-layout_scs', 'abc')).toBe('email-layout_scs_abc');
  });
});
