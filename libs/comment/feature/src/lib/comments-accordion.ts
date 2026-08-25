import { Component, computed, effect, inject, input } from '@angular/core';
import { IonAccordion, IonIcon, IonItem, IonLabel } from '@ionic/angular/standalone';

import { DocumentModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { CountPill } from '@okr/shared-ui';
import { coerceBoolean } from '@okr/shared-util-core';

import { CommentComposer, CommentsList } from '@okr/comment-ui';

import { CommentListStore } from './comment-list.store';

@Component({
  selector: 'okr-comments-accordion',
  standalone: true,
  imports: [
    SvgIconPipe,
    CountPill,
    IonAccordion, IonItem, IonLabel, IonIcon,
    CommentsList, CommentComposer
  ],
  providers: [CommentListStore],
  styles: [`
    .header-icon {
      font-size: 20px;
      color: var(--ion-color-medium);
      margin-inline-end: 10px;
    }
    /* Ionic sets .accordion-expanded on the host while the accordion is open. */
    ion-accordion.accordion-expanded .header-icon { color: var(--ion-color-primary); }
    ion-accordion.accordion-expanded ion-label { color: var(--ion-color-primary-shade); font-weight: 600; }
    ion-accordion.accordion-expanded okr-count-pill {
      --okr-pill-background: var(--ion-color-primary-tint);
      --okr-pill-color: var(--ion-color-primary-shade);
    }

    .content { padding: 12px 12px 10px; }
    .composer { margin-top: 14px; }

    .read-only {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-top: 14px;
      padding: 14px 16px;
      border: 1px dashed var(--ion-color-light-shade);
      border-radius: 14px;
      background: var(--ion-color-light);
      color: var(--ion-color-medium);
      font-size: 0.875rem;
    }
    .read-only ion-icon { font-size: 20px; flex-shrink: 0; }
  `],
  template: `
    <ion-accordion toggle-icon-slot="start" value="comments">
      <ion-item slot="header" [color]="color()">
        <ion-icon class="header-icon" src="{{ 'chatbox' | svgIcon }}" />
        <ion-label>{{ store.i18n.comments() }}</ion-label>
        <okr-count-pill slot="end" [count]="store.commentCount()" />
      </ion-item>

      <div slot="content" class="content">
        <okr-comments-list
          [comments]="comments()"
          [empty]="store.i18n.empty()"
          [attachments]="store.attachments()"
          [currentPersonKey]="store.currentPersonKey()"
          (attachmentOpened)="openAttachment($event)" />

        @if (isReadOnly()) {
          <div class="read-only">
            <ion-icon src="{{ 'lock-closed' | svgIcon }}" />
            <span>{{ store.i18n.read_only() }}</span>
          </div>
        } @else {
          <div class="composer">
            <okr-comment-composer
              [i18n]="store.i18n"
              [pendingFiles]="store.pendingFiles()"
              [isBusy]="store.isUploading()"
              (sent)="add($event)"
              (attachRequested)="pickFiles()"
              (attachmentRemoved)="store.removeFile($event)" />
          </div>
        }
      </div>
    </ion-accordion>
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

  constructor() {
    effect(() => {
      this.store.setParentKey(this.parentKey());
    });
  }

  protected async add(comment: string): Promise<void> {
    await this.store.add(comment);
  }

  protected async pickFiles(): Promise<void> {
    await this.store.pickFiles();
  }

  protected async openAttachment(document: DocumentModel): Promise<void> {
    await this.store.openAttachment(document);
  }
}
