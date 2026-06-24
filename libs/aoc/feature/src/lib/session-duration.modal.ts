import { Component, inject, input, signal } from '@angular/core';
import { IonButton, IonButtons, IonContent, IonDatetime, IonHeader, IonItem, IonLabel, IonList, IonTitle, IonToolbar, ModalController } from '@ionic/angular/standalone';

import { DateFormat, convertDateFormatToString } from '@bk2/shared-util-core';

@Component({
  selector: 'bk-session-duration-modal',
  standalone: true,
  imports: [
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton,
    IonContent, IonList, IonItem, IonLabel, IonDatetime,
  ],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-title>{{ title() }}</ion-title>
        <ion-buttons slot="start"><ion-button (click)="cancel()">{{ cancelLabel() }}</ion-button></ion-buttons>
        <ion-buttons slot="end"><ion-button (click)="confirm()">{{ okLabel() }}</ion-button></ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <ion-list>
        <ion-item lines="none"><ion-label>{{ fromLabel() }}</ion-label></ion-item>
        <ion-datetime presentation="date-time" [value]="fromIso()" (ionChange)="onFromChange($any($event.detail.value))" />
        <ion-item lines="none"><ion-label>{{ toLabel() }}</ion-label></ion-item>
        <ion-datetime presentation="date-time" [value]="toIso()" (ionChange)="onToChange($any($event.detail.value))" />
      </ion-list>
    </ion-content>
  `,
})
export class SessionDurationModal {
  private readonly modalController = inject(ModalController);

  // inputs are StoreDateTime (yyyyMMddHHmmss); convert to ISO for ion-datetime
  public fromDateTime = input.required<string>();
  public toDateTime = input.required<string>();
  public title = input('Zeitraum wählen');
  public fromLabel = input('Von');
  public toLabel = input('Bis');
  public okLabel = input('OK');
  public cancelLabel = input('Abbrechen');

  protected fromIso = signal('');
  protected toIso = signal('');

  constructor() {
    // initialise the ISO signals from the StoreDateTime inputs once they resolve
    queueMicrotask(() => {
      this.fromIso.set(convertDateFormatToString(this.fromDateTime(), DateFormat.StoreDateTime, DateFormat.IsoDateTime));
      this.toIso.set(convertDateFormatToString(this.toDateTime(), DateFormat.StoreDateTime, DateFormat.IsoDateTime));
    });
  }

  /**
   * ion-datetime ionChange may emit ISO strings with milliseconds (e.g. "2026-06-24T12:00:00.000")
   * or a timezone offset (e.g. "2026-06-24T12:00:00+02:00"). date-fns parse() is strict about the
   * format pattern, so we normalise to exactly 19 chars (yyyy-MM-ddTHH:mm:ss) before storing.
   */
  private normalizeIso(value: string | null | undefined): string {
    if (!value) return '';
    return value.slice(0, 19);
  }

  protected onFromChange(value: string | null | undefined): void {
    this.fromIso.set(this.normalizeIso(value));
  }

  protected onToChange(value: string | null | undefined): void {
    this.toIso.set(this.normalizeIso(value));
  }

  protected confirm(): void {
    const from = convertDateFormatToString(this.fromIso(), DateFormat.IsoDateTime, DateFormat.StoreDateTime);
    const to = convertDateFormatToString(this.toIso(), DateFormat.IsoDateTime, DateFormat.StoreDateTime);
    this.modalController.dismiss({ from, to }, 'confirm');
  }

  protected cancel(): void {
    this.modalController.dismiss(null, 'cancel');
  }
}
