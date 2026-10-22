import { Component, computed, inject, input, output } from '@angular/core';
import { IonBadge, IonButton, IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonIcon, IonItem, IonLabel, IonList, IonNote } from '@ionic/angular';

import { I18nService } from '@okr/shared-i18n';
import { SvgIconPipe } from '@okr/shared-pipes';
import { Spinner } from '@okr/shared-ui';
import { fill } from '@okr/shared-util-core';
import {
  FILE_TRANSFER_I18N_KEYS, FileTransferI18n, FileTransferView, formatFileTransferExpiry, formatFileTransferSize, isFileTransferInline, isFileTransferVideo,
} from '@okr/content-file-transfer-util';

/** A click on a file: view it inline (video, image, pdf) or download it. */
export interface FileTransferOpenEvent {
  fileIndex: number;
  disposition: 'inline' | 'attachment';
}

/**
 * A transfer as a card (spec 1.115 §4.2/§4.5): sender, message, files with their sizes and
 * play/view/download buttons, expiry — or «abgelaufen». Presentational: it never holds a URL; a
 * click leaves through `open` and the caller fetches the short-lived signed URL.
 * `view` undefined and not expired = still loading.
 */
@Component({
  selector: 'okr-file-transfer-card',
  standalone: true,
  imports: [
    SvgIconPipe, Spinner,
    IonCard, IonCardHeader, IonCardTitle, IonCardSubtitle, IonCardContent, IonList, IonItem, IonLabel, IonNote, IonButton, IonIcon, IonBadge,
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px;} }
    .message { display: block; white-space: pre-line; padding: 0 16px 8px 16px; }
    ion-badge { margin-left: 8px; vertical-align: middle; }
  `],
  template: `
    <ion-card>
      @if (expired()) {
        <ion-card-header>
          <ion-card-title>
            {{ i18n.card_title() }}
            <ion-badge color="medium">{{ i18n.card_expired_badge() }}</ion-badge>
          </ion-card-title>
          @if (view()) {
            <ion-card-subtitle>{{ fromText() }}</ion-card-subtitle>
          }
        </ion-card-header>
        <ion-card-content>
          <ion-note>{{ i18n.card_expired() }}</ion-note>
        </ion-card-content>
      } @else {
        @if (view(); as view) {
          <ion-card-header>
            <ion-card-title>{{ fromText() }}</ion-card-title>
            <ion-card-subtitle>{{ expiresText() }}</ion-card-subtitle>
          </ion-card-header>
          <ion-card-content class="ion-no-padding">
            @if (view.message) {
              <span class="message">{{ view.message }}</span>
            }
            <ion-list lines="inset">
              @for (file of view.files; track file.index) {
                <ion-item>
                  <ion-icon slot="start" src="{{ fileIcon(file.contentType) | svgIcon }}" />
                  <ion-label class="ion-text-wrap">
                    <h3>{{ file.name }}</h3>
                    <p>{{ fileSize(file.size) }}</p>
                  </ion-label>
                  @if (isInline(file.contentType)) {
                    <ion-button slot="end" fill="clear" [attr.aria-label]="inlineLabel(file.contentType)"
                      (click)="open.emit({ fileIndex: file.index, disposition: 'inline' })">
                      <ion-icon slot="icon-only" src="{{ (isVideo(file.contentType) ? 'play' : 'eye-on') | svgIcon }}" />
                    </ion-button>
                  }
                  <ion-button slot="end" fill="clear" [attr.aria-label]="i18n.card_download()"
                    (click)="open.emit({ fileIndex: file.index, disposition: 'attachment' })">
                    <ion-icon slot="icon-only" src="{{ 'download' | svgIcon }}" />
                  </ion-button>
                </ion-item>
              }
            </ion-list>
          </ion-card-content>
        } @else {
          <ion-card-content>
            <okr-spinner />
            <ion-note>{{ i18n.card_loading() }}</ion-note>
          </ion-card-content>
        }
      }
    </ion-card>
  `,
})
export class FileTransferCard {
  // direct inject: the card is also placed outside the transfer pages (e.g. in a chat timeline)
  protected readonly i18n = inject(I18nService).translateAll(FILE_TRANSFER_I18N_KEYS) as FileTransferI18n;

  // inputs
  /** the transfer this card stands for — lets the caller match `open` events to a transfer */
  public readonly transferKey = input('');
  public readonly view = input<FileTransferView | undefined>(undefined);
  public readonly expired = input(false);

  // outputs
  public readonly open = output<FileTransferOpenEvent>();

  protected readonly fromText = computed(() => fill(this.i18n.card_from(), { name: this.view()?.senderName ?? '' }));
  protected readonly expiresText = computed(() => {
    // local wall-clock time of the viewer (expiresAt is UTC)
    return fill(this.i18n.card_expires(), { date: formatFileTransferExpiry(this.view()?.expiresAt) });
  });

  protected fileSize(bytes: number): string {
    return formatFileTransferSize(bytes);
  }

  protected isInline(contentType: string): boolean {
    return isFileTransferInline(contentType);
  }

  protected isVideo(contentType: string): boolean {
    return isFileTransferVideo(contentType);
  }

  protected inlineLabel(contentType: string): string {
    return isFileTransferVideo(contentType) ? this.i18n.card_play() : this.i18n.card_view();
  }

  /** a file-type icon from the 'icons' set — by kind, never derived from the (client-supplied) name */
  protected fileIcon(contentType: string): string {
    return isFileTransferVideo(contentType) ? 'play' : 'document';
  }
}
