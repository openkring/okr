// libs/content/pdf-template/ui/src/lib/doc-button.ts
import {
  ChangeDetectionStrategy, Component, computed, inject,
  input, output, signal,
} from '@angular/core';
import { IonButton, IonIcon, IonSpinner, ModalController, ToastController } from '@ionic/angular/standalone';
import { firstValueFrom } from 'rxjs';
import { SvgIconPipe } from '@okr/shared-pipes';
import { I18nService } from '@okr/shared-i18n';
import { DOC_BUTTON_I18N_KEYS, DocButtonI18n } from '@okr/content-pdf-template-util';
import {
  DocGenerationService, GenerateDocumentRequest, GenerateDocumentResponse,
} from '@okr/content-pdf-template-data-access';
import { PdfPreviewModal } from './pdf-preview.modal';

@Component({
  selector: 'okr-doc-button',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SvgIconPipe, IonButton, IonIcon, IonSpinner],
  template: `
    @if(variant() !== 'icon-only') {
      <ion-button
        [fill]="variant() === 'primary' ? 'solid' : 'outline'"
        [disabled]="isLoading()"
        (click)="generate()">
        @if(isLoading()) {
          <ion-spinner name="crescent" slot="start" />
        } @else {
          <ion-icon src="{{ icon() | svgIcon }}" slot="start" />
        }
        {{ labelText() }}
      </ion-button>
    } @else {
      <ion-button fill="clear" [disabled]="isLoading()" (click)="generate()">
        @if(isLoading()) {
          <ion-spinner name="crescent" slot="icon-only" />
        } @else {
          <ion-icon src="{{ icon() | svgIcon }}" slot="icon-only" />
        }
      </ion-button>
    }
  `
})
export class DocButton {
  private readonly docGenService = inject(DocGenerationService);
  private readonly modalController = inject(ModalController);
  private readonly toastController = inject(ToastController);
  private readonly i18nService = inject(I18nService);
  protected readonly i18n = this.i18nService.translateAll(DOC_BUTTON_I18N_KEYS) as DocButtonI18n;

  public readonly templateId = input.required<string>();
  public readonly payload = input.required<Record<string, unknown>>();
  public readonly templateVersion = input<number | undefined>(undefined);
  public readonly outputFormat = input<'pdf' | 'docx' | 'html'>('pdf');
  /** Caller-supplied label; falls back to the translated default. */
  public readonly label = input<string>('');
  public readonly icon = input<string>('document');
  public readonly variant = input<'primary' | 'secondary' | 'icon-only'>('primary');
  public readonly filename = input<string | undefined>(undefined);
  public readonly autoDownload = input<boolean>(false);
  public readonly autoOpenPreview = input<boolean>(true);
  public readonly entityType = input<string | undefined>(undefined);
  public readonly entityId = input<string | undefined>(undefined);
  public readonly recipientEmail = input<string | undefined>(undefined);
  public readonly recipientName = input<string | undefined>(undefined);

  public readonly generated = output<GenerateDocumentResponse>();
  public readonly errorOccurred = output<Error>();

  protected readonly isLoading = signal(false);
  protected readonly labelText = computed(() => this.label() || this.i18n.generate());

  protected async generate(): Promise<void> {
    this.isLoading.set(true);
    const toast = await this.toastController.create({
      message: this.i18n.generate_pending(),
      duration: 0,
      position: 'bottom',
    });
    const timeoutId = setTimeout(() => toast.present(), 2000);

    try {
      const req: GenerateDocumentRequest = {
        templateId: this.templateId(),
        templateVersion: this.templateVersion(),
        payload: this.payload(),
        options: {
          outputFormat: this.outputFormat(),
          filename: this.filename(),
          storageMode: 'persist',
          metadata: this.entityType()
            ? { entityType: this.entityType(), entityId: this.entityId() }
            : undefined,
        },
      };

      const response = await this.docGenService.generate(req);
      clearTimeout(timeoutId);
      await toast.dismiss();
      this.generated.emit(response);

      if (this.autoDownload()) {
        const a = document.createElement('a');
        a.href = response.url;
        a.download = response.filename;
        a.click();
      } else if (this.autoOpenPreview() && response.outputFormat === 'pdf') {
        const modal = await this.modalController.create({
          component: PdfPreviewModal,
          cssClass: 'wide-modal',
          componentProps: {
            url: response.url,
            title: response.filename,
            filename: response.filename,
            outputFormat: response.outputFormat,
            storagePath: response.storagePath,
            recipientEmail: this.recipientEmail(),
            recipientName: this.recipientName(),
          },
        });
        await modal.present();
      }
    } catch (err) {
      clearTimeout(timeoutId);
      await toast.dismiss();
      const e = err instanceof Error ? err : new Error(String(err));
      this.errorOccurred.emit(e);
      const errToast = await this.toastController.create({
        // parameterised key → translate(key, params); translateAll would strip the placeholder
        message: await firstValueFrom(this.i18nService.translate(DOC_BUTTON_I18N_KEYS.generate_error, { error: e.message })),
        duration: 4000,
        color: 'danger',
        position: 'bottom',
      });
      await errToast.present();
    } finally {
      this.isLoading.set(false);
    }
  }
}
