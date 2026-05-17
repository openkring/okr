import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, model, output, viewChild } from '@angular/core';
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonIcon, IonInput, IonItem, IonLabel, IonList, IonReorder, IonReorderGroup, ItemReorderEventDetail, ToastController } from '@ionic/angular/standalone';

import { NAME_LENGTH } from '@bk2/shared-constants';
import { TranslatePipe } from '@bk2/shared-i18n';
import { AvatarInfo, UserModel } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { AlertService, copyToClipboardWithConfirmation } from '@bk2/shared-util-angular';
import { coerceBoolean, getAvatarName } from '@bk2/shared-util-core';

import { AvatarDisplay } from './avatar-display';

/**
 * Vest updates work by binding to ngModel.
 * In this component, we can not use ngModel to bind the avatars to the model, because the avatars are stored as an array.
 * That is why we notify the parent component about the changes.
 */

@Component({
  selector: 'bk-avatars',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe,
    AvatarDisplay,
    IonList, IonItem, IonLabel, IonIcon, IonReorderGroup, IonReorder, IonCard, IonCardHeader, IonCardContent, IonCardTitle, IonButton
],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px;} }
    .title { font-size: 1.25rem; font-weight: 500; margin-left: 0;}
    ion-card-header { padding: 0; }
  `],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>
          <ion-item lines="none" no-padding>
            <div class="title">{{ cardTitle() | translate | async }}</div>
            @if(!isReadOnly()) {
                <ion-button slot="end" fill="clear" (click)="selectClicked.emit()" size="default">
                  <ion-icon color="secondary" slot="icon-only" src="{{'add-circle' | svgIcon }}" />
                </ion-button>
            }
          </ion-item>
        </ion-card-title>
      </ion-card-header>
      <ion-card-content class="ion-no-padding">
        @if((description() ?? '').length > 0) {
          <ion-item lines="none">
            <ion-label>{{ description() | translate | async }}</ion-label>
          </ion-item>
        }
        @if(isReadOnly()) {
          <ion-item lines="none">
            <bk-avatar-display [avatars]="avatars()" [showName]="false" />
          </ion-item>
        } @else {
          @if(avatars(); as avatars) {
            <ion-list>
              <!-- Casting $event to $any is a temporary fix for this bug https://github.com/ionic-team/ionic-framework/issues/24245 -->
              <ion-reorder-group  [disabled]=false (ionItemReorder)="reorder($any($event))">
                @for(avatar of avatars; track $index) {
                  <ion-item>
                    <ion-reorder slot="start" />
                    <ion-label>{{ getAvatarName(avatar) }}</ion-label>
                    <ion-icon src="{{'cancel' | svgIcon }}" (click)="remove($index)" slot="end" />
                    @if (isCopyable()) {
                      <ion-icon slot="end" src="{{'copy' | svgIcon }}" (click)="copy(avatar)" />
                    }
                    @if (isEditable()) {
                      <ion-icon slot="end" src="{{'edit' | svgIcon }}" (click)="edit(avatar, $index)" />
                    }
                  </ion-item>
                }
              </ion-reorder-group>
            </ion-list>
          }
        }
      </ion-card-content>
    </ion-card>
  `
})
export class Avatars {
  private readonly toastController = inject(ToastController);
  private readonly alertService = inject(AlertService);

  // inputs
  public avatars = model.required<AvatarInfo[]>(); // the keys of the menu items
  public title = input<string>();
  public currentUser = input.required<UserModel>();
  public name = input('avatar'); // the name of the menu
  public copyable = input(false);
  public editable = input(false);
  public readOnly = input.required<boolean>();
  public description = input<string>();
  public maxLength = input(NAME_LENGTH);

  // coerced boolean inputs
  protected isCopyable = computed(() => coerceBoolean(this.copyable()));
  protected isEditable = computed(() => coerceBoolean(this.editable()));
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // view children
  public stringInput = viewChild<IonInput>('stringInput');

  // outputs
  public selectClicked = output<void>();

  // computed labels
  protected cardTitle = computed(() => this.title() || `@input.${this.name()}.label`);

  public add(newAvatar: AvatarInfo): void {
    this.avatars.update(arr => [...arr, newAvatar])
  }

  public remove(index: number): void {
    // do not use set here, because the set on an array would not be signalled to the parent component
    this.avatars.update(arr => arr.filter((_, i) => i !== index));
  }

  public async copy(avatar: AvatarInfo, confirmation?: string): Promise<void> {
    await copyToClipboardWithConfirmation(this.toastController, this.getAvatarName(avatar), confirmation);
  }

  public async edit(avatar: AvatarInfo, index: number): Promise<void> {
    const changedName = await this.alertService.bkPrompt('@input.avatar.edit', '', this.getAvatarName(avatar));
    if (changedName) {
      // do not use set here, because the set on an array would not be signalled to the parent component
      this.avatars.update(arr => {  
        const newArr = [...arr];                    // new reference
        newArr[index] = this.updateAvatarName(newArr[index], changedName);
        return newArr;
      });
    }
  }

  private updateAvatarName(oldAvatar: AvatarInfo, name: string): AvatarInfo {
    if (name.includes(' ')) {
      const nameParts = name.split(' ');
      oldAvatar.name1 = nameParts[0];
      oldAvatar.name2 = nameParts[1];
    } else {
      oldAvatar.name1 = '';
      oldAvatar.name2 = name;
    }
    return oldAvatar;
  }

  protected getAvatarName(avatar: AvatarInfo): string {
    return getAvatarName(avatar, this.currentUser()?.nameDisplay);
  }

  /**
   * Finish the reorder and position the item in the DOM based on where the gesture ended.
   * @param ev the custom dom event with the reordered items
   */
  reorder(ev: CustomEvent<ItemReorderEventDetail>) {
    // this works with set, because ev.detail.complete always returns a new array reference
    this.avatars.set(ev.detail.complete(this.avatars()));
  }
}

