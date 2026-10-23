import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Network } from '@capacitor/network';
import {
  ActionSheetController, AlertController, IonButton, IonButtons, IonContent, IonHeader, IonItem, IonLabel, IonList, IonMenuButton, IonTitle,
  IonToolbar, ToastController,
} from '@ionic/angular';

import { ModelSelectService } from '@okr/shared-feature';
import { okrPrompt } from '@okr/shared-util-angular';
import { fill } from '@okr/shared-util-core';
import { showJournalError } from './journal-errors';
import { JournalSyncLine } from './journal-sync-line';
import { JournalStore } from './journal.store';

/** All travel journals on this device (spec 1.113); opens one, or creates a new one. */
@Component({
  selector: 'okr-journal-list-page',
  imports: [IonHeader, IonToolbar, IonButtons, IonMenuButton, IonTitle, IonContent, IonList, IonItem, IonLabel, IonButton, JournalSyncLine],
  styles: [`.title { cursor: pointer; } okr-journal-sync-line { margin-top: 12px; }`],
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
            <ion-item>
              <ion-label class="title" (click)="open(journal.key)">{{ journal.title || store.i18n.untitled() }}</ion-label>
              <ion-button slot="end" fill="clear" (click)="actions(journal.key, journal.title)">{{ store.i18n.list_actions() }}</ion-button>
            </ion-item>
          } @empty {
            <ion-item lines="none"><ion-label class="ion-text-wrap">{{ store.i18n.list_empty() }}</ion-label></ion-item>
          }
        </ion-list>
        <ion-button expand="block" (click)="create()">{{ store.i18n.list_new() }}</ion-button>
        <okr-journal-sync-line [status]="store.syncStatus()" [paused]="store.photosPaused()" [i18n]="store.i18n"
          (syncNow)="store.syncNow()" (togglePhotos)="store.setPhotosPaused(!store.photosPaused())" />
      }
    </ion-content>
  `,
})
export class JournalListPage {
  protected readonly store = inject(JournalStore);
  private readonly router = inject(Router);
  private readonly alertController = inject(AlertController);
  private readonly toastController = inject(ToastController);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly modelSelectService = inject(ModelSelectService);

  public constructor() {
    void this.store.init();
  }

  protected open(journalKey: string): void {
    void this.router.navigate(['/journal', journalKey]);
  }

  protected async actions(journalKey: string, title: string): Promise<void> {
    const i18n = this.store.i18n;
    const sheet = await this.actionSheetController.create({
      header: title || i18n.untitled(),
      buttons: [
        { text: i18n.list_rename(), handler: () => void this.rename(journalKey, title) },
        { text: i18n.list_coauthor(), handler: () => void this.addCoAuthor(journalKey) },
        { text: i18n.list_delete(), role: 'destructive', handler: () => void this.confirmDelete(journalKey) },
        { text: i18n.cancel(), role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  private async rename(journalKey: string, current: string): Promise<void> {
    const i18n = this.store.i18n;
    const title = await okrPrompt(this.alertController, i18n.list_rename(), i18n.list_rename_prompt(), i18n.save(), i18n.cancel(), current);
    if (!title?.trim() || title.trim() === current) return;
    await this.run(() => this.store.renameJournal(journalKey, title.trim()));
  }

  /** Picks a person (needs the person list, so online only) and makes them a co-author. */
  private async addCoAuthor(journalKey: string): Promise<void> {
    const i18n = this.store.i18n;
    if (!(await Network.getStatus()).connected) {
      await this.toast(i18n.list_coauthor_offline());
      return;
    }
    const person = await this.modelSelectService.selectPersonAvatar();
    if (!person?.key) return; // cancelled, or a free-text name without a person
    await this.run(async () => {
      await this.store.addCoAuthor(journalKey, person);
      await this.toast(fill(i18n.list_coauthor_done(), { name: `${person.name1} ${person.name2}`.trim() }));
    });
  }

  private async toast(message: string): Promise<void> {
    const toast = await this.toastController.create({ message, duration: 2500, position: 'bottom' });
    await toast.present();
  }

  private async confirmDelete(journalKey: string): Promise<void> {
    const i18n = this.store.i18n;
    const sheet = await this.actionSheetController.create({
      header: i18n.list_delete_confirm(),
      buttons: [
        { text: i18n.list_delete(), role: 'destructive', handler: () => void this.run(() => this.store.archiveJournal(journalKey)) },
        { text: i18n.cancel(), role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  private async run(action: () => Promise<unknown>): Promise<void> {
    try {
      await action();
    } catch (error) {
      await showJournalError(this.toastController, this.store.i18n, error);
    }
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
