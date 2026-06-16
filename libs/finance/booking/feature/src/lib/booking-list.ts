import { Component, inject } from '@angular/core';
import { ActionSheetButton, ActionSheetController, IonButton, IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { BookingModel } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';

import { BookingStore } from './booking.store';

@Component({
  selector: 'bk-booking-list',
  standalone: true,
  imports: [
    IonHeader, IonToolbar, IonTitle, IonContent,
    IonList, IonItem, IonLabel, IonFab, IonFabButton, IonIcon,
    IonButton,
    SvgIconPipe,
  ],
  providers: [BookingStore],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ store.i18n.list_title() }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      @if (store.isLoading()) {
        <p>Loading...</p>
      } @else if (store.bookings().length === 0) {
        <p>{{ store.i18n.empty() }}</p>
      } @else {
        <ion-list>
          @for (booking of store.bookings(); track booking.bkey) {
            <ion-item (click)="store.openEdit(booking, store.linesByBooking().get(booking.bkey) ?? [], store.isReadOnly())">
              <ion-label>
                <h3>{{ booking.bookingNo }} — {{ booking.title }}</h3>
                <p>{{ booking.date }}</p>
              </ion-label>
              @if (store.availableActions(booking).length > 0) {
                <ion-button slot="end" fill="clear" (click)="openActions($event, booking)">
                  <ion-icon src="{{ 'menu' | svgIcon }}" />
                </ion-button>
              }
            </ion-item>
          }
        </ion-list>
      }
    </ion-content>
    @if (!store.isReadOnly()) {
      <ion-fab slot="fixed" vertical="bottom" horizontal="end">
        <ion-fab-button (click)="store.openCreate()">
          <ion-icon src="{{ 'add' | svgIcon }}" />
        </ion-fab-button>
      </ion-fab>
    }
  `,
})
export class BookingList {
  protected readonly store = inject(BookingStore);
  private readonly actionSheetCtrl = inject(ActionSheetController);

  protected async openActions(event: Event, booking: BookingModel): Promise<void> {
    event.stopPropagation();
    const actions = this.store.availableActions(booking);
    const hasCounterparty = !!booking.counterparty;
    const buttons: ActionSheetButton[] = [
      ...actions.map((a) => ({
        text: this.store.i18n.action_createReceipt(),
        handler: hasCounterparty ? () => { this.store.runAction(a, booking); } : undefined,
      })),
      ...(hasCounterparty ? [] : [{ text: this.store.i18n.action_counterpartyRequired(), role: 'destructive' as const }]),
      { text: 'Abbrechen', role: 'cancel' as const },
    ];
    const sheet = await this.actionSheetCtrl.create({
      header: booking.title,
      buttons,
    });
    await sheet.present();
  }
}
