import { Component } from '@angular/core';
import { IonCol, IonRow } from '@ionic/angular/standalone';

@Component({
  selector: 'bk-comment-header',
  standalone: true,
  imports: [
    IonRow, IonCol
  ],
  template: `
    <ion-row>
      <ion-col size="4"><strong>{{ '@input.comment.date' }}/{{ '@input.comment.authorName' }}</strong></ion-col>
      <ion-col size="8"><strong>{{ '@input.comment.label' }}</strong></ion-col>
    </ion-row>
`
})
export class CommentHeader {
}
