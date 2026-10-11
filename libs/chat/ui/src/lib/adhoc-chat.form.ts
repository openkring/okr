import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonAvatar, IonButton, IonCard, IonCardContent, IonCol, IonGrid, IonIcon, IonImg, IonItem, IonLabel, IonList, IonNote, IonRow } from '@ionic/angular/standalone';

import { AvatarInfo, UserModel } from '@okr/shared-models';
import { Checkbox, CheckboxI18n, ErrorNote, NotesInput, NotesInputI18n, RadioGroup, RadioGroupI18n, TextInput, TextInputI18n } from '@okr/shared-ui';
import { DESCRIPTION_LENGTH, SHORT_NAME_LENGTH } from '@okr/shared-constants';
import { SvgIconPipe } from '@okr/shared-pipes';
import { coerceBoolean } from '@okr/shared-util-core';
import { validateVestTree, vestErrors } from '@okr/shared-util-angular';

import { AvatarPipe } from '@okr/avatar-ui';
import { AdhocChatFormModel, adhocChatValidations, ChatRoomType, MatrixChatI18n } from '@okr/chat-util';

/**
 * Formular «Raum hinzufuegen» (planning/specs/2026-09-01-adhoc-chats-spec.md, Pinnwand: 1.95).
 *
 * Zuerst die Wahl des Raumtyps — sie entscheidet, welche Felder folgen:
 * - **direct**: genau eine weitere Person, kein Name (ein DM traegt den Namen der Gegenperson);
 * - **adhoc**: Name (Pflicht) und zwei bis 19 weitere Personen;
 * - **pinboard** (nur `privileged`, `canCreatePinboard`): Name, Beschreibung, Quellgruppen,
 *   Teilnahme (optOut/optIn) und «Antworten an alle zulassen».
 * Die Weiche fuer das Anlegen steht im `MatrixChatStore`.
 *
 * Die Personen- und Gruppenauswahl gehoert NICHT hierher — sie sind der bestehende
 * `PersonSelectModal` bzw. `GroupSelectModal`, die der Elternteil oeffnet
 * (`addMemberClicked`, `addSourceGroupClicked`). Das Formular zeigt nur, wer bzw. welche
 * Gruppe schon dabei ist, und laesst einzelne wieder entfernen.
 */
@Component({
  selector: 'okr-adhoc-chat-form',
  standalone: true,
  imports: [
    TextInput, NotesInput, Checkbox, RadioGroup, ErrorNote, AvatarPipe, SvgIconPipe,
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

        @if (!readOnlyType()) {
          <ion-card>
            <ion-card-content class="ion-no-padding">
              <ion-grid>
                <ion-row>
                  <ion-col size="12">
                    <okr-radio-group [i18n]="roomTypeI18n()" [stringList]="roomTypes()" [labels]="roomTypeLabels()"
                      [selectedString]="roomType()" (selectedStringChange)="onRoomTypeChange($event)" [readOnly]="isReadOnly()" />
                  </ion-col>
                </ion-row>
              </ion-grid>
            </ion-card-content>
          </ion-card>
        }

        @if (roomType() !== 'direct') {
          <ion-card>
            <ion-card-content class="ion-no-padding">
              <ion-grid>
                <ion-row>
                  <ion-col size="12" size-md="6">
                    <okr-text-input [i18n]="nameI18n()" [value]="name()" (valueChange)="onFieldChange('name', $event)"
                      [autofocus]="true" [maxLength]="shortNameLength" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="nameErrors()" />
                  </ion-col>
                </ion-row>
              </ion-grid>
            </ion-card-content>
          </ion-card>
        }

        @if (roomType() === 'pinboard') {
          <okr-notes-input [i18n]="descriptionI18n()" [value]="description()" (valueChange)="onFieldChange('description', $event)"
            [maxLength]="descriptionLength" [readOnly]="isReadOnly()" [errors]="descriptionErrors()" />

          <ion-card>
            <ion-card-content class="ion-no-padding">
              <div class="members-title">{{ i18n().pinboard_sources_title() }} · {{ sourceGroups().length }}</div>
              <ion-list lines="full">
                @for (group of sourceGroups(); track group.key) {
                  <ion-item class="member-item" lines="full">
                    <ion-avatar slot="start">
                      <ion-img src="{{ 'group.' + group.key | avatar }}" alt="Avatar" />
                    </ion-avatar>
                    <ion-label>{{ group.name2 }}</ion-label>
                    @if (!isReadOnly()) {
                      <ion-button slot="end" fill="clear" (click)="removeSourceGroup.emit(group.key)">
                        <ion-icon slot="icon-only" src="{{ 'cancel' | svgIcon }}" />
                      </ion-button>
                    }
                  </ion-item>
                }
                @if (!isReadOnly()) {
                  <ion-item class="member-item" button lines="none" (click)="addSourceGroupClicked.emit()">
                    <ion-icon slot="start" color="primary" src="{{ 'add-circle' | svgIcon }}" />
                    <ion-label color="primary">{{ i18n().pinboard_sources_add() }}</ion-label>
                  </ion-item>
                }
              </ion-list>
              @if (sourceGroups().length === 0) {
                <ion-note class="hint" color="medium">{{ i18n().pinboard_sources_empty() }}</ion-note>
              }
              <okr-error-note [errors]="sourceGroupsErrors()" />
            </ion-card-content>
          </ion-card>

          <ion-card>
            <ion-card-content class="ion-no-padding">
              <ion-grid>
                <ion-row>
                  <ion-col size="12" size-md="6">
                    <okr-radio-group [i18n]="joinModeI18n()" [stringList]="joinModes" [labels]="joinModeLabels()"
                      [selectedString]="joinMode()" (selectedStringChange)="onFieldChange('joinMode', $event)" [readOnly]="isReadOnly()" />
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <okr-checkbox [i18n]="allowReplyAllI18n()" [checked]="allowReplyAll()" (checkedChange)="onFieldChange('allowReplyAll', $event)"
                      [showHelper]="true" [readOnly]="isReadOnly()" />
                  </ion-col>
                </ion-row>
              </ion-grid>
              <ion-note class="hint" color="medium">{{ i18n().pinboard_hint() }}</ion-note>
            </ion-card-content>
          </ion-card>
        } @else {
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

                @if (canAddMember()) {
                  <ion-item class="member-item" button lines="none" (click)="addMemberClicked.emit()">
                    <ion-icon slot="start" color="primary" src="{{ 'add-circle' | svgIcon }}" />
                    <ion-label color="primary">{{ i18n().adhoc_member_add() }}</ion-label>
                  </ion-item>
                }
              </ion-list>
              <okr-error-note [errors]="membersErrors()" />

              @if (memberCount() < 2) {
                <ion-note class="hint" color="medium">{{ i18n().adhoc_members_empty() }}</ion-note>
              }
              <ion-note class="hint" color="medium">{{ isDirect() ? i18n().adhoc_hint_direct() : i18n().adhoc_hint() }}</ion-note>
            </ion-card-content>
          </ion-card>
        }

      </form>
    }
  `
})
export class AdhocChatForm {
  /** kept in step with the cap the Vest suite enforces on this field */
  protected readonly shortNameLength = SHORT_NAME_LENGTH;
  /** kept in step with the cap the Vest suite enforces on this field (= PINBOARD_DESCRIPTION_MAX) */
  protected readonly descriptionLength = DESCRIPTION_LENGTH;
  protected readonly joinModes = ['optOut', 'optIn'];

  // inputs
  public readonly i18n = input.required<MatrixChatI18n>();
  public formData = model.required<AdhocChatFormModel>();
  public readonly currentUser = input<UserModel | undefined>();
  public readonly readOnly = input(false);
  public readonly showForm = input(true);
  /** Nur `privileged` darf eine Pinnwand anlegen; sonst fehlt die Option im Raumtyp. */
  public readonly canCreatePinboard = input(false);
  /** true im Bearbeitungsmodus einer Pinnwand: der Raumtyp steht fest, die Auswahl entfaellt. */
  public readonly readOnlyType = input(false);

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();
  /** Der Elternteil oeffnet daraufhin den PersonSelectModal. */
  public readonly addMemberClicked = output<void>();
  /** personKey der Person, die wieder aus der Liste soll. */
  public readonly removeMember = output<string>();
  /** Der Elternteil oeffnet daraufhin den GroupSelectModal. */
  public readonly addSourceGroupClicked = output<void>();
  /** Gruppen-Key der Quellgruppe, die wieder aus der Liste soll. */
  public readonly removeSourceGroup = output<string>();

  // signal form — wraps formData with Vest validation
  protected readonly adhocForm = form(this.formData, (path) =>
    validateVestTree(path, adhocChatValidations as any),
  );
  private readonly validationResult = vestErrors(this.adhocForm);
  protected readonly nameErrors = computed(() => this.validationResult().getErrors('name'));
  protected readonly membersErrors = computed(() => this.validationResult().getErrors('members'));
  protected readonly descriptionErrors = computed(() => this.validationResult().getErrors('description'));
  protected readonly sourceGroupsErrors = computed(() => this.validationResult().getErrors('sourceGroups'));

  constructor() {
    effect(() => this.valid.emit(this.adhocForm().valid()));
  }

  // computed field accessors
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly roomType = computed((): ChatRoomType => this.formData()?.roomType ?? 'direct');
  protected readonly name = computed(() => this.formData()?.name ?? '');
  protected readonly description = computed(() => this.formData()?.description ?? '');
  protected readonly members = computed((): AvatarInfo[] => this.formData()?.members ?? []);
  protected readonly sourceGroups = computed((): AvatarInfo[] => this.formData()?.sourceGroups ?? []);
  protected readonly joinMode = computed(() => this.formData()?.joinMode ?? 'optOut');
  protected readonly allowReplyAll = computed(() => this.formData()?.allowReplyAll ?? false);
  /** Die anlegende Person zaehlt mit — sie steht als erste Zeile in der Liste. */
  protected readonly memberCount = computed(() => this.members().length + 1);
  protected readonly currentPersonKey = computed(() => this.currentUser()?.personKey ?? '');
  protected readonly currentUserName = computed(() => {
    const user = this.currentUser();
    return user ? `${user.firstName} ${user.lastName}`.trim() : '';
  });

  protected readonly isDirect = computed(() => this.roomType() === 'direct');
  /** Ein Direkt-Chat hat genau eine Gegenperson: ist sie gewaehlt, verschwindet die Zeile «hinzufuegen». */
  protected readonly canAddMember = computed(() => !this.isReadOnly() && !(this.isDirect() && this.members().length >= 1));

  protected readonly roomTypes = computed((): ChatRoomType[] =>
    this.canCreatePinboard() ? ['direct', 'adhoc', 'pinboard'] : ['direct', 'adhoc']);
  protected readonly roomTypeLabels = computed(() => this.roomTypes().map((t) => {
    switch (t) {
      case 'adhoc': return this.i18n().adhoc_roomType_adhoc();
      case 'pinboard': return this.i18n().adhoc_roomType_pinboard();
      default: return this.i18n().adhoc_roomType_direct();
    }
  }));
  protected readonly roomTypeI18n = computed(() => ({
    name: 'roomType',
    label: this.i18n().adhoc_roomType_label()
  } as RadioGroupI18n));

  protected readonly nameI18n = computed(() => ({
    name: 'name',
    label: this.i18n().adhoc_name_label(),
    placeholder: this.i18n().adhoc_name_placeholder(),
    helper: this.i18n().adhoc_name_helper()
  } as TextInputI18n));

  protected readonly descriptionI18n = computed(() => ({
    name: 'description',
    label: this.i18n().pinboard_description_label(),
    placeholder: this.i18n().pinboard_description_placeholder()
  } as NotesInputI18n));

  protected readonly joinModeLabels = computed(() => [this.i18n().pinboard_joinMode_optOut(), this.i18n().pinboard_joinMode_optIn()]);
  protected readonly joinModeI18n = computed(() => ({
    name: 'joinMode',
    label: this.i18n().pinboard_joinMode_label()
  } as RadioGroupI18n));

  protected readonly allowReplyAllI18n = computed(() => ({
    name: 'allowReplyAll',
    label: this.i18n().pinboard_allowReplyAll_label(),
    helper: this.i18n().pinboard_allowReplyAll_helper()
  } as CheckboxI18n));

  /******************************* actions *************************************** */
  protected onRoomTypeChange(value: string): void {
    const roomType = value as ChatRoomType;
    if (roomType === this.roomType()) return;
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, roomType }));
  }

  protected onFieldChange(fieldName: keyof AdhocChatFormModel, fieldValue: string | boolean): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }
}
