import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import {
  IonButton, IonButtons, IonChip, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton,
  IonProgressBar, IonTitle, IonToolbar, ModalController,
} from '@ionic/angular';

import {
  LearningFileList, LearningImageGrid, LearningToolbar, LearningVideoGrid,
} from '@okr/content-learning-ui';
import {
  LearningFilter, LearningTab, PublicLearningItem, filterLearningDocs, learningTabOf,
} from '@okr/content-learning-util';
import { DocumentModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, Spinner, browse, showVideoView } from '@okr/shared-ui';
import { fill } from '@okr/shared-util-core';

import { LearningStore } from './learning.store';

/** A public item in the shape the room components render (they work on DocumentModel). */
function publicItemAsDoc(item: PublicLearningItem): DocumentModel {
  const mimeType = item.tab === 'videos' ? 'video/mp4' : item.tab === 'images' ? 'image/jpeg' : 'application/octet-stream';
  return { okey: item.key, title: item.title, tags: item.tags.join(','), notes: item.notes, links: item.links, url: item.url, mimeType, isArchived: false } as DocumentModel;
}

/**
 * A learning room (spec 1.115 §5.1–5.2): page type `learning`, rendered by PageDispatcher (and as
 * the «Dateien» segment of a group with a `<groupKey>_learning` page).
 *
 * The dispatcher creates this component lazily and passes the page key; the room reads its page,
 * first learning section and folder documents through the LearningStore (it cannot read
 * PageStore: that lives in @okr/cms-page-feature, which imports this lib — a cycle).
 *
 * Signed in: search, tabs, topic chips over the room folder's documents; curators get an upload
 * row (one «Hochladen» per curatable topic). Signed out on /public/<pageKey>: the published room
 * from the public page API (no comments, ratings or uploader names).
 */
@Component({
  selector: 'okr-learning-room-page',
  standalone: true,
  imports: [
    LearningToolbar, LearningVideoGrid, LearningImageGrid, LearningFileList, Spinner, EmptyList, SvgIconPipe,
    IonHeader, IonToolbar, IonButtons, IonMenuButton, IonTitle, IonContent, IonButton, IonIcon, IonChip, IonLabel,
    IonProgressBar, IonList, IonItem,
  ],
  providers: [LearningStore],
  styles: [`
    :host { display: flex; flex-direction: column; height: 100%; width: 100%; }
    .upload-row { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; padding: 4px 8px; }
    .upload-row label { cursor: pointer; }
    .upload-row input[type=file] { display: none; }
    .upload-status { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 4px 16px 8px; font-size: 0.9em; color: var(--ion-color-medium); }
    .public-images { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 8px; padding: 8px; }
    .public-images a img { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 6px; display: block; }
    .notes { padding: 0 16px; }
  `],
  template: `
    @if (showMenu()) {
      <ion-header>
        <ion-toolbar [color]="color()">
          <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
          <ion-title>{{ title() }}</ion-title>
        </ion-toolbar>
      </ion-header>
    }
    <ion-content>
      @if (!store.sessionReady()) {
        <okr-spinner />
      } @else if (store.isAnonymous()) {
        @if (store.isPublicLoading()) {
          <okr-spinner />
        } @else if (store.publicRoomFailed() || !store.publicRoom()) {
          <okr-empty-list [message]="store.i18n.room_unavailable()" />
        } @else {
          <okr-learning-toolbar [topics]="publicTopics()" [counts]="publicCounts()" [i18n]="store.i18n" [filter]="store.filter()" (filterChange)="store.setFilter($event)" />
          @switch (store.filter().tab) {
            @case ('videos') {
              <okr-learning-video-grid [docs]="publicVisible()" [posters]="publicPosters()" [i18n]="store.i18n" (open)="playPublic($event)" />
            }
            @case ('images') {
              @if (publicVisible().length === 0) {
                <okr-empty-list [message]="store.i18n.empty_images()" />
              } @else {
                <div class="public-images">
                  @for (doc of publicVisible(); track doc.okey) {
                    <a [href]="doc.url" target="_blank" rel="noopener"><img [src]="doc.url" [alt]="doc.title" loading="lazy" /></a>
                  }
                </div>
              }
            }
            @default {
              <okr-learning-file-list [docs]="publicVisible()" [i18n]="store.i18n" (open)="selectPublic($event)" (download)="openPublic($event)" />
            }
          }
          @if (selectedPublic(); as item) {
            <ion-list>
              <ion-item lines="none"><ion-label class="ion-text-wrap"><h2>{{ item.title }}</h2></ion-label></ion-item>
              @if (item.notes) {
                <div class="notes" [innerHTML]="item.notes"></div>
              }
              @for (link of item.links ?? []; track link.url) {
                <ion-item button [detail]="true" (click)="openUrl(link.url)"><ion-label>{{ link.title || link.url }}</ion-label></ion-item>
              }
            </ion-list>
          }
        }
      } @else if (store.isRoomLoading() && !store.room()) {
        <okr-spinner />
      } @else if (!store.config()) {
        <okr-empty-list [message]="store.i18n.room_notConfigured()" />
      } @else {
        <okr-learning-toolbar [topics]="store.topics()" [counts]="store.counts()" [i18n]="store.i18n" [filter]="store.filter()" (filterChange)="store.setFilter($event)" />
        @if (store.curatableTopics().length > 0) {
          <div class="upload-row">
            @for (topic of store.curatableTopics(); track topic) {
              <!-- a real <label> around the input: the file dialog opens from the user's own tap (Safari) -->
              <label>
                <ion-chip color="primary" [disabled]="!!store.upload()">
                  <ion-icon src="{{ 'upload' | svgIcon }}" />
                  <ion-label>{{ store.i18n.room_upload() }}: {{ topic }}</ion-label>
                </ion-chip>
                <input type="file" multiple [disabled]="!!store.upload()" (change)="onFiles(topic, $event)" />
              </label>
            }
          </div>
        }
        @if (store.upload(); as up) {
          <ion-progress-bar [value]="up.progress" />
          <div class="upload-status">
            <span>{{ uploading(up.name) }}</span>
            <ion-button fill="clear" size="small" (click)="store.cancelUpload()">{{ store.i18n.room_uploadCancel() }}</ion-button>
          </div>
        }
        @if (store.isDocsLoading() && store.docs().length === 0) {
          <okr-spinner />
        } @else {
          @switch (store.filter().tab) {
            @case ('videos') {
              <okr-learning-video-grid [docs]="store.visibleDocs()" [posters]="posters()" [postersLoading]="postersLoading()" [i18n]="store.i18n" (open)="store.openItem($event)" />
            }
            @case ('images') {
              <okr-learning-image-grid [docs]="store.visibleDocs()" [imgixBaseUrl]="imgixBaseUrl" [i18n]="store.i18n" />
            }
            @default {
              <okr-learning-file-list [docs]="store.visibleDocs()" [i18n]="store.i18n" (open)="store.openItem($event)" (download)="store.download($event)" />
            }
          }
        }
      }
    </ion-content>
  `,
})
export class LearningRoomPage {
  protected readonly store = inject(LearningStore);
  private readonly modalController = inject(ModalController);
  protected readonly imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  // inputs (set by PageDispatcher)
  public readonly pageKey = input('');
  /**
   * Intentionally unused: accepted only so PageDispatcher can pass the same inputs to every page
   * type. A learning room has no DB context menu — its actions (upload per topic, edit, delete)
   * depend on the viewer's curated topics and are rendered as buttons.
   */
  public readonly contextMenuName = input<string | undefined>(undefined);
  public readonly color = input('secondary');
  public readonly showMenu = input(true);

  protected readonly title = computed(() => this.store.room()?.page.title || this.store.room()?.page.name || this.store.publicRoom()?.title || '');

  /** posters of the visible videos, signed by VideoUrlService */
  protected readonly posters = computed(() => {
    const signed = this.store.videoUrlService.signed();
    const out: Record<string, string> = {};
    for (const [key, v] of Object.entries(signed)) if (v.posterUrl) out[key] = v.posterUrl;
    return out;
  });
  private readonly signing = signal(false);
  protected readonly postersLoading = computed(() => {
    if (this.signing()) return true;
    const settled = this.store.videoUrlService.settled();
    return this.visibleVideoKeys().some(k => !settled.has(k));
  });
  private readonly visibleVideoKeys = computed(() =>
    this.store.filter().tab === 'videos' ? this.store.visibleDocs().filter(d => learningTabOf(d.mimeType) === 'videos').map(d => d.okey) : []);

  // public (anonymous) view
  private readonly publicDocs = computed(() => (this.store.publicRoom()?.items ?? []).map(publicItemAsDoc));
  protected readonly publicTopics = computed(() => this.store.publicRoom()?.topics ?? []);
  protected readonly publicVisible = computed(() => filterLearningDocs(this.publicDocs(), this.store.filter()));
  protected readonly publicCounts = computed<Record<LearningTab, number>>(() => {
    const f = this.store.filter();
    const count = (tab: LearningTab) => filterLearningDocs(this.publicDocs(), { ...f, tab } as LearningFilter).length;
    return { files: count('files'), videos: count('videos'), images: count('images') };
  });
  protected readonly publicPosters = computed(() => {
    const out: Record<string, string> = {};
    for (const item of this.store.publicRoom()?.items ?? []) if (item.posterUrl) out[item.key] = item.posterUrl;
    return out;
  });
  protected readonly selectedPublic = signal<PublicLearningItem | undefined>(undefined);

  constructor() {
    effect(() => {
      const key = this.pageKey();
      untracked(() => this.store.setPageKey(key));
    });
    // the room's start tab, once its config arrives
    effect(() => {
      const config = this.store.config();
      if (config) untracked(() => this.store.applyDefaultTab(config.defaultTab));
    });
    // sign the posters of the visible videos (the service skips keys it already holds)
    effect(() => {
      const keys = this.visibleVideoKeys();
      if (keys.length === 0) return;
      untracked(() => {
        this.signing.set(true);
        void this.store.videoUrlService.ensure(keys).catch(() => undefined).finally(() => this.signing.set(false));
      });
    });
  }

  protected uploading(name: string): string {
    return fill(this.store.i18n.room_uploading(), { name });
  }

  protected async onFiles(topic: string, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';   // the same file can be picked again
    await this.store.upload(topic, files);
  }

  protected selectPublic(doc: DocumentModel): void {
    this.selectedPublic.set(this.store.publicRoom()?.items.find(i => i.key === doc.okey));
  }

  protected async openPublic(doc: DocumentModel): Promise<void> {
    await browse(doc.url);
  }

  protected async openUrl(url: string): Promise<void> {
    await browse(url);
  }

  protected async playPublic(doc: DocumentModel): Promise<void> {
    this.selectPublic(doc);
    if (!doc.url) return;
    await showVideoView(this.modalController, { playUrl: doc.url }, '', {
      title: doc.title, download: this.store.i18n.item_download(), close: this.store.i18n.form_cancel(),
      error: this.store.i18n.item_videoUnavailable(),
    });
  }
}
