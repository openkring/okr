import { Component, computed, inject, input } from '@angular/core';
import { IonButton, IonContent, ModalController } from '@ionic/angular';

import { Header, HeaderI18n } from '@okr/shared-ui';

import { JournalBookPrints } from './journal-book-prints';
import { JournalStore } from './journal.store';

/**
 * «Fotobuch erstellen oder ändern» (spec 1.126 §4): one entry point for the book. The book is designed in the
 * browser (the book page); on the iPad this is where the print-size photos are uploaded.
 */
@Component({
  selector: 'okr-journal-photo-book-modal',
  imports: [Header, IonContent, IonButton, JournalBookPrints],
  template: `
    <okr-header [i18n]="headerI18n()" [isModal]="true" />
    <ion-content class="ion-padding">
      @if (store.native()) {
        <p>{{ store.i18n.book_modal_desktop_hint() }}</p>
        <okr-journal-book-prints [journalKey]="journalKey()" />
      } @else {
        <ion-button expand="block" (click)="openBook()">{{ store.i18n.book_modal_open() }}</ion-button>
      }
    </ion-content>
  `,
})
export class JournalPhotoBookModal {
  protected readonly store = inject(JournalStore);
  private readonly modalController = inject(ModalController);

  public readonly journalKey = input.required<string>();

  protected readonly headerI18n = computed<HeaderI18n>(() => ({ title: this.store.i18n.book_modal_title() }));

  protected openBook(): void {
    void this.modalController.dismiss(true, 'confirm');
  }
}

/** Resolves true when the author chose to open the book page. */
export async function openPhotoBookModal(modalController: ModalController, journalKey: string): Promise<boolean> {
  const modal = await modalController.create({ component: JournalPhotoBookModal, componentProps: { journalKey } });
  await modal.present();
  const { role } = await modal.onWillDismiss();
  return role === 'confirm';
}
