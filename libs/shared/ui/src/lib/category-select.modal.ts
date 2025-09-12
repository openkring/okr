import { AsyncPipe } from '@angular/common';
import { Component, inject, input } from '@angular/core';
import { IonContent, IonItem, IonLabel, ModalController } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { CategoryModel } from '@bk2/shared-models';
import { HeaderComponent } from './header.component';

/**
 * A modal to select a category from a list of categories.
 * The selected category is returned as a number when the modal is dismissed.
 * 
 * THIS IS LEGACY, NOT USED ANYMORE
 */
@Component({
  selector: 'bk-category-select-modal',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, 
    HeaderComponent,
    IonContent, IonLabel, IonItem
  ],
  template: `
    <bk-header title="{{ '@general.operation.select.category' | translate | async }}" [isModal]="true" />
    <ion-content class="ion-padding">
      @for (cat of this.categories(); track cat; let i = $index) {
        <ion-item lines="none" (click)="select(i)">
          <ion-label>{{ '@' + cat.i18nBase + '.label' | translate | async }}</ion-label>
        </ion-item>
      }
    </ion-content>
  `,
})
export class CategorySelectModalComponent {
  private readonly modalController = inject(ModalController);
  public categories = input.required<CategoryModel[]>(); // mandatory view model
  
  public async select(index: number): Promise<boolean> {
    return await this.modalController.dismiss(index, 'confirm');
  }
}
