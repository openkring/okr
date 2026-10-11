import { Component, inject, input } from '@angular/core';
import { IonButton, IonContent, IonIcon, IonItem, IonLabel, IonList, IonNote, ModalController } from '@ionic/angular/standalone';

import { Header } from '@okr/shared-ui';
import { SvgIconPipe } from '@okr/shared-pipes';
import { dismissOverlay } from '@okr/shared-util-angular';
import { I18nService } from '@okr/shared-i18n';
import { MATRIX_CHAT_I18N_KEYS, MatrixChatI18n } from '@okr/chat-util';

/**
 * Info einer Pinnwand: Regeln, Quellgruppen, Mitgliederzahl, Teilnahme-Modus.
 * Der Modal fuehrt nichts selbst aus: er schliesst mit der Rolle `edit`, `archive` oder
 * `leave`, und der `MatrixChatStore` erledigt den Rest (so bleibt der Modal frei vom Store).
 */
@Component({
  selector: 'okr-pinboard-info-modal',
  standalone: true,
  imports: [Header, SvgIconPipe, IonContent, IonList, IonItem, IonLabel, IonNote, IonButton, IonIcon],
  styles: [`
    .name { font-size: 1.25rem; font-weight: 600; text-align: center; padding: 20px 16px 4px 16px; }
    .text { display: block; padding: 8px 16px; }
    .actions { padding: 8px 16px 16px 16px; }
  `],
  template: `
    <okr-header [i18n]="{ title: i18n.pinboard_info_header() }" [isModal]="true" />
    <ion-content class="ion-no-padding">
      <div class="name">{{ name() }}</div>
      @if (description()) { <ion-note class="text">{{ description() }}</ion-note> }
      <ion-note class="text" color="dark">{{ i18n.pinboard_info_rules() }}</ion-note>
      <ion-list lines="full">
        <ion-item><ion-label>{{ i18n.pinboard_sources_title() }}</ion-label><ion-note slot="end">{{ sourceGroupNames().join(', ') }}</ion-note></ion-item>
        <ion-item><ion-label>{{ i18n.pinboard_info_members() }}</ion-label><ion-note slot="end">{{ memberCount() }}</ion-note></ion-item>
        <ion-item><ion-label>{{ i18n.pinboard_joinMode_label() }}</ion-label>
          <ion-note slot="end">{{ joinMode() === 'optIn' ? i18n.pinboard_joinMode_optIn() : i18n.pinboard_joinMode_optOut() }}</ion-note></ion-item>
      </ion-list>
      <div class="actions">
        @if (canManage()) {
          <ion-button expand="block" fill="outline" (click)="close('edit')">
            <ion-icon slot="start" src="{{ 'edit' | svgIcon }}" />{{ i18n.pinboard_edit() }}
          </ion-button>
          <ion-button expand="block" fill="clear" color="danger" (click)="close('archive')">
            <ion-icon slot="start" src="{{ 'archive' | svgIcon }}" />{{ i18n.pinboard_archive() }}
          </ion-button>
        }
        <ion-button expand="block" fill="clear" color="danger" (click)="close('leave')">
          <ion-icon slot="start" src="{{ 'cancel' | svgIcon }}" />{{ i18n.pinboard_leave() }}
        </ion-button>
      </div>
    </ion-content>
  `
})
export class PinboardInfoModal {
  private readonly modalController = inject(ModalController);
  protected readonly i18n = inject(I18nService).translateAll(MATRIX_CHAT_I18N_KEYS) as MatrixChatI18n;
  public readonly name = input.required<string>();
  public readonly description = input('');
  public readonly sourceGroupNames = input<string[]>([]);
  public readonly memberCount = input(0);
  public readonly joinMode = input<'optOut' | 'optIn'>('optOut');
  public readonly canManage = input(false);
  public async close(role: 'edit' | 'archive' | 'leave'): Promise<void> {
    await dismissOverlay(this.modalController, undefined, role);
  }
}
