import { Component, computed, effect, inject, input, linkedSignal } from '@angular/core';
import { IonCol, IonContent, IonGrid, IonItem, IonLabel, IonList, IonRow, ModalController } from '@ionic/angular/standalone';

import { CalendarModel, UserModel } from '@bk2/shared-models';
import { EmptyListComponent, HeaderComponent, SpinnerComponent } from '@bk2/shared-ui';

import { CalendarSelectStore } from './calendar-select.store';

@Component({
  selector: 'bk-calendar-select-modal',
  standalone: true,
  imports: [
    HeaderComponent, SpinnerComponent, EmptyListComponent,
    IonContent, IonList, IonItem, IonLabel, IonGrid, IonRow, IonCol,
  ],
  providers: [CalendarSelectStore],
  styles: [`
    ion-list { padding: 0; }
    ion-item { --min-height: 48px; }
    .key { font-size: 0.75rem; color: var(--ion-color-medium); }
  `],
  template: `
    <bk-header
      [(searchTerm)]="searchTerm"
      [isSearchable]="true"
      title="@input.calendarName.select"
      [isModal]="true"
    />
    <ion-content>
      @if (isLoading()) {
        <bk-spinner />
      } @else if (filteredCount() === 0) {
        <bk-empty-list message="@input.calendarName.field.empty" />
      } @else {
        <ion-list lines="full">
          @for (calendar of filteredCalendars(); track calendar.bkey) {
            <ion-item (click)="select(calendar)">
              <ion-grid>
                <ion-row>
                  <ion-col size="5">
                    <ion-label>
                      <p class="key">{{ calendar.bkey }}</p>
                      <h2>{{ calendar.name }}</h2>
                    </ion-label>
                  </ion-col>
                  <ion-col size="7">
                    <ion-label class="ion-text-wrap">{{ calendar.description }}</ion-label>
                  </ion-col>
                </ion-row>
              </ion-grid>
            </ion-item>
          }
        </ion-list>
      }
    </ion-content>
  `
})
export class CalendarSelectModalComponent {
  private readonly calendarSelectStore = inject(CalendarSelectStore);
  private readonly modalController = inject(ModalController);

  public currentUser = input.required<UserModel>();

  protected searchTerm = linkedSignal(() => this.calendarSelectStore.searchTerm());
  protected filteredCalendars = computed(() => this.calendarSelectStore.filteredCalendars());
  protected filteredCount = computed(() => this.filteredCalendars().length);
  protected isLoading = computed(() => this.calendarSelectStore.isLoading());

  constructor() {
    effect(() => this.calendarSelectStore.setCurrentUser(this.currentUser()));
    effect(() => this.calendarSelectStore.setSearchTerm(this.searchTerm()));
  }

  public select(calendar: CalendarModel): Promise<boolean> {
    return this.modalController.dismiss(calendar.bkey, 'confirm');
  }
}
