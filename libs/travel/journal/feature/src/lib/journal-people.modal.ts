import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { IonButton, IonContent, IonIcon, IonItem, IonLabel, IonList, IonNote, IonSpinner, ModalController, ToastController } from '@ionic/angular';

import { AvatarDisplay } from '@okr/avatar-ui';
import { SvgIconPipe } from '@okr/shared-pipes';
import { Header, HeaderI18n } from '@okr/shared-ui';

import { showJournalError } from './journal-errors';
import { JournalGuestsSheet, JournalPeopleMode, JournalPeopleRow } from './journal-guests';
import { JournalStore } from './journal.store';

/**
 * «Autoren verwalten» / «Gäste verwalten» (spec 1.154 §9): one list modal for both. A row is the red «entfernen»
 * icon (confirmed; hidden for the creator and yourself), the avatar with the name, the email when the screen is wide
 * enough, and for a guest the link state plus a warning when the guest has no email. A tap on a guest row opens the
 * link actions. People are added and removed immediately, so there is nothing to confirm on close — a list, not an
 * edit form (no change-confirmation; check-forms rule 4 does not apply: no inputs).
 */
@Component({
  selector: 'okr-journal-people-modal',
  imports: [Header, IonContent, IonList, IonItem, IonLabel, IonNote, IonButton, IonIcon, IonSpinner, SvgIconPipe, AvatarDisplay],
  styles: [`
    .remove.hidden { visibility: hidden; }
    .no-email { display: flex; align-items: center; gap: 4px; }
    @media (max-width: 575.98px) { .email { display: none; } }
  `],
  template: `
    <okr-header [i18n]="headerI18n()" [isModal]="true" />
    <ion-content class="ion-padding">
      @if (loading()) {
        <ion-spinner />
      } @else {
        <ion-list>
          @for (row of rows(); track row.person.key) {
            <ion-item [button]="isGuests()" detail="false" (click)="tap(row)">
              <ion-button slot="start" fill="clear" color="danger" class="remove" [class.hidden]="!row.removable" [disabled]="!row.removable"
                [attr.aria-hidden]="row.removable ? null : 'true'" [attr.aria-label]="i18n.people_remove()" (click)="remove($event, row)">
                <ion-icon slot="icon-only" src="{{ 'cancel-circle' | svgIcon }}" />
              </ion-button>
              <okr-avatar-display [avatars]="[row.person]" [showName]="true" [maxAvatarsToShow]="1" />
              @if (row.email) {
                <ion-note slot="end" class="email">{{ row.email }}</ion-note>
              }
              @if (isGuests()) {
                @if (row.noEmail) {
                  <ion-note slot="end" color="warning" class="no-email">
                    <ion-icon src="{{ 'warning' | svgIcon }}" aria-hidden="true" />{{ i18n.people_no_email() }}
                  </ion-note>
                }
                <ion-note slot="end">{{ row.state }}</ion-note>
              }
            </ion-item>
          } @empty {
            @if (isGuests()) {
              <ion-item lines="none"><ion-label class="ion-text-wrap">{{ i18n.guests_empty() }}</ion-label></ion-item>
            }
          }
        </ion-list>
      }
      <ion-button expand="block" fill="outline" (click)="add()">
        <ion-icon slot="start" src="{{ 'add' | svgIcon }}" />{{ isGuests() ? i18n.guest_add() : i18n.people_author_add() }}
      </ion-button>
    </ion-content>
  `,
})
export class JournalPeopleModal implements OnInit {
  private readonly store = inject(JournalStore);
  private readonly sheet = inject(JournalGuestsSheet);
  private readonly toastController = inject(ToastController);

  public readonly journalKey = input.required<string>();
  public readonly mode = input.required<JournalPeopleMode>();

  protected readonly i18n = this.store.i18n;
  protected readonly isGuests = computed(() => this.mode() === 'guests');
  protected readonly headerI18n = computed<HeaderI18n>(() => ({
    title: this.isGuests() ? this.i18n.guests_manage() : this.i18n.people_authors_manage(),
  }));
  protected readonly rows = signal<JournalPeopleRow[]>([]);
  protected readonly loading = signal(true);

  public ngOnInit(): void {
    void this.reload();
  }

  protected tap(row: JournalPeopleRow): void {
    if (this.isGuests()) void this.sheet.guestActions(this.journalKey(), row.person, () => void this.reload());
  }

  protected remove(event: Event, row: JournalPeopleRow): void {
    event.stopPropagation(); // not the row's tap
    if (row.removable) void this.sheet.confirmRemove(this.journalKey(), row.person, this.mode(), () => void this.reload());
  }

  protected add(): void {
    const changed = () => void this.reload();
    void (this.isGuests() ? this.sheet.add(this.journalKey(), changed) : this.sheet.addAuthor(this.journalKey(), changed));
  }

  private async reload(): Promise<void> {
    try {
      this.rows.set(await this.sheet.rows(this.journalKey(), this.mode()));
    } catch (error) {
      await showJournalError(this.toastController, this.i18n, error);
    } finally {
      this.loading.set(false);
    }
  }
}

/** Opens «Autoren verwalten» or «Gäste verwalten»; online only, because links and emails live behind a callable. */
export async function openPeopleModal(
  modalController: ModalController, sheet: JournalGuestsSheet, journalKey: string, mode: JournalPeopleMode,
): Promise<void> {
  if (!(await sheet.isOnline(mode))) return;
  const modal = await modalController.create({ component: JournalPeopleModal, componentProps: { journalKey, mode } });
  await modal.present();
}
