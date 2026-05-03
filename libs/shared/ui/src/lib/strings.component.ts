import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, model, output, viewChild } from '@angular/core';
import { AlertController, IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonIcon, IonInput, IonItem, IonLabel, IonList, IonNote, IonReorder, IonReorderGroup, ItemReorderEventDetail, ToastController } from '@ionic/angular/standalone';

import { MaskitoDirective } from '@maskito/angular';
import { MaskitoElementPredicate, MaskitoOptions } from '@maskito/core';

import { LowercaseWordMask } from '@bk2/shared-config';
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
  selector: 'bk-strings',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe,
    MaskitoDirective,
    IonList, IonItem,
    IonLabel, IonInput, IonIcon,
    IonReorderGroup, IonReorder,
    IonCard, IonCardHeader, IonCardContent, IonCardTitle, IonButton
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
            @if(!isReadOnly() && inputStyle() === 'select') {
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
            <ion-list>
              @for(text of strings(); track $index) {
                <ion-item>
                  <ion-label>{{ text }}</ion-label>
                  @if (isCopyable()) {
                    <ion-icon slot="end" src="{{'copy' | svgIcon }}" (click)="copy(text)" />
                  }
                </ion-item>
              }
            </ion-list>
        } @else {
            <!-- we deliberately use ion-input here, because we do not want to interfere with the vest from update of strings() -->
            @if(inputStyle() === 'text') {
              <ion-item lines="none">
                <ion-input [value]="''" (ionChange)="save($event)" #stringInput
                  label="{{ addLabel() | translate | async }}"
                  labelPlacement="floating"
                  inputMode="text"
                  type="text"
                  [counter]="true"
                  [maxlength]="maxLength()"
                  placeholder="ssssss"
                  [maskito]="mask()"
                  [maskitoElement]="maskPredicate"
                />
              </ion-item>
            } 

          @if(strings(); as strings) {
            <ion-list>
              <!-- Casting $event to $any is a temporary fix for this bug https://github.com/ionic-team/ionic-framework/issues/24245 -->
              <ion-reorder-group  [disabled]=false (ionItemReorder)="reorder($any($event))">
                @for(text of strings; track $index) {
                  <ion-item>
                    <ion-reorder slot="start" />
                    <ion-label>{{ text }}</ion-label>
                    <ion-icon src="{{'cancel' | svgIcon }}" (click)="remove($index)" slot="end" />
                    @if (isCopyable()) {
                      <ion-icon slot="end" src="{{'copy' | svgIcon }}" (click)="copy(text)" />
                    }
                    @if (isEditable()) {
                      <ion-icon slot="end" src="{{'edit' | svgIcon }}" (click)="edit(text, $index)" />
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

  // inputs
  public strings = model.required<string[]>(); // the keys of the menu items
  public title = input<string>();
  public addLabel = input('@input.strings.addString');
  public copyable = input(false);
  public editable = input(false);
  public inputStyle = input<'text' | 'select'>('text');
  public readOnly = input.required<boolean>();
  public description = input<string>();
  public mask = input<MaskitoOptions>(LowercaseWordMask);
  public maxLength = input(NAME_LENGTH);
  public selectLabel = input<string>();

  // coerced boolean inputs
  protected isCopyable = computed(() => coerceBoolean(this.copyable()));
  protected isEditable = computed(() => coerceBoolean(this.editable()));
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  public selectClicked = output<void>();
  // view children
  public stringInput = viewChild<IonInput>('stringInput');

  protected cardTitle = computed(() => this.title() || '@input.strings.label');

  public save($event: CustomEvent): void {
    const newString = ($event?.detail?.value.trim() ?? '').toLowerCase();
    this.resetInput();
    if (newString.length === 0) return;  // prevent adding empty strings
    this.strings.update(arr => {
      if (arr.includes(newString)) return arr; // Prevent duplicates (case-insensitive)
      return [...arr, newString];   // we do not sort the array, the user can reorder it as needed
    });
  }

  private resetInput(): void {
    const input = this.stringInput();
    if (input) {
      input.value = '';
    }
  }

  public remove(index: number): void {
    this.strings.update(arr => {
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
      const strings = this.strings();
      strings[index] = changedText;
    this.strings.set(strings); // converts array back into a comma-separated string
    }
  }

  /**
   * Finish the reorder and position the item in the DOM based on where the gesture ended.
   * @param ev the custom dom event with the reordered items
   */
  reorder(ev: CustomEvent<ItemReorderEventDetail>) {
    this.strings.set(ev.detail.complete(this.strings()));
  }

  readonly maskPredicate: MaskitoElementPredicate = async (el) => (el as HTMLIonInputElement).getInputElement();
}

