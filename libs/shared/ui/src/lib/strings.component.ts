import { Component, inject, input, model, output, viewChild } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { AlertController, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonIcon, IonInput, IonItem, IonLabel, IonList, IonNote, IonReorder, IonReorderGroup, ItemReorderEventDetail, ToastController } from '@ionic/angular/standalone';
import { MaskitoElementPredicate, MaskitoOptions } from '@maskito/core';
import { MaskitoDirective } from '@maskito/angular';

import { SvgIconPipe } from '@bk2/shared/pipes';
import { TranslatePipe } from '@bk2/shared/i18n';
import { LowercaseWordMask, NAME_LENGTH } from '@bk2/shared/config';
import { bkPrompt, copyToClipboardWithConfirmation } from '@bk2/shared/util';

/**
 * Vest updates work by binding to ngModel.
 * In this component, we can not use ngModel to bind the strings to the model, because the strings are stored as an array.
 * That is why we notify the parent component about the changes.
 */

@Component({
  selector: 'bk-strings',
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe,
    MaskitoDirective,
    IonList, IonItem,
    IonLabel, IonInput, IonIcon, IonNote,
    IonReorderGroup, IonReorder,
    IonCard, IonCardHeader, IonCardContent, IonCardTitle
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
        @if(readOnly() === true) {
          <ion-item lines="none">
            <ion-note color="medium">{{ strings().join(', ') }}</ion-note>
          </ion-item>
        } @else {
          <ion-item lines="none">
            <!-- we deliberately use ion-input here, because we do not want to interfere with the vest from update of strings() -->
            <ion-input [value]="''" (ionChange)="save($event)" #stringInput
                label="{{ addLabel() | translate | async }}"
                labelPlacement="floating"
                inputMode="text"
                type="text"
                [counter]="true"
                [maxlength]="maxLength()"
                placeholder="ssssss"
                [maskito]="mask()"
                [maskitoElement]="maskPredicate" />
          </ion-item>

          @if(strings(); as strings) {
            <ion-list>
              <!-- Casting $event to $any is a temporary fix for this bug https://github.com/ionic-team/ionic-framework/issues/24245 -->
              <ion-reorder-group  [disabled]=false (ionItemReorder)="reorder($any($event))">
                @for(text of strings; track $index) {
                  <ion-item>
                    <ion-reorder slot="start" />
                    <ion-label>{{ text }}</ion-label>
                    <ion-icon src="{{'close_cancel_circle' | svgIcon }}" (click)="remove($index)" slot="end" />
                    @if (copyable()) {
                      <ion-icon slot="end" src="{{'copy' | svgIcon }}" (click)="copy(text)" />
                    }
                    @if (editable()) {
                      <ion-icon slot="end" src="{{'create_edit' | svgIcon }}" (click)="edit(text, $index)" />
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
export class StringsComponent {
  private readonly toastController = inject(ToastController);
  private readonly alertController = inject(AlertController);

  public strings = model.required<string[]>(); // the keys of the menu items
  public title = input('@input.strings.label');
  public addLabel = input('@input.strings.addString');
  public copyable = input(false);
  public editable = input(false);
  public readOnly = input(false);
  public description = input<string>();
  public mask = input<MaskitoOptions>(LowercaseWordMask);
  public maxLength = input(NAME_LENGTH);
  public changed = output<string[]>();
  public stringInput = viewChild<IonInput>('stringInput');

  public save($event: CustomEvent): void {
    const _newString = $event?.detail?.value as string;
    this.resetInput();
    if (_newString && _newString.length > 0) {
      const _strings = this.strings();
      _strings.push(_newString);
      this.updateStrings(_strings);
    }
  }

  private resetInput(): void {
    const _input = this.stringInput();
    if (_input) {
      _input.value = '';
    }
  }

  public remove(index: number): void {
    const _strings = this.strings();
    _strings.splice(index, 1);
    this.updateStrings(_strings);
  }

  public async copy(data: string | number | undefined, confirmation?: string): Promise<void> {
    await copyToClipboardWithConfirmation(this.toastController, data ?? '', confirmation);
  }

  public async edit(text: string, index: number): Promise<void> {
    const _changedText = await bkPrompt(this.alertController, '@input.strings.edit', text);
    if (_changedText) {
      const _strings = this.strings();
      _strings[index] = _changedText;
      this.updateStrings(_strings);
    }
  }

  private updateStrings(strings: string[]): void {
    this.strings.set(strings); // converts array back into a comma-separated string
    this.changed.emit(strings); // notify the parent component about the change
  }


  /**
   * Finish the reorder and position the item in the DOM based on where the gesture ended.
   * @param ev the custom dom event with the reordered items
   */
  reorder(ev: CustomEvent<ItemReorderEventDetail>) {
    this.updateStrings(ev.detail.complete(this.strings()));
  }

  readonly maskPredicate: MaskitoElementPredicate = async (el: HTMLElement) => (el as HTMLIonInputElement).getInputElement();
}

