import { Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { IonCard, IonCardContent } from '@ionic/angular/standalone';

import { SectionModel } from '@bk2/shared-models';
import { OptionalCardHeaderComponent, SpinnerComponent } from '@bk2/shared-ui';

@Component({
  selector: 'bk-iframe-section',
  standalone: true,
  imports: [
    SpinnerComponent, OptionalCardHeaderComponent,
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
          <iframe [src]="url()" [style]="style()" [title]="title()" allow="autoplay;fullscreen" allowfullscreen frameborder="0"></iframe>
        </ion-card-content>
      </ion-card>

    } @else {
      <bk-spinner />
    }
  `
})
export class IframeSectionComponent {
  private readonly sanitizer = inject(DomSanitizer);

  public section = input<SectionModel>();

  public style = computed(() => this.section()?.properties?.iframe?.style ?? 'width:100%; min-height:400px; border:none;');
  public title = computed(() => this.section()?.title ?? '');
  protected subTitle = computed(() => this.section()?.subTitle);
  protected url = computed(() => this.sanitizer.bypassSecurityTrustResourceUrl(this.section()?.properties?.iframe?.url ?? ''));
}

