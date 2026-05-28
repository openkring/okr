import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { IonAccordion, IonButton, IonGrid, IonIcon, IonItem, IonLabel } from '@ionic/angular/standalone';


import { CommentsList } from '@bk2/comment-ui';

import { CommentListStore } from './comment-list.store';
import { coerceBoolean } from '@bk2/shared-util-core';
import { SvgIconPipe } from '@bk2/shared-pipes';

@Component({
  selector: 'bk-comments-accordion',
  standalone: true,
  imports: [
    SvgIconPipe,
    IonAccordion, IonItem, IonLabel, IonGrid, IonButton, IonIcon,
    CommentsList
  ],
  providers: [CommentListStore],
  template: `
    <ion-accordion toggle-icon-slot="start" value="comments">
      <ion-item slot="header" [color]="color()">
        <ion-label>{{ store.i18n.comments() }}</ion-label>
        @if(!isReadOnly()) {
          <ion-button fill="clear" (click)="add()" size="default">
            <ion-icon color="secondary" slot="icon-only" src="{{'add-circle' | svgIcon }}" />
        </ion-button>
      }
      </ion-item>
    <div slot="content">
      <ion-grid style="width: 100%; height: 100%;">
        <bk-comments-list [comments]="comments()" [empty]="store.i18n.empty()" />
      </ion-grid>
    </div>
  `
})
export class CommentsAccordion {
  protected readonly store = inject(CommentListStore);

  public name = input('comment'); // mandatory name for the form control
  public parentKey = input.required<string>();  // modelType.key of the parent model
  public readOnly = input<boolean>(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  public color = input('light');

  public comments = computed(() => this.store.comments() ?? []);
  protected value = signal<string>('');

  constructor() {
    effect(() => {
      this.store.setParentKey(this.parentKey());
    });
  }

  public async add(): Promise<void> {
    await this.store.add();
    this.value.set('');  // reset input field
  }
}
