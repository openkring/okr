import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { IonAccordion, IonButton, IonGrid, IonIcon, IonItem, IonLabel } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';

import { CommentsListComponent } from '@bk2/comment-ui';

import { CommentListStore } from './comment-list.store';
import { coerceBoolean } from '@bk2/shared-util-core';
import { SvgIconPipe } from '@bk2/shared-pipes';

@Component({
  selector: 'bk-comments-accordion',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe,
    IonAccordion, IonItem, IonLabel, IonGrid, IonButton, IonIcon,
    CommentsListComponent
  ],
  providers: [CommentListStore],
  template: `
    <ion-accordion toggle-icon-slot="start" value="comments">
      <ion-item slot="header" [color]="color()">
        <ion-label>{{ '@comment.plural' | translate | async }}</ion-label>
        @if(!isReadOnly()) {
          <ion-button fill="clear" (click)="add()" size="default">
            <ion-icon color="secondary" slot="icon-only" src="{{'add-circle' | svgIcon }}" />
        </ion-button>
      }
      </ion-item>
    <div slot="content">
      <ion-grid style="width: 100%; height: 100%;">
        <bk-comments-list [comments]="comments()" />
      </ion-grid>
    </div>
  `
})
export class CommentsAccordionComponent {
  private readonly commentListStore = inject(CommentListStore);

  public name = input('comment'); // mandatory name for the form control
  public parentKey = input.required<string>();  // modelType.key of the parent model
  public readOnly = input<boolean>(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  public color = input('light');

  public comments = computed(() => this.commentListStore.comments() ?? []);
  protected value = signal<string>('');

  constructor() {
    effect(() => {
      this.commentListStore.setParentKey(this.parentKey());
    });
  }

  public async add(): Promise<void> {
    await this.commentListStore.add();
    this.value.set('');  // reset input field
  }
}
