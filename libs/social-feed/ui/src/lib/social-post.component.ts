import { Component, input } from "@angular/core";
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonIcon } from '@ionic/angular/standalone';

import { SocialPostModel } from "@bk2/shared-models";
import { SvgIconPipe } from "@bk2/shared-pipes";

@Component({
  selector: 'bk-social-post',
  standalone: true,
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