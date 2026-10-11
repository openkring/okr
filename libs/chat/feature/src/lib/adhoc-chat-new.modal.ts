import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { AvatarInfo, GroupModel, UserModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { getAvatarInfo, hasRole } from '@okr/shared-util-core';
import { dismissOverlay } from '@okr/shared-util-angular';
import { I18nService } from '@okr/shared-i18n';
import { AppStore, GroupSelectModal, PersonSelectModal, PersonSelectResult } from '@okr/shared-feature';

import { AdhocChatForm } from '@okr/chat-ui';
import { AdhocChatFormModel, ADHOC_CHAT_MAX_MEMBERS, MATRIX_CHAT_I18N_KEYS, MatrixChatI18n, newAdhocChatForm } from '@okr/chat-util';

/**
 * «Raum hinzufuegen» — ein Modal fuer alle Raumtypen
 * (planning/specs/2026-09-01-adhoc-chats-spec.md §6, Pinnwand: 1.95).
 *
 * Der Raumtyp (Direkt-Chat / Ad-hoc-Chat / Pinnwand) ist eine ausdrueckliche Wahl im Formular;
 * die Pinnwand bietet es nur `privileged` an (`canCreatePinboard`). Erzwungen werden die
 * Regeln je Typ von `adhocChatValidations` ueber `formValid`; angelegt wird hier nichts —
 * der Modal gibt das ausgefuellte Formular zurueck, und der `MatrixChatStore` entscheidet
 * anhand von `roomType`, welche Cloud Function er ruft.
 *
 * `mode: 'editPinboard'` (Task 10) oeffnet denselben Modal mit `initial` zum Bearbeiten einer
 * Pinnwand: der Raumtyp steht dann fest und die Auswahl ist ausgeblendet.
 *
 * Die Personenauswahl ist der bestehende `PersonSelectModal`, die Gruppenauswahl der
 * `GroupSelectModal`: je ein Eintrag pro Oeffnen.
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
    <okr-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
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
          [canCreatePinboard]="canCreatePinboard()"
          [readOnlyType]="isEditMode()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
          (addMemberClicked)="addMember()"
          (removeMember)="removeMember($event)"
          (addSourceGroupClicked)="addSourceGroup()"
          (removeSourceGroup)="removeSourceGroup($event)"
        />
      }
    </ion-content>
  `
})
export class AdhocChatNewModal {
  private readonly modalController = inject(ModalController);
  private readonly appStore = inject(AppStore);
  protected readonly i18n = inject(I18nService).translateAll(MATRIX_CHAT_I18N_KEYS) as MatrixChatI18n;

  // inputs
  public readonly mode = input<'create' | 'editPinboard'>('create');
  /** Ausgangswerte im Bearbeitungsmodus; einmal uebernommen, danach gehoert das Formular dem Benutzer. */
  public readonly initial = input<AdhocChatFormModel | undefined>();

  // signals
  protected readonly currentUser = computed(() => this.appStore.currentUser());
  protected readonly isEditMode = computed(() => this.mode() === 'editPinboard');
  protected readonly canCreatePinboard = computed(() => hasRole('privileged', this.currentUser()));
  protected readonly formDirty = signal(false);
  protected readonly formValid = signal(false);
  protected readonly showForm = signal(true);
  public readonly formData = signal<AdhocChatFormModel>(newAdhocChatForm());

  protected readonly headerTitle = computed(() =>
    this.isEditMode() ? this.i18n.pinboard_edit_header() : this.i18n.adhoc_new_header());

  /** Der Speicherbalken erscheint, sobald etwas Gueltiges zu speichern ist — fuer jeden Raumtyp. */
  protected readonly showConfirmation = computed(() => this.formValid() && this.formDirty());

  protected readonly changeConfirmationI18n = computed(() => ({
    cancel: this.i18n.cancel(),
    save: this.isEditMode() ? this.i18n.save() : this.i18n.adhoc_create_action()
  } as ChangeConfirmationI18n));

  constructor() {
    // Die Inputs (componentProps) stehen erst nach dem Konstruktor fest: einmal uebernehmen,
    // ohne spaetere Aenderungen am Formular zu verfolgen.
    let seeded = false;
    effect(() => {
      const initial = this.initial();
      const editMode = this.isEditMode();
      if (seeded) return;
      seeded = true;
      untracked(() => this.formData.set(this.seed(initial, editMode)));
    });
  }

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    await dismissOverlay(this.modalController, this.formData(), 'confirm');
  }

  public cancel(): void {
    this.formDirty.set(false);
    this.formData.set(this.seed(this.initial(), this.isEditMode()));
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
    const vm = this.formData();
    if (vm.roomType === 'direct' && vm.members.length >= 1) return;
    if (vm.members.length + 1 >= ADHOC_CHAT_MAX_MEMBERS) return;

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

  /**
   * Eine Quellgruppe der Pinnwand hinzufuegen — ueber den GroupSelectModal, der die gewaehlte
   * Gruppe mit der Rolle 'confirm' zurueckgibt. Nur echte Gruppen taugen als Quelle; Ad-hoc-Chats
   * und Pinnwaende (die `GroupSelectModal` ebenfalls listet) verwirft der Server, deshalb schon hier.
   */
  protected async addSourceGroup(): Promise<void> {
    const currentUser = this.currentUser();
    if (!currentUser) return;
    const modal = await this.modalController.create({
      component: GroupSelectModal,
      cssClass: 'list-modal',
      componentProps: { selectedTag: '', currentUser },
    });
    await modal.present();
    const { data, role } = await modal.onWillDismiss<GroupModel>();
    if (role !== 'confirm' || !data?.okey) return;
    if ((data.kind ?? 'group') !== 'group') return;
    if (this.formData().sourceGroups.some((g) => g.key === data.okey)) return;
    const avatar = getAvatarInfo(data, 'group');
    if (!avatar) return;
    this.formDirty.set(true);
    this.formData.update((vm) => ({ ...vm, sourceGroups: [...vm.sourceGroups, avatar] }));
  }

  protected removeSourceGroup(groupKey: string): void {
    this.formDirty.set(true);
    this.formData.update((vm) => ({ ...vm, sourceGroups: vm.sourceGroups.filter((g) => g.key !== groupKey) }));
  }

  /** Weder die eigene Person noch Doppelte — beide waeren serverseitig ohnehin entfernt. */
  private addAvatar(avatar: AvatarInfo, currentUser: UserModel): void {
    if (avatar.key === currentUser.personKey) return;
    if (this.formData().members.some((m) => m.key === avatar.key)) return;
    this.formDirty.set(true);
    this.formData.update((vm) => ({ ...vm, members: [...vm.members, avatar] }));
  }

  /** Ein frisches Formular, im Bearbeitungsmodus aus `initial` (fehlende Felder mit Standardwerten). */
  private seed(initial: AdhocChatFormModel | undefined, editMode: boolean): AdhocChatFormModel {
    if (!editMode) return initial ? { ...newAdhocChatForm(), ...structuredClone(initial) } : newAdhocChatForm();
    return { ...newAdhocChatForm('pinboard'), ...(initial ? structuredClone(initial) : {}), roomType: 'pinboard' };
  }
}
