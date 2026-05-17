import { AsyncPipe } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { IonBadge, IonCardHeader, IonCardSubtitle, IonCardTitle } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';

@Component({
  selector: 'bk-optional-card-header',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    IonCardHeader, IonCardTitle, IonCardSubtitle, IonBadge
  ],
  styles: [`
  /* iOS places the subtitle above the title */
  ion-card-header { display: flex; flex-flow: column-reverse; padding-bottom: 0px; }
  .title-row { display: flex; align-items: center; justify-content: space-between; }
`],
  template: `
    @if(doShowHeader()) {
      <ion-card-header>
        @if(title()) {
          <div class="title-row">
            <ion-card-title>{{ title() | translate | async }}</ion-card-title>
            @if((count() ?? 0) > 0) {
              @let c = count()!;
              <ion-badge color="danger">{{ c > 99 ? '99+' : c }}</ion-badge>
            }
          </div>
        }
        @if(subTitle()) {
          <ion-card-subtitle>{{ subTitle() | translate | async }} </ion-card-subtitle>
        }
      </ion-card-header>
    }
  `
})
export class OptionalCardHeader {
  public title = input<string | undefined>();
  public subTitle = input<string | undefined>();
  public count = input<number | undefined>();

  protected doShowHeader = computed(() => !!this.title() || !!this.subTitle());
}
