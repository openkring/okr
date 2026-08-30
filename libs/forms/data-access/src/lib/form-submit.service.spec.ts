import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FormDefinitionModel } from '@okr/shared-models';

import { FormSubmitService } from './form-submit.service';

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
