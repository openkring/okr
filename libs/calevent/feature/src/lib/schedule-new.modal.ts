import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import {
  IonButton,
  IonChip, IonIcon, IonDatetime, IonModal,
  IonContent, IonItem, IonInput, IonTextarea,
  ModalController,
} from '@ionic/angular/standalone';
import { TranslatePipe } from '@bk2/shared-i18n';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { HeaderComponent } from '@bk2/shared-ui';
import { convertDateFormatToString, DateFormat } from '@bk2/shared-util-core';

@Component({
  selector: 'bk-schedule-new-modal',
  standalone: true,
  imports: [
    IonButton,
    IonChip, IonIcon, IonDatetime, IonModal,
    IonContent, IonItem, IonInput, IonTextarea,
    AsyncPipe, TranslatePipe, SvgIconPipe,
    HeaderComponent,
  ],
  template: `
    <bk-header title="@schedule.title" [isModal]="true" />
    <ion-content class="ion-padding">
      <ion-item>
        <ion-input
          [label]="'@schedule.topic' | translate | async"
          labelPlacement="stacked"
          [value]="name()"
          (ionInput)="name.set(($any($event.target)).value ?? '')"
          required
        />
      </ion-item>
      <ion-item>
        <ion-textarea
          [label]="'@schedule.description' | translate | async"
          labelPlacement="stacked"
          [value]="description()"
          (ionInput)="description.set(($any($event.target)).value ?? '')"
          [rows]="2"
        />
      </ion-item>

      <ion-item lines="none">
        {{ '@schedule.dates' | translate | async }}
      </ion-item>

      <div class="date-chips">
        @for (date of selectedDates(); track date) {
          <ion-chip (click)="removeDate(date)">
            {{ formatDate(date) }}
            <ion-icon src="{{ 'close-circle' | svgIcon }}" />
          </ion-chip>
        }
        <ion-chip color="primary" [outline]="true" (click)="datePickerOpen.set(true)">
          {{ '@schedule.addDate' | translate | async }}
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
            {{ '@schedule.confirmDates' | translate | async }}
          </ion-button>
        </ng-template>
      </ion-modal>

      <ion-button
        expand="block"
        [disabled]="!canSubmit()"
        (click)="submit()"
        class="ion-margin-top"
      >
        {{ '@schedule.invite' | translate | async }}
      </ion-button>
    </ion-content>
  `,
})
export class ScheduleNewModal {
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
