import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import {
  IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonChip, IonIcon, IonItem, IonLabel, IonList,
  IonListHeader, IonNote, IonSpinner, IonThumbnail, ModalController,
} from '@ionic/angular/standalone';

import { ContractDocumentRole, ContractDocState, ContractModel } from '@okr/shared-models';
import { I18nService } from '@okr/shared-i18n';
import { SvgIconPipe } from '@okr/shared-pipes';

import { ContractDocumentService, SignedContractDocument } from '@okr/business-contract-data-access';
import {
  CONTRACT_I18N_KEYS, contractFileIconName, contractFileMimeType, ContractI18n, documentKeysSignature, groupDocumentsByRole,
  pickFreshUrl,
} from '@okr/business-contract-util';

import { ContractDocumentUploadModal, ContractDocumentUploadResult } from './contract-document-upload.modal';

/** Signed URLs live ~10 minutes (spec 1.5 §7.2); a link older than this is re-signed on click. */
const SIGNED_URL_FRESH_MS = 8 * 60 * 1000;

/**
 * The contract's files (spec 1.5 §7), grouped by role. Links are signed once per change of the
 * dossier's key list — never on a timer; a click on a stale link re-signs first.
 */
@Component({
  selector: 'okr-contract-dossier',
  standalone: true,
  imports: [
    SvgIconPipe,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonList, IonListHeader, IonItem, IonLabel, IonNote,
    IonThumbnail, IonIcon, IonChip, IonButton, IonSpinner,
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px;} }
    ion-card-title { font-size: 1rem; }
    .title-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    ion-thumbnail img { object-fit: cover; }
    ion-thumbnail ion-icon { width: 100%; height: 100%; }
  `],
  template: `
    <ion-card>
      <ion-card-header>
        <div class="title-row">
          <ion-card-title>{{ i18n.dossier() }}</ion-card-title>
          @if (canEdit()) {
            <ion-button fill="clear" size="small" [disabled]="uploading()" (click)="addFile()">
              @if (uploading()) {
                <ion-spinner slot="start" name="crescent" />
              } @else {
                <ion-icon slot="start" src="{{ 'add-circle' | svgIcon }}" />
              }
              {{ i18n.upload() }}
            </ion-button>
          }
        </div>
      </ion-card-header>
      <ion-card-content class="ion-no-padding">
        @if (uploading()) {
          <ion-item lines="none"><ion-note>{{ i18n.file_uploading() }}</ion-note></ion-item>
        }
        @if (uploadFailed()) {
          <ion-item lines="none"><ion-note color="danger">{{ i18n.file_uploadError() }}</ion-note></ion-item>
        }
        @if (signFailed()) {
          <ion-item lines="none"><ion-note color="warning">{{ i18n.file_signError() }}</ion-note></ion-item>
        }
        @if (groups().length === 0) {
          <ion-item lines="none"><ion-note>{{ i18n.file_empty() }}</ion-note></ion-item>
        } @else {
          <ion-list lines="inset">
            @for (group of groups(); track group.role) {
              <ion-list-header><ion-label>{{ roleLabel(group.role) }}</ion-label></ion-list-header>
              @for (doc of group.documents; track doc.docKey) {
                @let signed = signedByKey().get(doc.docKey);
                <ion-item [href]="signed?.url" target="_blank" rel="noopener" [detail]="false"
                  [attr.aria-label]="i18n.file_open() + ': ' + (doc.title || signed?.name || '')"
                  (click)="onOpen($event, doc.docKey)">
                  <ion-thumbnail slot="start">
                    @if (signed?.thumbnailUrl) {
                      <img [src]="signed?.thumbnailUrl" [alt]="doc.title" loading="lazy" />
                    } @else {
                      <ion-icon src="{{ fileIcon(signed) | svgIcon:'filetypes' }}" />
                    }
                  </ion-thumbnail>
                  <ion-label class="ion-text-wrap">{{ doc.title || signed?.name || doc.docKey }}</ion-label>
                  <ion-chip slot="end" [outline]="true">{{ docStateLabel(doc.docState) }}</ion-chip>
                </ion-item>
              }
            }
          </ion-list>
        }
      </ion-card-content>
    </ion-card>
  `,
})
export class ContractDossier {
  private readonly documentService = inject(ContractDocumentService);
  private readonly modalController = inject(ModalController);
  protected readonly i18n = inject(I18nService).translateAll(CONTRACT_I18N_KEYS) as ContractI18n;

  public readonly contract = input.required<ContractModel>();
  public readonly canEdit = input(false);
  /** emitted after a successful upload, so the store reloads the contract */
  public readonly changed = output<void>();

  protected readonly groups = computed(() => groupDocumentsByRole(this.contract().documents));
  /** a string, so the effect below re-runs only when the key list really changes */
  private readonly keySignature = computed(() => documentKeysSignature(this.contract().documents));

  protected readonly signedByKey = signal(new Map<string, SignedContractDocument>());
  protected readonly signFailed = signal(false);
  protected readonly uploading = signal(false);
  protected readonly uploadFailed = signal(false);
  private signedAt = 0;
  private signRequest = 0;

  constructor() {
    effect(() => {
      const signature = this.keySignature();
      untracked(() => void this.sign(signature));
    });
  }

  protected roleLabel(role: ContractDocumentRole): string {
    return this.i18n[`role_${role}`]?.() ?? role;
  }

  protected docStateLabel(state: ContractDocState): string {
    return this.i18n[`docState_${state}`]?.() ?? state;
  }

  protected fileIcon(signed: SignedContractDocument | undefined): string {
    return contractFileIconName(signed?.mimeType);
  }

  /**
   * Signs the dossier's files; a late answer to an outdated key list is dropped. Never throws.
   * @returns true only when this call applied fresh results (a failure keeps the old, possibly expired map)
   */
  private async sign(signature: string): Promise<boolean> {
    const request = ++this.signRequest;
    const keys = signature ? signature.split('|') : [];
    if (keys.length === 0) {
      this.signedByKey.set(new Map());
      this.signFailed.set(false);
      return true;
    }
    try {
      const documents = await this.documentService.sign(keys);
      if (request !== this.signRequest) return false;
      this.signedByKey.set(new Map(documents.map((d) => [d.key, d])));
      this.signedAt = Date.now();
      this.signFailed.set(false);
      return true;
    } catch (error) {
      if (request !== this.signRequest) return false;
      console.error('ContractDossier.sign: could not sign the dossier files', error);
      this.signFailed.set(true);
      return false;
    }
  }

  /**
   * A fresh link opens through the item's own anchor. A stale one is re-signed first; the tab is
   * opened synchronously (still inside the tap, so no popup blocker) and pointed at the new URL.
   */
  protected async onOpen(event: Event, docKey: string): Promise<void> {
    const fresh = Date.now() - this.signedAt < SIGNED_URL_FRESH_MS;
    if (fresh) return; // signed: the anchor opens it; not signed (unreadable): the item has no href
    event.preventDefault();
    const tab = window.open('', '_blank');
    if (tab) tab.opener = null;
    const signedOk = await this.sign(this.keySignature());
    // never fall back to the expired URL: on a failed re-sign the note above explains it
    const url = pickFreshUrl(signedOk, this.signedByKey().get(docKey));
    if (tab && url) tab.location.href = url;
    else tab?.close();
  }

  protected async addFile(): Promise<void> {
    const modal = await this.modalController.create({
      component: ContractDocumentUploadModal,
      componentProps: { documents: this.contract().documents ?? [] },
    });
    await modal.present();
    const { data, role } = await modal.onWillDismiss<ContractDocumentUploadResult>();
    if (role !== 'confirm' || !data) return;

    this.uploading.set(true);
    this.uploadFailed.set(false);
    try {
      // the server checks the declared type: name it even when the browser could not (HEIC on Chrome)
      const type = contractFileMimeType(data.file.name, data.file.type);
      const file = type === data.file.type ? data.file : new File([data.file], data.file.name, { type });
      await this.documentService.upload(this.contract().okey, file, {
        role: data.role, title: data.title, docState: data.docState,
        ...(data.priorVersionKey ? { priorVersionKey: data.priorVersionKey } : {}),
      });
      this.changed.emit();
    } catch (error) {
      console.error('ContractDossier.addFile: upload failed', error);
      this.uploadFailed.set(true);
    } finally {
      this.uploading.set(false);
    }
  }
}
