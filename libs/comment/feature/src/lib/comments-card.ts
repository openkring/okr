import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonGrid } from '@ionic/angular/standalone';
import { Observable } from 'rxjs';

import { TranslatePipe } from '@bk2/shared-i18n';
import { CommentModel } from '@bk2/shared-models';

import { CommentHeaderComponent, CommentInputComponent, CommentsListComponent } from '@bk2/comment-ui';

import { CommentListStore } from './comment-list.store';

@Component({
  selector: 'bk-comments-card',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    IonGrid, IonCard, IonCardContent, IonCardHeader, IonCardTitle,
    CommentInputComponent, CommentHeaderComponent, CommentsListComponent
],
  providers: [CommentListStore],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ '@comment.plural' | translate | async}}</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        <ion-grid style="width: 100%; height: 100%;">
          @if (!readOnly()) {
            <bk-comment-input [name]="name()" [value]="" (changed)="addComment($event)" />
          }
          <bk-comment-header />
          <bk-comments-list [comments]="comments()" />
        </ion-grid>
      </ion-card-content>
    </ion-card>
`
})
export class CommentsCardComponent {
  private readonly commentListStore = inject(CommentListStore);

  public name = input('comment'); // mandatory name for the form control
  public collectionName = input.required<string>();
  public parentKey = input.required<string>();
  public readOnly = input(true);
  
  public comments$: Observable<CommentModel[]> | undefined
  protected value = signal<string>('');
  public comments = computed(() => this.commentListStore.comments() ?? []);

  constructor() {
    effect(() => {
      this.commentListStore.setCollection(this.collectionName(), this.parentKey());
    });
  }

  public async addComment(comment: string): Promise<void> {
    await this.commentListStore.add(comment);
    this.value.set('');  // reset input field
  }
}
