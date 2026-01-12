import { Component, computed, input } from '@angular/core';
import { IonIcon, IonAvatar, IonImg, IonItem, IonLabel } from '@ionic/angular/standalone';

import { SvgIconPipe } from '@bk2/shared-pipes';
import { extractFirstPartOfOptionalTupel } from '@bk2/shared-util-core';

import { AvatarPipe } from '@bk2/avatar-ui';
import { AsyncPipe } from '@angular/common';
import { TranslatePipe } from '@bk2/shared-i18n';

@Component({
  selector: 'bk-multi-avatar',
  standalone: true,
  imports: [
    SvgIconPipe, AvatarPipe, AsyncPipe, TranslatePipe,
    IonIcon, IonAvatar, IonImg, IonItem, IonLabel
],
  styles: [`
    ion-icon { color: var(--ion-color-dark); }
    .letter { color: black; }
    @media (prefers-color-scheme: dark) {
      ion-icon { color: var(--ion-color-white); }
      .letter { color: white; }
    }
    .letter-avatar {
      background: var(--ion-color-light);
      .letter {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 15px;
        font-weight: bold;
      }    
    }
`],
  template: `
    @if(icon(); as icon) {
      @if(name(); as name) {
        @if (icon.startsWith('@@')) {  <!-- textual avatar, shows 1 letter -->
          <ion-item>
            <ion-avatar slot="start" class="letter-avatar">
              <div class="letter">{{ name }}</div>
            </ion-avatar> 
            <ion-label>{{ label() | translate | async }}</ion-label>
          </ion-item>
        } @else {         <!-- real avatar, showing an image from avatar collection or a default icon -->
          @if(icon.startsWith('//')) {
            <ion-item>
              <ion-avatar slot="start" [style.background-color]="'var(--ion-color-light)'">
                <ion-img src="{{ name | avatar:getModelName(name) | async }}" alt="Avatar Logo" />
              </ion-avatar>
              <ion-label>{{ label() | translate | async }}</ion-label>
            </ion-item>
          }
        }
      } @else {       <!-- icon -->
        <ion-item>
          <ion-icon slot="start" src="{{icon | svgIcon }}" />
          <ion-label>{{ label() | translate | async }}</ion-label>
        </ion-item>
      }
    }
  `
})
export class MultiAvatarComponent {

  // inputs 
  public icon = input.required<string>();
  public label = input<string>();

  // derived signals
  protected name = computed(() => {
    const icon = this.icon();
    if (icon.startsWith('@@')) return icon.substring(2, 3); // only 1 char
    if (icon.startsWith('//')) return icon.substring(2);        // modeltype.key
    return undefined;
  });

  protected getModelName(key: string): string {
    return extractFirstPartOfOptionalTupel(key)
  }
}
