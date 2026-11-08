// libs/content/pdf-template/ui/src/lib/versand-info.modal.ts
import { Component, input } from '@angular/core';
import { IonCard, IonCardContent, IonContent } from '@ionic/angular';

import { Header } from '@okr/shared-ui';
import { EmailComposerI18n } from '@okr/content-pdf-template-util';

/**
 * Read-only explanation of how a Versand works (spec 1.144 §4.5): the profile decides the delivery
 * type, to/cc/bcc only matter for email, what each delivery type does with text and attachments, and
 * how chosen events (personal answer links) and attachments behave.
 */
@Component({
  selector: 'okr-versand-info-modal',
  standalone: true,
  imports: [Header, IonContent, IonCard, IonCardContent],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px; } }
    p { margin: 0 0 12px; line-height: 1.5; }
  `],
  template: `
    <okr-header [i18n]="{ title: i18n().info_title() }" [isModal]="true" />
    <ion-content>
      <ion-card>
        <ion-card-content>
          <p>{{ i18n().info_p1() }}</p>
          <p>{{ i18n().info_p2() }}</p>
          <p>{{ i18n().info_p3() }}</p>
          <p>{{ i18n().info_p4() }}</p>
          <p>{{ i18n().info_p5() }}</p>
          <p>{{ i18n().info_p7() }}</p>
          <p>{{ i18n().info_p8() }}</p>
          <p><strong>{{ i18n().info_p6() }}</strong></p>
        </ion-card-content>
      </ion-card>
    </ion-content>
  `,
})
export class VersandInfoModal {
  public readonly i18n = input.required<EmailComposerI18n>();
}
