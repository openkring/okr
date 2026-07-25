import { Component, input } from '@angular/core';
import { IonCol, IonRow } from '@ionic/angular/standalone';

import { CommentListI18n } from '@okr/comment-util';

@Component({
  selector: 'okr-comment-header',
  standalone: true,
  imports: [
    IonRow, IonCol
  ],
  template: `
    <ion-row>
      <ion-col size="4"><strong>{{ i18n().header_date() }}/{{ i18n().header_author() }}</strong></ion-col>
      <ion-col size="8"><strong>{{ i18n().header_label() }}</strong></ion-col>
    </ion-row>
`
})
export class CommentHeader {
  public readonly i18n = input.required<CommentListI18n>();
}
