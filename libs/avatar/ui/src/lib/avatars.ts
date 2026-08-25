import { Component, computed, inject, input, model, output, viewChild } from '@angular/core';
import { IonAvatar, IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonIcon, IonImg, IonInput, IonItem, IonLabel, IonList, IonReorder, IonReorderGroup, IonRow, ItemReorderEventDetail, ToastController } from '@ionic/angular/standalone';

import { NAME_LENGTH } from '@okr/shared-constants';

import { AvatarInfo, UserModel } from '@okr/shared-models';
import { I18nService } from '@okr/shared-i18n';
import { SvgIconPipe } from '@okr/shared-pipes';
import { AlertService, copyToClipboardWithConfirmation } from '@okr/shared-util-angular';
import { coerceBoolean, getAvatarName } from '@okr/shared-util-core';

import { getDefaultIcon } from '@okr/avatar-util';

import { AvatarDisplay } from './avatar-display';
import { AvatarPipe } from './avatar.pipe';

/**
 * Vest updates work by binding to ngModel.
 * In this component, we can not use ngModel to bind the avatars to the model, because the avatars are stored as an array.
 * That is why we notify the parent component about the changes.
 */

@Component({
  selector: 'okr-avatars',
  standalone: true,
  imports: [
    SvgIconPipe, AvatarPipe,
    AvatarDisplay,
    IonList, IonItem, IonLabel, IonIcon, IonReorderGroup, IonReorder, IonCard, IonCardHeader, IonCardContent, IonCardTitle, IonButton, IonAvatar, IonImg,
    IonGrid, IonRow, IonCol
],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px;} }
    .title { font-size: 1.25rem; font-weight: 500; margin-left: 0;}
    /* sectionStyle: the card heading reads like a form section ('WER'), not like a card title */
    .section-title { display: flex; align-items: center; gap: 8px; }
    .section-title .text {
      font-size: 12px;
      font-weight: 500;
      letter-spacing: 0.09em;
      text-transform: uppercase;
      color: var(--ion-color-medium, #6d7683);
    }
    .section-title ion-icon { font-size: 16px; color: var(--ion-color-medium, #6d7683); }
    .add-label { --padding-start: 8px; --padding-end: 8px; font-size: 13px; }
    ion-card-header { padding: 0; }
    ion-avatar { width: 30px; height: 30px; }
    .add-icon { font-size: 32px; }
  `],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>
          @if(showsButton()) {
            <!-- label left / control right, the same 6-6 split the sibling fields use -->
            <ion-grid class="ion-no-padding">
              <ion-row>
                <ion-col size="6">
                  <ion-item lines="none">
                    <ion-label>{{ label() }}</ion-label>
                  </ion-item>
                </ion-col>
                <ion-col size="6">
                  <ion-item lines="none">
                    @if(!isReadOnly()) {
                      <ion-button (click)="selectClicked.emit()">
                        <ion-icon slot="start" src="{{ selectIcon() | svgIcon }}" />
                        {{ cardTitle() }}
                      </ion-button>
                    }
                  </ion-item>
                </ion-col>
              </ion-row>
            </ion-grid>
          } @else {
            <ion-item lines="none" no-padding>
              @if(isSectionStyle()) {
                <div class="section-title">
                  @if(titleIcon().length > 0) {
                    <ion-icon src="{{ titleIcon() | svgIcon }}" />
                  }
                  <span class="text">{{ cardTitle() }}</span>
                </div>
              } @else {
                <div class="title">{{ cardTitle() }}</div>
              }
              @if(!isReadOnly()) {
                @if(addLabel().length > 0) {
                  <!-- same slot as the round '+', but labelled ('+ Person') -->
                  <ion-button class="add-label" slot="end" fill="clear" color="secondary" size="small" (click)="selectClicked.emit()">
                    <ion-icon slot="start" src="{{'add' | svgIcon }}" />
                    {{ addLabel() }}
                  </ion-button>
                } @else {
                  <ion-button slot="end" fill="clear" (click)="selectClicked.emit()" size="large">
                    <ion-icon class="add-icon" color="secondary" slot="icon-only" src="{{'add-circle' | svgIcon }}" />
                  </ion-button>
                }
              }
            </ion-item>
          }
        </ion-card-title>
      </ion-card-header>
      <ion-card-content class="ion-no-padding">
        @if((description() ?? '').length > 0) {
          <ion-item lines="none">
            <ion-label>{{ description() }}</ion-label>
          </ion-item>
        }
        @if(isReadOnly()) {
          <ion-item lines="none">
            <okr-avatar-display [avatars]="avatars()" [showName]="false" />
          </ion-item>
        } @else {
          @if(avatars(); as avatars) {
            <ion-list>
              <!-- Casting $event to $any is a temporary fix for this bug https://github.com/ionic-team/ionic-framework/issues/24245 -->
              <ion-reorder-group  [disabled]=false (ionItemReorder)="reorder($any($event))">
                @for(avatar of avatars; track $index) {
                  <ion-item>
                    <ion-reorder slot="start" />
                    <ion-avatar slot="start">
                      <ion-img src="{{ avatar.modelType + '.' + avatar.key | avatar:getDefaultIcon(avatar.modelType) }}" alt="Avatar" />
                    </ion-avatar>
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
  // own @avatar/ui scope (replacing the legacy global @input.avatar.* keys)
  private readonly avatarsI18n = inject(I18nService).translateAll({
    title: '@avatar/ui.avatars.title',
    edit:  '@avatar/ui.avatars.edit',
  });

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
  /** true: the header is a field label + a select button (labelled with `title`), not title + '+' icon. */
  public showButton = input(false);
  /** Field label shown left of that button (showButton only). */
  public label = input('');
  /** Icon of that select button. */
  public selectIcon = input('person');
  /** true: render the card heading as a small uppercase section label instead of a card title. */
  public sectionStyle = input(false);
  /** Icon shown left of that section label (sectionStyle only). */
  public titleIcon = input('');
  /** non-empty: the round '+' becomes a labelled button in the same place (e.g. '+ Person'). */
  public addLabel = input('');

  // coerced boolean inputs
  protected isCopyable = computed(() => coerceBoolean(this.copyable()));
  protected isEditable = computed(() => coerceBoolean(this.editable()));
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected showsButton = computed(() => coerceBoolean(this.showButton()));
  protected isSectionStyle = computed(() => coerceBoolean(this.sectionStyle()));

  // view children
  public stringInput = viewChild<IonInput>('stringInput');

  // outputs
  public selectClicked = output<void>();

  // computed labels
  protected cardTitle = computed(() => this.title() || this.avatarsI18n.title());

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
    const changedName = await this.alertService.okrPrompt(this.avatarsI18n.edit(), '', this.getAvatarName(avatar));
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

  protected getDefaultIcon(modelType: string): string {
    return getDefaultIcon(modelType);
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

