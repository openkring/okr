import { Component, inject, input, output } from '@angular/core';
import { IonContent, IonItem, IonReorder, IonReorderGroup, ItemReorderEventDetail, ModalController } from '@ionic/angular/standalone';

import { SectionModel } from '@okr/shared-models';
import { Header, Spinner } from '@okr/shared-ui';
import { arrayMove } from '@okr/shared-util-core';

import { PageStore } from './page.store';

/**
 * Modal to sort the sections of a page.
 */
@Component({
  selector: 'okr-page-sort-modal',
  standalone: true,
  imports: [ 
    Spinner, Header,
    IonContent, IonReorderGroup, IonReorder, IonItem
  ],
  providers: [PageStore],
  template: `
    <okr-header [i18n]="{ title: store.i18n.sort_label() }" [isModal]="true" [showOkButton]="true" (okClicked)="save()" />
    <ion-content>
      @if (sections(); as sections) {
        <!-- Casting $event to $any is a temporary fix for this bug https://github.com/ionic-team/ionic-framework/issues/24245 -->
        <ion-reorder-group disabled="false" (ionItemReorder)="reorder($any($event))">
          @for(section of sections; track section.okey) {
            <ion-item>              
              {{ section.name}}  ({{ section.type }})
              <ion-reorder slot="start" />
            </ion-item>
          }
        </ion-reorder-group>
      } @else {
        <okr-spinner />
      }
    </ion-content>
  `
})
export class PageSortModal {
  private readonly modalController = inject(ModalController);
  protected readonly store = inject(PageStore);

  // inputs
  public sections = input.required<SectionModel[]>();

  // outputs
  public sectionsChanged = output<SectionModel[]>();

  /******************************** actions ******************************************* */
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



