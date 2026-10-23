import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import {
  AlertController, IonButton, IonButtons, IonContent, IonHeader, IonItem, IonLabel, IonList, IonMenuButton, IonTitle,
  IonToolbar, ToastController,
} from '@ionic/angular';

import { okrPrompt } from '@okr/shared-util-angular';
import { showJournalError } from './journal-errors';
import { JournalStore } from './journal.store';

/** All travel journals on this device (spec 1.113); opens one, or creates a new one. */
@Component({
  selector: 'okr-journal-list-page',
  imports: [IonHeader, IonToolbar, IonButtons, IonMenuButton, IonTitle, IonContent, IonList, IonItem, IonLabel, IonButton],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ store.i18n.list_title() }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      @if (!store.native()) {
        <p>{{ store.i18n.native_only() }}</p>
      } @else {
        <ion-list>
          @for (journal of store.journals(); track journal.key) {
            <ion-item button detail (click)="open(journal.key)">
              <ion-label>{{ journal.title || store.i18n.untitled() }}</ion-label>
            </ion-item>
          } @empty {
            <ion-item lines="none"><ion-label class="ion-text-wrap">{{ store.i18n.list_empty() }}</ion-label></ion-item>
          }
        </ion-list>
        <ion-button expand="block" (click)="create()">{{ store.i18n.list_new() }}</ion-button>
      }
    </ion-content>
  `,
})
export class JournalListPage {
  protected readonly store = inject(JournalStore);
  private readonly router = inject(Router);
  private readonly alertController = inject(AlertController);
  private readonly toastController = inject(ToastController);

  public constructor() {
    void this.store.init();
  }

  protected open(journalKey: string): void {
    void this.router.navigate(['/journal', journalKey]);
  }

  protected async create(): Promise<void> {
    const i18n = this.store.i18n;
    const title = await okrPrompt(this.alertController, i18n.list_new_prompt(), i18n.list_new(), i18n.save(), i18n.cancel());
    if (!title?.trim()) return;
    try {
      const key = await this.store.createJournal(title.trim());
      this.open(key);
    } catch (error) {
      await showJournalError(this.toastController, i18n, error);
    }
  }
}
