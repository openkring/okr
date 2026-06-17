// libs/esign/feature/src/lib/esign-view.modal.ts
import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon,
  IonContent, IonGrid, IonRow, IonCol, IonLabel, IonChip,
  IonList, IonItem, IonNote, ModalController, ToastController,
} from '@ionic/angular/standalone';
import { Browser } from '@capacitor/browser';

import { EsignRecord, EsignSignee } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { EsignService } from '@bk2/esign-data-access';

@Component({
  selector: 'bk-esign-view-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    SvgIconPipe,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon,
    IonContent, IonGrid, IonRow, IonCol, IonLabel, IonChip,
    IonList, IonItem, IonNote,
    DatePipe,
  ],
  styles: [`
    .preview-frame { width: 100%; height: 60vh; border: none; }
    .signee-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; }
    .meta-label { font-size: 0.75rem; color: var(--ion-color-medium); }
    .meta-value { font-size: 0.9rem; }
    ion-chip { font-size: 0.75rem; height: 20px; }
    .section-title { font-weight: 600; margin: 12px 0 4px; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; }
    .events-toggle { font-size: 0.8rem; color: var(--ion-color-primary); cursor: pointer; margin-top: 8px; }
  `],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button (click)="close()">
            <ion-icon src="{{ 'close' | svgIcon }}" slot="icon-only" />
          </ion-button>
        </ion-buttons>
        <ion-title>{{ esign().documentName }}</ion-title>
        <ion-buttons slot="end">
          <ion-chip [outline]="true" size="small"
            [color]="esignService.statusColor(esign().documentStatus)">
            {{ esignService.statusLabel(esign().documentStatus) }}
          </ion-chip>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-grid>
        <!-- PDF Preview -->
        @if(previewUrl()) {
          <ion-row>
            <ion-col>
              <iframe [src]="previewUrl()" class="preview-frame" title="PDF Vorschau"></iframe>
            </ion-col>
          </ion-row>
        }

        <!-- Summary -->
        <ion-row>
          <ion-col>
            <p class="section-title">Details</p>
            <ion-list lines="none">
              <ion-item>
                <ion-label>
                  <p class="meta-label">Initiator</p>
                  <p class="meta-value">{{ esign().initiatorAliasName }}</p>
                </ion-label>
              </ion-item>
              <ion-item>
                <ion-label>
                  <p class="meta-label">Signaturmodus</p>
                  <p class="meta-value">{{ esign().signatureMode }} ({{ esign().jurisdiction }})</p>
                </ion-label>
              </ion-item>
            </ion-list>
          </ion-col>
        </ion-row>

        <!-- Signees -->
        <ion-row>
          <ion-col>
            <p class="section-title">Unterzeichner</p>
            @for(signee of esign().signees; track signee.signeeId) {
              <div class="signee-row">
                <ion-chip [outline]="true" size="small"
                  [color]="signeeStatusColor(signee.signStatus)">
                  {{ signeeStatusLabel(signee.signStatus) }}
                </ion-chip>
                <ion-label>
                  <p class="meta-value">{{ signee.name ?? signee.email }}</p>
                  <p class="meta-label">{{ signee.email }}</p>
                  @if(signee.signedTime) {
                    <p class="meta-label">Unterzeichnet: {{ signee.signedTime.toDate() | date }}</p>
                  }
                  @if(signee.signeeComment) {
                    <p class="meta-label">{{ signee.signeeComment }}</p>
                  }
                </ion-label>
                @if(canResend(signee)) {
                  <ion-button size="small" fill="outline" (click)="resendInvitation(signee)">
                    Erneut senden
                  </ion-button>
                }
              </div>
            }
          </ion-col>
        </ion-row>

        <!-- Events (collapsible) -->
        <ion-row>
          <ion-col>
            <p class="events-toggle" (click)="showEvents.set(!showEvents())">
              {{ showEvents() ? '▲ Ereignisse ausblenden' : '▼ Ereignisse anzeigen' }}
            </p>
            @if(showEvents()) {
              @for(event of esign().events; track event.at) {
                <ion-note>{{ event.type }} — {{ event.at.toDate() | date:'short' }}</ion-note>
              }
            }
          </ion-col>
        </ion-row>
      </ion-grid>
    </ion-content>

    <!-- Footer -->
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button (click)="refresh()">
          <ion-icon src="{{ 'reload' | svgIcon }}" slot="icon-only" />
        </ion-button>
        @if(esign().documentStatus === 'signed') {
          <ion-button (click)="downloadSigned()">
            <ion-icon src="{{ 'download' | svgIcon }}" slot="icon-only" />
          </ion-button>
        }
      </ion-buttons>
      <ion-buttons slot="end">
        <ion-button color="danger" (click)="requestDelete()">
          <ion-icon src="{{ 'trash' | svgIcon }}" slot="icon-only" />
        </ion-button>
      </ion-buttons>
    </ion-toolbar>
  `
})
export class EsignViewModal {
  public readonly esign = input.required<EsignRecord>();

  protected readonly esignService   = inject(EsignService);
  private readonly modalController  = inject(ModalController);
  private readonly toastController  = inject(ToastController);

  protected readonly previewUrl     = signal<string>('');
  protected readonly showEvents     = signal(false);
  protected readonly loading        = signal(false);

  protected close(): void {
    this.modalController.dismiss(null, 'cancel');
  }

  protected async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      const details = await this.esignService.getDocumentDetails(this.esign().esignId);
      const url = (details['previewUrl'] ?? details['documentUrl']) as string | undefined;
      if (url) this.previewUrl.set(url);
    } catch {
      const toast = await this.toastController.create({
        message: 'Vorschau konnte nicht geladen werden.',
        duration: 3000,
        color: 'danger',
      });
      await toast.present();
    } finally {
      this.loading.set(false);
    }
  }

  protected async downloadSigned(): Promise<void> {
    const path = this.esign().signedPdfPath;
    if (!path) return;
    const { getStorage, ref, getDownloadURL } = await import('firebase/storage');
    const url = await getDownloadURL(ref(getStorage(), path));
    await Browser.open({ url });
  }

  protected async resendInvitation(signee: EsignSignee): Promise<void> {
    try {
      await this.esignService.resendInvitation(this.esign().esignId, signee.signeeId);
      const toast = await this.toastController.create({
        message: `Einladung an ${signee.email} erneut gesendet.`,
        duration: 2000,
        color: 'success',
      });
      await toast.present();
    } catch {
      const toast = await this.toastController.create({
        message: 'Einladung konnte nicht gesendet werden.',
        duration: 3000,
        color: 'danger',
      });
      await toast.present();
    }
  }

  protected async requestDelete(): Promise<void> {
    const { EsignDeleteConfirmModal } = await import('./esign-delete-confirm.modal');
    const modal = await this.modalController.create({
      component: EsignDeleteConfirmModal,
      componentProps: { esign: this.esign() },
    });
    await modal.present();
    const { role } = await modal.onWillDismiss();
    if (role === 'confirm') {
      try {
        await this.esignService.deleteEsign(this.esign().esignId);
        this.modalController.dismiss(null, 'deleted');
      } catch {
        const toast = await this.toastController.create({
          message: 'Dokument konnte nicht gelöscht werden.',
          duration: 3000,
          color: 'danger',
        });
        await toast.present();
      }
    }
  }

  protected canResend(signee: EsignSignee): boolean {
    return signee.signStatus === 'pending' || signee.signStatus === 'in-progress';
  }

  protected signeeStatusLabel(status: EsignSignee['signStatus']): string {
    const map: Record<EsignSignee['signStatus'], string> = {
      'on-hold':    'Wartend',
      'pending':    'Ausstehend',
      'in-progress': 'In Bearbeitung',
      'signed':     'Unterzeichnet',
      'rejected':   'Abgelehnt',
    };
    return map[status] ?? status;
  }

  protected signeeStatusColor(status: EsignSignee['signStatus']): string {
    const map: Record<EsignSignee['signStatus'], string> = {
      'on-hold':    'medium',
      'pending':    'warning',
      'in-progress': 'primary',
      'signed':     'success',
      'rejected':   'danger',
    };
    return map[status] ?? 'medium';
  }
}
