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
  previewLoading: boolean;
}

export const TemplateStore = signalStore(
  withProps(() => ({
    i18nService:     inject(I18nService),
    templateService: inject(TemplateService),
    docGenService:   inject(DocGenerationService),
    appStore:        inject(AppStore),
    modalController: inject(ModalController),
    toastController: inject(ToastController),
  })),
  withProps(store => ({
    i18n: store.i18nService.translateAll(TEMPLATE_I18N_KEYS) as TemplateI18n,
  })),
  withState<TemplateState>({
    searchTerm:     '',
    previewUrl:     '',
    previewLoading: false,
  }),
  withProps(store => ({
    _templates: rxResource({
      params: () => ({ tenantId: store.appStore.tenantId() }),
      stream: () => store.templateService.list(),
    }),
  })),
  withComputed(store => ({
    isLoading: computed(() => store._templates.isLoading()),
    templates:  computed(() => (store._templates.value() ?? []) as TemplateModel[]),
    currentUser: computed(() => store.appStore.currentUser()),
    filteredTemplates: computed(() => {
      const term = store.searchTerm();
      const all  = (store._templates.value() ?? []) as TemplateModel[];
      if (!term) return all;
      return all.filter((t: TemplateModel) => nameMatches(t.index, term));
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

    async generatePreview(
      templateKey: string,
      version: TemplateVersionModel,
      sampleData: string
    ): Promise<GenerateDocumentResponse | undefined> {
      patchState(store, { previewLoading: true, previewUrl: '' });
      try {
        let payload: Record<string, unknown> = {};
        try { payload = JSON.parse(sampleData || '{}'); } catch { /* ignore parse error */ }

        await store.templateService.saveDraftVersion(templateKey, version, store.currentUser());
        const response = await store.docGenService.preview(templateKey, payload, version.version);
        patchState(store, { previewUrl: response.url });
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
