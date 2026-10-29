import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { IonButton, IonContent, IonIcon, IonItem, IonLabel, IonList, IonNote, IonSpinner, ModalController, ToastController } from '@ionic/angular';

import { AvatarDisplay } from '@okr/avatar-ui';
import { AvatarInfo } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { Header, HeaderI18n } from '@okr/shared-ui';

import { showJournalError } from './journal-errors';
import { JournalGuestsSheet } from './journal-guests';
import { JournalStore } from './journal.store';

/**
 * «Gäste verwalten» (spec 1.126 §3): the journal's guests as an avatar list with their link state. A tap opens the
 * guest's actions (share link, expiry, block, remove — removal is confirmed); «Gast hinzufügen» opens the person
 * picker. Guests are added and removed immediately, so there is nothing to confirm on close.
 */
@Component({
  selector: 'okr-journal-guests-modal',
  imports: [Header, IonContent, IonList, IonItem, IonLabel, IonNote, IonButton, IonIcon, IonSpinner, SvgIconPipe, AvatarDisplay],
  template: `
    <okr-header [i18n]="headerI18n()" [isModal]="true" />
    <ion-content class="ion-padding">
      @if (loading()) {
        <ion-spinner />
      } @else {
        <ion-list>
          @for (row of rows(); track row.guest.key) {
            <ion-item button detail="false" (click)="actions(row.guest)">
              <okr-avatar-display [avatars]="[row.guest]" [showName]="true" [maxAvatarsToShow]="1" />
              <ion-note slot="end">{{ row.state }}</ion-note>
            </ion-item>
          } @empty {
            <ion-item lines="none"><ion-label class="ion-text-wrap">{{ i18n.guests_empty() }}</ion-label></ion-item>
          }
        </ion-list>
      }
      <ion-button expand="block" fill="outline" (click)="add()">
        <ion-icon slot="start" src="{{ 'add' | svgIcon }}" />{{ i18n.guest_add() }}
      </ion-button>
    </ion-content>
  `,
})
export class JournalGuestsModal implements OnInit {
  private readonly store = inject(JournalStore);
  private readonly sheet = inject(JournalGuestsSheet);
  private readonly toastController = inject(ToastController);

  public readonly journalKey = input.required<string>();

  protected readonly i18n = this.store.i18n;
  protected readonly headerI18n = computed<HeaderI18n>(() => ({ title: this.i18n.guests_manage() }));
  protected readonly rows = signal<{ guest: AvatarInfo; state: string }[]>([]);
  protected readonly loading = signal(true);

  public ngOnInit(): void {
    void this.reload();
  }

  protected actions(guest: AvatarInfo): void {
    void this.sheet.guestActions(this.journalKey(), guest, () => void this.reload());
  }

  protected add(): void {
    void this.sheet.add(this.journalKey(), () => void this.reload());
  }

  private async reload(): Promise<void> {
    try {
      this.rows.set(await this.sheet.load(this.journalKey()));
    } catch (error) {
      await showJournalError(this.toastController, this.i18n, error);
    } finally {
      this.loading.set(false);
    }
  }
}

/** Opens «Gäste verwalten»; online only, because the links live behind a callable. */
export async function openGuestsModal(modalController: ModalController, sheet: JournalGuestsSheet, journalKey: string): Promise<void> {
  if (!(await sheet.isOnline())) return;
  const modal = await modalController.create({ component: JournalGuestsModal, componentProps: { journalKey } });
  await modal.present();
}
