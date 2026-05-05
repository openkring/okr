import { Component, computed, input } from '@angular/core';
import { IonBadge, IonIcon, IonAvatar, IonImg, IonItem, IonLabel } from '@ionic/angular/standalone';

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
    IonBadge, IonIcon, IonAvatar, IonImg, IonItem, IonLabel
  ],
  styles: [`
    ion-item::part(native) {
      transition: background-color 0.2s ease;
    }

    ion-item:hover::part(native) {
      background: rgba(0, 0, 0, 0.08);
    }

    ion-icon { color: var(--ion-color-dark); }
    .letter { color: black; }

    @media (prefers-color-scheme: dark) {
      ion-item:hover::part(native) {
        background: rgba(255, 255, 255, 0.12);
      }

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
        @if (icon.startsWith('@@')) {
          <ion-item [button]="true">
            <ion-avatar slot="start" class="letter-avatar">
              <div class="letter">{{ name }}</div>
            </ion-avatar>
            <ion-label>{{ label() | translate | async }}</ion-label>
            @if(badge() > 0) {
              <ion-badge slot="end" color="danger">{{ badge() }}</ion-badge>
            }
          </ion-item>
        } @else {
          @if(icon.startsWith('//')) {
            <ion-item [button]="true">
              <ion-avatar slot="start" [style.background-color]="'var(--ion-color-light)'">
                <ion-img src="{{ name | avatar:getModelName(name) }}" alt="Avatar Logo" />
              </ion-avatar>
              <ion-label>{{ label() | translate | async }}</ion-label>
              @if(badge() > 0) {
                <ion-badge slot="end" color="danger">{{ badge() }}</ion-badge>
              }
            </ion-item>
          }
        }
      } @else {
        <ion-item [button]="true">
          <ion-icon slot="start" src="{{icon | svgIcon }}" />
          <ion-label>{{ label() | translate | async }}</ion-label>
          @if(badge() > 0) {
            <ion-badge slot="end" color="danger">{{ badge() }}</ion-badge>
          }
        </ion-item>
      }
    }
  `
})
export class MultiAvatarComponent {
  public icon = input.required<string>();
  public label = input<string>();
  public badge = input<number>(0);

  protected name = computed(() => {
    const icon = this.icon();
    if (icon.startsWith('@@')) return icon.substring(2, 3);
    if (icon.startsWith('//')) return icon.substring(2);
    return undefined;
  });

  protected getModelName(key: string): string {
    return extractFirstPartOfOptionalTupel(key);
  }
}
