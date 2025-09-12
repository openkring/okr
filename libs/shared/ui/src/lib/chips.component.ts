import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, model, output } from '@angular/core';
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonChip, IonIcon, IonItem, IonLabel, ModalController } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { getNonSelectedChips, string2stringArray } from '@bk2/shared-util-core';
import { ChipSelectModalComponent } from './chip-select.modal';

/**
 * Vest updates work by binding to ngModel.
 * In this component, we can not use ngModel to bind the selected chips to the model, because the chips are stored as a comma-separated string in the database.
 * That is why we notify the parent component about the changes in the selected chips by calling a function that updates the model.
 */
@Component({
  selector: 'bk-chips',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe,
    IonItem, IonLabel, IonIcon, IonChip, IonButton,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent
  ],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ title() | translate | async}}</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        <ion-item lines="none">
          @if (readOnly()) {
            <ion-label class="ion-hide-sm-down">{{ title() | translate | async }}</ion-label>
            <div  class="ion-text-wrap">
              @for (chip of selectedChips(); track $index) {
                <ion-chip color="primary">
                  <ion-label>{{ chip | translate | async }}</ion-label>
                </ion-chip>
              }
            </div>
          } @else {
            <ion-button fill="clear" (click)="addChip()" size="large">
              <ion-icon src="{{'add-circle' | svgIcon }}" slot="start" [style.color]="'primary'" />
            </ion-button>
            <div  class="ion-text-wrap">
              @for (chip of selectedChips(); track $index) {
                <ion-chip color="primary">
                  <ion-button fill="clear" (click)="removeChip(chip)">
                    <ion-icon src="{{'close_cancel_circle' | svgIcon }}" slot="start" [style.color]="'primary'" />
                    <ion-label>{{ chip | translate | async }}</ion-label>
                  </ion-button>
                </ion-chip>
              }
            </div>
          }
        </ion-item>
      </ion-card-content>
    </ion-card>
  `
})
export class ChipsComponent {
  protected modalController = inject(ModalController);
  public storedChips = model.required<string>();    // the list of tag or role names, separated by comma, as read from the database
  public allChips = input.required<string>();       // a comma-separated list of all available tags or roles
  public readOnly = input(false); // if true, the selected tags or roles are shown as ready-only, disabled chips
  public chipName = input<'tag' | 'role'>('tag');

  protected selectedChips = computed<string[]>(() => string2stringArray(this.storedChips()));
  protected nonSelectedChips = computed<string[]>(() => getNonSelectedChips(string2stringArray(this.allChips()), this.selectedChips()));
  protected title = computed(() => `@general.util.${this.chipName()}`);
  public changed = output<string>(); 

  public removeChip(chip: string): void {
    const _selectedChips = this.selectedChips();
    _selectedChips.splice(_selectedChips.indexOf(chip), 1);
    this.updateChips(_selectedChips);
  }

  public async addChip() {
    const _modal = await this.modalController.create({
      component: ChipSelectModalComponent,
      cssClass: 'chip-modal',
      componentProps: {
        chips: this.nonSelectedChips(),
        chipName: this.chipName()
      }
    });
    _modal.present();
    const { data, role } = await _modal.onWillDismiss();
    if (role === 'confirm') {
      const _chip = data as string;
      const _selectedChips = this.selectedChips();
      _selectedChips.push(_chip);
      this.updateChips(_selectedChips);
    }
  }

  private updateChips(chips: string[]): void {
    const _chips = chips.join(',');
    this.storedChips.set(_chips); // converts array back into a comma-separated string; re-computing selectedChips and nonSelectedChips
    this.changed.emit(_chips); // notify the parent component about the changes
  }
}

