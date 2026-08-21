import { Component, input } from '@angular/core';
import { IonCol, IonRow } from '@ionic/angular/standalone';

import { CommentModel } from '@okr/shared-models';
import { PrettyDatePipe } from '@okr/shared-pipes';

@Component({
  selector: 'okr-comments-list',
  standalone: true,
  imports: [
    PrettyDatePipe,
    IonRow, IonCol,
  ],
  styles: [`
    .author { font-size: 0.8em; color: var(--ion-color-medium); }
  `],
  template: `
    @if(comments().length === 0) {
      <ion-row>
        <ion-col size="12"><small>{{ empty() }}</small></ion-col>
      </ion-row>
    } @else {
      @for (comment of comments(); track comment.okey) {
        <ion-row>
          <!-- small screens have no room for 'date/author' on one line: the author goes on a
               second, smaller line rather than being dropped as it was before. -->
          <ion-col size="4" class="ion-hide-md-up">
            <small>{{ comment.creationDateTime | prettyDate }}</small>
            <div><small class="author">{{ comment.authorName }}</small></div>
          </ion-col>
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
