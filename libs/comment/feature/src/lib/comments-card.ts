import { Component, computed, effect, inject, input } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonIcon } from '@ionic/angular/standalone';

import { DocumentModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { CountPill } from '@okr/shared-ui';
import { coerceBoolean } from '@okr/shared-util-core';

import { CommentComposer, CommentsList } from '@okr/comment-ui';

import { CommentListStore } from './comment-list.store';

/**
 * The card variant of the comment thread, for pages that show comments as a section of their own
 * rather than inside an accordion group. Same building blocks as `okr-comments-accordion` — only
 * the frame differs.
 */
@Component({
  selector: 'okr-comments-card',
  standalone: true,
  imports: [
    SvgIconPipe,
    CountPill,
    IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonIcon,
    CommentsList, CommentComposer
  ],
  providers: [CommentListStore],
  styles: [`
    ion-card-title {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .title-icon { font-size: 20px; color: var(--ion-color-medium); }
    .composer { margin-top: 14px; }
  `],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>
          <ion-icon class="title-icon" src="{{ 'chatbox' | svgIcon }}" />
          <span>{{ store.i18n.comments() }}</span>
          <okr-count-pill [count]="store.commentCount()" />
        </ion-card-title>
      </ion-card-header>
      <ion-card-content>
        <okr-comments-list
          [comments]="comments()"
          [empty]="store.i18n.empty()"
          [attachments]="store.attachments()"
          [currentPersonKey]="store.currentPersonKey()"
          (attachmentOpened)="openAttachment($event)" />

        @if (!isReadOnly()) {
          <div class="composer">
            <okr-comment-composer
              [i18n]="store.i18n"
              [pendingFiles]="store.pendingFiles()"
              [isBusy]="store.isUploading()"
              (sent)="addComment($event)"
              (attachRequested)="pickFiles()"
              (attachmentRemoved)="store.removeFile($event)" />
          </div>
        }
      </ion-card-content>
    </ion-card>
  `
})
export class CommentsCard {
  protected readonly store = inject(CommentListStore);

  public name = input('comment'); // mandatory name for the form control
  public parentKey = input.required<string>();  // modelType.key of the parent model
  public readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  public comments = computed(() => this.store.comments() ?? []);

  constructor() {
    effect(() => {
      this.store.setParentKey(this.parentKey());
    });
  }

  protected async addComment(comment: string): Promise<void> {
    await this.store.add(comment);
  }

  protected async pickFiles(): Promise<void> {
    await this.store.pickFiles();
  }

  protected async openAttachment(document: DocumentModel): Promise<void> {
    await this.store.openAttachment(document);
  }
}
