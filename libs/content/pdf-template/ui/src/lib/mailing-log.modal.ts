// libs/content/pdf-template/ui/src/lib/mailing-log.modal.ts
import { Component, input } from '@angular/core';
import { IonBadge, IonCard, IonCardContent, IonContent, IonItem, IonLabel, IonList, IonNote } from '@ionic/angular';

import { Header } from '@okr/shared-ui';
import { MailEventLogEntry, mailLogEventColor, mailLogEventOf, MailingI18n } from '@okr/content-pdf-template-util';

/**
 * Read-only «Versandprotokoll» of one recipient's E-Mail: what the mail server reported, oldest first,
 * with the time and — for a bounce — the reason (addresses removed on the server). Opened from the person
 * actions of the Versand overview.
 */
@Component({
  selector: 'okr-mailing-log-modal',
  standalone: true,
  imports: [Header, IonContent, IonCard, IonCardContent, IonList, IonItem, IonLabel, IonBadge, IonNote],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px; } }
    ion-note { display: block; padding: 0 0 8px; }
    ion-badge { font-weight: normal; }
  `],
  template: `
    <okr-header [i18n]="{ title: i18n().log_title() + ': ' + name() }" [isModal]="true" />
    <ion-content>
      <ion-card>
        <ion-card-content>
          <ion-note>{{ i18n().log_hint() }}</ion-note>
          @if (log().length === 0) {
            <ion-note>{{ i18n().log_empty() }}</ion-note>
          } @else {
            <ion-list lines="inset">
              @for (entry of log(); track $index) {
                <ion-item>
                  <ion-label>
                    {{ time(entry.at) }}
                    @if (entry.reason) { <p>{{ entry.reason }}</p> }
                  </ion-label>
                  <ion-badge slot="end" [color]="color(entry.event)">{{ label(entry.event) }}</ion-badge>
                </ion-item>
              }
            </ion-list>
          }
        </ion-card-content>
      </ion-card>
    </ion-content>
  `,
})
export class MailingLogModal {
  public readonly name = input('');
  public readonly log = input<MailEventLogEntry[]>([]);
  public readonly i18n = input.required<MailingI18n>();

  protected color(event: string): string {
    return mailLogEventColor(event);
  }

  protected label(event: string): string {
    const i18n = this.i18n();
    switch (mailLogEventOf(event)) {
      case 'delivery': return i18n.log_delivery();
      case 'open': return i18n.log_open();
      case 'click': return i18n.log_click();
      case 'soft bounce': return i18n.log_soft_bounce();
      case 'bounce': return i18n.log_bounce();
      case 'reject': return i18n.log_reject();
      case 'suspension': return i18n.log_suspension();
      case 'spam': return i18n.log_spam();
      case 'unsubscribe': return i18n.log_unsubscribe();
      default: return event;
    }
  }

  /** «15.11.2026, 14:03:12» in the reader's locale. */
  protected time(iso: string | undefined): string {
    if (!iso) return '';
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? iso : date.toLocaleString('de-CH');
  }
}
