import { Component, computed, inject, input, resource } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonNote } from '@ionic/angular/standalone';

import { ENV } from '@okr/shared-config';
import { I18nService } from '@okr/shared-i18n';
import { FileTile, FileTiles } from '@okr/shared-ui';
import { resourceParams } from '@okr/shared-util-angular';
import { fileExtension, reduceLogoName } from '@okr/shared-util-core';
import { FinanceDocumentService } from '@okr/finance-accounting-data-access';
import { ACCOUNTING_I18N_KEYS, AccountingI18n, voucherTileImage } from '@okr/finance-accounting-util';

/**
 * The vouchers (Belege) of a booking or bill as a row of clickable tiles (spec 1.74). The files sit
 * in the private bucket; `signFinanceDocuments` hands out links valid for ~10 minutes: the original,
 * and a thumbnail (images, a PDF's first page) from the private imgix source. Other files show a
 * file-type logo. A click opens the file in a new tab.
 */
@Component({
  selector: 'okr-voucher-tiles',
  standalone: true,
  imports: [FileTiles, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonNote],
  template: `
    @if (documentKeys().length > 0) {
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ i18n.voucher_title() }}</ion-card-title>
        </ion-card-header>
        @if (vouchers.error()) {
          <ion-card-content><ion-note color="danger">{{ i18n.voucher_load_error() }}</ion-note></ion-card-content>
        } @else {
          <okr-file-tiles [tiles]="tiles()" (tileSelected)="open($event)" />
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

  /** finance-documents okeys, e.g. booking.documentKeys or bill.attachments */
  public readonly documentKeys = input<string[]>([]);

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
}
