import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import {
  IonBackButton, IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonChip, IonContent,
  IonHeader, IonIcon, IonItem, IonLabel, IonList, IonTitle, IonToolbar,
} from '@ionic/angular';
import { combineLatest, of, map, catchError } from 'rxjs';

import { CommentsCard } from '@okr/comment-feature';
import { RatingStars } from '@okr/content-learning-ui';
import { averageStars, learningRoomUrl, learningTabOf, parseTopics } from '@okr/content-learning-util';
import { DocumentModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, Spinner, browse } from '@okr/shared-ui';
import { navigateByUrl, resourceParams } from '@okr/shared-util-angular';
import { DateFormat, convertDateFormatToString, fill } from '@okr/shared-util-core';

import { LearningStore } from './learning.store';

/**
 * One item of a learning room — `/private/learning-item/:pageKey/:docKey` (spec 1.115 §5.3):
 * player or preview, topics, uploader and date, the average rating and the caller's own stars,
 * notes (read-only HTML, sanitized by Angular's default [innerHTML] binding), links, attachments
 * and the comments of the document. Curators get «Bearbeiten» / «Löschen» (callables decide again).
 *
 * The document must sit in the room's folder; anything else answers «nicht verfügbar», like the server.
 */
@Component({
  selector: 'okr-learning-item-page',
  standalone: true,
  imports: [
    RatingStars, CommentsCard, Spinner, EmptyList, SvgIconPipe,
    IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonButton, IonIcon, IonContent,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonList, IonItem, IonLabel, IonChip,
  ],
  providers: [LearningStore],
  styles: [`
    .media { padding: 0 16px; }
    video, .preview { width: 100%; max-height: 70vh; border-radius: 8px; display: block; }
    video { background: black; }
    .preview { object-fit: contain; }
    .meta { padding: 8px 16px 0; color: var(--ion-color-medium); font-size: 0.9em; }
    .topics { display: flex; flex-wrap: wrap; gap: 4px; padding: 4px 12px; }
    .rating { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 8px 16px; }
    .notes { overflow-wrap: anywhere; }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-back-button [defaultHref]="roomUrl()" /></ion-buttons>
        <ion-title>{{ doc()?.title || store.i18n.detail_title() }}</ion-title>
        @if (doc(); as doc) {
          <ion-buttons slot="end">
            @if (store.canEdit(doc)) {
              <ion-button (click)="edit(doc)" [attr.aria-label]="store.i18n.detail_edit()">
                <ion-icon slot="icon-only" src="{{ 'edit' | svgIcon }}" />
              </ion-button>
            }
            @if (store.canDelete(doc)) {
              <ion-button (click)="remove(doc)" [attr.aria-label]="store.i18n.detail_delete()">
                <ion-icon slot="icon-only" src="{{ 'trash' | svgIcon }}" />
              </ion-button>
            }
          </ion-buttons>
        }
      </ion-toolbar>
    </ion-header>
    <ion-content>
      @if (isLoading()) {
        <okr-spinner />
      } @else if (!doc()) {
        <okr-empty-list [message]="store.i18n.detail_notFound()" />
      } @else if (doc(); as doc) {
        <div class="media">
          @switch (tab()) {
            @case ('videos') {
              @if (playUrl(); as url) {
                <video [src]="url" [poster]="posterUrl()" controls playsinline [attr.aria-label]="doc.title"></video>
              } @else if (playLoading()) {
                <okr-spinner />
              } @else {
                <okr-empty-list [message]="store.i18n.item_videoUnavailable()" />
              }
            }
            @case ('images') {
              <img class="preview" [src]="imageUrl()" [alt]="doc.altText || doc.title" />
            }
          }
        </div>
        <div class="meta">{{ uploadedText() }}</div>
        @if (docTopics().length > 0) {
          <div class="topics">
            @for (t of docTopics(); track t) { <ion-chip color="medium"><ion-label>{{ t }}</ion-label></ion-chip> }
          </div>
        }
        <div class="rating">
          <okr-rating-stars [value]="average()" [i18n]="store.i18n" />
          <span>{{ store.i18n.detail_yourRating() }}:</span>
          <okr-rating-stars [value]="myStars() ?? 0" [readOnly]="false" [label]="store.i18n.detail_yourRating()" [i18n]="store.i18n" (rate)="rate($event)" />
          @if (myStars()) {
            <ion-button fill="clear" size="small" (click)="clearRating()">{{ store.i18n.detail_clearRating() }}</ion-button>
          }
        </div>
        <ion-list lines="none">
          @if (tab() !== 'videos') {
            <ion-item button [detail]="false" (click)="store.download(doc)">
              <ion-icon slot="start" src="{{ 'download' | svgIcon }}" />
              <ion-label>{{ store.i18n.item_open() }}</ion-label>
            </ion-item>
          } @else {
            <ion-item button [detail]="false" (click)="store.download(doc)">
              <ion-icon slot="start" src="{{ 'download' | svgIcon }}" />
              <ion-label>{{ store.i18n.item_download() }}</ion-label>
            </ion-item>
          }
        </ion-list>
        @if (doc.notes && doc.notes !== '<p></p>') {
          <ion-card>
            <ion-card-header><ion-card-title>{{ store.i18n.item_notes() }}</ion-card-title></ion-card-header>
            <ion-card-content><div class="notes" [innerHTML]="doc.notes"></div></ion-card-content>
          </ion-card>
        }
        @if ((doc.links ?? []).length > 0) {
          <ion-card>
            <ion-card-header><ion-card-title>{{ store.i18n.detail_links() }}</ion-card-title></ion-card-header>
            <ion-card-content class="ion-no-padding">
              <ion-list lines="inset">
                @for (link of doc.links ?? []; track $index) {
                  <ion-item button [detail]="true" (click)="openUrl(link.url)">
                    <ion-label class="ion-text-wrap"><h3>{{ link.title || link.url }}</h3><p>{{ link.url }}</p></ion-label>
                  </ion-item>
                }
              </ion-list>
            </ion-card-content>
          </ion-card>
        }
        @if (attachments().length > 0) {
          <ion-card>
            <ion-card-header><ion-card-title>{{ store.i18n.detail_attachments() }}</ion-card-title></ion-card-header>
            <ion-card-content class="ion-no-padding">
              <ion-list lines="inset">
                @for (a of attachments(); track a.okey) {
                  <ion-item button [detail]="true" (click)="store.download(a)">
                    <ion-label class="ion-text-wrap">{{ a.title || a.okey }}</ion-label>
                  </ion-item>
                }
              </ion-list>
            </ion-card-content>
          </ion-card>
        }
        <okr-comments-card [parentKey]="'document.' + doc.okey" [readOnly]="false" />
      }
    </ion-content>
  `,
})
export class LearningItemPage {
  protected readonly store = inject(LearningStore);
  private readonly imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  // route params (withComponentInputBinding); '' when unbound
  public readonly pageKey = input('');
  public readonly docKey = input('');

  protected readonly roomUrl = computed(() => learningRoomUrl(this.pageKey() ?? ''));

  private readonly docResource = rxResource({
    params: resourceParams(() => ({ key: this.docKey() ?? '' })),
    stream: ({ params }) => params.key
      ? this.store.documentService.read(params.key).pipe(catchError(() => of(undefined)))
      : of(undefined),
  });

  /** the document, only when it sits in this room's folder and is live */
  protected readonly doc = computed<DocumentModel | undefined>(() => {
    const doc = this.docResource.hasValue() ? this.docResource.value() : undefined;
    const folder = this.store.config()?.folder;
    if (!doc || !folder || doc.isArchived || !(doc.folderKeys ?? []).includes(folder)) return undefined;
    return doc;
  });
  protected readonly isLoading = computed(() => !this.store.sessionReady() ||
    this.docResource.isLoading() || (this.store.isRoomLoading() && !this.store.room()));

  protected readonly tab = computed(() => learningTabOf(this.doc()?.mimeType ?? ''));
  /** the shown document's key: effects key on it, so a live update of the doc (rating aggregate) does not restart the player */
  private readonly shownKey = computed(() => this.doc()?.okey ?? '');
  protected readonly docTopics = computed(() => parseTopics(this.doc()?.tags ?? ''));
  protected readonly average = computed(() => { const d = this.doc(); return d ? averageStars(d) : 0; });
  protected readonly imageUrl = computed(() => {
    const path = this.doc()?.fullPath ?? '';
    return path ? `${this.imgixBaseUrl}/${encodeURI(path)}?w=1200&auto=format,compress` : '';
  });
  protected readonly uploadedText = computed(() => {
    const d = this.doc();
    if (!d) return '';
    const date = d.dateOfDocCreation ? convertDateFormatToString(d.dateOfDocCreation, DateFormat.StoreDate, DateFormat.ViewDate, false) : '';
    return d.authorName
      ? fill(this.store.i18n.detail_uploadedBy(), { name: d.authorName, date })
      : fill(this.store.i18n.detail_uploadedOn(), { date });
  });

  private readonly attachmentsResource = rxResource({
    params: resourceParams(() => ({ keys: (this.doc()?.attachmentKeys ?? []).join(',') })),
    stream: ({ params }) => {
      const keys = params.keys ? params.keys.split(',') : [];
      if (keys.length === 0) return of([] as DocumentModel[]);
      return combineLatest(keys.map(k => this.store.documentService.read(k).pipe(catchError(() => of(undefined))))).pipe(
        map(docs => docs.filter((d): d is DocumentModel => !!d && !d.isArchived)),
      );
    },
  });
  protected readonly attachments = computed(() => this.attachmentsResource.value() ?? []);

  protected readonly myStars = signal<number | undefined>(undefined);
  protected readonly playUrl = signal<string | undefined>(undefined);
  protected readonly posterUrl = signal<string>('');
  protected readonly playLoading = signal(false);

  constructor() {
    effect(() => {
      const key = this.pageKey() ?? '';
      untracked(() => this.store.setPageKey(key));
    });
    // own rating, once per document
    effect(() => {
      const docKey = this.shownKey();
      untracked(() => {
        this.myStars.set(undefined);
        if (docKey) void this.store.myRating(docKey).then(stars => { if (this.doc()?.okey === docKey) this.myStars.set(stars); });
      });
    });
    // signed playback URL for a video
    effect(() => {
      const docKey = this.shownKey();
      const isVideo = this.tab() === 'videos';
      untracked(() => {
        this.playUrl.set(undefined);
        if (!docKey || !isVideo) return;
        this.playLoading.set(true);
        void this.store.videoUrlService.forPlayback(docKey)
          .then(signed => {
            if (this.shownKey() !== docKey) return;
            this.playUrl.set(signed?.playback.url);
            this.posterUrl.set(signed?.posterUrl ?? '');
          })
          .catch(() => undefined)
          .finally(() => this.playLoading.set(false));
      });
    });
  }

  protected async rate(stars: number): Promise<void> {
    const doc = this.doc();
    if (!doc) return;
    const before = this.myStars();
    this.myStars.set(stars);
    if (!(await this.store.rate(doc.okey, stars))) this.myStars.set(before);
  }

  protected async clearRating(): Promise<void> {
    const doc = this.doc();
    if (!doc) return;
    const before = this.myStars();
    this.myStars.set(undefined);
    if (!(await this.store.clearRating(doc.okey))) this.myStars.set(before);
  }

  protected async edit(doc: DocumentModel): Promise<void> {
    await this.store.editItem(doc);
  }

  protected async remove(doc: DocumentModel): Promise<void> {
    if (await this.store.deleteItem(doc)) await navigateByUrl(this.store.router, this.roomUrl());
  }

  protected async openUrl(url: string): Promise<void> {
    await browse(url);
  }
}
