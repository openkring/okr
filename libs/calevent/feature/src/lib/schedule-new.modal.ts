import { Component, computed, inject, signal } from '@angular/core';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonButton,
  IonContent, IonItem, IonLabel, IonInput, IonTextarea,
  IonChip, IonIcon, IonDatetime, IonDatetimeButton, IonModal,
  ModalController,
} from '@ionic/angular/standalone';
import { TranslatePipe } from '@bk2/shared-i18n';
import { SvgIconPipe } from '@bk2/shared-pipes';

@Component({
  selector: 'bk-schedule-new-modal',
  standalone: true,
  imports: [
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton,
    IonContent, IonItem, IonLabel, IonInput, IonTextarea,
    IonChip, IonIcon, IonDatetime, IonDatetimeButton, IonModal,
    TranslatePipe, SvgIconPipe,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ '@schedule.title' | translate | async }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="cancel()">{{ '@general.cancel' | translate | async }}</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <ion-item>
        <ion-label position="stacked">{{ '@schedule.topic' | translate | async }}</ion-label>
        <ion-input
          [value]="name()"
          (ionInput)="name.set($any($event.target).value)"
          required
        />
      </ion-item>
      <ion-item>
        <ion-label position="stacked">{{ '@schedule.description' | translate | async }}</ion-label>
        <ion-textarea
          [value]="description()"
          (ionInput)="description.set($any($event.target).value)"
          [rows]="2"
        />
      </ion-item>

      <ion-item lines="none">
        <ion-label>{{ '@schedule.dates' | translate | async }}</ion-label>
      </ion-item>

      <div class="date-chips">
        @for (date of selectedDates(); track date) {
          <ion-chip (click)="removeDate(date)">
            {{ formatDate(date) }}
            <ion-icon src="{{ 'close-circle' | svgIcon }}" />
          </ion-chip>
        }
        <ion-chip id="open-date-picker" color="primary" [outline]="true">
          {{ '@schedule.addDate' | translate | async }}
        </ion-chip>
      </div>

      <ion-modal trigger="open-date-picker" [keepContentsMounted]="true">
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

  protected readonly canSubmit = computed(
    () => this.name().trim().length > 0 && this.selectedDates().length > 0
  );

  protected formatDate(isoDate: string): string {
    const d = new Date(isoDate);
    return d.toLocaleDateString('de-CH', { weekday: 'short', day: '2-digit', month: '2-digit' });
  }

  protected onDatetimeChange(event: CustomEvent): void {
    const val = event.detail.value;
    this.pendingDates.set(Array.isArray(val) ? val : val ? [val] : []);
  }

  protected confirmDates(): void {
    this.selectedDates.set([...this.pendingDates()].sort());
    // close the inner modal
    const modal = document.querySelector('ion-modal[trigger="open-date-picker"]') as HTMLIonModalElement;
    modal?.dismiss();
  }

  protected removeDate(date: string): void {
    this.selectedDates.update(dates => dates.filter(d => d !== date));
  }

  protected cancel(): void {
    this.modalCtrl.dismiss(null, 'cancel');
  }

  protected submit(): void {
    this.modalCtrl.dismiss({
      name: this.name().trim(),
      description: this.description().trim(),
      dates: this.selectedDates(),
    }, 'confirm');
  }
}
