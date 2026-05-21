import { Component, computed, inject, signal } from '@angular/core';
import { IonButton, IonChip, IonIcon, IonDatetime, IonModal, IonContent, IonItem, IonInput, IonTextarea, ModalController } from '@ionic/angular/standalone';

import { SvgIconPipe } from '@bk2/shared-pipes';
import { Header } from '@bk2/shared-ui';
import { convertDateFormatToString, DateFormat } from '@bk2/shared-util-core';

import { CalEventStore } from './calevent.store';

@Component({
  selector: 'bk-schedule-new-modal',
  standalone: true,
  providers: [CalEventStore],
  imports: [
    IonButton,
    IonChip, IonIcon, IonDatetime, IonModal,
    IonContent, IonItem, IonInput, IonTextarea,
    SvgIconPipe,
    Header,
  ],
  template: `
    <bk-header [i18n]="{ title: store.i18n.schedule_title() }" [isModal]="true" />
    <ion-content class="ion-padding">
      <ion-item>
        <ion-input
          [label]="store.i18n.topic()"
          labelPlacement="stacked"
          [value]="name()"
          (ionInput)="name.set(($any($event.target)).value ?? '')"
          required
        />
      </ion-item>
      <ion-item>
        <ion-textarea
          [label]="store.i18n.description()"
          labelPlacement="stacked"
          [value]="description()"
          (ionInput)="description.set(($any($event.target)).value ?? '')"
          [rows]="2"
        />
      </ion-item>

      <ion-item lines="none">
        {{ store.i18n.schedule_date_proposals() }}
      </ion-item>

      <div class="date-chips">
        @for (date of selectedDates(); track date) {
          <ion-chip (click)="removeDate(date)">
            {{ formatDate(date) }}
            <ion-icon src="{{ 'close-circle' | svgIcon }}" />
          </ion-chip>
        }
        <ion-chip color="primary" [outline]="true" (click)="datePickerOpen.set(true)">
          {{ store.i18n.schedule_date_add() }}
        </ion-chip>
      </div>

      <ion-modal
        [isOpen]="datePickerOpen()"
        [keepContentsMounted]="true"
        (ionModalDidDismiss)="datePickerOpen.set(false)"
      >
        <ng-template>
          <ion-datetime
            presentation="date"
            [multiple]="true"
            [value]="selectedDates()"
            (ionChange)="onDatetimeChange($event)"
          />
          <ion-button expand="block" (click)="confirmDates()">
            {{ store.i18n.schedule_confirm() }}
          </ion-button>
        </ng-template>
      </ion-modal>

      <ion-button
        expand="block"
        [disabled]="!canSubmit()"
        (click)="submit()"
        class="ion-margin-top"
      >
        {{ store.i18n.invite_members() }}
      </ion-button>
    </ion-content>
  `,
})
export class ScheduleNewModal {
  protected readonly store = inject(CalEventStore);
  private readonly modalCtrl = inject(ModalController);

  protected readonly name = signal('');
  protected readonly description = signal('');
  protected readonly selectedDates = signal<string[]>([]);
  protected readonly pendingDates = signal<string[]>([]);
  protected readonly datePickerOpen = signal(false);

  protected readonly canSubmit = computed(
    () => this.name().trim().length > 0 && this.selectedDates().length > 0
  );

  protected formatDate(isoDate: string): string {
    return convertDateFormatToString(isoDate, DateFormat.IsoDate, DateFormat.ViewDate);
  }

  protected onDatetimeChange(event: CustomEvent): void {
    const val = event.detail.value;
    this.pendingDates.set(Array.isArray(val) ? val : val ? [val] : []);
  }

  protected confirmDates(): void {
    this.selectedDates.set([...this.pendingDates()].sort());
    this.datePickerOpen.set(false);
  }

  protected removeDate(date: string): void {
    this.selectedDates.update(dates => dates.filter(d => d !== date));
  }

  protected async cancel(): Promise<void> {
    await this.modalCtrl.dismiss(null, 'cancel');
  }

  protected async submit(): Promise<void> {
    await this.modalCtrl.dismiss({
      name: this.name().trim(),
      description: this.description().trim(),
      dates: this.selectedDates(),
    }, 'confirm');
  }
}
