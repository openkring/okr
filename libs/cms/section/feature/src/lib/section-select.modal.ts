import { AsyncPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { IonContent, IonItem, IonLabel, IonList, ModalController } from '@ionic/angular/standalone';

import { SectionTypes } from '@bk2/shared-categories';
import { TranslatePipe } from '@bk2/shared-i18n';
import { CategoryNamePipe } from '@bk2/shared-pipes';
import { HeaderComponent, SpinnerComponent } from '@bk2/shared-ui';

import { SectionSelectStore } from './section-select.store';

/**
 * Modal to sort the sections of a page.
 */
@Component({
  selector: 'bk-section-select',
  standalone: true,
  imports: [ 
    CategoryNamePipe, TranslatePipe, AsyncPipe,
    SpinnerComponent, HeaderComponent,
    IonContent, IonItem, IonList, IonLabel
  ],
  providers: [SectionSelectStore],
  template: `
    <bk-header title="{{ '@content.section.operation.select.label' | translate | async}}" [isModal]="true"
      [isSearchable]="true" (searchtermChange)="onSearchtermChange($event)" />
    <ion-content>
      @if (isLoading()) {
        <bk-spinner />
      } @else {
        @for (section of filteredSections(); track section.bkey) {
          <ion-list>
            <ion-item lines="none" (click)="select(section.bkey)">
              <ion-label class="ion-hide-md-down">{{ section.bkey }}</ion-label>
              <ion-label>{{ section.name }}</ion-label>
              <ion-label>{{ section.type | categoryName:sectionTypes }}</ion-label>
            </ion-item>
          </ion-list>
        }
      }
    </ion-content>
  `
})
export class SectionSelectModalComponent {
  private readonly modalController = inject(ModalController);
  protected sectionSelectStore = inject(SectionSelectStore);

  protected filteredSections = computed(() => this.sectionSelectStore.filteredSections() ?? []);
  protected isLoading = computed(() => this.sectionSelectStore.isLoading());
  
  protected sectionTypes = SectionTypes;

  protected select(sectionKey: string): Promise<boolean> {
    return this.modalController.dismiss(sectionKey, 'confirm');
  }

  protected onSearchtermChange(searchTerm: string): void {
    this.sectionSelectStore.setSearchTerm(searchTerm);
  }
}



