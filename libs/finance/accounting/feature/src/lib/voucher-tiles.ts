import { Component, computed, inject, input, output, resource, signal } from '@angular/core';
import { IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonIcon, IonNote, IonProgressBar } from '@ionic/angular/standalone';

import { ENV } from '@okr/shared-config';
import { I18nService } from '@okr/shared-i18n';
import { SvgIconPipe } from '@okr/shared-pipes';
import { FileTile, FileTiles } from '@okr/shared-ui';
import { resourceParams } from '@okr/shared-util-angular';
import { fileExtension, reduceLogoName } from '@okr/shared-util-core';
import { FinanceDocumentService } from '@okr/finance-accounting-data-access';
import { ACCOUNTING_I18N_KEYS, AccountingI18n, BOOKING_VOUCHER_ACCEPT, voucherTileImage } from '@okr/finance-accounting-util';

/**
 * The vouchers (Belege) of a booking, bill or invoice as a row of clickable tiles (spec 1.74). The files sit
 * in the private bucket; `signFinanceDocuments` hands out links valid for ~10 minutes: the original,
 * and a thumbnail (images, a PDF's first page) from the private imgix source. Other files show a
 * file-type logo. A click opens the file in a new tab.
 *
 * With `canAdd`, the card also takes new files — the add-circle button or a drop onto the card — and
 * emits them as `filesAdded`; the parent uploads them and passes the new keys back in.
 */
@Component({
  selector: 'okr-voucher-tiles',
  standalone: true,
  imports: [FileTiles, SvgIconPipe, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonNote, IonButtons, IonButton, IonIcon, IonProgressBar],
  styles: [`
    ion-card-header { display: flex; flex-direction: row; align-items: center; justify-content: space-between; }
    .dropzone { outline: 2px dashed var(--ion-color-primary); outline-offset: -2px; background: var(--ion-color-primary-tint); }
    .file-input { display: none; }
  `],
  template: `
    @if (documentKeys().length > 0 || canAdd()) {
      <ion-card [class.dropzone]="isDragging()"
        (dragover)="onDragOver($event)" (dragleave)="isDragging.set(false)" (drop)="onDrop($event)">
        <ion-card-header>
          <ion-card-title>{{ i18n.voucher_title() }}</ion-card-title>
          @if (canAdd()) {
            <ion-buttons>
              <!-- input.click() runs synchronously in the click handler: Safari opens the dialog only in the gesture's own call stack -->
              <ion-button fill="clear" [title]="i18n.voucher_add()" [disabled]="uploading()" (click)="fileInput.click()">
                <ion-icon slot="icon-only" src="{{ 'add-circle' | svgIcon }}" />
              </ion-button>
            </ion-buttons>
            <input #fileInput class="file-input" type="file" multiple [accept]="accept" (change)="onPicked(fileInput)" />
          }
        </ion-card-header>
        @if (uploading()) {
          <ion-progress-bar type="indeterminate" [attr.aria-label]="i18n.voucher_uploading()" />
        }
        @if (vouchers.error()) {
          <ion-card-content><ion-note color="danger">{{ i18n.voucher_load_error() }}</ion-note></ion-card-content>
        } @else if (documentKeys().length > 0) {
          <okr-file-tiles [tiles]="tiles()" (tileSelected)="open($event)" />
        } @else {
          <ion-card-content><ion-note>{{ i18n.voucher_drop() }}</ion-note></ion-card-content>
        }
      </ion-card>
    }
  `,
})
export class VoucherTiles {
  private readonly financeDocumentService = inject(FinanceDocumentService);
  private readonly imgixBaseUrl = inject(ENV).services.imgixBaseUrl;
  // direct inject: this component sits in modals the feature stores open
  protected readonly i18n = inject(I18nService).translateAll(ACCOUNTING_I18N_KEYS) as AccountingI18n;
  protected readonly accept = BOOKING_VOUCHER_ACCEPT;

  /** finance-documents okeys, e.g. booking.documentKeys or bill.attachments */
  public readonly documentKeys = input<string[]>([]);
  /** shows the add button and takes dropped files */
  public readonly canAdd = input(false);
  /** an upload of the parent is running: progress bar, add button disabled */
  public readonly uploading = input(false);
  public readonly filesAdded = output<File[]>();

  protected readonly isDragging = signal(false);

  protected readonly vouchers = resource({
    params: resourceParams(() => ({ keys: this.documentKeys() })),
    loader: ({ params }) => this.financeDocumentService.sign(params.keys),
  });

  protected readonly tiles = computed((): FileTile[] => (this.vouchers.value() ?? []).map(v => ({
    key: v.key,
    name: v.name,
    // the file-type logo is a public asset; the thumbnail is signed by the private imgix source
    ...voucherTileImage(v, `${this.imgixBaseUrl}/logo/filetypes/${reduceLogoName(fileExtension(v.name).toLowerCase())}.svg`),
  })));

  protected open(tile: FileTile): void {
    const voucher = this.vouchers.value()?.find(v => v.key === tile.key);
    // the link is signed for ~10 minutes; after that, reopening the modal fetches fresh ones
    if (voucher) window.open(voucher.url, '_blank', 'noopener');
  }

  protected onPicked(fileInput: HTMLInputElement): void {
    const files = Array.from(fileInput.files ?? []);
    fileInput.value = ''; // the same file picked again must fire change again
    if (files.length > 0) this.filesAdded.emit(files);
  }

  protected onDragOver(event: DragEvent): void {
    if (!this.canAdd() || this.uploading() || !event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    this.isDragging.set(true);
  }

  protected onDrop(event: DragEvent): void {
    this.isDragging.set(false);
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (!this.canAdd() || this.uploading() || files.length === 0) return;
    event.preventDefault();
    this.filesAdded.emit(files);
  }
}
