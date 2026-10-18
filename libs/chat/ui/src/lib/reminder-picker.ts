import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { IonButton, IonButtons, IonContent, IonDatetime, IonHeader, IonTitle, IonToolbar, ModalController } from '@ionic/angular';

import { toLocalIso } from '@okr/chat-util';

/**
 * Date and time picker for a chat reminder (spec 1.104 §5.2). Opened programmatically through
 * the ModalController, so there is no trigger element that must exist at load time. Dismisses
 * with the chosen instant in epoch ms, or without data when cancelled. Not a form: the value is
 * only ever a single point in time that is not in the past.
 */
@Component({
  selector: 'okr-reminder-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent, IonDatetime],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button (click)="cancel()">{{ cancelLabel() }}</ion-button>
        </ion-buttons>
        <ion-title>{{ title() }}</ion-title>
        <ion-buttons slot="end">
          <ion-button [strong]="true" [disabled]="!valid()" (click)="confirm()">{{ confirmLabel() }}</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <ion-datetime presentation="date-time" [preferWheel]="false" [hourCycle]="'h23'"
        [min]="min()" [value]="value()" (ionChange)="onChange($event.detail.value)" />
    </ion-content>
  `,
})
export class ReminderPicker {
  private readonly modalController = inject(ModalController);

  public readonly title = input('');
  public readonly confirmLabel = input('OK');
  public readonly cancelLabel = input('');
  /** Earliest selectable instant (epoch ms); the default is now. */
  public readonly earliest = input(Date.now());
  /** Start value (epoch ms): the current reminder when changing one, else an hour from now. */
  public readonly initial = input(Date.now() + 3_600_000);

  protected readonly chosen = signal<number | undefined>(undefined);

  protected min(): string { return toLocalIso(this.earliest()); }
  protected value(): string { return toLocalIso(this.chosen() ?? Math.max(this.initial(), this.earliest())); }
  protected valid(): boolean { return (this.chosen() ?? this.initial()) > Date.now(); }

  protected onChange(value: string | string[] | null | undefined): void {
    const v = Array.isArray(value) ? value[0] : value;
    const ms = v ? new Date(v).getTime() : NaN; // zone-less ISO → local wall clock
    if (!Number.isNaN(ms)) this.chosen.set(ms);
  }

  protected cancel(): void {
    void this.modalController.dismiss(undefined, 'cancel');
  }

  protected confirm(): void {
    const ms = this.chosen() ?? this.initial();
    if (ms > Date.now()) void this.modalController.dismiss(ms, 'confirm');
  }
}
