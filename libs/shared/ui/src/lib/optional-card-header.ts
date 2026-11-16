import { Component, computed, input, output } from '@angular/core';
import { IonBadge, IonButton, IonCardHeader, IonCardSubtitle, IonCardTitle, IonIcon } from '@ionic/angular';

import { SvgIconPipe } from '@okr/shared-pipes';

@Component({
  selector: 'okr-optional-card-header',
  standalone: true,
  imports: [
    SvgIconPipe,
    IonCardHeader, IonCardTitle, IonCardSubtitle, IonBadge, IonButton, IonIcon
  ],
  styles: [`
  /* iOS places the subtitle above the title */
  ion-card-header { display: flex; flex-flow: column-reverse; padding-bottom: 0px; }
  .title-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .title-row ion-card-title { flex: 1; }
  /* the info button must not inflate the header row: strip Ionic's default button box */
  .title-row ion-button { --padding-start: 4px; --padding-end: 4px; margin: 0; height: 28px; }
  .title-row ion-button ion-icon { font-size: 20px; }
  /* Ionic defaults ion-card-title to 1.75rem in iOS mode vs 1.25rem in md;
     pin it so section titles are the same size on real iPhones and elsewhere. */
  ion-card-title { font-size: 1.25rem; font-weight: 600; }
  /* the intro: above the title a small uppercase line (Überzeile), below title and subtitle a short paragraph */
  .intro-above { margin: 0; padding: 16px 16px 0 16px; font-size: 0.8rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ion-color-secondary); }
  .intro-above + ion-card-header { padding-top: 4px; }
  .intro-below { margin: 0; padding: 8px 16px 0 16px; opacity: 0.8; white-space: pre-line; }
`],
  template: `
    @if(introText() && introPosition() === 'above') {
      <p class="intro-above">{{ introText() }}</p>
    }
    @if(doShowHeader()) {
      <ion-card-header>
        @if(title()) {
          <div class="title-row">
            <ion-card-title>{{ title() }}</ion-card-title>
            @if((count() ?? 0) > 0) {
              @let c = count()!;
              <ion-badge color="danger">{{ c > 99 ? '99+' : c }}</ion-badge>
            }
            @if(showInfoButton()) {
              <ion-button fill="clear" size="small" color="medium" [title]="infoLabel()" (click)="infoClicked.emit()">
                <ion-icon slot="icon-only" src="{{'info-circle' | svgIcon }}" />
              </ion-button>
            }
          </div>
        }
        @if(subTitle()) {
          <ion-card-subtitle>{{ subTitle() }} </ion-card-subtitle>
        }
      </ion-card-header>
    }
    @if(introText() && introPosition() !== 'above') {
      <p class="intro-below">{{ introText() }}</p>
    }
  `
})
export class OptionalCardHeader {
  public title = input<string | undefined>();
  public subTitle = input<string | undefined>();
  public count = input<number | undefined>();
  /** the section's intro: a small line above the title, or (default) a short paragraph under title and subtitle */
  public intro = input<string | undefined>();
  public introPosition = input<'above' | 'below' | undefined>();
  /** Renders an (i) button next to the title; the host decides what it opens. */
  public showInfoButton = input<boolean>(false);
  public infoLabel = input<string>('');

  // outputs
  public infoClicked = output<void>();

  protected introText = computed(() => this.intro()?.trim() ?? '');
  protected doShowHeader = computed(() => !!this.title() || !!this.subTitle());
}
