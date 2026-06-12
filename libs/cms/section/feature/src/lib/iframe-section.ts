import { Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { IonCard, IonCardContent } from '@ionic/angular/standalone';

import { IframeSection } from '@bk2/shared-models';
import { OptionalCardHeader, Spinner } from '@bk2/shared-ui';
import { getSafeEmbedUrl } from '@bk2/shared-util-core';

@Component({
  selector: 'bk-iframe-section',
  standalone: true,
  imports: [
    Spinner, OptionalCardHeader,
    IonCard, IonCardContent
  ],
  styles: [`
    ion-card-content { padding: 0px; }
    ion-card { padding: 0px; margin: 0px; border: 0px; box-shadow: none !important;}
  `],
  template: `
    @if(section()) {
      <ion-card>
        <bk-optional-card-header  [title]="title()" [subTitle]="subTitle()" />
        <ion-card-content>
          <iframe
            [src]="url()"
            [style]="style()"
            [title]="title()"
            allow="autoplay;fullscreen"
            allowfullscreen
            frameborder="0">
          </iframe>
        </ion-card-content>
      </ion-card>

    } @else {
      <bk-spinner />
    }
  `
})
export class IframeSectionComponent {
  private readonly sanitizer = inject(DomSanitizer);

  public section = input<IframeSection>();

  public style = computed(() => this.section()?.properties?.style ?? 'width:100%; min-height:400px; border:none;');
  public title = computed(() => this.section()?.title ?? '');
  protected subTitle = computed(() => this.section()?.subTitle);
  // Only trust the editor-supplied URL after validating it against the embed
  // host allowlist (H-3) — otherwise a javascript:/data: or foreign-host URL
  // would be stored XSS. An invalid URL renders an empty iframe.
  protected url = computed(() => {
    const safe = getSafeEmbedUrl(this.section()?.properties?.url);
    return safe ? this.sanitizer.bypassSecurityTrustResourceUrl(safe) : '';
  });
}

