import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, model, viewChild } from '@angular/core';
import { AlertController, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonIcon, IonInput, IonItem, IonLabel, IonList, IonNote, IonReorder, IonReorderGroup, ItemReorderEventDetail, ToastController } from '@ionic/angular/standalone';

import { NAME_LENGTH } from '@bk2/shared-constants';
import { TranslatePipe } from '@bk2/shared-i18n';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { bkPrompt, copyToClipboardWithConfirmation } from '@bk2/shared-util-angular';
import { coerceBoolean } from '@bk2/shared-util-core';

/**
 * Vest updates work by binding to ngModel.
 * In this component, we can not use ngModel to bind the strings to the model, because the strings are stored as an array.
 * That is why we notify the parent component about the changes.
 */

@Component({
  selector: 'bk-text-list',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe,
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
        @if(isReadOnly()) {
            <ion-list>
              @for(text of texts(); track $index) {
                <ion-item>
                  <ion-label>{{ text }}</ion-label>
                  @if (isCopyable()) {
                    <ion-icon slot="end" src="{{'copy' | svgIcon }}" (click)="copy(text)" />
                  }
                </ion-item>
              }
            </ion-list>
        } @else {
          <ion-item lines="none">
            <!-- we deliberately use ion-input here, because we do not want to interfere with the vest from update of strings() -->
            <ion-input [value]="''" (ionChange)="save($event)" #textInput
                label="{{ addLabel() | translate | async }}"
                labelPlacement="floating"
                inputMode="text"
                type="text"
                [counter]="true"
                [maxlength]="maxLength()"
                placeholder="ssssss"
            />
          </ion-item>

          @if(texts(); as texts) {
            <ion-list>
              <!-- Casting $event to $any is a temporary fix for this bug https://github.com/ionic-team/ionic-framework/issues/24245 -->
              <ion-reorder-group  [disabled]=false (ionItemReorder)="reorder($any($event))">
                @for(text of texts; track $index) {
                  <ion-item>
                    <ion-reorder slot="start" />
                    <ion-label>{{ text }}</ion-label>
                    <ion-icon src="{{'close_cancel_circle' | svgIcon }}" (click)="remove($index)" slot="end" />
                    @if (isCopyable()) {
                      <ion-icon slot="end" src="{{'copy' | svgIcon }}" (click)="copy(text)" />
                    }
                    @if (isEditable()) {
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
export class TextList {
  private readonly toastController = inject(ToastController);
  private readonly alertController = inject(AlertController);

  // inputs
  public texts = model.required<string[]>(); // the keys of the menu items
  public title = input('@input.texts.label');
  public addLabel = input('@input.texts.addString');
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
  public textInput = viewChild<IonInput>('textInput');

  public save($event: CustomEvent): void {
    const newString = $event?.detail?.value.trim() ?? '';
    this.resetInput();
    if (newString.length === 0) return;  // prevent adding empty strings
    this.texts.update(arr => {
      if (arr.includes(newString)) return arr; // Prevent duplicates (case-insensitive)
      return [...arr, newString];   // we do not sort the array, the user can reorder it as needed
    });
  }

  private resetInput(): void {
    const input = this.textInput();
    if (input) {
      input.value = '';
    }
  }

  public remove(index: number): void {
    this.texts.update(arr => {
      const newArr = [...arr];
      newArr.splice(index, 1);
      return newArr;
    });
  }

  public async copy(data: string | number | undefined, confirmation?: string): Promise<void> {
    await copyToClipboardWithConfirmation(this.toastController, data ?? '', confirmation);
  }

  public async edit(text: string, index: number): Promise<void> {
    const changedText = await bkPrompt(this.alertController, '@input.strings.edit', text);
    if (changedText) {
      const strings = this.texts();
      strings[index] = changedText;
    this.texts.set(strings); // converts array back into a comma-separated string
    }
  }

  /**
   * Finish the reorder and position the item in the DOM based on where the gesture ended.
   * @param ev the custom dom event with the reordered items
   */
  reorder(ev: CustomEvent<ItemReorderEventDetail>) {
    this.texts.set(ev.detail.complete(this.texts()));
  }
}

