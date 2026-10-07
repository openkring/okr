import { Component, computed, effect, inject, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonAvatar, IonButton, IonCard, IonCardContent, IonIcon, IonImg, IonItem, IonLabel, IonList } from '@ionic/angular/standalone';

import { AvatarInfo, UserModel } from '@okr/shared-models';
import { ModelSelectService } from '@okr/shared-feature';
import { COMMENT_LENGTH } from '@okr/shared-constants';
import { SvgIconPipe } from '@okr/shared-pipes';
import { ErrorNote, TextareaInput, TextInputI18n } from '@okr/shared-ui';
import { validateVestTree } from '@okr/shared-util-angular';
import { coerceBoolean, getAvatarName } from '@okr/shared-util-core';
import { AvatarPipe } from '@okr/avatar-ui';
import { getDefaultIcon } from '@okr/avatar-util';

import { InvitePersonsFormData, InvitePersonsI18n, invitePersonsValidations } from '@okr/relationship-invitation-util';

/**
 * Wen einladen, und mit welcher Nachricht.
 *
 * Zwei Felder, weil eine Einladung genau zwei Angaben braucht: die Personen und einen Satz dazu.
 * Beide Angaben gelten fuer ALLE Ausgewaehlten — pro Person entsteht ein eigenes
 * Einladungsdokument mit demselben Text, weil der Antwortzustand pro Person gefuehrt wird.
 *
 * Die Auswahl sucht zweistufig: zuerst Personen mit Benutzerkonto in DIESEM Mandanten, darunter
 * alle uebrigen Personen. Wer kein Konto hat, bekommt die Einladung per E-Mail und antwortet ueber
 * die signierten Links darin (onInvitationCreated, emailWithoutAccount) — das loest Entscheidung 9
 * der Spec „Offene Anlaesse" ab, die nur registrierte Benutzer zuliess. Eine Person muss es aber
 * geben (und sie braucht eine E-Mail-Adresse), freie Adressen gibt es hier bewusst nicht.
 */
@Component({
  selector: 'okr-invite-persons-form',
  standalone: true,
  imports: [
    AvatarPipe, SvgIconPipe, TextareaInput, ErrorNote,
    IonCard, IonCardContent, IonButton, IonIcon, IonList, IonItem, IonAvatar, IonImg, IonLabel,
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px;} }
    ion-avatar { width: 30px; height: 30px; }
    .remove { cursor: pointer; }
    .select { padding: 8px 16px; }
  `],
  template: `
    @if (showForm()) {
      <form novalidate>
        <!-- one card: who (button + picked persons) and the optional message -->
        <ion-card>
          <ion-card-content class="ion-no-padding">
            @if (!isReadOnly()) {
              <!-- not inside an ion-item: an item shrinks its buttons to the condensed item size -->
              <div class="select">
                <ion-button expand="block" (click)="selectPerson()">
                  <ion-icon slot="start" src="{{ 'person-add' | svgIcon }}" />
                  {{ i18n().invite_persons_select() }}
                </ion-button>
              </div>
            }
            <okr-error-note [errors]="inviteesErrors()" />
            @if (invitees().length > 0) {
              <ion-list>
                @for (avatar of invitees(); track avatar.key) {
                  <ion-item>
                    <ion-avatar slot="start">
                      <ion-img src="{{ avatar.modelType + '.' + avatar.key | avatar:defaultIcon }}" alt="Avatar" />
                    </ion-avatar>
                    <ion-label>{{ avatarName(avatar) }}</ion-label>
                    @if (!isReadOnly()) {
                      <ion-icon class="remove" slot="end" src="{{ 'cancel' | svgIcon }}" (click)="remove($index)" />
                    }
                  </ion-item>
                }
              </ion-list>
            }
            <okr-textarea-input [i18n]="messageI18n()" [value]="message()" (valueChange)="onMessageChange($event)"
              [maxLength]="messageLength" [rows]="3" [showHelper]="true" [readOnly]="isReadOnly()" />
            <okr-error-note [errors]="messageErrors()" />
          </ion-card-content>
        </ion-card>
      </form>
    }
  `,
})
export class InvitePersonsForm {
  private readonly modelSelectService = inject(ModelSelectService);

  // inputs
  public readonly i18n = input.required<InvitePersonsI18n>();
  public formData = model.required<InvitePersonsFormData>();
  public readonly currentUser = input<UserModel | undefined>();
  /** The tenant the invitation is written in — the picker offers only accounts of this tenant. */
  public readonly tenantId = input.required<string>();
  /** okeys the picker must not offer: the organiser and everybody already on the event. */
  public readonly excludeKeys = input<string[]>([]);
  public readonly readOnly = input(false);
  public readonly showForm = input(true);

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  protected readonly inviteForm = form(this.formData, (path) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    validateVestTree(path, invitePersonsValidations as any));

  // per-field errors for the notes; per-invitee key errors are folded into the list's note
  private readonly validationResult = computed(() => invitePersonsValidations(this.formData()));
  protected readonly messageErrors = computed(() => this.validationResult().getErrors('message'));
  protected readonly inviteesErrors = computed(() => {
    const all = this.validationResult().getErrors();
    return Object.entries(all).filter(([key]) => key === 'invitees' || key.startsWith('invitees[')).flatMap(([, messages]) => messages);
  });

  constructor() {
    effect(() => this.valid.emit(this.inviteForm().valid()));
  }
  protected readonly message = computed(() => this.formData()?.message ?? '');
  protected readonly messageLength = COMMENT_LENGTH;
  protected readonly defaultIcon = getDefaultIcon('person');

  /**
   * Seeded from the model and written back through {@link setInvitees} — the same path the message
   * takes, so `dirty`/`valid` stay in step whether a person is added or removed.
   */
  protected readonly invitees = computed(() => this.formData()?.invitees ?? []);

  protected messageI18n = computed(() => ({
    name: 'message',
    label: this.i18n().invite_message_label(),
    placeholder: this.i18n().invite_message_placeholder(),
    helper: this.i18n().invite_message_helper(),
  } as TextInputI18n));

  /** Adds one person; the picker offers only registered users who are not already on the event. */
  public async selectPerson(): Promise<void> {
    const picked = [...(this.formData()?.invitees ?? [])];
    const avatar = await this.modelSelectService.selectPersonAvatar('', '', false, false, {
      accountsFirst: this.tenantId(),
      excludeKeys: [...this.excludeKeys(), ...picked.map(person => person.key)],
    });
    if (!avatar) return;
    this.setInvitees([...picked, avatar]);
  }

  protected remove(index: number): void {
    this.setInvitees(this.invitees().filter((_, i) => i !== index));
  }

  protected avatarName(avatar: AvatarInfo): string {
    return getAvatarName(avatar, this.currentUser()?.nameDisplay);
  }

  protected onMessageChange(message: string): void {
    this.dirty.emit(true);
    this.formData.update(data => ({ ...data, message }));
  }

  public setInvitees(invitees: AvatarInfo[]): void {
    this.dirty.emit(true);
    this.formData.update(data => ({ ...data, invitees }));
  }
}
