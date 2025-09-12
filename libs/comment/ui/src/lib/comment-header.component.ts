import { AsyncPipe } from '@angular/common';
import { Component } from '@angular/core';
import { IonCol, IonRow } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';

@Component({
  selector: 'bk-comment-header',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    IonRow, IonCol
  ],
  template: `
    <ion-row>
      <ion-col size="4"><strong>{{ '@input.comment.date' | translate | async }}/{{ '@input.comment.authorName' | translate | async }}</strong></ion-col>
      <ion-col size="8"><strong>{{ '@input.comment.label' | translate | async}}</strong></ion-col>
    </ion-row>
`
})
export class CommentHeaderComponent {
}
