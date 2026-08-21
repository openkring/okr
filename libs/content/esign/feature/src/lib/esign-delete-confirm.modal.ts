// libs/content/esign/feature/src/lib/esign-delete-confirm.modal.ts
import { ChangeDetectionStrategy, Component, inject, input, computed } from '@angular/core';
import {
  IonHeader, IonFooter, IonToolbar, IonTitle, IonButtons, IonButton,
  IonContent, ModalController,
} from '@ionic/angular/standalone';

import { EsignRecord } from '@okr/shared-models';
import { I18nService } from '@okr/shared-i18n';
import { ESIGN_I18N_KEYS, EsignI18n } from '@okr/content-esign-util';
import { dismissOverlay } from '@okr/shared-util-angular';

interface DeleteConfig {
  title: string;
  body: string;
  confirmLabel: string;
}

@Component({
  selector: 'okr-esign-delete-confirm-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IonHeader, IonFooter, IonToolbar, IonTitle, IonButtons, IonButton,
    IonContent,
  ],
  styles: [`
    .body  { padding: 16px; font-size: 0.95rem; line-height: 1.5; }
    .warn  { font-weight: 600; color: var(--ion-color-danger); }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-title>{{ cfg().title }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="cancel()">{{ i18n.cancel() }}</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <p class="body" [innerHTML]="cfg().body"></p>
    </ion-content>

    <ion-footer>
      <ion-toolbar color="light">
        <ion-buttons slot="end">
          <ion-button (click)="cancel()">{{ i18n.cancel() }}</ion-button>
          <ion-button color="danger" (click)="confirm()">{{ cfg().confirmLabel }}</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-footer>
  `
})
export class EsignDeleteConfirmModal {
  public readonly esign = input.required<EsignRecord>();
  private readonly modalController = inject(ModalController);

  // Direct inject (no store): EsignStore opens this modal, importing it back would be circular.
  protected readonly i18n = inject(I18nService).translateAll(ESIGN_I18N_KEYS) as EsignI18n;

  protected readonly cfg = computed<DeleteConfig>(() => {
    const i18n = this.i18n;
    switch (this.esign().documentStatus) {
      case 'uploading':
      case 'error':
        return { title: i18n.del_upload_title(), body: i18n.del_upload_body(), confirmLabel: i18n.del_upload_confirm() };
      case 'draft':
        return { title: i18n.del_draft_title(), body: i18n.del_draft_body(), confirmLabel: i18n.del_draft_confirm() };
      case 'in-progress':
        return { title: i18n.del_progress_title(), body: i18n.del_progress_body(), confirmLabel: i18n.del_progress_confirm() };
      case 'signed':
        return { title: i18n.del_signed_title(), body: i18n.del_signed_body(), confirmLabel: i18n.del_signed_confirm() };
      default:
        return { title: i18n.del_default_title(), body: i18n.del_default_body(), confirmLabel: i18n.del_default_confirm() };
    }
  });

  protected cancel(): void {
    dismissOverlay(this.modalController, null, 'cancel');
  }

  protected confirm(): void {
    dismissOverlay(this.modalController, null, 'confirm');
  }
}
