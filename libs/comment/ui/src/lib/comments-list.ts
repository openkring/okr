import { Component, input } from '@angular/core';
import { IonCol, IonRow } from '@ionic/angular/standalone';

import { CommentModel } from '@bk2/shared-models';
import { PrettyDatePipe } from '@bk2/shared-pipes';

@Component({
  selector: 'bk-comments-list',
  standalone: true,
  imports: [
    PrettyDatePipe,
    IonRow, IonCol,
  ],
  template: `
    @if(comments().length === 0) {
      <ion-row>
        <ion-col size="12"><small>{{ empty() }}</small></ion-col>
      </ion-row>
    } @else {
      @for (comment of comments(); track comment.bkey) {
        <ion-row>
          <ion-col size="4" class="ion-hide-md-up"><small>{{ comment.creationDateTime | prettyDate }}</small></ion-col>
          <ion-col size="4" class="ion-hide-md-down"><small>{{ comment.creationDateTime | prettyDate }}/{{ comment.authorName }}</small></ion-col>
          <ion-col size="8"><small>{{ comment.description }}</small></ion-col>  
        </ion-row>
      }
    }
`
})
export class CommentsList {
  public comments = input.required<CommentModel[]>();
  public empty = input.required<string>();
}
