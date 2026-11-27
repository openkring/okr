import { Component, computed, effect, inject, input, untracked } from '@angular/core';
import { AppStore } from '@okr/shared-feature';
import { DomSanitizer } from '@angular/platform-browser';
import { IonCard, IonCardContent, ModalController } from '@ionic/angular';

import { VideoSection } from '@okr/shared-models';
import { OptionalCardHeader, showVideoView, Spinner, VideoCard } from '@okr/shared-ui';
import { getSafeEmbedUrl, warn } from '@okr/shared-util-core';
import { I18nService } from '@okr/shared-i18n';
import { videoLink } from '@okr/content-document-util';
import { VideoUrlService } from '@okr/content-document-data-access';
import { SECTION_I18N_KEYS, videoAspectRatioCss, YOUTUBE_EMBED_BASE } from '@okr/cms-section-util';

/**
 * A section that plays a video: the YouTube or Vimeo player (`baseUrl` + `url`), or an album video as a card (`documentKey`).
 * The player fills the width; its height follows `aspectRatio` (16:9 when absent).
 * See: https://developers.google.com/youtube/player_parameters
 */
@Component({
  selector: 'okr-video-section',
  standalone: true,
  imports: [
    Spinner, OptionalCardHeader, VideoCard,
    IonCard, IonCardContent,
  ],
  styles: [`
  ion-card-content { padding: 0px; }
  ion-card { padding: 0px; margin: 0px; border: 0px; box-shadow: none !important;}
  iframe { display: block; width: 100%; height: auto; margin: 0 auto; border: 0; }
  `],
  template: `
    @if(section(); as section) {
      <ion-card>
        <okr-optional-card-header [intro]="section.intro" [introPosition]="section.introPosition"  [title]="title()" [subTitle]="subTitle()" />
        <ion-card-content>
          @if (documentKey(); as key) {
            <okr-video-card [posterUrl]="poster()" [available]="available()" [loading]="loading()"
              [unavailableLabel]="i18n.album_video_unavailable()" [title]="title()" (clicked)="onPlay(key)" />
          } @else {
          <iframe
            [style.aspect-ratio]="aspectRatio()"
            [style.max-width]="maxWidth()"
            [src]="videoUrl()"
            [attr.title]="title() || null"
            allow="encrypted-media; picture-in-picture; fullscreen"
            referrerpolicy="strict-origin-when-cross-origin"
            allowfullscreen>
          </iframe>
          }
        </ion-card-content>
      </ion-card>
    } @else {
      <okr-spinner />
    }
  `
})
export class VideoSectionComponent {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly modalController = inject(ModalController);
  private readonly videoUrls = inject(VideoUrlService);
  private readonly appStore = inject(AppStore);
  protected readonly i18n = inject(I18nService).translateAll(SECTION_I18N_KEYS);

  constructor() {
    // sign once per key change; the service keeps the result in its signals
    effect(() => {
      const key = this.documentKey();
      if (!key) return;
      untracked(() => {
        this.videoUrls.ensure([key]).catch((ex) => warn(`VideoSection: signing video failed: ${ex}`));
      });
    });
  }

  // inputs
  public section = input.required<VideoSection>();

  // derived
  protected url = computed(() => this.section().properties?.url ?? '');
  protected baseUrl = computed(() => this.section().properties?.baseUrl ?? YOUTUBE_EMBED_BASE);
  protected aspectRatio = computed(() => videoAspectRatioCss(this.section().properties?.aspectRatio));
  /** a tall video is never higher than 80% of the window: it is then narrower and centred */
  protected maxWidth = computed(() => `calc(80vh * ${this.aspectRatio()})`);
  /** album source (spec 1.82); empty/legacy → the YouTube iframe */
  protected documentKey = computed(() => this.section().properties?.documentKey ?? '');
  protected signedVideo = computed(() => this.videoUrls.signed()[this.documentKey()]);
  protected poster = computed(() => this.signedVideo()?.posterUrl ?? '');
  protected loading = computed(() => !this.signedVideo() && !this.videoUrls.settled().has(this.documentKey()));
  protected available = computed(() => !!this.signedVideo());

  protected async onPlay(key: string): Promise<void> {
    let signed;
    try {
      signed = await this.videoUrls.forPlayback(key);
    } catch (ex) {
      warn(`VideoSection: signing video for playback failed: ${ex}`);
    }
    if (!signed) return;
    const labels = {
      title: this.title() || this.i18n.album_video_title(),
      download: this.i18n.album_video_download(),
      close: this.i18n.album_video_close(),
      error: this.i18n.album_video_error(),
      copyLink: this.i18n.album_video_copy_link(),
      linkCopied: this.i18n.album_video_link_copied()
    };
    await showVideoView(this.modalController, { playUrl: signed.playback.url }, signed.downloadUrl ?? '', labels,
      videoLink(this.appStore.appOrigin(), key));
  }
    // autoplay=1 starts the video automatically
  protected readonly title = computed(() => this.section()?.title);
  protected readonly subTitle = computed(() => this.section()?.subTitle);  

  // Validate the (editor-supplied) baseUrl + url against the embed host
  // allowlist before trusting it (H-3). An invalid URL renders an empty iframe.
  // a url stored whole (legacy) stands for itself
  protected videoUrl = computed(() => {
    const url = this.url();
    const safe = getSafeEmbedUrl(/^https:\/\//.test(url) ? url : this.baseUrl() + url);
    return safe ? this.sanitizer.bypassSecurityTrustResourceUrl(safe) : '';
  });
}