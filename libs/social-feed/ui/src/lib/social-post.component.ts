import { Component, input } from "@angular/core";
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonIcon } from '@ionic/angular/standalone';

import { SvgIconPipe } from "@bk2/shared/pipes";
import { SocialPostModel } from "@bk2/shared/models";

@Component({
  selector: 'bk-social-post',
  imports: [
    IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonIcon,
    SvgIconPipe
  ],
  styles: `
  ion-card { margin: 10px; }
  `,
  template: `
    @let p = post();
    <ion-card>
      <img loading="lazy" [src]="p.image" [alt]="p.title" />
      <ion-card-header>
        <ion-card-title>{{ p.title }}</ion-card-title>
        <ion-card-subtitle>{{ p.subtitle }}</ion-card-subtitle>
      </ion-card-header>
      <ion-card-content>
        {{ p.content }}
        <div class="ion-margin-top">
          <ion-icon src="{{ 'heart' | svgIcon }}" />
          {{ p.likes }}
        </div>
      </ion-card-content>
    </ion-card>
  `,
})
export class SocialPostComponent {
  readonly post = input.required<SocialPostModel>();
}