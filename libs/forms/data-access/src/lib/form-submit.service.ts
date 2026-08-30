import { Injectable } from '@angular/core';

import { FormDefinitionModel } from '@okr/shared-models';
import { sanitizeFileName } from '@okr/shared-util-core';

/** What a submitted file becomes once it is in storage — plain, or encrypted at rest. */
export interface UploadedFileRef {
  name?: string;
  encryptedName?: string;
  ivBase64?: string;
  saltBase64?: string;
  mimeType: string;
  sizeBytes: number;
  storageUrl: string;
}

export interface FormSubmitArgs {
  formKey: string;
  /** the section document a submit came from, or '' for a modal — it drives the
   *  section-configured side effects (tasks, mail) server-side, which a modal has none of */
  sectionConfigRef: string;
  tenantId: string;
  values: Record<string, unknown>;
  /** ISO timestamp of when the form became visible — the server's timing heuristic */
  pageLoadedAt: string;
  honeypotKey: string;
  showCaptcha: boolean;
}

export interface UploadOptions {
  encryptFileUpload: boolean;
  /** asked once, before the first file — the prompt itself is presentation and stays with
   *  the host component (an ion-alert in a section, the same in a modal) */
  askPassword: () => Promise<string>;
}

/**
 * The single public submit gateway for form-builder forms.
 *
 * Both hosts go through here — the inline `okr-form-section` on a CMS page AND the `FormModal`
 * a CMS button opens (spec 2026-08-29-generic-workflow-triggers §6a, decision O5). There must
 * be exactly ONE of these: the honeypot key, the `pageLoadedAt` timing heuristic, the JS token
 * and the spam-meta stripping are the anti-abuse path of every public form, and a second copy
 * would drift — with the newer, less-exercised copy being the weaker one.
 *
 * Everything here is anonymous-safe: `getFormDefinition` and `getFormToken` are public
 * callables precisely because `formDefinitions` is not client-readable on a public page.
 *
 * `firebase/functions` and `firebase/storage` are imported dynamically so a page that never
 * submits a form does not pay for them.
 */
@Injectable({ providedIn: 'root' })
export class FormSubmitService {
  private readonly region = 'europe-west6';

  private async callable<TReq, TRes>(name: string) {
    const { getFunctions, httpsCallable } = await import('firebase/functions');
    const { getApp } = await import('firebase/app');
    return httpsCallable<TReq, TRes>(getFunctions(getApp(), this.region), name);
  }

  /**
   * Public, anonymous gateway — reads the form definition server-side so it works on public
   * pages where the `formDefinitions` collection is not client-readable.
   */
  public async fetchDefinition(formKey: string, tenantId: string): Promise<FormDefinitionModel | undefined> {
    try {
      const fn = await this.callable<{ formKey: string; tenantId: string }, FormDefinitionModel>('getFormDefinition');
      const result = await fn({ formKey, tenantId });
      return result.data;
    } catch {
      return undefined;   // not found / unavailable → the host shows "form not found"
    }
  }

  public async fetchJsToken(formKey: string): Promise<string> {
    try {
      const fn = await this.callable<{ formKey: string }, { token: string }>('getFormToken');
      const result = await fn({ formKey });
      return result.data.token;
    } catch {
      return '';   // graceful degradation: the server marks the submission as missing_token
    }
  }

  public async submit(args: FormSubmitArgs): Promise<{ submissionId: string }> {
    const fn = await this.callable<unknown, { submissionId: string }>('submitForm');
    const ua = navigator.userAgent;
    const fingerprint = btoa(ua).substring(0, 32);

    // The spam-meta fields travel in `values` because they are rendered as fields; they are
    // lifted into `meta` here and must NOT be persisted with the answers.
    const clean = { ...args.values };
    const honeypotWebsite = String(clean[args.honeypotKey] ?? '');
    const jsToken = String(clean['_jsToken'] ?? '');
    delete clean[args.honeypotKey];
    delete clean['_jsToken'];

    const result = await fn({
      formKey: args.formKey,
      sectionConfigRef: args.sectionConfigRef,
      tenantId: args.tenantId,
      values: clean,
      meta: {
        pageLoadedAt: args.pageLoadedAt,
        submittedAt: new Date().toISOString(),
        honeypotWebsite,
        jsToken,
        userAgentFingerprint: fingerprint,
        showCaptcha: args.showCaptcha,
      },
    });
    return result.data;
  }

  /**
   * Upload every `File` in `values` and replace it with a reference. Optionally encrypts at
   * rest with a password the host asks for ONCE, before the first file.
   */
  public async uploadFiles(
    values: Record<string, unknown>,
    def: FormDefinitionModel,
    opts: UploadOptions,
  ): Promise<Record<string, unknown>> {
    const hasFiles = Object.values(values).some(v => v instanceof File);
    if (!hasFiles) return values;

    const { uploadToFirebaseStorage } = await import('@okr/shared-config');
    const { getDownloadURL } = await import('firebase/storage');
    const result = { ...values };

    // Ask for the password once before processing all files
    let password = '';
    if (opts.encryptFileUpload && def.encryptionSalt) {
      password = await opts.askPassword();
      if (!password) throw new Error('Encryption password not provided');
    }

    for (const [key, val] of Object.entries(result)) {
      if (!(val instanceof File)) continue;
      const path = `forms/${def.formKey}/${crypto.randomUUID()}-${sanitizeFileName(val.name)}`;

      if (opts.encryptFileUpload && def.encryptionSalt && password) {
        const { encryptFile } = await import('@okr/forms-util');
        const encrypted = await encryptFile(val, password, def.encryptionSalt);
        const encBlob = new File([encrypted.ciphertext], val.name + '.enc', { type: 'application/octet-stream' });
        const url = await this.upload(uploadToFirebaseStorage(path + '.enc', encBlob), getDownloadURL);
        const ivBase64 = btoa(String.fromCharCode(...encrypted.iv));
        result[key] = {
          encryptedName: btoa(val.name),
          ivBase64,
          saltBase64: def.encryptionSalt,
          mimeType: val.type,
          sizeBytes: val.size,
          storageUrl: url,
        } satisfies UploadedFileRef;
      } else {
        const url = await this.upload(uploadToFirebaseStorage(path, val), getDownloadURL);
        result[key] = {
          name: val.name, mimeType: val.type, sizeBytes: val.size, storageUrl: url,
        } satisfies UploadedFileRef;
      }
    }
    return result;
  }

  private async upload(
    task: import('firebase/storage').UploadTask,
    getDownloadURL: (ref: import('firebase/storage').StorageReference) => Promise<string>,
  ): Promise<string> {
    const snap = await new Promise<import('firebase/storage').UploadTaskSnapshot>(
      (res, rej) => task.on('state_changed', undefined, rej, () => res(task.snapshot))
    );
    return getDownloadURL(snap.ref);
  }
}
