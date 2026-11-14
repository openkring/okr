import { Component, computed, inject, input, signal } from '@angular/core';
import {
  IonContent, IonItem, IonLabel, IonList, IonRadio, IonRadioGroup, IonToggle, ModalController,
} from '@ionic/angular';

import { ChangeConfirmation, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { MatrixChatI18n, PIN_DURATIONS, PinDuration } from '@okr/chat-util';

/** What the pin dialog returns with role `confirm`. */
export interface PinMessageChoice {
  duration: PinDuration;
  forAll: boolean;
}

const DEFAULT_DURATION: PinDuration = '7d';

const DURATION_LABEL: Record<PinDuration, keyof MatrixChatI18n> = {
  '24h': 'pin_24h',
  '7d': 'pin_7d',
  '30d': 'pin_30d',
  forever: 'pin_forever',
};

/**
 * Picker: how long to pin a message and for whom (spec 1.109 §6). Durations 24 Stunden · 7 Tage
 * (default) · 30 Tage · Bis ich es löse; the «Für alle anheften» toggle only when the caller may
 * pin for everyone (off by default). Dismisses with `{ duration, forAll }` and role `confirm`.
 */
@Component({
  selector: 'okr-pin-message-modal',
  standalone: true,
  imports: [
    Header, ChangeConfirmation, IonContent, IonList, IonItem, IonLabel,
    IonRadioGroup, IonRadio, IonToggle,
  ],
  template: `
    <okr-header [i18n]="{ title: i18n().pin_title() }" [isModal]="true" />
    <!-- always shown: a duration is preselected, so pinning is possible from the start;
         its cancel only appears once the choice differs from the defaults -->
    <okr-change-confirmation [i18n]="{ cancel: i18n().cancel(), save: i18n().pin_action() }"
      [showCancel]="isChanged()" (saveClicked)="confirm()" (cancelClicked)="reset()" />
    <ion-content>
      <ion-list lines="full">
        <ion-radio-group [value]="duration()" (ionChange)="duration.set($any($event).detail.value)">
          @for (d of durations; track d) {
            <ion-item>
              <ion-radio [value]="d" justify="space-between">{{ label(d) }}</ion-radio>
            </ion-item>
          }
        </ion-radio-group>
      </ion-list>
      @if (canPinForAll()) {
        <ion-list lines="full">
          <ion-item>
            <ion-toggle [checked]="forAll()" (ionChange)="forAll.set($any($event).detail.checked)" justify="space-between">
              <ion-label>{{ i18n().pin_for_all() }}</ion-label>
            </ion-toggle>
          </ion-item>
        </ion-list>
      }
    </ion-content>
  `,
})
export class PinMessageModal {
  private readonly modalController = inject(ModalController);
  /** The chat labels (`store.i18n`), handed in so opening the modal resolves nothing again. */
  public readonly i18n = input.required<MatrixChatI18n>();

  /** Whether the «Für alle anheften» toggle is offered. */
  public readonly canPinForAll = input(false);

  protected readonly durations = PIN_DURATIONS;
  protected readonly duration = signal<PinDuration>(DEFAULT_DURATION);
  protected readonly forAll = signal(false);
  protected readonly isChanged = computed(() => this.duration() !== DEFAULT_DURATION || this.forAll());

  protected label(d: PinDuration): string {
    return this.i18n()[DURATION_LABEL[d]]();
  }

  /** the change-confirmation's cancel: back to the defaults, stay in the dialog */
  protected reset(): void {
    this.duration.set(DEFAULT_DURATION);
    this.forAll.set(false);
  }

  protected async confirm(): Promise<void> {
    const choice: PinMessageChoice = { duration: this.duration(), forAll: this.canPinForAll() && this.forAll() };
    await dismissOverlay(this.modalController, choice, 'confirm');
  }
}
