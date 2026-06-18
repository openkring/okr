// libs/pdf-template/feature/src/lib/template.store.ts
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController, ToastController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { AppStore } from '@bk2/shared-feature';
import { I18nService } from '@bk2/shared-i18n';
import { TemplateModel, TemplateVersionModel } from '@bk2/shared-models';
import { DocGenerationService, GenerateDocumentResponse, TemplateService } from '@bk2/pdf-template-data-access';
import { newTemplate, newTemplateVersion, TEMPLATE_I18N_KEYS, TemplateI18n } from '@bk2/pdf-template-util';
export type { TemplateI18n };

import { nameMatches } from '@bk2/shared-util-core';

interface TemplateState {
  searchTerm: string;
  previewUrl: string;
  previewStoragePath: string;
  previewFilename: string;
  previewLoading: boolean;
}

const initialState: TemplateState = {
  searchTerm: '',
  previewUrl: '',
  previewStoragePath: '',
  previewFilename: '',
  previewLoading: false
};

export const TemplateStore = signalStore(
  withState(initialState),
  withProps(() => ({
    i18n:     inject(I18nService).translateAll(TEMPLATE_I18N_KEYS) as TemplateI18n,
    templateService: inject(TemplateService),
    docGenService:   inject(DocGenerationService),
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
  })),
  withComputed(store => ({
    isLoading: computed(() => store.allTemplatesResource.isLoading()),
    templates:  computed(() => (store.allTemplatesResource.value() ?? []) as TemplateModel[]),
    currentUser: computed(() => store.appStore.currentUser()),
    filteredTemplates: computed(() => {
      const searchTerm = store.searchTerm();
      let templates  = (store.allTemplatesResource.value() ?? []) as TemplateModel[];
      // filter by search term
      if (searchTerm) {
        templates = templates.filter(i => nameMatches(i.index, searchTerm));
      }
      return templates;
    }),
  })),
  withMethods(store => ({
    setSearchTerm(term: string): void {
      patchState(store, { searchTerm: term });
    },

    async createTemplate(): Promise<string | undefined> {
      const tmpl = newTemplate(store.appStore.tenantId());
      return store.templateService.create(tmpl, store.currentUser());
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
     * - otherwise roll the published pointer back one version (N → N-1).
     */
    async revertToLastVersion(template: TemplateModel): Promise<void> {
      try {
        if (template.draftVersion) {
          await store.templateService.discardDraft(template, store.currentUser());
        } else if (template.currentVersion > 1) {
          await store.templateService.rollbackVersion(template, store.currentUser());
        } else {
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

    async saveDraft(templateKey: string, version: TemplateVersionModel): Promise<void> {
      try {
        await store.templateService.saveDraftVersion(templateKey, version, store.currentUser());
        const toast = await store.toastController.create({
          message:  store.i18n.save_draft_conf(),
          duration: 2000,
          color:    'success',
        });
        await toast.present();
      } catch {
        const toast = await store.toastController.create({
          message:  store.i18n.save_draft_error(),
          duration: 3000,
          color:    'danger',
        });
        await toast.present();
      }
    },

    async openPublishDialog(templateKey: string, versionNum: number): Promise<boolean> {
      // Lazy import to avoid circular reference at module load time
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { TemplatePublishModal } = await import('./template-publish.modal' as any);
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
      // Lazy import to avoid circular reference at module load time
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { EmailComposerModal } = await import('@bk2/pdf-template-ui' as any);
      const modal = await store.modalController.create({
        component: EmailComposerModal,
        componentProps: {
          storagePath,
          filename: store.previewFilename() || 'document.pdf',
          outputFormat: 'pdf',
        },
      });
      await modal.present();
    },

    async generatePreview(
      templateKey: string,
      version: TemplateVersionModel,
      sampleData: string,
      persist = true
    ): Promise<GenerateDocumentResponse | undefined> {
      patchState(store, { previewLoading: true, previewUrl: '', previewStoragePath: '', previewFilename: '' });
      try {
        let payload: Record<string, unknown> = {};
        try { payload = JSON.parse(sampleData || '{}'); } catch { /* ignore parse error */ }

        // In read-only view the version already exists in Firestore, so don't write a draft.
        if (persist) {
          await store.templateService.saveDraftVersion(templateKey, version, store.currentUser());
        }
        const response = await store.docGenService.preview(templateKey, payload, version.version);
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
  }))
);
