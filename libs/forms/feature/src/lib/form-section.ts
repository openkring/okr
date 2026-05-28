import { Component, computed, effect, inject, input, Signal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { signalStore, withMethods, withProps } from '@ngrx/signals';
import { AlertController, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonNote } from '@ionic/angular/standalone';

import { AppStore } from '@bk2/shared-feature';
import { I18nService } from '@bk2/shared-i18n';
import { Spinner } from '@bk2/shared-ui';
import { FormDefinitionModel, FormSection as FormSectionModel } from '@bk2/shared-models';
import { FormDefinitionService } from '@bk2/forms-data-access';
import { FormRenderer } from '@bk2/forms-ui';
import { PFX } from './scope';

const FORM_SECTION_I18N_KEYS = {
  submit:       PFX + 'section.submit',
  submit_conf:  PFX + 'section.submit_conf',
  submit_error: PFX + 'section.submit_error',
  loading:      PFX + 'section.loading',
  not_found:    PFX + 'section.not_found',
  archived:     PFX + 'section.archived',
} satisfies Record<string, string>;

export type FormSectionI18n = { [K in keyof typeof FORM_SECTION_I18N_KEYS]: Signal<string> };

const FormSectionStore = signalStore(
  withProps(() => ({
    appStore: inject(AppStore),
    formDefinitionService: inject(FormDefinitionService),
    i18nService: inject(I18nService),
  })),
  withProps(store => ({
    i18n: store.i18nService.translateAll(FORM_SECTION_I18N_KEYS) as FormSectionI18n,
  })),
  withMethods(store => ({
    async fetchJsToken(formKey: string): Promise<string> {
      try {
        const { getFunctions, httpsCallable } = await import('firebase/functions');
        const { getApp } = await import('firebase/app');
        const fn = httpsCallable<{ formKey: string }, { token: string }>(
          getFunctions(getApp(), 'europe-west6'),
          'getFormToken',
        );
        const result = await fn({ formKey });
        return result.data.token;
      } catch {
        return '';
      }
    },

    async submitForm(
      formKey: string,
      sectionConfigRef: string,
      values: Record<string, unknown>,
      pageLoadedAt: string,
      honeypotKey: string,
      showCaptcha: boolean,
    ): Promise<{ submissionId: string }> {
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const { getApp } = await import('firebase/app');
      const fn = httpsCallable<unknown, { submissionId: string }>(
        getFunctions(getApp(), 'europe-west6'),
        'submitForm',
      );
      const ua = navigator.userAgent;
      const fingerprint = btoa(ua).substring(0, 32);

      const clean = { ...values };
      const honeypotWebsite = String(clean[honeypotKey] ?? '');
      const jsToken = String(clean['_jsToken'] ?? '');
      delete clean[honeypotKey];
      delete clean['_jsToken'];

      const result = await fn({
        formKey,
        sectionConfigRef,
        tenantId: store.appStore.tenantId(),
        values: clean,
        meta: {
          pageLoadedAt,
          submittedAt: new Date().toISOString(),
          honeypotWebsite,
          jsToken,
          userAgentFingerprint: fingerprint,
          showCaptcha,
        },
      });
      return result.data;
    },
  }))
);

@Component({
  selector: 'bk-form-section',
  standalone: true,
  imports: [Spinner, FormRenderer, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonNote],
  providers: [FormSectionStore],
  template: `
    <ion-card>
      @if (section().title) {
        <ion-card-header>
          <ion-card-title>{{ section().title }}</ion-card-title>
        </ion-card-header>
      }
      <ion-card-content>
        @if (definitionResource.isLoading()) {
          <bk-spinner />
        } @else if (submitted()) {
          <ion-note color="success">{{ store.i18n.submit_conf() }}</ion-note>
        } @else if (errorMsg()) {
          <ion-note color="danger">{{ errorMsg() }}</ion-note>
        } @else if (definition(); as def) {
          @if (def.isArchived) {
            <ion-note color="warning">{{ store.i18n.archived() }}</ion-note>
          } @else {
            <bk-form-renderer
              [definition]="def"
              [submitLabel]="store.i18n.submit()"
              [submitting]="submitting()"
              [jsToken]="jsToken()"
              (submitted)="onSubmit($event)"
            />
          }
        } @else {
          <ion-note color="medium">{{ store.i18n.not_found() }}</ion-note>
        }
      </ion-card-content>
    </ion-card>
  `,
})
export class FormSectionComponent {
  protected readonly store = inject(FormSectionStore);
  private readonly alertController = inject(AlertController);

  public readonly section = input.required<FormSectionModel>();
  public readonly editMode = input(false);

  private readonly pageLoadedAt = new Date().toISOString();

  protected readonly submitted = signal(false);
  protected readonly submitting = signal(false);
  protected readonly errorMsg = signal('');
  protected readonly jsToken = signal('');

  protected readonly definitionResource = rxResource({
    params: () => ({ formKey: this.section().properties?.formKey }),
    stream: ({ params }: { params: { formKey: string } }) =>
      this.store.formDefinitionService.readByFormKey(params.formKey),
  });

  protected readonly definition = computed(() => {
    const val = this.definitionResource.value();
    return Array.isArray(val) ? val[0] : val;
  });

  constructor() {
    effect(async () => {
      const def = this.definition();
      if (def?.formKey) {
        const token = await this.store.fetchJsToken(def.formKey);
        this.jsToken.set(token);
      }
    });
  }

  protected async onSubmit(values: Record<string, unknown>): Promise<void> {
    const def = this.definition();
    if (!def) return;
    this.submitting.set(true);
    this.errorMsg.set('');
    try {
      const processedValues = await this.uploadFiles(values, def);
      await this.store.submitForm(
        def.formKey,
        this.section().bkey ?? '',
        processedValues,
        this.pageLoadedAt,
        def.honeypotKey || 'website',
        this.section().properties?.showCaptcha ?? false,
      );
      this.submitted.set(true);
    } catch {
      this.errorMsg.set(this.store.i18n.submit_error());
    } finally {
      this.submitting.set(false);
    }
  }

  private async promptEncryptionPassword(): Promise<string> {
    return new Promise(resolve => {
      this.alertController.create({
        header: 'Datei-Verschlüsselung',
        message: 'Bitte geben Sie das Verschlüsselungspasswort ein.',
        inputs: [{ name: 'password', type: 'password', placeholder: 'Passwort' }],
        buttons: [
          { text: 'Abbrechen', role: 'cancel', handler: () => resolve('') },
          { text: 'OK', handler: (data: { password: string }) => resolve(data.password ?? '') },
        ],
      }).then(alert => alert.present());
    });
  }

  private async uploadFiles(
    values: Record<string, unknown>,
    def: FormDefinitionModel,
  ): Promise<Record<string, unknown>> {
    const encryptFileUpload = this.section().properties?.encryptFileUpload ?? false;
    const hasFiles = Object.values(values).some(v => v instanceof File);
    if (!hasFiles) return values;

    const { uploadToFirebaseStorage } = await import('@bk2/shared-config');
    const { getDownloadURL } = await import('firebase/storage');
    const result = { ...values };

    let password = '';
    if (encryptFileUpload && def.encryptionSalt) {
      password = await this.promptEncryptionPassword();
      if (!password) throw new Error('Encryption password not provided');
    }

    for (const [key, val] of Object.entries(result)) {
      if (!(val instanceof File)) continue;
      const path = `forms/${def.formKey}/${crypto.randomUUID()}-${val.name}`;

      if (encryptFileUpload && def.encryptionSalt && password) {
        const { encryptFile } = await import('@bk2/forms-util');
        const encrypted = await encryptFile(val, password, def.encryptionSalt);
        const encBlob = new File([encrypted.ciphertext], val.name + '.enc', { type: 'application/octet-stream' });
        const task = uploadToFirebaseStorage(path + '.enc', encBlob);
        const snap = await new Promise<import('firebase/storage').UploadTaskSnapshot>(
          (res, rej) => task.on('state_changed', undefined, rej, () => res(task.snapshot))
        );
        const url = await getDownloadURL(snap.ref);
        const ivBase64 = btoa(String.fromCharCode(...encrypted.iv));
        result[key] = {
          encryptedName: btoa(val.name),
          ivBase64,
          saltBase64: def.encryptionSalt,
          mimeType: val.type,
          sizeBytes: val.size,
          storageUrl: url,
        };
      } else {
        const task = uploadToFirebaseStorage(path, val);
        const snap = await new Promise<import('firebase/storage').UploadTaskSnapshot>(
          (res, rej) => task.on('state_changed', undefined, rej, () => res(task.snapshot))
        );
        const url = await getDownloadURL(snap.ref);
        result[key] = { name: val.name, mimeType: val.type, sizeBytes: val.size, storageUrl: url };
      }
    }
    return result;
  }
}
