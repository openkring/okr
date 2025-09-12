import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { IonAccordion, IonGrid, IonItem, IonLabel } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';

import { CommentHeaderComponent, CommentInputComponent, CommentsListComponent } from '@bk2/comment-ui';

import { CommentListStore } from './comment-list.store';

@Component({
  selector: 'bk-comments-accordion',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    IonAccordion, IonItem, IonLabel, IonGrid,
    CommentInputComponent, CommentHeaderComponent, CommentsListComponent
  ],
  providers: [CommentListStore],
  template: `
    <ion-accordion toggle-icon-slot="start" value="comments">
      <ion-item slot="header" [color]="color()">
        <ion-label>{{ '@comment.plural' | translate | async }}</ion-label>
      </ion-item>
    <div slot="content">
      <ion-grid style="width: 100%; height: 100%;">
        @if (!readOnly()) {
          <bk-comment-input [name]="name()" [value]="" (changed)="addComment($event)" />
        }
        <bk-comment-header />
        <bk-comments-list [comments]="comments()" />
      </ion-grid>
    </div>
  `
})
export class CommentsAccordionComponent {
  private readonly commentListStore = inject(CommentListStore);

  public name = input('comment'); // mandatory name for the form control
  public collectionName = input.required<string>();
  public parentKey = input.required<string>();
  public readOnly = input(false);
  public color = input('light');

  public comments = computed(() => this.commentListStore.comments() ?? []);
  protected value = signal<string>('');

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
