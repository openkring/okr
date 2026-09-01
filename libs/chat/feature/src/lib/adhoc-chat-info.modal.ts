import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonAvatar, IonButton, IonContent, IonIcon, IonImg, IonItem, IonLabel, IonList, IonNote, ModalController } from '@ionic/angular/standalone';

import { AvatarInfo } from '@okr/shared-models';
import { Header } from '@okr/shared-ui';
import { SvgIconPipe } from '@okr/shared-pipes';
import { AlertService, dismissOverlay } from '@okr/shared-util-angular';
import { fill, getAvatarInfo } from '@okr/shared-util-core';
import { I18nService } from '@okr/shared-i18n';
import { AppStore, PersonSelectModal, PersonSelectResult } from '@okr/shared-feature';

import { AvatarPipe } from '@okr/avatar-ui';
import { MatrixChatService } from '@okr/chat-data-access';
import { ADHOC_CHAT_MAX_MEMBERS, MATRIX_CHAT_I18N_KEYS, MatrixChatI18n } from '@okr/chat-util';

/**
 * Chat-Info eines Ad-hoc-Chats: wer drin ist, wer dazukommt, und der Austritt
 * (planning/specs/2026-09-01-adhoc-chats-spec.md §5, §10.2).
 *
 * Hinzufuegen darf jedes Mitglied — es gibt keine Chat-Admins. Wer neu dazukommt, liest
 * ab dem Beitritt mit: der Raum traegt `history_visibility: 'joined'`.
 *
 * Der Modal fuehrt den Austritt nicht selbst aus: er schliesst mit der Rolle `leave`, und
 * der `MatrixChatStore` fragt nach und ruft die Cloud Function. So bleibt der Modal frei
 * vom Store, der ihn oeffnet. Das Hinzufuegen dagegen laeuft direkt ueber den
 * `MatrixChatService` — eine data-access-Abhaengigkeit, kein Zirkelbezug — damit der Modal
 * dafuer nicht schliessen muss.
 */
@Component({
  selector: 'okr-adhoc-chat-info-modal',
  standalone: true,
  imports: [
    Header, AvatarPipe, SvgIconPipe,
    IonContent, IonList, IonItem, IonLabel, IonAvatar, IonImg, IonNote, IonButton, IonIcon
  ],
  styles: [`
    .chat-name { font-size: 1.25rem; font-weight: 600; text-align: center; padding: 20px 16px 4px 16px; }
    .members-title { font-size: 0.8rem; font-weight: 600; color: var(--ion-color-medium); padding: 16px 16px 4px 16px; letter-spacing: 0.02em; }
    .hint { display: block; padding: 8px 16px 16px 16px; }
    .leave { padding: 8px 16px 0 16px; }
  `],
  template: `
    <okr-header [i18n]="{ title: i18n.adhoc_info_header() }" [isModal]="true" />
    <ion-content class="ion-no-padding">
      <div class="chat-name">{{ chatName() }}</div>

      <div class="members-title">{{ i18n.adhoc_members_title() }} · {{ members().length }}</div>
      <ion-list lines="full">
        @for (member of members(); track member.key) {
          <ion-item>
            <ion-avatar slot="start">
              <ion-img src="{{ 'person.' + member.key | avatar }}" alt="Avatar" />
            </ion-avatar>
            <ion-label>{{ member.name1 }} {{ member.name2 }}</ion-label>
            @if (member.key === currentPersonKey()) {
              <ion-note slot="end">{{ i18n.adhoc_member_you() }}</ion-note>
            }
          </ion-item>
        }

        @if (canAddMore()) {
          <ion-item button lines="none" [disabled]="isAdding()" (click)="addMember()">
            <ion-icon slot="start" color="primary" src="{{ 'add-circle' | svgIcon }}" />
            <ion-label color="primary">{{ i18n.adhoc_member_add() }}</ion-label>
          </ion-item>
        }
      </ion-list>
      <ion-note class="hint" color="medium">{{ i18n.adhoc_history_hint() }}</ion-note>

      <div class="leave">
        <ion-button expand="block" fill="clear" color="danger" (click)="leave()">
          <ion-icon slot="start" src="{{ 'cancel' | svgIcon }}" />
          {{ i18n.adhoc_leave() }}
        </ion-button>
      </div>
      <ion-note class="hint" color="medium">{{ i18n.adhoc_leave_hint() }}</ion-note>
    </ion-content>
  `
})
export class AdhocChatInfoModal {
  private readonly modalController = inject(ModalController);
  private readonly matrixService = inject(MatrixChatService);
  private readonly alertService = inject(AlertService);
  private readonly appStore = inject(AppStore);
  protected readonly i18n = inject(I18nService).translateAll(MATRIX_CHAT_I18N_KEYS) as MatrixChatI18n;

  // inputs
  public readonly chatName = input.required<string>();
  /** Der Schluessel des Chat-Dokuments (`groups/{okey}` mit `kind: 'chat'`). */
  public readonly groupKey = input.required<string>();
  public readonly initialMembers = input.required<AvatarInfo[]>();
  /** personKey der betrachtenden Person — markiert die eigene Zeile mit «du». */
  public readonly currentPersonKey = input<string>('');

  /**
   * Die Mitgliederliste kommt als Eingabe herein und waechst hier weiter: der Beitritt ist
   * serverseitig schon passiert, aber der Matrix-Sync braucht einen Moment, und bis dahin
   * soll die Liste bereits stimmen.
   */
  protected readonly members = linkedSignal(() => [...this.initialMembers()]);
  protected readonly isAdding = signal(false);
  protected readonly canAddMore = computed(() => this.members().length < ADHOC_CHAT_MAX_MEMBERS);

  public async addMember(): Promise<void> {
    const currentUser = this.appStore.currentUser();
    if (!currentUser || this.isAdding()) return;

    const modal = await this.modalController.create({
      component: PersonSelectModal,
      cssClass: 'list-modal',
      componentProps: { selectedTag: '', currentUser },
    });
    await modal.present();
    const { data, role } = await modal.onWillDismiss<PersonSelectResult>();
    if (role !== 'confirm' || data?.kind !== 'predefined') return;

    const avatar = getAvatarInfo(data.person, 'person');
    if (!avatar) return;
    if (this.members().some((m) => m.key === avatar.key)) return;   // schon dabei

    await this.add(avatar);
  }

  private async add(avatar: AvatarInfo): Promise<void> {
    this.isAdding.set(true);
    try {
      const added = await this.matrixService.addAdhocChatMembers(this.groupKey(), [avatar.key]);
      if (added.includes(avatar.key)) {
        this.members.update((list) => [...list, avatar]);
        await this.alertService.showToast(
          fill(this.i18n.adhoc_member_add_conf(), { name: `${avatar.name1} ${avatar.name2}`.trim() }));
      }
    } catch (error) {
      console.error('AdhocChatInfoModal.add: failed:', error);
      await this.alertService.showToast(this.i18n.adhoc_member_add_error());
    } finally {
      this.isAdding.set(false);
    }
  }

  public async leave(): Promise<void> {
    await dismissOverlay(this.modalController, undefined, 'leave');
  }
}
