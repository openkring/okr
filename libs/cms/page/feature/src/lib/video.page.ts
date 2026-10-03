import { Component, computed, inject, input, resource } from '@angular/core';
import { AppStore } from '@okr/shared-feature';
import { RouterLink } from '@angular/router';
import { IonButton, IonContent, IonIcon, ToastController } from '@ionic/angular/standalone';
import { firstValueFrom } from 'rxjs';

import { I18nService } from '@okr/shared-i18n';
import { DocumentModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { Header, Spinner } from '@okr/shared-ui';
import { warn } from '@okr/shared-util-core';
import { copyToClipboardWithConfirmation, downloadToBrowser } from '@okr/shared-util-angular';

import { VIDEO_PAGE_I18N_KEYS, VideoPageI18n } from '@okr/cms-page-util';
import { DocumentService, VideoUrlService } from '@okr/content-document-data-access';
import { SignedVideo, videoLink } from '@okr/content-document-util';
import { FolderService } from '@okr/content-folder-data-access';

/** What the page shows once loading is over; undefined = not available (every failure). */
interface VideoView {
  signed: SignedVideo;
  title: string;          // '' = use the translated fallback at render time
  folderKey: string;
  folderName: string;
}

/**
 * `/video/<docKey>` — the canonical, shareable link of one private album video (spec 1.82).
 *
 * The signed playback URL is fetched once per visit via `signVideoUrls`, which is also the access
 * check. Every failure — unknown key, not permitted, archived, callable error — ends in the same
 * neutral message: the page must not tell a non-member whether the video exists.
 */
@Component({
  selector: 'okr-video-page',
  standalone: true,
  imports: [RouterLink, SvgIconPipe, Header, Spinner, IonContent, IonButton, IonIcon],
  styles: [`
    .video-page { max-width: 1200px; margin: 0 auto; padding: 0.5rem; }
    video { display: block; width: 100%; max-height: 80dvh; background: #000; border-radius: 4px; }
    .meta { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.5rem; margin-top: 0.5rem; }
    .meta h2 { margin: 0; font-size: 1.1rem; color: var(--ion-text-color); }
    .meta a { color: var(--ion-color-primary); }
    .unavailable { max-width: 32rem; margin: 2rem auto; padding: 1rem; text-align: center; color: var(--ion-color-medium); }
  `],
  template: `
    <okr-header [i18n]="{ title: headerTitle() }" [isRoot]="true" />
    <ion-content>
      @if (videoResource.isLoading()) {
        <okr-spinner />
      } @else if (view(); as v) {
        <div class="video-page">
          <video [src]="v.signed.playback.url" controls playsinline></video>
          <div class="meta">
            <div>
              <h2>{{ v.title || i18n.title() }}</h2>
              @if (v.folderKey) {
                <a [routerLink]="['/album', v.folderKey]">{{ v.folderName || i18n.to_album() }}</a>
              }
            </div>
            <div>
              <ion-button fill="clear" (click)="copyLink()">
                <ion-icon slot="start" src="{{ 'copy' | svgIcon }}" />
                {{ i18n.copy_link() }}
              </ion-button>
              @if (v.signed.downloadUrl) {
                <ion-button fill="clear" (click)="download(v.signed.downloadUrl)">
                  <ion-icon slot="start" src="{{ 'download' | svgIcon }}" />
                  {{ i18n.download() }}
                </ion-button>
              }
            </div>
          </div>
        </div>
      } @else {
        <p class="unavailable">{{ i18n.unavailable() }}</p>
      }
    </ion-content>
  `
})
export class VideoPage {
  private readonly videoUrls = inject(VideoUrlService);
  private readonly documentService = inject(DocumentService);
  private readonly folderService = inject(FolderService);
  private readonly toastController = inject(ToastController);
  private readonly appStore = inject(AppStore);
  protected readonly i18n = inject(I18nService).translateAll(VIDEO_PAGE_I18N_KEYS) as VideoPageI18n;

  // route input — withComponentInputBinding sets it to undefined when absent, hence the coalesce
  public docKey = input<string>();

  private readonly key = computed(() => (this.docKey() ?? '').trim());

  protected readonly videoResource = resource({
    params: () => ({ docKey: this.key() }),
    loader: ({ params }) => this.load(params.docKey)
  });

  protected readonly view = computed(() => this.videoResource.hasValue() ? this.videoResource.value() : undefined);
  protected readonly headerTitle = computed(() => this.view()?.title || this.i18n.title());

  /** Never throws: every failure is logged and becomes `undefined` (= not available). */
  private async load(docKey: string): Promise<VideoView | undefined> {
    if (!docKey) return undefined;
    let signed: SignedVideo | undefined;
    try {
      signed = await this.videoUrls.forPlayback(docKey);
    } catch (ex) {
      warn(`VideoPage: signing video ${docKey} for playback failed: ${ex}`);
      return undefined;
    }
    if (!signed) return undefined;   // not found, not permitted or archived — the callable does not say which

    const doc = await this.readDocument(docKey);
    if (doc?.isArchived === true) return undefined;
    const folderKey = doc?.folderKeys?.[0] ?? '';
    return {
      signed,
      title: doc?.title || doc?.altText || '',
      folderKey,
      folderName: await this.readFolderName(folderKey),
    };
  }

  /** Title and folder are decoration: a failed read keeps the player and falls back to defaults. */
  private async readDocument(docKey: string): Promise<DocumentModel | undefined> {
    try {
      return await firstValueFrom(this.documentService.read(docKey));
    } catch (ex) {
      warn(`VideoPage: reading document ${docKey} failed: ${ex}`);
      return undefined;
    }
  }

  private async readFolderName(folderKey: string): Promise<string> {
    if (!folderKey) return '';
    try {
      const folder = await firstValueFrom(this.folderService.read(folderKey));
      return folder?.title || folder?.name || '';
    } catch (ex) {
      warn(`VideoPage: reading folder ${folderKey} failed: ${ex}`);
      return '';
    }
  }

  /** The link is known synchronously: the clipboard write starts inside the click gesture. */
  protected async copyLink(): Promise<void> {
    await copyToClipboardWithConfirmation(this.toastController, videoLink(this.appStore.appOrigin(), this.key()), this.i18n.link_copied());
  }

  protected async download(url: string): Promise<void> {
    await downloadToBrowser(url);
  }
}
