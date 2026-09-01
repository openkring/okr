import { Component, computed, inject, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { AvatarInfo, UserModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { getAvatarInfo } from '@okr/shared-util-core';
import { dismissOverlay } from '@okr/shared-util-angular';
import { I18nService } from '@okr/shared-i18n';
import { AppStore, PersonSelectModal, PersonSelectResult } from '@okr/shared-feature';

import { AdhocChatForm } from '@okr/chat-ui';
import { AdhocChatFormModel, ADHOC_CHAT_MAX_MEMBERS, MATRIX_CHAT_I18N_KEYS, MatrixChatI18n, newAdhocChatForm } from '@okr/chat-util';

/**
 * «Neuer Chat» — Name und Mitglieder eines Ad-hoc-Chats
 * (planning/specs/2026-09-01-adhoc-chats-spec.md §6).
 *
 * Die Personenauswahl ist der bestehende `PersonSelectModal`: eine Person je Oeffnen,
 * mit Suchkopf und flacher Liste. Angelegt wird hier nichts — der Modal gibt das
 * ausgefuellte Formular zurueck, und der `MatrixChatStore` ruft damit die Cloud Function.
 *
 * Der `MatrixChatStore` wird bewusst NICHT injiziert (er oeffnet diesen Modal), sonst
 * entsteht ein Zirkelbezug; die i18n kommt deshalb direkt aus dem `I18nService`.
 */
@Component({
  selector: 'okr-adhoc-chat-new-modal',
  standalone: true,
  imports: [
    Header, ChangeConfirmation, AdhocChatForm,
    IonContent
  ],
  template: `
    <okr-header [i18n]="{ title: i18n.adhoc_new_header() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as formData) {
        <okr-adhoc-chat-form
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [i18n]="i18n"
          [currentUser]="currentUser()"
          [showForm]="showForm()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
          (addMemberClicked)="addMember()"
          (removeMember)="removeMember($event)"
        />
      }
    </ion-content>
  `
})
export class AdhocChatNewModal {
  private readonly modalController = inject(ModalController);
  private readonly appStore = inject(AppStore);
  protected readonly i18n = inject(I18nService).translateAll(MATRIX_CHAT_I18N_KEYS) as MatrixChatI18n;

  // signals
  protected readonly currentUser = computed(() => this.appStore.currentUser());
  protected readonly formDirty = signal(false);
  protected readonly formValid = signal(false);
  protected readonly showForm = signal(true);
  public readonly formData = signal<AdhocChatFormModel>(newAdhocChatForm());

  /**
   * Der Speicherbalken erscheint erst, wenn wirklich etwas zu speichern ist. Ein Name
   * allein reicht nicht — ohne eine zweite Person gibt es keinen Chat.
   */
  protected readonly showConfirmation = computed(() =>
    this.formValid() && this.formDirty() && this.formData().members.length > 0);

  protected readonly changeConfirmationI18n = computed(() => ({
    cancel: this.i18n.cancel(),
    save: this.i18n.adhoc_create_action()
  } as ChangeConfirmationI18n));

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    await dismissOverlay(this.modalController, this.formData(), 'confirm');
  }

  public cancel(): void {
    this.formDirty.set(false);
    this.formData.set(newAdhocChatForm());
    // Formular neu aufbauen, damit Vest seinen Zustand verliert
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected onFormDataChange(formData: AdhocChatFormModel): void {
    this.formData.set(formData);
  }

  /**
   * Eine Person hinzufuegen — ueber den bestehenden PersonSelectModal, der genau eine
   * Person zurueckgibt. Fuer die naechste oeffnet man ihn erneut; das ist bewusst so,
   * statt eine zweite Mehrfachauswahl zu bauen.
   */
  protected async addMember(): Promise<void> {
    const currentUser = this.currentUser();
    if (!currentUser) return;
    if (this.formData().members.length + 1 >= ADHOC_CHAT_MAX_MEMBERS) return;

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
    this.addAvatar(avatar, currentUser);
  }

  protected removeMember(personKey: string): void {
    this.formDirty.set(true);
    this.formData.update((vm) => ({ ...vm, members: vm.members.filter((m) => m.key !== personKey) }));
  }

  /** Weder die eigene Person noch Doppelte — beide waeren serverseitig ohnehin entfernt. */
  private addAvatar(avatar: AvatarInfo, currentUser: UserModel): void {
    if (avatar.key === currentUser.personKey) return;
    if (this.formData().members.some((m) => m.key === avatar.key)) return;
    this.formDirty.set(true);
    this.formData.update((vm) => ({ ...vm, members: [...vm.members, avatar] }));
  }
}
