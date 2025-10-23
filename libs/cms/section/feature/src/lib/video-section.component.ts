import { Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { IonCard, IonCardContent } from '@ionic/angular/standalone';

import { SectionModel } from '@bk2/shared-models';
import { OptionalCardHeaderComponent, SpinnerComponent } from '@bk2/shared-ui';

/**
 * A section that displays a video using Google's youtube player.
 * See: https://developers.google.com/youtube/player_parameters 
 */
@Component({
  selector: 'bk-video-section',
  standalone: true,
  imports: [
    SpinnerComponent, OptionalCardHeaderComponent,
    IonCard, IonCardContent,
  ],
  styles: [`
  ion-card-content { padding: 0px; }
  ion-card { padding: 0px; margin: 0px; border: 0px; box-shadow: none !important;}
  iframe { aspect-ratio: 16/9; width: 100% !important;}
  `],
  template: `
    @if(section(); as section) {
      <ion-card>
        <bk-optional-card-header  [title]="title()" [subTitle]="subTitle()" />
        <ion-card-content>
          <iframe 
            id="ytplayer"
            type="text/html"
            [width]="width()"
            [height]="height()"
            [src]="videoUrl()"
            [attr.frameborder]="frameborder()"
            allowfullscreen>
          </iframe>
        </ion-card-content>
      </ion-card>
    } @else {
      <bk-spinner />
    }
  `
})
export class VideoSectionComponent {
  private readonly sanitizer = inject(DomSanitizer);
  public section = input.required<SectionModel>();

  protected url = computed(() => this.section().properties?.video?.url ?? '');
  protected width = computed(() => this.section().properties?.video?.width ?? '100%');
  protected height = computed(() => this.section().properties?.video?.height ?? 'auto');
  protected frameborder = computed(() => this.section().properties?.video?.frameborder ?? '0');
  protected baseUrl = computed(() => this.section().properties?.video?.baseUrl ?? 'https://www.youtube.com/embed/');
    // autoplay=1 starts the video automatically
  protected readonly title = computed(() => this.section()?.title);
  protected readonly subTitle = computed(() => this.section()?.subTitle);  

  protected videoUrl = computed(() => this.sanitizer.bypassSecurityTrustResourceUrl(this.baseUrl() + this.url()));
}