import { AsyncPipe } from "@angular/common";
import { Component, input } from "@angular/core";
import { IonAvatar, IonChip, IonImg, IonLabel } from "@ionic/angular/standalone";

import { AvatarInfo } from "@bk2/shared/models";
import { FullNamePipe } from '@bk2/shared/pipes';

import { AvatarPipe } from '@bk2/avatar/ui';

@Component({
  selector: 'bk-avatar-display',
  imports: [
    AvatarPipe, AsyncPipe, FullNamePipe,
    IonAvatar, IonLabel, IonImg, IonChip
  ],
  styles: [`
    .avatar-container { display: flex; align-items: center; }
    .avatar-stack { display: flex; align-items: center; }
    ion-avatar { width: 30px; height: 30px; transition: transform 0.2s ease; }
    .stacked-avatar { margin-left: -8px; }
    .stacked-avatar:hover { transform: scale(1.2) translateY(-5px); }
    .single-avatar-name { margin-left: 12px; font-size: 16px; }
    ion-chip { background-color: var(--ion-color-light); color: var(--ion-color-primary); }
    `],
  template: `
    @if(avatars(); as avatars) {
      @switch(avatars.length) {
        @case(0) {
          <ion-label>??</ion-label>
        }
        @case(1) {
          @if(avatars[0].key && avatars[0].key.length > 0) {
            <ion-chip>
              <ion-avatar>
                <ion-img src="{{ avatars[0].modelType + '.' + avatars[0].key | avatar | async }}" alt="Avatar of person or org" />
              </ion-avatar>
              @if(showName()) {
                <ion-label><small>{{ avatars[0].name1 | fullName:avatars[0].name2 }}</small></ion-label>
              }
            </ion-chip>        
          } @else {
            <ion-label><small>{{ avatars[0].name1 | fullName:avatars[0].name2 }}</small></ion-label>
          }
        }
        @default {
          <div class="avatar-container">
            <div class="avatar-stack">
              @for(avatar of avatars; track $index) {
                @if(avatar.key && avatar.key.length > 0) {
                  <ion-avatar [class.stacked-avatar]="true" [style.zIndex]="avatars.length - $index">
                    <ion-img src="{{ avatar.modelType + '.' + avatar.key | avatar | async }}" alt="Avatar of person or org" />
                  </ion-avatar>
                } 
              }
            </div>
          </div>
        }
      }
    } @else {
      <ion-label>?</ion-label>
    }
  `
})
export class AvatarDisplayComponent {
  public avatars = input<AvatarInfo[]>([]);
  public showName = input(true);
}