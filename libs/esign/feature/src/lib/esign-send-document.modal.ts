// libs/esign/feature/src/lib/esign-send-document.modal.ts
import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { form } from '@angular/forms/signals';
import {
  IonButton, IonButtons, IonCard, IonCardContent, IonCol, IonContent, IonGrid, IonHeader,
  IonItem, IonLabel, IonSelect, IonSelectOption, IonSpinner, IonTitle, IonToolbar, IonRow,
  ModalController, ToastController,
} from '@ionic/angular/standalone';

import { NotesInput, NotesInputI18n, TextInput, TextInputI18n } from '@okr/shared-ui';
import { I18nService } from '@okr/shared-i18n';
import { validateVestTree } from '@okr/shared-util-angular';
import { ESIGN_I18N_KEYS, EsignI18n, EsignSendFormModel, esignSendValidations } from '@okr/esign-util';
import { EsignScanPredefinedResponse, EsignService } from '@okr/esign-data-access';

type SendStatus = 'uploading' | 'scanning' | 'ready' | 'no-fields' | 'sending' | 'error';

@Component({
  selector: 'okr-esign-send-document-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    TextInput, NotesInput,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent,
    IonCard, IonCardContent, IonGrid, IonRow, IonCol, IonItem, IonLabel,
    IonSelect, IonSelectOption, IonSpinner,
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px; } }`],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ i18n.document_title() }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="close()">{{ i18n.close() }}</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <ion-card>
        <ion-card-content class="ion-no-padding">
          <ion-grid>
            <ion-row>
              <ion-col size="12">
                <ion-item lines="none">
                  <ion-label>
                    <h2>{{ file().name }}</h2>
                    <p>{{ fileSizeKb() }} KB</p>
                  </ion-label>
                </ion-item>
              </ion-col>
            </ion-row>

            @switch (status()) {
              @case ('uploading') {
                <ion-item lines="none"><ion-spinner name="dots" slot="start" /><ion-label>{{ i18n.uploading() }}</ion-label></ion-item>
              }
              @case ('scanning') {
                <ion-item lines="none"><ion-spinner name="dots" slot="start" /><ion-label>{{ i18n.scanning() }}</ion-label></ion-item>
              }
              @case ('no-fields') {
                <ion-item lines="none" color="warning">
                  <ion-label class="ion-text-wrap">{{ i18n.no_fields_hint() }}</ion-label>
                </ion-item>
              }
              @case ('error') {
                <ion-item lines="none" color="danger"><ion-label class="ion-text-wrap">{{ errorMessage() }}</ion-label></ion-item>
              }
            }

            @if (scanResult(); as scan) {
              @if (scan.signatureFields.length > 0) {
                <ion-row>
                  <ion-col size="12">
                    <ion-item lines="none">
                      <ion-label><h3>{{ scan.signatureFields.length }} {{ i18n.signees_detected() }}</h3></ion-label>
                    </ion-item>
                    @for (sf of scan.signatureFields; track sf.email) {
                      <ion-item lines="none">
                        <ion-label class="ion-text-wrap">
                          <p>{{ sf.email }} · {{ sf.signatureType }} · {{ i18n.page() }} {{ sf.autographPosition.pageNumber }}</p>
                        </ion-label>
                      </ion-item>
                    }
                  </ion-col>
                </ion-row>
              }
            }

            @if (status() === 'ready' || status() === 'sending') {
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="initiatorI18n()" [value]="formData().initiatorAliasName"
                    (valueChange)="onFieldChange('initiatorAliasName', $event)"
                    [readOnly]="false" [autofocus]="true" [maxLength]="30" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <ion-item lines="none">
                    <ion-select [label]="i18n.signature_mode_label()" labelPlacement="floating"
                      [value]="formData().signatureMode" (ionChange)="onFieldChange('signatureMode', $event.detail.value)">
                      <ion-select-option value="timestamp">{{ i18n.signature_mode_timestamp() }}</ion-select-option>
                      <ion-select-option value="advanced">{{ i18n.signature_mode_advanced() }}</ion-select-option>
                      <ion-select-option value="qualified">{{ i18n.signature_mode_qualified() }}</ion-select-option>
                    </ion-select>
                  </ion-item>
                </ion-col>
                <ion-col size="12" size-md="6">
                  <ion-item lines="none">
                    <ion-select [label]="i18n.jurisdiction_label()" labelPlacement="floating"
                      [value]="formData().jurisdiction" (ionChange)="onFieldChange('jurisdiction', $event.detail.value)">
                      <ion-select-option value="zertes">{{ i18n.jurisdiction_zertes() }}</ion-select-option>
                      <ion-select-option value="eidas">{{ i18n.jurisdiction_eidas() }}</ion-select-option>
                    </ion-select>
                  </ion-item>
                </ion-col>
                <ion-col size="12" size-md="6">
                  <ion-item lines="none">
                    <ion-select [label]="i18n.send_mail_label()" labelPlacement="floating"
                      [value]="formData().sendMail" (ionChange)="onFieldChange('sendMail', $event.detail.value)">
                      <ion-select-option value="all">{{ i18n.send_mail_all() }}</ion-select-option>
                      <ion-select-option value="others">{{ i18n.send_mail_others() }}</ion-select-option>
                      <ion-select-option value="none">{{ i18n.send_mail_none() }}</ion-select-option>
                    </ion-select>
                  </ion-item>
                </ion-col>
                <ion-col size="12">
                  <okr-notes-input [i18n]="commentI18n()" [value]="formData().comment"
                    (valueChange)="onFieldChange('comment', $event)" [readOnly]="false" />
                </ion-col>
              </ion-row>
            }
          </ion-grid>
        </ion-card-content>
      </ion-card>

      @if (status() === 'ready' || status() === 'sending') {
        <ion-button expand="block" [disabled]="!canSend()" (click)="send()">
          @if (status() === 'sending') { <ion-spinner name="dots" /> } @else { {{ i18n.send() }} }
        </ion-button>
      }
      @if (status() === 'error') {
        <ion-button expand="block" fill="outline" (click)="retry()">{{ i18n.retry() }}</ion-button>
      }
    </ion-content>
  `,
})
export class EsignSendDocumentModal implements OnInit {
  public readonly file       = input.required<File>();
  public readonly tenantId   = input.required<string>();

  protected readonly i18n = inject(I18nService).translateAll(ESIGN_I18N_KEYS) as EsignI18n;
  private readonly modalController = inject(ModalController);
  private readonly toastController = inject(ToastController);
  protected readonly esignService  = inject(EsignService);

  protected readonly status       = signal<SendStatus>('uploading');
  protected readonly errorMessage = signal('');
  protected readonly scanResult   = signal<EsignScanPredefinedResponse | null>(null);
  private storagePath: string | null = null;

  protected readonly formData = signal<EsignSendFormModel>({
    initiatorAliasName: '',
    comment: '',
    signatureMode: 'timestamp',
    jurisdiction: 'zertes',
    sendMail: 'all',
  });

  // Signal Forms + Vest (project convention); validity gates the Send button.
  protected readonly sendForm = form(this.formData, (path) =>
    validateVestTree(path, esignSendValidations as any));

  protected readonly canSend = computed(() =>
    this.status() === 'ready'
    && this.sendForm().valid()
    && (this.scanResult()?.signatureFields.length ?? 0) > 0);

  protected readonly fileSizeKb = computed(() => Math.round(this.file().size / 1024));

  // adapted at the shared/ui boundary (the field primitives define their own minimal interface)
  protected readonly initiatorI18n = computed(() => ({
    name: 'initiatorAliasName', label: this.i18n.initiator_label(),
    placeholder: this.i18n.initiator_placeholder(), helper: this.i18n.initiator_helper(),
  } as TextInputI18n));
  protected readonly commentI18n = computed(() => ({
    name: 'comment', label: this.i18n.comment_label(), placeholder: this.i18n.comment_placeholder(),
  } as NotesInputI18n));

  public ngOnInit(): void {
    void this.prepare();
  }

  /** Upload the staged PDF, then dry-run the predefined-field scan to derive signees. */
  private async prepare(): Promise<void> {
    try {
      this.status.set('uploading');
      this.storagePath = await this.esignService.uploadStagingPdf(this.file(), this.tenantId());

      this.status.set('scanning');
      const scan = await this.esignService.scanPredefined(this.storagePath);
      this.scanResult.set(scan);

      if (scan.signatureFields.length === 0) {
        this.status.set('no-fields');
        return;
      }

      // Prefill mode/jurisdiction with what DeepSign detected in the PDF (when recognised).
      this.formData.update((vm) => ({
        ...vm,
        signatureMode: (['timestamp', 'advanced', 'qualified'].includes(scan.signatureMode)
          ? scan.signatureMode : vm.signatureMode) as EsignSendFormModel['signatureMode'],
        jurisdiction: (['zertes', 'eidas'].includes(scan.jurisdiction)
          ? scan.jurisdiction : vm.jurisdiction) as EsignSendFormModel['jurisdiction'],
      }));
      this.status.set('ready');
    } catch (error) {
      this.errorMessage.set(this.toMessage(error));
      this.status.set('error');
    }
  }

  protected retry(): void {
    void this.prepare();
  }

  protected onFieldChange(field: keyof EsignSendFormModel, value: string): void {
    this.formData.update((vm) => ({ ...vm, [field]: value }) as EsignSendFormModel);
  }

  protected async send(): Promise<void> {
    if (!this.canSend() || !this.storagePath) return;
    this.status.set('sending');
    try {
      const vm = this.formData();
      const response = await this.esignService.sendDocument({
        storagePath: this.storagePath,
        documentName: this.file().name,
        initiatorAliasName: vm.initiatorAliasName,
        ...(vm.comment ? { comment: vm.comment } : {}),
        signatureMode: vm.signatureMode,
        jurisdiction: vm.jurisdiction,
        sendMail: vm.sendMail,
        source: 'user-upload',
      });
      await this.presentToast(this.i18n.send_ok(), 'success');
      await this.modalController.dismiss(response, 'confirm');
    } catch (error) {
      await this.presentToast(`${this.i18n.send_failed()}: ${this.toMessage(error)}`, 'danger');
      this.status.set('ready');
    }
  }

  protected close(): void {
    this.modalController.dismiss(null, 'cancel');
  }

  private toMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private async presentToast(message: string, color: 'success' | 'danger'): Promise<void> {
    const toast = await this.toastController.create({ message, duration: 3000, color });
    await toast.present();
  }
}
