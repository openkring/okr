import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, model, output, viewChild } from '@angular/core';
import { AlertController, IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonIcon, IonInput, IonItem, IonLabel, IonList, IonNote, IonReorder, IonReorderGroup, ItemReorderEventDetail, ToastController } from '@ionic/angular/standalone';

import { NAME_LENGTH } from '@bk2/shared-constants';
import { TranslatePipe } from '@bk2/shared-i18n';
import { AvatarInfo } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { bkPrompt, copyToClipboardWithConfirmation } from '@bk2/shared-util-angular';
import { coerceBoolean, getFullPersonName, newAvatarInfo } from '@bk2/shared-util-core';

import { AvatarDisplayComponent } from './avatar-display.component';

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
    AvatarDisplayComponent,
    IonList, IonItem,
    IonLabel, IonInput, IonIcon, IonNote,
    IonReorderGroup, IonReorder,
    IonCard, IonCardHeader, IonCardContent, IonCardTitle, IonButton
  ],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ title() | translate | async }}</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        @if((description() ?? '').length > 0) {
          <ion-item lines="none">
            <ion-note>{{ description() | translate | async }}</ion-note>
          </ion-item>
        }
        @if(isReadOnly()) {
          <ion-item lines="none">
            <bk-avatar-display [avatars]="avatars()" [defaultIcon]="defaultIcon()" [showName]="false" />
          </ion-item>
        } @else {
          <ion-item lines="none">
            <!-- we deliberately use ion-input here, because we do not want to interfere with the vest from update of avatars() -->
            <ion-input [value]="''" (ionChange)="save($event)" #stringInput
                label="{{ addLabel() | translate | async }}"
                labelPlacement="floating"
                inputMode="text"
                type="text"
                [counter]="true"
                [maxlength]="maxLength()"
                placeholder="ssssss"
                />
            <ion-button slot="end" fill="clear" (click)="selectClicked.emit()">{{ '@general.operation.select.subject' | translate | async }}</ion-button>
          </ion-item>

          @if(avatars(); as avatars) {
            <ion-list>
              <!-- Casting $event to $any is a temporary fix for this bug https://github.com/ionic-team/ionic-framework/issues/24245 -->
              <ion-reorder-group  [disabled]=false (ionItemReorder)="reorder($any($event))">
                @for(avatar of avatars; track $index) {
                  <ion-item>
                    <ion-reorder slot="start" />
                    <ion-label>{{ getNameFromAvatar(avatar) }}</ion-label>
                    <ion-icon src="{{'close_cancel_circle' | svgIcon }}" (click)="remove($index)" slot="end" />
                    @if (isCopyable()) {
                      <ion-icon slot="end" src="{{'copy' | svgIcon }}" (click)="copy(avatar)" />
                    }
                    @if (isEditable()) {
                      <ion-icon slot="end" src="{{'create_edit' | svgIcon }}" (click)="edit(avatar, $index)" />
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
export class AvatarsComponent {
  private readonly toastController = inject(ToastController);
  private readonly alertController = inject(AlertController);

  public avatars = model.required<AvatarInfo[]>(); // the keys of the menu items
  public name = input('avatars'); // the name of the menu
  public copyable = input(false);
  protected isCopyable = computed(() => coerceBoolean(this.copyable()));
  public editable = input(false);
  protected isEditable = computed(() => coerceBoolean(this.editable()));
  public readOnly = input.required<boolean>();
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  public description = input<string>();
  public maxLength = input(NAME_LENGTH);
  public defaultIcon = input('other');

  public changed = output<AvatarInfo[]>();
  public stringInput = viewChild<IonInput>('stringInput');
  public selectClicked = output<void>();

  protected title = computed(() => `@input.${this.name()}.label`);
  protected addLabel = computed(() => `@input.${this.name()}.addString`);

  public save($event: CustomEvent): void {
    const _name = $event?.detail?.value as string;
    this.resetInput();
    if (_name && _name.length > 0) {    // we have a valid name, either of one or two parts
      const _avatars = this.avatars();
      _avatars.push(this.getAvatarFromName(_name));
      this.updateAvatars(_avatars);
    }
  }

  private resetInput(): void {
    const _input = this.stringInput();
    if (_input) {
      _input.value = '';
    }
  }

  public remove(index: number): void {
    const _avatars = this.avatars();
    _avatars.splice(index, 1);
    this.updateAvatars(_avatars);
  }

  public async copy(avatar: AvatarInfo, confirmation?: string): Promise<void> {
    await copyToClipboardWithConfirmation(this.toastController, getFullPersonName(avatar.name1, avatar.name2), confirmation);
  }

  public async edit(avatar: AvatarInfo, index: number): Promise<void> {
    const _changedName = await bkPrompt(this.alertController, '@input.avatars.edit', getFullPersonName(avatar.name1, avatar.name2));
    if (_changedName) {
      const _avatars = this.avatars();
      _avatars[index] = this.getAvatarFromName(_changedName);
      this.updateAvatars(_avatars);
    }
  }

  private updateAvatars(avatars: AvatarInfo[]): void {
    this.avatars.set(avatars); // converts array back into a comma-separated string
    this.changed.emit(avatars); // notify the parent component about the change
  }

  private getAvatarFromName(name: string): AvatarInfo {
    if (name.includes(' ')) {
      const _nameParts = name.split(' ');
      return newAvatarInfo(_nameParts[0], _nameParts[1]);  
    } else {
      return newAvatarInfo('', name);
    }
  }

  protected getNameFromAvatar(avatar: AvatarInfo): string {
    return getFullPersonName(avatar.name1, avatar.name2);
  }

  /**
   * Finish the reorder and position the item in the DOM based on where the gesture ended.
   * @param ev the custom dom event with the reordered items
   */
  reorder(ev: CustomEvent<ItemReorderEventDetail>) {
    this.updateAvatars(ev.detail.complete(this.avatars()));
  }
}

