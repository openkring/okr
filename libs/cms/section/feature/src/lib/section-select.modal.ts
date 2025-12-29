import { Component, computed, inject, linkedSignal } from '@angular/core';
import { IonContent, IonItem, IonLabel, IonList } from '@ionic/angular/standalone';

import { HeaderComponent, SpinnerComponent } from '@bk2/shared-ui';

import { SectionStore } from './section.store';

/**
 * Modal to sort the sections of a page.
 */
@Component({
  selector: 'bk-section-select',
  standalone: true,
  imports: [ 
    SpinnerComponent, HeaderComponent,
    IonContent, IonItem, IonList, IonLabel
  ],
  template: `
    <bk-header
      [searchTerm]="searchTerm()"
      (searchTermChange)="sectionStore.setSelSearchTerm($event)"
      [isSearchable]="true"
      title="@content.section.operation.select.label"
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
export class SectionSelectModalComponent {
  protected sectionStore = inject(SectionStore);

  protected searchTerm = linkedSignal(() => this.sectionStore.selSearchTerm());
  protected filteredSections = computed(() => this.sectionStore.selFilteredSections() ?? []);
  protected isLoading = computed(() => this.sectionStore.isLoading());
  
  protected select(sectionKey: string): Promise<boolean> {
    return this.sectionStore.modalController.dismiss(sectionKey, 'confirm');
  }
}



