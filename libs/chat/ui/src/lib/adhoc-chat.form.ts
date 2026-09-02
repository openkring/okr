import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonAvatar, IonButton, IonCard, IonCardContent, IonCol, IonGrid, IonIcon, IonImg, IonItem, IonLabel, IonList, IonNote, IonRow } from '@ionic/angular/standalone';

import { AvatarInfo, UserModel } from '@okr/shared-models';
import { TextInput, TextInputI18n } from '@okr/shared-ui';
import { SvgIconPipe } from '@okr/shared-pipes';
import { coerceBoolean } from '@okr/shared-util-core';
import { validateVestTree } from '@okr/shared-util-angular';

import { AvatarPipe } from '@okr/avatar-ui';
import { AdhocChatFormModel, adhocChatValidations, MatrixChatI18n } from '@okr/chat-util';

/**
 * Formular fuer einen neuen Chat (planning/specs/2026-09-01-adhoc-chats-spec.md):
 * ein Name und die Liste der Mitglieder.
 *
 * Die Anzahl der Mitglieder entscheidet, was daraus wird — genau eine weitere Person ergibt
 * eine Direktnachricht (Name irrelevant), mehrere einen Ad-hoc-Chat (Name Pflicht). Das
 * Formular zeigt das nur an; die Weiche steht im `MatrixChatStore`.
 *
 * Die Personenauswahl selbst gehoert NICHT hierher — sie ist der bestehende
 * `PersonSelectModal`, den der Elternteil oeffnet (`addMemberClicked`). Das Formular
 * zeigt nur, wer schon dabei ist, und laesst einzelne wieder entfernen.
 */
@Component({
  selector: 'okr-adhoc-chat-form',
  standalone: true,
  imports: [
    TextInput, AvatarPipe, SvgIconPipe,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent,
    IonList, IonItem, IonLabel, IonAvatar, IonImg, IonButton, IonIcon, IonNote
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px; } }
    .members-title { font-size: 0.8rem; font-weight: 600; color: var(--ion-color-medium); padding: 12px 16px 4px 16px; letter-spacing: 0.02em; }
    .member-item { --min-height: 48px; }
    .hint { display: block; padding: 8px 16px 16px 16px; }
  `],
  template: `
    @if (showForm()) {
      <form novalidate>

        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="nameI18n()" [value]="name()" (valueChange)="onNameChange($event)"
                    [autofocus]="true" [maxLength]="50" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>

        <ion-card>
          <ion-card-content class="ion-no-padding">
            <div class="members-title">{{ i18n().adhoc_members_title() }} · {{ memberCount() }}</div>
            <ion-list lines="full">
              <ion-item class="member-item" lines="full">
                <ion-avatar slot="start">
                  <ion-img src="{{ 'person.' + currentPersonKey() | avatar }}" alt="Avatar" />
                </ion-avatar>
                <ion-label>{{ currentUserName() }}</ion-label>
                <ion-note slot="end">{{ i18n().adhoc_member_you() }}</ion-note>
              </ion-item>

              @for (member of members(); track member.key) {
                <ion-item class="member-item" lines="full">
                  <ion-avatar slot="start">
                    <ion-img src="{{ 'person.' + member.key | avatar }}" alt="Avatar" />
                  </ion-avatar>
                  <ion-label>{{ member.name1 }} {{ member.name2 }}</ion-label>
                  @if (!isReadOnly()) {
                    <ion-button slot="end" fill="clear" (click)="removeMember.emit(member.key)">
                      <ion-icon slot="icon-only" src="{{ 'cancel' | svgIcon }}" />
                    </ion-button>
                  }
                </ion-item>
              }

              @if (!isReadOnly()) {
                <ion-item class="member-item" button lines="none" (click)="addMemberClicked.emit()">
                  <ion-icon slot="start" color="primary" src="{{ 'add-circle' | svgIcon }}" />
                  <ion-label color="primary">{{ i18n().adhoc_member_add() }}</ion-label>
                </ion-item>
              }
            </ion-list>

            @if (memberCount() < 2) {
              <ion-note class="hint" color="medium">{{ i18n().adhoc_members_empty() }}</ion-note>
            }
            <ion-note class="hint" color="medium">{{ isDirect() ? i18n().adhoc_hint_direct() : i18n().adhoc_hint() }}</ion-note>
          </ion-card-content>
        </ion-card>

      </form>
    }
  `
})
export class AdhocChatForm {
  // inputs
  public readonly i18n = input.required<MatrixChatI18n>();
  public formData = model.required<AdhocChatFormModel>();
  public readonly currentUser = input<UserModel | undefined>();
  public readonly readOnly = input(false);
  public readonly showForm = input(true);

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();
  /** Der Elternteil oeffnet daraufhin den PersonSelectModal. */
  public readonly addMemberClicked = output<void>();
  /** personKey der Person, die wieder aus der Liste soll. */
  public readonly removeMember = output<string>();

  // signal form — wraps formData with Vest validation
  protected readonly adhocForm = form(this.formData, (path) =>
    validateVestTree(path, adhocChatValidations as any),
  );

  constructor() {
    effect(() => this.valid.emit(this.adhocForm().valid()));
  }

  // computed field accessors
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly name = computed(() => this.formData()?.name ?? '');
  protected readonly members = computed((): AvatarInfo[] => this.formData()?.members ?? []);
  /** Die anlegende Person zaehlt mit — sie steht als erste Zeile in der Liste. */
  protected readonly memberCount = computed(() => this.members().length + 1);
  protected readonly currentPersonKey = computed(() => this.currentUser()?.personKey ?? '');
  protected readonly currentUserName = computed(() => {
    const user = this.currentUser();
    return user ? `${user.firstName} ${user.lastName}`.trim() : '';
  });

  /** Genau eine weitere Person: daraus wird eine Direktnachricht, kein Ad-hoc-Chat. */
  protected readonly isDirect = computed(() => this.members().length === 1);

  protected nameI18n = computed(() => ({
    name: 'name',
    label: this.i18n().adhoc_name_label(),
    placeholder: this.i18n().adhoc_name_placeholder(),
    helper: this.isDirect() ? this.i18n().adhoc_name_helper_direct() : this.i18n().adhoc_name_helper()
  } as TextInputI18n));

  protected onNameChange(value: string): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, name: value }));
  }
}
