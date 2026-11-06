// libs/content/pdf-template/feature/src/lib/template.store.ts
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController, ToastController } from '@ionic/angular';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { TemplateAddressWindow, TemplateModel, TemplateVersionModel } from '@okr/shared-models';
import {
  DocEmailService, DocGenerationService, GenerateDocumentResponse, RenderedPreview, TemplateService,
} from '@okr/content-pdf-template-data-access';
import { EmailComposerModal } from '@okr/content-pdf-template-ui';
import {
  emailCopyKey, emailPublishProblem, EmailPublishProblem, newTemplate, newTemplateVersion, TEMPLATE_I18N_KEYS, TemplateI18n,
} from '@okr/content-pdf-template-util';
export type { TemplateI18n };

import { nameMatches, SYSTEM_TENANT } from '@okr/shared-util-core';

/** Which kind of template the list shows: PDF documents or email layouts and texts. */
export type TemplateListKind = 'pdf' | 'email';

interface TemplateState {
  searchTerm: string;
  listKind: TemplateListKind;
  previewUrl: string;
  previewStoragePath: string;
  previewFilename: string;
  previewLoading: boolean;
  /** The email template as the server renders it; undefined until a preview ran. */
  emailPreview: RenderedPreview | undefined;
}

const initialState: TemplateState = {
  searchTerm: '',
  listKind: 'pdf',
  previewUrl: '',
  previewStoragePath: '',
  previewFilename: '',
  previewLoading: false,
  emailPreview: undefined,
};

export const TemplateStore = signalStore(
  withState(initialState),
  withProps(() => ({
    i18n:     inject(I18nService).translateAll(TEMPLATE_I18N_KEYS) as TemplateI18n,
    templateService: inject(TemplateService),
    docGenService:   inject(DocGenerationService),
    docEmailService: inject(DocEmailService),
    appStore:        inject(AppStore),
    modalController: inject(ModalController),
    toastController: inject(ToastController),
  })),
  withProps(store => ({
    allTemplatesResource: rxResource({
      params: () => ({ 
        tenantId: store.appStore.tenantId() 
      }),
      stream: () => store.templateService.list(),
    }),
    // loaded only while the email segment is showing; an undefined param keeps the resource idle
    emailTemplatesResource: rxResource({
      params: () => store.listKind() === 'email' ? { tenantId: store.appStore.tenantId() } : undefined,
      stream: () => store.templateService.listEmailTemplates(),
    }),
  })),
  withComputed(store => ({
    isLoading: computed(() =>
      store.listKind() === 'email' ? store.emailTemplatesResource.isLoading() : store.allTemplatesResource.isLoading()
    ),
    templates:  computed(() => (store.allTemplatesResource.value() ?? []) as TemplateModel[]),
    currentUser: computed(() => store.appStore.currentUser()),
    /**
     * The email templates of this tenant. A shared doc is left out when the tenant's copy of it
     * is in the list, so a tenant sees its own copy only. An archived copy is not in the list,
     * so the shared doc shows again.
     */
    emailTemplates: computed(() => {
      const all = (store.emailTemplatesResource.value() ?? []) as TemplateModel[];
      const tenantId = store.appStore.tenantId();
      const keys = new Set(all.map(t => t.okey));
      return all.filter(t => !(t.tenants ?? []).includes(SYSTEM_TENANT) || !keys.has(emailCopyKey(t.okey, tenantId)));
    }),
  })),
  withComputed(store => ({
    filteredTemplates: computed(() => {
      const searchTerm = store.searchTerm();
      let templates = (
        store.listKind() === 'email' ? store.emailTemplates() : store.allTemplatesResource.value() ?? []
      ) as TemplateModel[];
      // filter by search term
      if (searchTerm) {
        templates = templates.filter(i => nameMatches(i.index, searchTerm));
      }
      return templates;
    }),
  })),
  withMethods(store => {
  // newest email preview request; an older call that resolves later must not overwrite it
  let emailPreviewSeq = 0;
  return {
    setSearchTerm(term: string): void {
      patchState(store, { searchTerm: term });
    },

    setListKind(kind: TemplateListKind): void {
      patchState(store, { listKind: kind });
    },

    /**
     * Create the provisional document behind 'add template'. Silent: it is only a
     * template once the user saves it in the editor — until then leaving the editor
     * discards it again (see discardUnsavedTemplate).
     */
    async createTemplate(): Promise<string | undefined> {
      const tmpl = newTemplate(store.appStore.tenantId());
      return store.templateService.create(tmpl, store.currentUser(), true);
    },

    /** Discard a provisional template the user left without saving. */
    async discardUnsavedTemplate(template: TemplateModel): Promise<void> {
      await store.templateService.discardUnsaved(template, store.currentUser());
    },

    /**
     * Copy a template (settings + content of its effective version) into a new
     * unpublished draft template.
     * @return the key of the new template, or undefined if the copy failed
     */
    async copyTemplate(template: TemplateModel): Promise<string | undefined> {
      const key = await store.templateService.copy(
        template, store.i18n.copy_suffix(), store.currentUser()
      );
      const toast = await store.toastController.create({
        message:  key ? store.i18n.copy_conf() : store.i18n.copy_error(),
        duration: key ? 2000 : 3000,
        color:    key ? 'success' : 'danger',
      });
      await toast.present();
      return key;
    },

    /**
     * Copy a shared email template into the tenant's own copy, or open the copy it already has.
     * @return the key of the tenant's copy, or undefined if the copy failed
     */
    async copyEmailTemplate(template: TemplateModel): Promise<string | undefined> {
      const key = await store.templateService.copyEmailTemplate(template, store.currentUser());
      const toast = await store.toastController.create({
        message:  key ? store.i18n.copy_conf() : store.i18n.copy_error(),
        duration: key ? 2000 : 3000,
        color:    key ? 'success' : 'danger',
      });
      await toast.present();
      return key;
    },

    async updateTemplate(template: TemplateModel): Promise<void> {
      await store.templateService.update(template, store.currentUser());
    },

    async deleteTemplate(template: TemplateModel): Promise<void> {
      await store.templateService.delete(template, store.currentUser());
    },

    /**
     * Revert to the last version:
     * - if a draft exists, discard the draft (back to the current published version);
     * - otherwise roll the published pointer back to the nearest published version; without one nothing changes.
     */
    async revertToLastVersion(template: TemplateModel): Promise<void> {
      try {
        if (template.draftVersion) {
          await store.templateService.discardDraft(template, store.currentUser());
        } else if (!await store.templateService.rollbackVersion(template, store.currentUser())) {
          return;
        }
        const toast = await store.toastController.create({
          message:  store.i18n.revert_conf(),
          duration: 2000,
          color:    'success',
        });
        await toast.present();
      } catch {
        const toast = await store.toastController.create({
          message:  store.i18n.revert_error(),
          duration: 3000,
          color:    'danger',
        });
        await toast.present();
      }
    },

    /** @return true when the draft version was written; false after the error toast. */
    async saveDraft(templateKey: string, version: TemplateVersionModel): Promise<boolean> {
      try {
        // On a failed write the service has shown its own error toast and returns no key.
        const saved = await store.templateService.saveDraftVersion(templateKey, version, store.currentUser());
        if (!saved) return false;
        const toast = await store.toastController.create({
          message:  store.i18n.save_draft_conf(),
          duration: 2000,
          color:    'success',
        });
        await toast.present();
        return true;
      } catch {
        const toast = await store.toastController.create({
          message:  store.i18n.save_draft_error(),
          duration: 3000,
          color:    'danger',
        });
        await toast.present();
        return false;
      }
    },

    async openPublishDialog(templateKey: string, versionNum: number): Promise<boolean> {
      // Lazy import: keeps the modal out of the store's static import graph
      const { TemplatePublishModal } = await import('@okr/content-pdf-template-ui');
      const modal = await store.modalController.create({
        component: TemplatePublishModal,
        componentProps: { versionNum },
      });
      await modal.present();
      const { data, role } = await modal.onWillDismiss<{ changelog: string }>();
      if (role !== 'confirm' || !data?.changelog) return false;

      try {
        await store.templateService.publishVersion(
          templateKey, versionNum, data.changelog, store.currentUser()
        );
        const toast = await store.toastController.create({
          message:  store.i18n.publish_conf(),
          duration: 2000,
          color:    'success',
        });
        await toast.present();
        return true;
      } catch {
        const toast = await store.toastController.create({
          message:  store.i18n.publish_error(),
          duration: 3000,
          color:    'danger',
        });
        await toast.present();
        return false;
      }
    },

    /** Open the email composer for the current preview document (attached via its storage path). */
    async sendPreview(): Promise<void> {
      const storagePath = store.previewStoragePath();
      if (!storagePath) return;
      const modal = await store.modalController.create({
        component: EmailComposerModal,
        componentProps: {
          storagePath,
          filename: store.previewFilename() || 'document.pdf',
          outputFormat: 'pdf',
        },
        cssClass: 'wide-modal',
      });
      await modal.present();
    },

    /**
     * Render a saved version of an email template on the server (same renderer as the real mail).
     * The server error is technical English, so the user gets the plain preview label and the
     * detail goes to the console.
     */
    async generateEmailPreview(templateKey: string, version: number): Promise<RenderedPreview | undefined> {
      const id = ++emailPreviewSeq;
      patchState(store, { previewLoading: true, emailPreview: undefined });
      try {
        const rendered = await store.docEmailService.renderTemplatePreview(templateKey, version);
        if (id !== emailPreviewSeq) return undefined;
        patchState(store, { emailPreview: rendered });
        return rendered;
      } catch (err) {
        if (id !== emailPreviewSeq) return undefined;
        console.error('TemplateStore.generateEmailPreview: renderEmailPreview failed', err);
        const toast = await store.toastController.create({
          message:  store.i18n.preview_error(),
          duration: 4000,
          color:    'danger',
        });
        await toast.present();
        return undefined;
      } finally {
        if (id === emailPreviewSeq) patchState(store, { previewLoading: false });
      }
    },

    /** Tell the user why an email template cannot be published (nothing is published). */
    async showPublishProblem(problem: EmailPublishProblem): Promise<void> {
      const message = {
        no_content: store.i18n.publish_no_content,
        no_link:    store.i18n.publish_no_link,
        no_subject: store.i18n.publish_no_subject,
      }[problem]();
      const toast = await store.toastController.create({ message, duration: 4000, color: 'danger' });
      await toast.present();
    },

    async generatePreview(
      templateKey: string,
      version: TemplateVersionModel,
      sampleData: string,
      persist = true,
      addressWindow: TemplateAddressWindow = 'none'
    ): Promise<GenerateDocumentResponse | undefined> {
      patchState(store, { previewLoading: true, previewUrl: '', previewStoragePath: '', previewFilename: '' });
      try {
        let payload: Record<string, unknown> = {};
        try { payload = JSON.parse(sampleData || '{}'); } catch { /* ignore parse error */ }

        // In read-only view the version already exists in Firestore, so don't write a draft.
        if (persist) {
          await store.templateService.saveDraftVersion(templateKey, version, store.currentUser());
        }
        const response = await store.docGenService.preview(
          templateKey, payload, version.version, addressWindow === 'none' ? undefined : addressWindow
        );
        patchState(store, {
          previewUrl: response.url,
          previewStoragePath: response.storagePath,
          previewFilename: response.filename,
        });
        return response;
      } catch (err) {
        const toast = await store.toastController.create({
          message:  `${store.i18n.preview_error()}: ${String(err)}`,
          duration: 4000,
          color:    'danger',
        });
        await toast.present();
        return undefined;
      } finally {
        patchState(store, { previewLoading: false });
      }
    },
  };
  })
);
