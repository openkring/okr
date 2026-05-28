import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonGrid } from '@ionic/angular/standalone';
import { Observable } from 'rxjs';


import { CommentModel } from '@bk2/shared-models';

import { CommentHeader, CommentInput, CommentsList } from '@bk2/comment-ui';

import { CommentListStore } from './comment-list.store';

@Component({
  selector: 'bk-comments-card',
  standalone: true,
  imports: [
    IonGrid, IonCard, IonCardContent, IonCardHeader, IonCardTitle,
    CommentInput, CommentHeader, CommentsList
],
  providers: [CommentListStore],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ store.i18n.comments() }}</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        <ion-grid style="width: 100%; height: 100%;">
          @if (!readOnly()) {
            <bk-comment-input [name]="name()" [value]="" (changed)="addComment($event)" />
          }
          <bk-comment-header />
          <bk-comments-list [comments]="comments()" [empty]="store.i18n.empty()" />
        </ion-grid>
      </ion-card-content>
    </ion-card>
`
})
export class CommentsCard {
  protected readonly store = inject(CommentListStore);

  public name = input('comment'); // mandatory name for the form control
  public parentKey = input.required<string>();  // modelType.key of the parent model
  public readOnly = input(true);
  
  public comments$: Observable<CommentModel[]> | undefined
  protected value = signal<string>('');
  public comments = computed(() => this.store.comments() ?? []);

  constructor() {
    effect(() => {
      this.store.setParentKey(this.parentKey());
    });
  }

  public async addComment(comment: string): Promise<void> {
    await this.store.add(comment);
    this.value.set('');  // reset input field
  }
}
