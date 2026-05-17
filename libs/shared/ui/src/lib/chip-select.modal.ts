import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { IonChip, IonContent, IonLabel, ModalController } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { Header } from './header';

@Component({
  selector: 'bk-chip-select-modal',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, 
    Header,
    IonContent, IonChip, IonLabel
  ],
  template: `
    <bk-header [title]="headerTitle()" [isModal]="true" />
    <ion-content class="ion-padding">
      @for (chip of chips(); track chip) {
        <ion-chip color="primary" (click)="select(chip)">
          <ion-label>{{ chip | translate | async }} </ion-label>
        </ion-chip>  
      }
    </ion-content>
  `,
})
export class ChipSelectModal {
  private readonly modalController = inject(ModalController);

  // inputs
  public chips = input.required<string[]>();
  public chipName = input.required<string>();

  // computed
  public headerTitle = computed(() => `@general.operation.select.${this.chipName()}`);

  public async select(chip: string): Promise<boolean> {
    return await this.modalController.dismiss(chip, 'confirm');
  }
}
