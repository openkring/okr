// libs/cms/article/feature/src/lib/mail-text-info.modal.ts
import { Component, input } from '@angular/core';
import { IonCard, IonCardContent, IonContent } from '@ionic/angular';

import { Header } from '@okr/shared-ui';
import type { ArticleEditorI18n } from '@okr/cms-section-util';

/**
 * The (i) of the mail editor, read-only: the editor holds the content, the template and the reader's mail program its look, so the
 * text looks different in the editor, and from one reader to the next; and what Enter, Shift+Enter and an empty line become.
 */
@Component({
  selector: 'okr-mail-text-info-modal',
  standalone: true,
  imports: [Header, IonContent, IonCard, IonCardContent],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px; } }
    p { margin: 0 0 12px; line-height: 1.5; }
  `],
  template: `
    <okr-header [i18n]="{ title: i18n().article_editor_mail_info_title() }" [isModal]="true" />
    <ion-content>
      <ion-card>
        <ion-card-content>
          <p>{{ i18n().article_editor_mail_info_p1() }}</p>
          <p>{{ i18n().article_editor_mail_info_p2() }}</p>
          <p>{{ i18n().article_editor_mail_info_p3() }}</p>
        </ion-card-content>
      </ion-card>
      <ion-card>
        <ion-card-content>
          <p>{{ i18n().article_editor_mail_info_p4() }}</p>
          <p>{{ i18n().article_editor_mail_info_p5() }}</p>
          <p>{{ i18n().article_editor_mail_info_p6() }}</p>
        </ion-card-content>
      </ion-card>
    </ion-content>
  `,
})
export class MailTextInfoModal {
  public readonly i18n = input.required<ArticleEditorI18n>();
}
