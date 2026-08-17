import { Component, computed, input } from "@angular/core";
import { IonAvatar, IonChip, IonImg, IonLabel, IonNote } from "@ionic/angular/standalone";

import { AvatarInfo } from "@okr/shared-models";
import { FullNamePipe } from '@okr/shared-pipes';
import { coerceBoolean } from "@okr/shared-util-core";

import { AvatarPipe } from './avatar.pipe';
import { getDefaultIcon } from "@okr/avatar-util";

@Component({
  selector: 'okr-avatar-display',
  standalone: true,
  imports: [
    AvatarPipe, FullNamePipe,
    IonAvatar, IonLabel, IonImg, IonChip, IonNote
  ],
  styles: [`
    .avatar-container { display: flex; align-items: center; }
    .avatar-stack { display: flex; align-items: center; }
    ion-avatar { width: 30px; height: 30px; transition: transform 0.2s ease; }
    .stacked-avatar { margin-left: -8px; }
    .stacked-avatar:hover { transform: scale(1.2) translateY(-5px); }
    .single-avatar-name { margin-left: 12px; font-size: 16px; }
    ion-chip { background-color: var(--ion-color-light); color: var(--ion-color-light-contrast); }
    .letter-avatar {
      background: var(--ion-color-medium);
      display: flex; align-items: center; justify-content: center;
      color: var(--ion-color-medium-contrast); font-size: 14px; font-weight: bold;
    }
    `],
  template: `
    @if(avatars(); as avatars) {
      @switch(avatars.length) {
        @case(0) {
          <ion-label>-</ion-label>
        }
        @case(1) {
          @if(avatars[0].key && avatars[0].key.length > 0) {
            @if(shouldShowName()) {
              <ion-chip color="light">
                <ion-avatar>
                  <ion-img src="{{ avatars[0].modelType + '.' + avatars[0].key | avatar:getDefaultIcon(avatars[0].modelType) }}" alt="Avatar of person or org" />
                </ion-avatar>
                  <ion-label><small>{{ avatars[0].name1 | fullName:avatars[0].name2 }}</small></ion-label>
              </ion-chip>   
            } @else {
              <ion-avatar>
                <ion-img src="{{ avatars[0].modelType + '.' + avatars[0].key | avatar:getDefaultIcon(avatars[0].modelType) }}" alt="Avatar of person or org" />
              </ion-avatar>
            }
          } @else {
            @if(shouldShowName()) {
              <ion-chip color="light">
                <ion-avatar class="letter-avatar">G</ion-avatar>
                <ion-label><small>{{ avatars[0].name1 | fullName:avatars[0].name2 }}</small></ion-label>
              </ion-chip>
            } @else {
              <ion-avatar class="letter-avatar">G</ion-avatar>
            }
          }
        }
        @default {
          <div class="avatar-container">
            <div class="avatar-stack">
              @for(avatar of avatars.slice(0, maxAvatarsToShow()); track $index) {
                @if(avatar.key && avatar.key.length > 0) {
                  <ion-avatar [class.stacked-avatar]="true" [style.zIndex]="avatars.length - $index">
                    <ion-img src="{{ avatar.modelType + '.' + avatar.key | avatar:getDefaultIcon(avatar.modelType) }}" alt="Avatar of person or org" />
                  </ion-avatar>
                } @else {
                  <ion-avatar class="letter-avatar stacked-avatar" [style.zIndex]="avatars.length - $index">G</ion-avatar>
                }
              }
              @if(avatars.length > maxAvatarsToShow()) {
                <ion-note>+{{ avatars.length - maxAvatarsToShow() }}</ion-note>
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
export class AvatarDisplay {
  public avatars = input<AvatarInfo[]>([]);
  public showName = input(true);
  public maxAvatarsToShow = input(5);
  protected shouldShowName = computed(() => coerceBoolean(this.showName()));

  protected getDefaultIcon(modelType: string): string {
    return getDefaultIcon(modelType);
  }
}