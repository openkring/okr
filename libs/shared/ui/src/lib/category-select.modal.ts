import { Component, inject, input } from '@angular/core';
import { IonContent, IonItem, IonLabel, ModalController } from '@ionic/angular/standalone';

import { CategoryModel } from '@bk2/shared-models';
import { Header } from './header';

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
    
    Header,
    IonContent, IonLabel, IonItem
  ],
  template: `
    <bk-header [i18n]="{ title: '@select.category' }" [isModal]="true" />
    <ion-content class="ion-padding">
      @for (cat of this.categories(); track cat; let i = $index) {
        <ion-item lines="none" (click)="select(i)">
          <ion-label>{{ '@' + cat.i18nBase + '.label' }}</ion-label>
        </ion-item>
      }
    </ion-content>
  `,
})
export class CategorySelectModal {
  private readonly modalController = inject(ModalController);
  public categories = input.required<CategoryModel[]>(); // mandatory view model
  
  public async select(index: number): Promise<boolean> {
    return await this.modalController.dismiss(index, 'confirm');
  }
}
