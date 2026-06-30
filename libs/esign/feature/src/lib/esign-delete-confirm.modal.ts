// libs/esign/feature/src/lib/esign-delete-confirm.modal.ts
import { ChangeDetectionStrategy, Component, inject, input, computed } from '@angular/core';
import {
  IonHeader, IonFooter, IonToolbar, IonTitle, IonButtons, IonButton,
  IonContent, ModalController,
} from '@ionic/angular/standalone';

import { EsignRecord } from '@bk2/shared-models';

interface DeleteConfig {
  title: string;
  body: string;
  confirmLabel: string;
}

@Component({
  selector: 'bk-esign-delete-confirm-modal',
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
          <ion-button (click)="cancel()">Abbrechen</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <p class="body" [innerHTML]="cfg().body"></p>
    </ion-content>

    <ion-footer>
      <ion-toolbar color="light">
        <ion-buttons slot="end">
          <ion-button (click)="cancel()">Abbrechen</ion-button>
          <ion-button color="danger" (click)="confirm()">{{ cfg().confirmLabel }}</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-footer>
  `
})
export class EsignDeleteConfirmModal {
  public readonly esign = input.required<EsignRecord>();
  private readonly modalController = inject(ModalController);

  protected readonly cfg = computed<DeleteConfig>(() => {
    const status = this.esign().documentStatus;
    switch (status) {
      case 'uploading':
      case 'error':
        return {
          title: 'Upload verwerfen?',
          body: 'Dieser Upload hat DeepSign nie erreicht und wird nur lokal entfernt.',
          confirmLabel: 'Verwerfen',
        };
      case 'draft':
        return {
          title: 'Signaturprozess löschen?',
          body: 'Das Dokument wird aus DeepSign gelöscht. Es wurden noch keine Einladungen verschickt.',
          confirmLabel: 'Löschen',
        };
      case 'in-progress':
        return {
          title: 'Zurückziehen und löschen?',
          body: 'Der Signaturprozess wird zunächst zurückgezogen und dann gelöscht. Ausstehende Unterzeichner erhalten eine Rückzugsbenachrichtigung von DeepSign. <strong>Dies kann nicht rückgängig gemacht werden.</strong>',
          confirmLabel: 'Zurückziehen & löschen',
        };
      case 'signed':
        return {
          title: 'Unterzeichnetes Dokument löschen?',
          body: '<span class="warn">Das unterzeichnete PDF wird dauerhaft gelöscht.</span> Bitte stellen Sie sicher, dass Sie eine Kopie heruntergeladen haben.',
          confirmLabel: 'Unterzeichnetes PDF löschen',
        };
      default:
        return {
          title: 'Signaturprozess löschen?',
          body: 'Der Signaturprozess und sein Verlauf werden entfernt.',
          confirmLabel: 'Löschen',
        };
    }
  });

  protected cancel(): void {
    this.modalController.dismiss(null, 'cancel');
  }

  protected confirm(): void {
    this.modalController.dismiss(null, 'confirm');
  }
}
