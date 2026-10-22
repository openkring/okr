import { computed, inject, Injector } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { AlertController, ModalController, ToastController } from '@ionic/angular';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { of } from 'rxjs';

import { AppConfigService, ChatStatusService } from '@okr/shared-data-access';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { FileTransferLimits, FileTransferModel } from '@okr/shared-models';
import { confirm, lazyService, navigateByUrl, notify, resourceParams, showToast } from '@okr/shared-util-angular';
import { chatBlockedAlertMessage, debugListLoaded, fill, hasRole, isChatBlockedError } from '@okr/shared-util-core';

import { FileTransferDisposition, FileTransferError, FileTransferService } from '@okr/content-file-transfer-data-access';
import {
  DEFAULT_FILE_TRANSFER_LIMITS, FILE_TRANSFER_I18N_KEYS, FileTransferEventSummary, FileTransferI18n, FileTransferRejection,
  isFileTransferRejection, resolveFileTransferLimits, summarizeFileTransferEvents, summarizeFileTransferEventsByTransfer,
} from '@okr/content-file-transfer-util';
// Static on purpose: none of these ui modals injects this store (they resolve i18n through
// I18nService), so there is no store ↔ modal cycle. A dynamic import() of the same lib next to the
// pages' static FileTransferCard import is forbidden by @nx/enforce-module-boundaries anyway.
import {
  FileTransferFormData, FileTransferInfoModal, FileTransferLimitRequest, FileTransferLimitsEditModal, FileTransferLogModal,
  FileTransferNewModal,
} from '@okr/content-file-transfer-ui';

import type { FileTransferUploadFailure } from './file-transfer-upload.modal';

export type FileTransferState = {
  /** the sender's own list is on screen («Meine Transfers») */
  mineActive: boolean;
  /** the admin monitor is on screen */
  allActive: boolean;
  searchTerm: string;
  /** admin monitor: per-transfer access counts, loaded on demand (one-shot reads, no listeners) */
  monitorSummaries: Record<string, FileTransferEventSummary>;
};

const initialState: FileTransferState = {
  mineActive: false,
  allActive: false,
  searchTerm: '',
  monitorSummaries: {},
};

function matches(t: FileTransferModel, term: string): boolean {
  if (!term) return true;
  const needle = term.toLowerCase();
  return [t.senderName, t.message, ...t.files.map(f => f.name), ...t.recipients.map(r => r.name || r.email)]
    .some(field => (field ?? '').toLowerCase().includes(needle));
}

/**
 * Quick file transfer (spec 1.115): the sender's list, the admin monitor and every action —
 * send (prepare → resumable upload → send), end, info, limit request, limits, log, contact.
 *
 * Provided in root so the chat (Task 10) can open the send modal through a lazy import of this lib.
 * The two lists only load while a screen shows them (`showMine` / `showAll`), so injecting the store costs
 * no Firestore listener. The upload modal (this lib) is imported dynamically; see the ui import note.
 */
export const FileTransferStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),

  withProps(() => ({
    appStore: inject(AppStore),
    appConfigService: inject(AppConfigService),
    fileTransferService: inject(FileTransferService),
    i18nService: inject(I18nService),
    modalController: inject(ModalController),
    toastController: inject(ToastController),
    alertController: inject(AlertController),
    router: inject(Router),
    chatStatus: inject(ChatStatusService),
    matrixService: lazyService(inject(Injector), () =>
      import('@okr/chat-data-access').then(m => m.MatrixChatService)),
  })),

  withProps((store) => ({
    i18n: store.i18nService.translateAll(FILE_TRANSFER_I18N_KEYS) as FileTransferI18n,
  })),

  withProps((store) => ({
    // value-compared params: users/{uid} arrives twice at boot (memory: rxResource params not value-compared)
    mineResource: rxResource({
      params: resourceParams(() => ({
        personKey: store.mineActive() ? (store.appStore.currentUser()?.personKey ?? '') : '',
      })),
      stream: ({ params }) => params.personKey
        ? store.fileTransferService.listMine(params.personKey).pipe(debugListLoaded<FileTransferModel>('FileTransferStore.mine', store.appStore.currentUser()))
        : of([] as FileTransferModel[]),
    }),
    mineEventsResource: rxResource({
      params: resourceParams(() => ({
        personKey: store.mineActive() ? (store.appStore.currentUser()?.personKey ?? '') : '',
      })),
      stream: ({ params }) => params.personKey
        ? store.fileTransferService.listEventsOfSender(params.personKey)
        : of([]),
    }),
    allResource: rxResource({
      params: resourceParams(() => ({
        load: store.allActive() && hasRole('admin', store.appStore.currentUser()),
      })),
      stream: ({ params }) => params.load
        ? store.fileTransferService.listAll().pipe(debugListLoaded<FileTransferModel>('FileTransferStore.all', store.appStore.currentUser()))
        : of([] as FileTransferModel[]),
    }),
  })),

  withComputed((state) => ({
    currentUser: computed(() => state.appStore.currentUser()),
    tenantId: computed(() => state.appStore.tenantId()),
    personKey: computed(() => state.appStore.currentUser()?.personKey ?? ''),
    isAdmin: computed(() => hasRole('admin', state.appStore.currentUser())),
    /** app-config field is undefined on legacy docs (memory: Firestore reads skip model defaults) */
    configLimits: computed(() => state.appStore.appConfig()?.fileTransferLimits ?? undefined),
    mine: computed(() => state.mineResource.value() ?? []),
    all: computed(() => state.allResource.value() ?? []),
    mineSummaries: computed(() => summarizeFileTransferEventsByTransfer(state.mineEventsResource.value() ?? [])),
  })),

  withComputed((state) => ({
    limits: computed(() => resolveFileTransferLimits(state.configLimits(), state.personKey())),
    filteredMine: computed(() => state.mine().filter(t => matches(t, state.searchTerm()))),
    filteredAll: computed(() => state.all().filter(t => matches(t, state.searchTerm()))),
    isLoadingMine: computed(() => state.mineResource.isLoading()),
    isLoadingAll: computed(() => state.allResource.isLoading()),
  })),

  withMethods((store) => ({
    showMine(mineActive: boolean): void { patchState(store, { mineActive }); },
    showAll(allActive: boolean): void { patchState(store, { allActive }); },
    setSearchTerm(searchTerm: string): void { patchState(store, { searchTerm: searchTerm ?? '' }); },

    /** Limits of the given sender (the monitor flags a transfer relative to its sender's own limits). */
    limitsOf(personKey: string) {
      return resolveFileTransferLimits(store.configLimits(), personKey);
    },

    /** A friendly text for a failed callable: the limit breach the server named, else a generic one. */
    errorText(error: unknown): string {
      const message = error instanceof FileTransferError ? error.message : '';
      if (isFileTransferRejection(message)) {
        const key = `rejection_${message}` as `rejection_${FileTransferRejection}`;
        return store.i18n[key]();
      }
      return store.i18n.failure_generic();
    },

    async toast(message: string): Promise<void> {
      await showToast(store.toastController, message);
    },

    /*-------------------------- sending --------------------------------*/
    /**
     * Opens the send modal and, on «Senden», runs the whole send. `chatRoomId` makes the modal the
     * chat variant («Als Transfer senden»), and the server posts the card into that room.
     * @returns true when the transfer was sent
     */
    async openNew(preset?: Partial<FileTransferFormData>, chatRoomId = ''): Promise<boolean> {
      if (!store.currentUser()) return false;
      const modal = await store.modalController.create({
        component: FileTransferNewModal,
        componentProps: {
          preset,
          chatRoomId,
          limits: store.limits(),
          tenantId: store.tenantId(),
          groups: store.appStore.allGroups(),
          persons: store.appStore.allPersons(),
        },
      });
      await modal.present();
      const { data, role } = await modal.onDidDismiss<FileTransferFormData>();
      if (role !== 'confirm' || !data) return false;
      return this.send(data, chatRoomId);
    },

    /**
     * Best effort after a failed or aborted send: the server deletes the still-'uploading' transfer
     * (and its files), so it no longer counts toward the open bytes. If this call fails too, the
     * hourly reaper drops the upload after 24 h.
     */
    async abandon(transferKey: string): Promise<void> {
      try {
        await store.fileTransferService.cancelUpload(transferKey);
      } catch (error) {
        console.warn('FileTransferStore.abandon failed', error instanceof Error ? error.message : 'unknown');
      }
    },

    /**
     * prepare → resumable upload of every file (progress modal) → send. Every failure after
     * prepare (stale chunk, upload error, abort, expired session, rejected send) abandons the
     * transfer; the reaper is the fallback when that fails too.
     */
    async send(form: FileTransferFormData, chatRoomId = ''): Promise<boolean> {
      let prepared;
      try {
        prepared = await store.fileTransferService.prepare({
          files: form.files.map(f => ({ name: f.name, size: f.size, contentType: f.type || 'application/octet-stream' })),
          lifetimeDays: form.lifetimeDays,
          externalCount: form.emails.length,
          // an upper bound before deduplication; the server re-checks the real recipients at send
          recipientCount: form.groupKeys.length + form.personKeys.length + form.emails.length,
          emails: form.emails,
          origin: window.location.origin,
        });
      } catch (error) {
        await this.toast(this.errorText(error));
        return false;
      }

      let FileTransferUploadModal;
      try {
        ({ FileTransferUploadModal } = await import('./file-transfer-upload.modal'));
      } catch {
        // stale chunk after a deploy / offline: no unhandled rejection
        await this.abandon(prepared.transferKey);
        await this.toast(store.i18n.upload_failed());
        return false;
      }
      const uploadModal = await store.modalController.create({
        component: FileTransferUploadModal,
        componentProps: { files: form.files, uploads: prepared.uploads },
        backdropDismiss: false,
      });
      await uploadModal.present();
      const upload = await uploadModal.onDidDismiss<FileTransferUploadFailure>();
      if (upload.role !== 'confirm') {
        const text = upload.role === 'error'
          ? (upload.data?.reason === 'expired' ? store.i18n.upload_expired() : store.i18n.upload_failed())
          : store.i18n.upload_aborted();
        await this.abandon(prepared.transferKey);
        await this.toast(text);
        return false;
      }

      try {
        const result = await store.fileTransferService.send({
          transferKey: prepared.transferKey,
          groupKeys: form.groupKeys,
          personKeys: form.personKeys,
          emails: form.emails,
          message: form.message,
          password: form.password,
          chatRoomId,
        });
        await this.toast(fill(store.i18n.sent_done(), { count: result.recipients }));
        return true;
      } catch (error) {
        await this.abandon(prepared.transferKey);
        await this.toast(this.errorText(error));
        return false;
      }
    },

    /*-------------------------- info + limits --------------------------------*/
    async showInfo(): Promise<void> {
      const modal = await store.modalController.create({
        component: FileTransferInfoModal,
        componentProps: { limits: store.limits() },
      });
      await modal.present();
      const { data, role } = await modal.onDidDismiss<FileTransferLimitRequest>();
      if (role === 'requestLimit' && data) await this.requestLimit(data.reason);
    },

    async requestLimit(reason: string): Promise<void> {
      try {
        await store.fileTransferService.requestLimit(reason);
        await this.toast(store.i18n.request_done());
      } catch (error) {
        await this.toast(this.errorText(error));
      }
    },

    /** Admin: edit app-config/{tenantId}.fileTransferLimits (AppConfigService's single-field patch). */
    async editLimits(): Promise<void> {
      if (!store.isAdmin()) return;
      const modal = await store.modalController.create({
        component: FileTransferLimitsEditModal,
        componentProps: {
          limits: { ...DEFAULT_FILE_TRANSFER_LIMITS, ...(store.configLimits() ?? {}) },
          tenantId: store.tenantId(),
          readOnly: false,
          persons: store.appStore.allPersons(),
        },
      });
      await modal.present();
      const { data, role } = await modal.onDidDismiss<FileTransferLimits>();
      if (role !== 'confirm' || !data) return;
      await store.appConfigService.setFileTransferLimits(store.tenantId(), data);
    },

    /*-------------------------- per transfer --------------------------------*/
    async open(transfer: FileTransferModel): Promise<void> {
      await navigateByUrl(store.router, `/private/file-transfer/${transfer.okey}`);
    },

    /** Ends a transfer early (sender or admin); the server deletes the files. */
    async end(transfer: FileTransferModel): Promise<boolean> {
      const ok = await confirm(store.alertController, store.i18n.end_confirm(), store.i18n.actions_end(), store.i18n.cancel(), true);
      if (!ok) return false;
      try {
        await store.fileTransferService.end(transfer.okey);
        await this.toast(store.i18n.end_done());
        return true;
      } catch (error) {
        await this.toast(this.errorText(error));
        return false;
      }
    },

    /** Short-lived signed URL of one file (logged-in recipient, sender or admin). */
    async fileUrl(transferKey: string, fileIndex: number, disposition: FileTransferDisposition): Promise<string> {
      return store.fileTransferService.openFile(transferKey, fileIndex, disposition);
    },

    /**
     * Admin: load (or reload) the access counts of one transfer — a single one-shot read.
     * @returns false when the read failed (the caller may retry)
     */
    async loadSummary(transfer: FileTransferModel): Promise<boolean> {
      try {
        const events = await store.fileTransferService.getEvents(transfer.okey, store.isAdmin() ? undefined : store.personKey());
        patchState(store, { monitorSummaries: { ...store.monitorSummaries(), [transfer.okey]: summarizeFileTransferEvents(events) } });
        return true;
      } catch (error) {
        console.warn('FileTransferStore.loadSummary failed', error instanceof Error ? error.message : 'unknown');
        return false;
      }
    },

    /** The access log of one transfer (admin, or the sender for an own transfer). */
    async showLog(transfer: FileTransferModel): Promise<void> {
      let events;
      try {
        events = await store.fileTransferService.getEvents(transfer.okey, store.isAdmin() ? undefined : store.personKey());
      } catch {
        await this.toast(store.i18n.failure_generic());
        return;
      }
      if (store.isAdmin()) {
        patchState(store, { monitorSummaries: { ...store.monitorSummaries(), [transfer.okey]: summarizeFileTransferEvents(events) } });
      }
      const modal = await store.modalController.create({
        component: FileTransferLogModal,
        componentProps: { transfer, events },
      });
      await modal.present();
      await modal.onDidDismiss();
    },

    /**
     * Admin: contact the sender through a chat direct message (find-or-create, same path as the
     * reservation list). The sender's email is not on the transfer doc (PII vault), so there is no
     * mailto: fallback; a failure shows a toast.
     */
    async contactSender(transfer: FileTransferModel): Promise<void> {
      if (!transfer.senderKey) return;
      if (this.isChatBlocked()) {
        await this.showChatBlockedNotice();
        return;
      }
      try {
        const matrix = await store.matrixService();
        await matrix.ensureInitialized();
        const room = await matrix.createDirectRoom(transfer.senderKey);
        await navigateByUrl(store.router, '/private/chat/c-contentpage', { selectedRoom: room.roomId });
      } catch (error) {
        if (isChatBlockedError(error, this.isChatBlocked())) {
          await this.showChatBlockedNotice();
          return;
        }
        console.warn('FileTransferStore.contactSender failed', error instanceof Error ? error.message : 'unknown');
        await this.toast(store.i18n.contact_failed());
      }
    },

    /** 1.107: true while the chat is blocked for the current person (read live, not captured). */
    isChatBlocked(): boolean {
      return store.chatStatus.isEffectivelyBlocked(store.personKey());
    },

    /** 1.107: the admin's maintenance message (or the default) instead of an error toast. */
    async showChatBlockedNotice(): Promise<void> {
      await notify(
        store.alertController,
        store.i18n.chat_blocked_title(),
        chatBlockedAlertMessage(store.chatStatus.message(), store.i18n.chat_blocked_default()),
        store.i18n.ok(),
      );
    },
  })),
);
