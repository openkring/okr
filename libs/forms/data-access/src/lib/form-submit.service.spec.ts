import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FormDefinitionModel } from '@okr/shared-models';

import { FormSubmitService, isFormClosedError } from './form-submit.service';

// The service reaches Firebase only through two dynamic imports; stubbing them keeps the
// anti-abuse contract — what is stripped, what is lifted into `meta` — testable without any
// emulator or Angular TestBed.
const calls: { name: string; payload: any }[] = [];
let nextResult: unknown = { submissionId: 's1' };
let shouldThrow = false;

vi.mock('firebase/functions', () => ({
  getFunctions: () => ({}),
  httpsCallable: (_fns: unknown, name: string) => async (payload: unknown) => {
    calls.push({ name, payload });
    if (shouldThrow) throw new Error('callable failed');
    return { data: nextResult };
  },
}));
vi.mock('firebase/app', () => ({ getApp: () => ({}) }));

const definition = { formKey: 'f1', honeypotKey: 'website' } as FormDefinitionModel;

describe('FormSubmitService', () => {
  let service: FormSubmitService;

  beforeEach(() => {
    calls.length = 0;
    shouldThrow = false;
    nextResult = { submissionId: 's1' };
    service = new FormSubmitService();
    vi.stubGlobal('navigator', { userAgent: 'test-agent' });
  });

  describe('submit', () => {
    const args = {
      formKey: 'f1',
      sectionConfigRef: 'sec1',
      tenantId: 'scs',
      values: { firstName: 'Anna', website: 'spam-bait', _jsToken: 'tok' },
      pageLoadedAt: '2026-08-30T10:00:00.000Z',
      honeypotKey: 'website',
      showCaptcha: false,
    };

    it('lifts the honeypot and the JS token into meta and strips them from the answers', async () => {
      // The two most important lines of the whole gateway: a honeypot value persisted with
      // the answers would both leak the trap and pollute the record.
      await service.submit(args);
      const payload = calls[0].payload;
      expect(payload.values).toEqual({ firstName: 'Anna' });
      expect(payload.meta.honeypotWebsite).toBe('spam-bait');
      expect(payload.meta.jsToken).toBe('tok');
    });

    it('passes pageLoadedAt through and stamps submittedAt — the server times the pair', async () => {
      await service.submit(args);
      const meta = calls[0].payload.meta;
      expect(meta.pageLoadedAt).toBe(args.pageLoadedAt);
      expect(Date.parse(meta.submittedAt)).not.toBeNaN();
    });

    it('honours a form-specific honeypot key', async () => {
      await service.submit({ ...args, honeypotKey: 'hp_x', values: { a: '1', hp_x: 'bot' } });
      expect(calls[0].payload.values).toEqual({ a: '1' });
      expect(calls[0].payload.meta.honeypotWebsite).toBe('bot');
    });

    it('sends an empty honeypot rather than "undefined" when the field was not rendered', async () => {
      await service.submit({ ...args, values: { a: '1' } });
      expect(calls[0].payload.meta.honeypotWebsite).toBe('');
      expect(calls[0].payload.meta.jsToken).toBe('');
    });

    it('does not mutate the caller\'s values object', async () => {
      const values = { firstName: 'Anna', website: 'spam-bait' };
      await service.submit({ ...args, values });
      expect(values).toEqual({ firstName: 'Anna', website: 'spam-bait' });
    });

    it('calls submitForm and returns the submission id', async () => {
      await expect(service.submit(args)).resolves.toEqual({ submissionId: 's1' });
      expect(calls[0].name).toBe('submitForm');
    });

    it('returns the thank-you text the server sends with the submission id', async () => {
      nextResult = { submissionId: 's2', confirmation: 'Danke Anna.\nWir melden uns.' };
      await expect(service.submit(args)).resolves.toEqual({ submissionId: 's2', confirmation: 'Danke Anna.\nWir melden uns.' });
    });

    it('propagates a failure — the host shows the error, the submit is NOT silently swallowed', async () => {
      shouldThrow = true;
      await expect(service.submit(args)).rejects.toThrow();
    });
  });

  describe('fetchDefinition / fetchJsToken degrade gracefully', () => {
    it('returns undefined when the definition callable fails', async () => {
      shouldThrow = true;
      await expect(service.fetchDefinition('f1', 'scs')).resolves.toBeUndefined();
    });

    it('returns an empty token when the token callable fails — the server marks it missing', async () => {
      shouldThrow = true;
      await expect(service.fetchJsToken('f1')).resolves.toBe('');
    });

    it('passes the tenant to getFormDefinition — it is a public, anonymous callable', async () => {
      nextResult = definition;
      await service.fetchDefinition('f1', 'scs');
      expect(calls[0]).toEqual({ name: 'getFormDefinition', payload: { formKey: 'f1', tenantId: 'scs' } });
    });

    it('sends the section id when given — that page\'s own acceptance rules apply', async () => {
      nextResult = definition;
      await service.fetchDefinition('f1', 'scs', 'sec1');
      expect(calls[0].payload).toEqual({ formKey: 'f1', tenantId: 'scs', sectionId: 'sec1' });
    });

    it('omits the section id when absent or empty — a modal has no section', async () => {
      nextResult = definition;
      await service.fetchDefinition('f1', 'scs', '');
      expect(calls[0].payload).not.toHaveProperty('sectionId');
    });

    it('returns the availability and the mail flag next to the definition', async () => {
      nextResult = { ...definition, availability: { isOpen: false, reason: 'full' }, sendFillerConfirmation: true };
      const def = await service.fetchDefinition('f1', 'scs', 'sec1');
      expect(def?.availability?.isOpen).toBe(false);
      expect(def?.sendFillerConfirmation).toBe(true);
    });
  });

  describe('isFormClosedError', () => {
    it('is true for a failed-precondition saying form-closed or form-full, with or without the SDK prefix', () => {
      expect(isFormClosedError({ code: 'functions/failed-precondition', message: 'form-closed' })).toBe(true);
      expect(isFormClosedError({ code: 'functions/failed-precondition', message: 'form-full' })).toBe(true);
      expect(isFormClosedError({ code: 'failed-precondition', message: 'form-full' })).toBe(true);
    });

    it('is false for any other failure — the host keeps its generic submit error', () => {
      expect(isFormClosedError({ code: 'functions/failed-precondition', message: 'course-page-missing' })).toBe(false);
      expect(isFormClosedError({ code: 'functions/invalid-argument', message: 'form-closed' })).toBe(false);
      expect(isFormClosedError(new Error('form-closed'))).toBe(false);
      expect(isFormClosedError(undefined)).toBe(false);
      expect(isFormClosedError('form-closed')).toBe(false);
    });
  });

  describe('uploadFiles', () => {
    it('returns the values untouched when there is no file — no storage import, no password prompt', async () => {
      const askPassword = vi.fn();
      const values = { a: '1' };
      await expect(
        service.uploadFiles(values, definition, { encryptFileUpload: true, askPassword })
      ).resolves.toBe(values);
      expect(askPassword).not.toHaveBeenCalled();
    });
  });
});
