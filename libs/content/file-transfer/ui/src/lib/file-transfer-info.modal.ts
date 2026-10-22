import { Component, computed, inject, input, output, signal } from '@angular/core';
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonContent, IonIcon, IonItem, IonLabel, IonList, ModalController } from '@ionic/angular';

import { COMMENT_LENGTH } from '@okr/shared-constants';
import { I18nService } from '@okr/shared-i18n';
import { SvgIconPipe } from '@okr/shared-pipes';
import { Header, TextareaInput, TextInputI18n } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { fill } from '@okr/shared-util-core';
import { FILE_TRANSFER_I18N_KEYS, FileTransferI18n, formatFileTransferSize, ResolvedLimits } from '@okr/content-file-transfer-util';

/** What «Höhere Limite beantragen» hands back: the reason the admins read. */
export interface FileTransferLimitRequest {
  reason: string;
}

/**
 * The (i) explanation of a transfer (spec 1.115 §4.7): what it is, the sender's live limits,
 * lifetime, who sees what, logging, the consent hint — and «Höhere Limite beantragen».
 *
 * Read-only apart from the optional reason: it changes no stored record, so it is not an edit
 * dialog and has no change-confirmation banner. The request leaves through `requestLimit` and the
 * modal dismisses with the same {@link FileTransferLimitRequest} and role 'requestLimit'; the caller
 * sends it (requestFileTransferLimit). A blank reason becomes «Keine Begründung angegeben», because
 * the server requires one.
 */
@Component({
  selector: 'okr-file-transfer-info-modal',
  standalone: true,
  imports: [
    Header, TextareaInput, SvgIconPipe,
    IonContent, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonList, IonItem, IonLabel, IonIcon, IonButton,
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px;} }
    .request { padding: 8px 16px 16px 16px; }
  `],
  template: `
    <okr-header [i18n]="{ title: i18n.info_title() }" [isModal]="true" />
    <ion-content class="ion-no-padding">
      <ion-card>
        <ion-card-content>{{ i18n.info_what() }}</ion-card-content>
      </ion-card>

      <ion-card>
        <ion-card-header><ion-card-title>{{ i18n.info_limits_title() }}</ion-card-title></ion-card-header>
        <ion-card-content class="ion-no-padding">
          <ion-list lines="none">
            @for (line of limitLines(); track $index) {
              <ion-item>
                <ion-icon slot="start" src="{{ line.icon | svgIcon }}" />
                <ion-label class="ion-text-wrap">{{ line.text }}</ion-label>
              </ion-item>
            }
          </ion-list>
        </ion-card-content>
      </ion-card>

      <ion-card>
        <ion-card-header><ion-card-title>{{ i18n.info_who_title() }}</ion-card-title></ion-card-header>
        <ion-card-content class="ion-no-padding">
          <ion-list lines="none">
            <ion-item>
              <ion-icon slot="start" src="{{ 'people' | svgIcon }}" />
              <ion-label class="ion-text-wrap">{{ i18n.info_who_members() }}</ion-label>
            </ion-item>
            <ion-item>
              <ion-icon slot="start" src="{{ 'group' | svgIcon }}" />
              <ion-label class="ion-text-wrap">{{ i18n.info_who_groups() }}</ion-label>
            </ion-item>
            <ion-item>
              <ion-icon slot="start" src="{{ 'mail' | svgIcon }}" />
              <ion-label class="ion-text-wrap">{{ i18n.info_who_outside() }}</ion-label>
            </ion-item>
            <ion-item>
              <ion-icon slot="start" src="{{ 'trash' | svgIcon }}" />
              <ion-label class="ion-text-wrap">{{ i18n.info_deleted() }}</ion-label>
            </ion-item>
            <ion-item>
              <ion-icon slot="start" src="{{ 'eye-on' | svgIcon }}" />
              <ion-label class="ion-text-wrap">{{ i18n.info_log() }}</ion-label>
            </ion-item>
          </ion-list>
        </ion-card-content>
      </ion-card>

      <ion-card>
        <ion-card-header><ion-card-title>{{ i18n.info_consent_title() }}</ion-card-title></ion-card-header>
        <ion-card-content class="ion-no-padding">
          <ion-item lines="none">
            <ion-icon slot="start" color="warning" src="{{ 'warning' | svgIcon }}" />
            <ion-label class="ion-text-wrap">{{ i18n.consent_hint() }}</ion-label>
          </ion-item>
        </ion-card-content>
      </ion-card>

      <ion-card>
        <ion-card-header><ion-card-title>{{ i18n.info_request_title() }}</ion-card-title></ion-card-header>
        <ion-card-content class="ion-no-padding">
          <ion-item lines="none">
            <ion-label class="ion-text-wrap">{{ i18n.info_request_text() }}</ion-label>
          </ion-item>
          <okr-textarea-input [i18n]="reasonI18n()" [value]="reason()" (valueChange)="reason.set($event)"
            [maxLength]="reasonLength" [rows]="3" [readOnly]="false" />
          <div class="request">
            <ion-button expand="block" (click)="request()">
              <ion-icon slot="start" src="{{ 'send' | svgIcon }}" />
              {{ i18n.info_request() }}
            </ion-button>
          </div>
        </ion-card-content>
      </ion-card>
    </ion-content>
  `,
})
export class FileTransferInfoModal {
  private readonly modalController = inject(ModalController);
  protected readonly i18n = inject(I18nService).translateAll(FILE_TRANSFER_I18N_KEYS) as FileTransferI18n;

  // inputs
  /** the viewer's live limits (resolveFileTransferLimits of the tenant config and the viewer) */
  public readonly limits = input.required<ResolvedLimits>();

  // outputs
  public readonly requestLimit = output<FileTransferLimitRequest>();

  /** the server caps the reason at 500 characters (request-file-transfer-limit.ts) */
  protected readonly reasonLength = COMMENT_LENGTH;
  protected readonly reason = signal('');

  protected readonly limitLines = computed(() => {
    const l = this.limits();
    return [
      { icon: 'download', text: fill(this.i18n.info_limit_transfer(), { size: formatFileTransferSize(l.maxFileTransferBytes) }) },
      { icon: 'download', text: fill(this.i18n.info_limit_open(), { size: formatFileTransferSize(l.maxOpenBytes) }) },
      { icon: 'mail', text: fill(this.i18n.info_limit_externals(), { count: l.maxExternalRecipients }) },
      { icon: 'time', text: fill(this.i18n.info_lifetime(), { days: l.defaultLifetimeDays, max: l.maxLifetimeDays }) },
    ];
  });

  protected readonly reasonI18n = computed(() => ({
    name: 'reason',
    label: this.i18n.info_reason_label(),
    placeholder: this.i18n.info_reason_placeholder(),
    helper: '',
  } as TextInputI18n));

  protected async request(): Promise<void> {
    const request: FileTransferLimitRequest = { reason: this.reason().trim() || this.i18n.info_reason_none() };
    this.requestLimit.emit(request);
    await dismissOverlay(this.modalController, request, 'requestLimit');
  }
}
