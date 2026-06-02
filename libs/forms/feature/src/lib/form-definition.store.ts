import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { AppStore } from '@bk2/shared-feature';
import { I18nService } from '@bk2/shared-i18n';
import { FormDefinitionModel } from '@bk2/shared-models';
import { hasRole } from '@bk2/shared-util-core';

import { FormDefinitionService } from '@bk2/forms-data-access';
import { FORM_I18N_KEYS, FormI18n, FORM_MAPPINGS } from '@bk2/forms-util';
export type { FormI18n };

import { FormDefinitionEditModal } from './form-definition-edit.modal';
import { FormBuilderEditor } from './form-builder-editor';

export type FormDefinitionState = {
  searchTerm: string;
};

const initialState: FormDefinitionState = {
  searchTerm: '',
};

export const FormDefinitionStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    formDefinitionService: inject(FormDefinitionService),
    modalController: inject(ModalController),
    i18nService: inject(I18nService),
  })),
  withProps(store => ({
    i18n: store.i18nService.translateAll(FORM_I18N_KEYS) as FormI18n,
    formMappings: FORM_MAPPINGS,
  })),
  withProps(store => ({
    formsResource: rxResource({
      params: () => ({ tenantId: store.appStore.tenantId() }),
      stream: () => store.formDefinitionService.list(),
    }),
  })),
  withComputed(store => ({
    currentUser: computed(() => store.appStore.currentUser()),
    isLoading: computed(() => store.formsResource.isLoading()),
    canWrite: computed(() => hasRole('admin', store.appStore.currentUser())),
    filteredForms: computed(() => {
      const all = store.formsResource.value() ?? [];
      const term = store.searchTerm().toLowerCase();
      return all
        .filter((f: FormDefinitionModel) => !f.isArchived)
        .filter((f: FormDefinitionModel) => !term || f.name.toLowerCase().includes(term) || f.formKey.toLowerCase().includes(term));
    }),
  })),
  withMethods(store => ({
    setSearchTerm(searchTerm: string) {
      patchState(store, { searchTerm });
    },

    async openCreateModal(): Promise<void> {
      if (!store.canWrite()) return;
      const form = new FormDefinitionModel(store.appStore.tenantId());
      const modal = await store.modalController.create({
        component: FormDefinitionEditModal,
        componentProps: { form, mode: 'create' },
      });
      await modal.present();
      await modal.onDidDismiss();
      store.formsResource.reload();
    },

    async openEditModal(form: FormDefinitionModel): Promise<void> {
      if (!store.canWrite()) return;
      const modal = await store.modalController.create({
        component: FormDefinitionEditModal,
        componentProps: { form, mode: 'edit' },
      });
      await modal.present();
      await modal.onDidDismiss();
      store.formsResource.reload();
    },

    async openBuilder(form: FormDefinitionModel): Promise<void> {
      if (!store.canWrite()) return;
      const modal = await store.modalController.create({
        component: FormBuilderEditor,
        componentProps: { form },
        cssClass: 'full-screen-modal',
      });
      await modal.present();
      await modal.onDidDismiss();
      store.formsResource.reload();
    },

    async archiveForm(form: FormDefinitionModel): Promise<void> {
      if (!store.canWrite()) return;
      await store.formDefinitionService.archive(form, store.currentUser());
      store.formsResource.reload();
    },

    async duplicateForm(form: FormDefinitionModel): Promise<void> {
      if (!store.canWrite()) return;
      const copy: FormDefinitionModel = {
        ...form,
        bkey: '',
        name: form.name + ' (Kopie)',
        formKey: '',
        version: 1,
        createdAt: '',
        updatedAt: '',
        createdBy: '',
      };
      await store.formDefinitionService.create(copy, store.currentUser());
      store.formsResource.reload();
    },

    async downloadPdf(form: FormDefinitionModel, submissionId?: string): Promise<void> {
      if (form.target.kind !== 'collection') return;
      const { getFirestore, collection, getDocs, query, where } = await import('firebase/firestore');
      const db = getFirestore();

      type SubmissionDoc = Record<string, unknown> & { bkey: string };
      let docsData: SubmissionDoc[];

      if (submissionId) {
        const { doc, getDoc } = await import('firebase/firestore');
        const snap = await getDoc(doc(db, form.target.collectionName, submissionId));
        docsData = snap.exists() ? [{ ...snap.data(), bkey: snap.id } as SubmissionDoc] : [];
      } else {
        const snap = await getDocs(
          query(
            collection(db, form.target.collectionName),
            where('tenants', 'array-contains', store.appStore.tenantId()),
          )
        );
        docsData = snap.docs.map(d => ({ ...d.data(), bkey: d.id }) as SubmissionDoc);
      }

      if (docsData.length === 0) return;

      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const { getApp } = await import('firebase/app');
      const fn = httpsCallable<Record<string, unknown>, { url: string; filename: string }>(
        getFunctions(getApp(), 'europe-west6'),
        'generateDocument',
      );

      const fields = [...form.fields].sort((a, b) => a.order - b.order);

      if (submissionId && form.pdfTemplateId) {
        // Template mode — single submission
        const result = await fn({
          templateId: form.pdfTemplateId,
          payload: docsData[0],
          options: { outputFormat: 'pdf', storageMode: 'ephemeral', filename: `${form.formKey}-${submissionId}.pdf` },
        });
        window.open(result.data.url, '_blank');
      } else {
        // Raw HTML mode — batch (or single without template)
        const buildPage = (data: SubmissionDoc): string => {
          const rows = fields.map(f => {
            const v = data[f.key];
            const display = (v === undefined || v === null || v === '') ? '–' : String(v);
            return `<tr><th style="text-align:left;padding:4px 12px 4px 0;font-weight:600;">${f.label}</th><td style="padding:4px 0;">${display}</td></tr>`;
          }).join('');
          return `<div class="page">
            <h2 style="margin:0 0 12px;">${form.name}</h2>
            <table style="border-collapse:collapse;width:100%;">${rows}</table>
            <p style="color:#888;font-size:11px;margin-top:16px;">ID: ${data['bkey']} · Eingereicht: ${String(data['submittedAt'] ?? '')}</p>
          </div>`;
        };

        const pages = docsData
          .map((data, i) =>
            i < docsData.length - 1
              ? `<div style="page-break-after:always;">${buildPage(data)}</div>`
              : buildPage(data)
          )
          .join('');

        const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
          <style>body{font-family:sans-serif;padding:20px;} .page{padding:10px;}</style>
          </head><body>${pages}</body></html>`;

        const filename = submissionId
          ? `${form.formKey}-${submissionId}.pdf`
          : `${form.formKey}-submissions-${Date.now()}.pdf`;

        const result = await fn({
          html,
          options: { outputFormat: 'pdf', storageMode: 'ephemeral', filename },
        });
        window.open(result.data.url, '_blank');
      }
    },

    async downloadCsv(form: FormDefinitionModel): Promise<void> {
      if (form.target.kind !== 'collection') return;
      const { getFirestore, collection, getDocs, query, where } = await import('firebase/firestore');
      const db = getFirestore();
      const snap = await getDocs(
        query(
          collection(db, form.target.collectionName),
          where('tenants', 'array-contains', store.appStore.tenantId()),
        )
      );

      const fields = [...form.fields].sort((a, b) => a.order - b.order);
      const headerRow = fields
        .map(f => `"${f.label.replace(/"/g, '""')} (${f.key})"`)
        .concat(['"is_spam"', '"submittedAt"'])
        .join(',');

      const rows = snap.docs.map(doc => {
        const data = doc.data();
        const values = fields.map(f => {
          const v = data[f.key];
          const cell = v === undefined || v === null ? '' : String(v);
          return `"${cell.replace(/"/g, '""')}"`;
        });
        values.push(`"${data['isSpam'] ? 'ja' : 'nein'}"`);
        values.push(`"${data['submittedAt'] ?? ''}"`);
        return values.join(',');
      });

      const csv = [headerRow, ...rows].join('\r\n');
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${form.formKey}-submissions.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    },
  }))
);
