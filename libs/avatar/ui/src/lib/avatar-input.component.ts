import { AsyncPipe } from '@angular/common';
import { Component, computed, input, output, viewChild } from '@angular/core';
import { IonButton, IonInput, IonItem } from '@ionic/angular/standalone';

import { NAME_LENGTH } from '@bk2/shared-constants';
import { TranslatePipe } from '@bk2/shared-i18n';
import { AvatarInfo } from '@bk2/shared-models';
import { generateRandomString, newAvatarInfo } from '@bk2/shared-util-core';

/**
 * This component lets the user add an avatar for a person by entering a name string or by clicking the select button.
 * Either the entered AvatarInfo or the selectClicked event is emitted to the parent component.
 * Vest updates work by binding to ngModel.
 * In this component, we can not use ngModel to bind the avatars to the model, because the avatars are stored as an array.
 * That is why we notify the parent component about the changes.
 */

@Component({
  selector: 'bk-avatar-input',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    IonItem, IonInput, IonButton
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    <ion-item lines="none">
        <!-- we deliberately use ion-input here, because we do not want to interfere with the vest from update of avatars() -->
        <ion-input [value]="''" (ionChange)="add($event)" #stringInput
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
  `
})
export class AvatarInputComponent {
  // inputs
  public name = input('avatar'); 
  public maxLength = input(NAME_LENGTH);

  // view children
  public stringInput = viewChild<IonInput>('stringInput');

  // outputs
  public avatarAdded = output<AvatarInfo>();
  public selectClicked = output<void>();

  // computed labels
  protected addLabel = computed(() => `@input.${this.name()}.addString`);


  public add($event: CustomEvent): void {
    const name = $event?.detail?.value?.trim() as string;
    this.resetInput();
    if (name && name.length > 0) {    // we have a valid name, either of one or two parts
      // do not use set here, because the set on an array would not be signalled to the parent component
      let newAvatar = newAvatarInfo(`person.${generateRandomString(10)}`, '', '', 'person', '', '', name);
      newAvatar = this.updateAvatarName(newAvatar, name);
      this.avatarAdded.emit(newAvatar)
    }
  }

  private resetInput(): void {
    const input = this.stringInput();
    if (input) {
      input.value = '';
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
}

