import { Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { IonCard, IonCardContent } from '@ionic/angular';

import { IframeSection } from '@okr/shared-models';
import { OptionalCardHeader, Spinner } from '@okr/shared-ui';
import { getSafeEmbedUrl } from '@okr/shared-util-core';
import { iframeHeightCss } from '@okr/cms-section-util';

@Component({
  selector: 'okr-iframe-section',
  standalone: true,
  imports: [
    Spinner, OptionalCardHeader,
    IonCard, IonCardContent
  ],
  styles: [`
    ion-card-content { padding: 0px; }
    ion-card { padding: 0px; margin: 0px; border: 0px; box-shadow: none !important;}
    iframe { display: block; width: 100%; border: none; }
  `],
  template: `
    @if(section()) {
      <ion-card>
        <okr-optional-card-header [intro]="section()?.intro" [introPosition]="section()?.introPosition"  [title]="title()" [subTitle]="subTitle()" />
        <ion-card-content>
          <iframe
            [src]="url()"
            [style.height]="height()"
            [title]="title()"
            allow="autoplay;fullscreen"
            allowfullscreen
            frameborder="0">
          </iframe>
        </ion-card-content>
      </ion-card>

    } @else {
      <okr-spinner />
    }
  `
})
export class IframeSectionComponent {
  private readonly sanitizer = inject(DomSanitizer);

  public section = input<IframeSection>();

  /** the chosen height (S, M, L, full); a section stored before 2026-11-27 takes the one nearest to its free css */
  protected height = computed(() => iframeHeightCss(this.section()?.properties));
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

