// libs/esign/feature/src/lib/esign-list.ts
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActionSheetController, ActionSheetOptions, ModalController, ToastController } from '@ionic/angular/standalone';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon,
  IonContent, IonLabel, IonGrid, IonRow, IonCol, IonChip, IonMenuButton,
} from '@ionic/angular/standalone';

import { EsignRecord } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyList, ListFilter, Spinner } from '@bk2/shared-ui';
import { AppStore } from '@bk2/shared-feature';
import { EsignService } from '@bk2/esign-data-access';
import { Browser } from '@capacitor/browser';

import { EsignStore } from './esign.store';

@Component({
  selector: 'bk-esign-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [EsignStore],
  imports: [
    SvgIconPipe, DatePipe,
    Spinner, ListFilter, EmptyList,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonMenuButton,
    IonContent, IonLabel, IonGrid, IonRow, IonCol, IonChip,
  ],
  styles: [`
    .e-name  { font-size: 1rem; }
    .e-date  { color: var(--ion-color-medium); font-weight: 600; margin-right: 6px; }
    .e-meta  { font-size: 0.8rem; color: var(--ion-color-medium); }
    ion-chip { font-size: 0.75rem; height: 20px; }
    .filter-row { display: flex; gap: 4px; padding: 4px 8px; overflow-x: auto; }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ store.filteredEsigns().length }} {{ store.i18n.list_title() }}</ion-title>
        <ion-buttons slot="end">
          <ion-button fill="clear" (click)="uploadAndSend()">
            <ion-icon src="{{ 'add-circle' | svgIcon }}" slot="icon-only" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
      <bk-list-filter (searchTermChanged)="store.setSearchTerm($event)" />
      <div class="filter-row">
        @for(f of statusFilters; track f.value) {
          <ion-chip
            [outline]="store.statusFilter() !== f.value"
            [color]="f.color"
            (click)="store.setStatusFilter(f.value)">
            {{ f.label }}
          </ion-chip>
        }
      </div>
    </ion-header>

    <ion-content>
      @if(store.isLoading()) {
        <bk-spinner />
      } @else if(store.filteredEsigns().length === 0) {
        <bk-empty-list [message]="store.i18n.empty()" />
      } @else {
        <ion-grid>
          @for(esign of store.filteredEsigns(); track esign.esignId) {
            <ion-row (click)="showActions(esign)">
              <ion-col size="6">
                <ion-label>
                  <p class="e-name">
                    <span class="e-date">{{ esign.createdAt.toDate() | date:'dd.MM.yy' }}</span>
                    {{ esign.documentName }}
                  </p>
                  <p class="e-meta">{{ subtitle(esign) }}</p>
                </ion-label>
              </ion-col>
              <ion-col size="6" class="ion-align-self-center">
                <ion-chip [outline]="true" size="small"
                  [color]="esignService.statusColor(esign.documentStatus)">
                  {{ esignService.statusLabel(esign.documentStatus) }}
                </ion-chip>
              </ion-col>
            </ion-row>
          }
        </ion-grid>
      }
    </ion-content>
  `
})
export class EsignList {
  protected readonly store = inject(EsignStore);
  protected readonly esignService = inject(EsignService);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly modalController = inject(ModalController);
  private readonly toastController = inject(ToastController);
  private readonly appStore = inject(AppStore);

  protected readonly statusFilters = [
    { value: 'all'         as const, label: 'Alle',          color: 'medium'  },
    { value: 'in-progress' as const, label: 'In Bearbeitung', color: 'warning' },
    { value: 'signed'      as const, label: 'Unterzeichnet',  color: 'success' },
    { value: 'rejected'    as const, label: 'Abgelehnt',      color: 'danger'  },
    { value: 'draft'       as const, label: 'Entwurf',        color: 'medium'  },
    { value: 'withdrawn'   as const, label: 'Zurückgezogen',  color: 'medium'  },
  ];

  protected subtitle(esign: EsignRecord): string {
    const total  = esign.signees?.length ?? 0;
    const signed = esign.signees?.filter(s => s.signStatus === 'signed').length ?? 0;
    if (esign.documentStatus === 'in-progress') {
      const next = esign.signees?.find(s => s.signStatus === 'pending' || s.signStatus === 'in-progress');
      if (next) return `Wartet auf ${next.email}`;
    }
    return `${signed} / ${total} unterzeichnet`;
  }

  protected async showActions(esign: EsignRecord): Promise<void> {
    const options: ActionSheetOptions = {
      header: esign.documentName,
      buttons: [],
    };

    options.buttons.push({
      text: this.store.i18n.as_view(),
      handler: () => { this.store.openViewModal(esign); },
    });

    options.buttons.push({
      text: this.store.i18n.as_doc_view(),
      handler: () => { this.openPdf(esign); },
    });

    if (esign.documentStatus === 'signed') {
      options.buttons.push({
        text: this.store.i18n.as_doc_send(),
        handler: () => { this.openSendEmail(esign); },
      });
    }

    options.buttons.push({
      text: this.store.i18n.as_delete(),
      role: 'destructive',
      handler: () => { this.store.openDeleteConfirm(esign); },
    });

    options.buttons.push({ text: 'Abbrechen', role: 'cancel' });

    const sheet = await this.actionSheetController.create(options);
    await sheet.present();
  }

  private async openPdf(esign: EsignRecord): Promise<void> {
    try {
      const details = await this.esignService.getDocumentDetails(esign.esignId);
      const url = (details['previewUrl'] ?? details['documentUrl']) as string | undefined;
      if (url) {
        await Browser.open({ url });
      }
    } catch {
      const toast = await this.toastController.create({
        message: 'Dokument konnte nicht geöffnet werden.',
        duration: 3000,
        color: 'danger',
      });
      await toast.present();
    }
  }

  private async openSendEmail(esign: EsignRecord): Promise<void> {
    const { EsignSendEmailModal } = await import('./esign-send-email.modal');
    const modal = await this.modalController.create({
      component: EsignSendEmailModal,
      componentProps: { esign },
    });
    await modal.present();
  }

  protected async uploadAndSend(): Promise<void> {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf';
    input.click();

    const file = await new Promise<File | null>(resolve => {
      input.onchange = () => resolve(input.files?.[0] ?? null);
      input.oncancel = () => resolve(null);
    });
    if (!file) return;

    if (file.size > 40 * 1024 * 1024) {
      const toast = await this.toastController.create({
        message: this.store.i18n.upload_error(),
        duration: 3000,
        color: 'danger',
      });
      await toast.present();
      return;
    }

    const { EsignSendDocumentModal } = await import('./esign-send-document.modal');
    const modal = await this.modalController.create({
      component: EsignSendDocumentModal,
      componentProps: { file, tenantId: this.appStore.tenantId() },
    });
    await modal.present();
  }
}
