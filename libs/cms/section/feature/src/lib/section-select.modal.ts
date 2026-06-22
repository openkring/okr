import { Component, computed, inject, linkedSignal } from '@angular/core';
import { IonContent, IonItem, IonLabel, IonList } from '@ionic/angular/standalone';

import { Header, Spinner } from '@bk2/shared-ui';

import { SectionStore } from './section.store';

/**
 * Modal to sort the sections of a page.
 */
@Component({
  selector: 'bk-section-select',
  standalone: true,
  imports: [ 
    Spinner, Header,
    IonContent, IonItem, IonList, IonLabel
  ],
  template: `
    <bk-header
      [searchTerm]="searchTerm()"
      (searchTermChange)="store.setSelSearchTerm($event)"
      [isSearchable]="true"
      [i18n]="{ title: store.i18n.select_label() }"
      [isModal]="true"
    />
    <ion-content>
      @if (isLoading()) {
        <bk-spinner />
      } @else {
        @for (section of filteredSections(); track section.bkey) {
          <ion-list>
            <ion-item lines="none" (click)="select(section.bkey)">
              <ion-label class="ion-hide-md-down">{{ section.bkey }}</ion-label>
              <ion-label>{{ section.name }}</ion-label>
              <ion-label>{{ section.type }}</ion-label>
            </ion-item>
          </ion-list>
        }
      }
    </ion-content>
  `
})
export class SectionSelectModal {
  protected store = inject(SectionStore);

  protected searchTerm = linkedSignal(() => this.store.selSearchTerm());
  protected filteredSections = computed(() => this.store.selFilteredSections() ?? []);
  protected isLoading = computed(() => this.store.isLoading());  
  
  protected select(sectionKey: string): Promise<boolean> {
    return this.store.modalController.dismiss(sectionKey, 'confirm');
  }
}



