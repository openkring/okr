import { Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Network } from '@capacitor/network';
import {
  ActionSheetController, AlertController, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton,
  IonTitle, IonToolbar, ModalController, PopoverController, ToastController,
} from '@ionic/angular';

import { ModelSelectService } from '@okr/shared-feature';
import { SvgIconPipe } from '@okr/shared-pipes';
import { createActionSheetButton, createActionSheetOptions, okrPrompt } from '@okr/shared-util-angular';
import { fill, registerBundledIcons } from '@okr/shared-util-core';
import { JournalEditModal } from '@okr/travel-journal-ui';
import { JournalFormModel, journalFormOf, journalPatch, JournalListAction, journalListMenu, journalListSheet, JournalWriteSlow } from '@okr/travel-journal-util';
import { continueWhenSlow, showJournalError } from './journal-errors';
import { openJournalInfo } from './journal-info';
import { JournalGuestsSheet } from './journal-guests';
import { openGuestsModal } from './journal-guests.modal';
import { openJournalMenu } from './journal-menu-open';
import { openPhotoSyncModal } from './journal-photo-sync.modal';
import { JOURNAL_ICONS } from './journal-icons';
import { JournalStore } from './journal.store';

/** All travel journals on this device (spec 1.113); opens one, or creates a new one. */
@Component({
  selector: 'okr-journal-list-page',
  imports: [IonHeader, IonToolbar, IonButtons, IonMenuButton, IonTitle, IonContent, IonList, IonItem, IonLabel, IonButton, IonIcon, SvgIconPipe],
  styles: [`
    .thumb { width: 48px; height: 48px; border-radius: 8px; display: flex; align-items: center; justify-content: center;
      background: var(--ion-color-light); color: var(--ion-color-medium); }
    .thumb ion-icon { font-size: 24px; }
    .thumb img { width: 100%; height: 100%; object-fit: cover; border-radius: 8px; display: block; }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ store.i18n.list_title() }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="info()" [attr.aria-label]="store.i18n.info()"><ion-icon slot="icon-only" src="{{ 'info-circle' | svgIcon }}" /></ion-button>
          @if (menuItems().length > 0) {
            <ion-button (click)="menu($event)" [attr.aria-label]="store.i18n.menu_open()"><ion-icon slot="icon-only" src="{{ 'ellipsis-vertical' | svgIcon }}" /></ion-button>
          }
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <ion-list>
          @for (journal of store.journals(); track journal.key) {
            <ion-item button detail="false" (click)="actions(journal.key, journal.title)">
              <div slot="start" class="thumb">
                @if (store.coverUrl(journal.key); as url) {
                  <img [src]="url" alt="" loading="lazy" />
                } @else {
                  <ion-icon src="{{ 'map' | svgIcon }}" />
                }
              </div>
              <ion-label>{{ journal.title || store.i18n.untitled() }}</ion-label>
            </ion-item>
          } @empty {
            <ion-item lines="none"><ion-label class="ion-text-wrap">{{ store.i18n.list_empty() }}</ion-label></ion-item>
          }
        </ion-list>
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
  private readonly guestsSheet = inject(JournalGuestsSheet);
  private readonly modalController = inject(ModalController);
  private readonly popoverController = inject(PopoverController);

  protected readonly menuItems = computed(() => journalListMenu({ native: this.store.native(), canWrite: this.store.canWrite() }));

  public constructor() {
    registerBundledIcons(JOURNAL_ICONS); // the journal renders its icons offline (spec 1.126)
    void this.store.init();
  }

  protected info(): Promise<void> {
    return openJournalInfo(this.modalController);
  }

  protected async menu(event: Event): Promise<void> {
    switch (await openJournalMenu(this.popoverController, event, this.menuItems(), this.store.i18n)) {
      case 'newJournal': return this.create();
      case 'photoSync': return openPhotoSyncModal(this.modalController);
    }
  }

  protected open(journalKey: string): void {
    void this.router.navigate(['/journal', journalKey]);
  }

  protected async actions(journalKey: string, title: string): Promise<void> {
    const i18n = this.store.i18n;
    const imgix = this.store.appStore.services.imgixBaseUrl();
    const options = createActionSheetOptions(title || i18n.untitled());
    const labels: Record<JournalListAction, [string, string]> = {
      'journal.open': [i18n.list_open(), 'map'],
      'journal.edit': [i18n.list_edit(), 'edit'],
      'journal.delete': [i18n.list_delete(), 'trash'],
      'journal.authors': [i18n.list_manage(), 'person-add'],
      'journal.guests': [i18n.list_manage(), 'people'],
      'journal.notice': [i18n.list_notify(), 'send'],
    };
    const groupLabels = { journal: i18n.list_group_journal(), authors: i18n.list_group_authors(), guests: i18n.list_group_guests() };
    for (const { group, actions } of journalListSheet({ canWrite: this.store.canWrite() })) {
      options.buttons.push({ text: groupLabels[group], disabled: true, cssClass: 'okr-sheet-group-label' });
      actions.forEach((action, i) => {
        const [text, icon] = labels[action];
        const button = createActionSheetButton(action, text, imgix, icon);
        if (i === 0) button.cssClass = 'okr-sheet-group-start';
        options.buttons.push(button);
      });
    }
    options.buttons.push(createActionSheetButton('cancel', i18n.cancel(), imgix, 'cancel'));
    const sheet = await this.actionSheetController.create(options);
    await sheet.present();
    const { data } = await sheet.onDidDismiss<{ action: string }>();
    switch (data?.action) {
      case 'journal.open': return this.open(journalKey);
      case 'journal.edit': return this.edit(journalKey);
      case 'journal.authors': return this.addCoAuthor(journalKey);
      case 'journal.guests': return openGuestsModal(this.modalController, this.guestsSheet, journalKey);
      case 'journal.notice': return this.guestsSheet.notify(journalKey);
      case 'journal.delete': return this.confirmDelete(journalKey);
    }
  }

  /** «Reisetagebuch ändern»: title, subtitle, cover photo and labels in one modal (spec 1.154). */
  private async edit(journalKey: string): Promise<void> {
    const current = this.store.journals().find((j) => j.key === journalKey);
    if (!current) return;
    const covers = this.store.coverChoices(journalKey);
    const modal = await this.modalController.create({ component: JournalEditModal, componentProps: { journal: journalFormOf(current), covers } });
    await modal.present();
    const { data, role } = await modal.onWillDismiss<JournalFormModel>();
    if (role !== 'confirm' || !data) return;
    await this.run(() => this.store.updateJournal(journalKey, journalPatch(data, current)));
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
    // the key is chosen here: a slow write keeps its record (it will land), so the new journal opens anyway
    const key = crypto.randomUUID();
    let slow: boolean;
    try {
      slow = await continueWhenSlow(() => this.store.createJournal(title.trim(), key));
    } catch (error) {
      await showJournalError(this.toastController, i18n, error);
      return;
    }
    this.open(key);
    if (slow) await showJournalError(this.toastController, i18n, new JournalWriteSlow());
  }
}
