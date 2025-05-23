import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { IonChip, IonContent, IonLabel, ModalController } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared/i18n';
import { HeaderComponent } from './header.component';

@Component({
  selector: 'bk-chip-select-modal',
  imports: [
    TranslatePipe, AsyncPipe, 
    HeaderComponent,
    IonContent, IonChip, IonLabel
  ],
  template: `
    <bk-header title="{{ title() | translate | async }}" [isModal]="true" />
    <ion-content class="ion-padding">
      @for (chip of chips(); track chip) {
        <ion-chip color="primary" (click)="select(chip)">
          <ion-label>{{ chip | translate | async }} </ion-label>
        </ion-chip>  
      }
    </ion-content>
  `,
})
export class ChipSelectModalComponent {
  private readonly modalController = inject(ModalController);
  public chips = input.required<string[]>();
  public chipName = input.required<string>();
  public title = computed(() => `@general.operation.select.${this.chipName()}`);

  public async select(chip: string): Promise<boolean> {
    return await this.modalController.dismiss(chip, 'confirm');
  }
}
