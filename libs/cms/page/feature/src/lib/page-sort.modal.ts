import { Component, inject, input, output } from '@angular/core';
import { IonContent, IonItem, IonReorder, IonReorderGroup, ItemReorderEventDetail, ModalController } from '@ionic/angular/standalone';

import { SectionModel } from '@bk2/shared-models';
import { CategoryNamePipe } from '@bk2/shared-pipes';
import { HeaderComponent, SpinnerComponent } from '@bk2/shared-ui';
import { arrayMove } from '@bk2/shared-util-core';

/**
 * Modal to sort the sections of a page.
 */
@Component({
  selector: 'bk-page-sort-modal',
  standalone: true,
  imports: [ 
    CategoryNamePipe,
    SpinnerComponent, HeaderComponent,
    IonContent, IonReorderGroup, IonReorder, IonItem
  ],
  template: `
    <bk-header title="Sektionen sortieren" [isModal]="true" [showOkButton]="true" (okClicked)="save()" />
    <ion-content>
      @if (sections(); as sections) {
        <!-- Casting $event to $any is a temporary fix for this bug https://github.com/ionic-team/ionic-framework/issues/24245 -->
        <ion-reorder-group disabled="false" (ionItemReorder)="reorder($any($event))">
          @for(section of sections; track section.bkey) {
            <ion-item>              
              {{ section.name}}  ({{ section.type | categoryName:STS }})
              <ion-reorder slot="start" />
            </ion-item>
          }
        </ion-reorder-group>
      } @else {
        <bk-spinner />
      }
    </ion-content>
  `
})
export class PageSortModalComponent {
  private readonly modalController = inject(ModalController);
  public sections = input.required<SectionModel[]>();
  public sectionsChanged = output<SectionModel[]>();

  public cancel(): Promise<boolean> {
    return this.modalController.dismiss(null, 'cancel');
  }

  public save(): Promise<boolean> {
    return this.modalController.dismiss(this.sections(), 'confirm');
  }

  reorder(ev: CustomEvent<ItemReorderEventDetail>) {
    // The `from` and `to` properties contain the index of the item
    // when the drag started and ended, respectively
    arrayMove(this.sections(), ev.detail.from, ev.detail.to);

    // Finish the reorder and position the item in the DOM based on
    // where the gesture ended. This method can also be called directly
    // by the reorder group
    ev.detail.complete();
    this.sectionsChanged.emit(this.sections());
  }
}



