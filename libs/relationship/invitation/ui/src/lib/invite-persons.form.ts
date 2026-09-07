import { Component, computed, inject, input, linkedSignal, model, output } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { AvatarInfo, UserModel } from '@okr/shared-models';
import { ModelSelectService } from '@okr/shared-feature';
import { NotesInput, NotesInputI18n } from '@okr/shared-ui';
import { coerceBoolean } from '@okr/shared-util-core';
import { Avatars } from '@okr/avatar-ui';

import { InvitePersonsFormData, InvitePersonsI18n } from '@okr/relationship-invitation-util';

/**
 * Wen einladen, und mit welcher Nachricht.
 *
 * Zwei Felder, weil eine Einladung genau zwei Angaben braucht: die Personen und einen Satz dazu.
 * Beide Angaben gelten fuer ALLE Ausgewaehlten — pro Person entsteht ein eigenes
 * Einladungsdokument mit demselben Text, weil der Antwortzustand pro Person gefuehrt wird.
 *
 * Die Auswahl ist auf registrierte Benutzer DIESES Mandanten eingeschraenkt (Spec „Offene
 * Anlaesse", Entscheidung 9): wer hier keinen Zugang hat, koennte die Einladung nie beantworten —
 * ein Benutzerkonto gehoert zu genau einem Mandanten, auch wenn die Person in mehreren steht.
 * Deshalb gibt es hier auch bewusst kein „Person neu anlegen" — eine frisch angelegte Person
 * haette keinen Zugang.
 *
 * Kein Vest-Suite: das einzige Kriterium ist „mindestens eine Person", und das prueft `valid`
 * direkt. Eine Suite ohne Regel waere Zeremonie.
 */
@Component({
  selector: 'okr-invite-persons-form',
  standalone: true,
  imports: [
    Avatars, NotesInput,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent,
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              @if (currentUser(); as currentUser) {
                <ion-row>
                  <ion-col size="12">
                    <okr-avatars name="invitees" [avatars]="invitees()" (avatarsChange)="setInvitees($event)"
                      [currentUser]="currentUser"
                      [readOnly]="isReadOnly()" [editable]="true" [showButton]="true"
                      [label]="i18n().invite_persons_label()" [addLabel]="i18n().invite_persons_add()"
                      selectIcon="person" (selectClicked)="selectPerson()" />
                  </ion-col>
                </ion-row>
              }
              <ion-row>
                <ion-col size="12">
                  <okr-notes-input [i18n]="messageI18n()" [value]="message()"
                    (valueChange)="onMessageChange($event)" [rows]="4" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
            </ion-grid>
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
  protected readonly message = computed(() => this.formData()?.message ?? '');

  /**
   * Seeded from the model and written back through {@link setInvitees} — the same path the message
   * takes, so `dirty`/`valid` stay in step whether a person is added or removed (`okr-avatars`
   * removes entries itself).
   */
  protected readonly invitees = linkedSignal(() => this.formData()?.invitees ?? []);

  protected messageI18n = computed(() => ({
    name: 'message',
    label: this.i18n().invite_message_label(),
    placeholder: this.i18n().invite_message_placeholder(),
    helper: this.i18n().invite_message_helper(),
  } as NotesInputI18n));

  /** Adds one person; the picker offers only registered users who are not already on the event. */
  public async selectPerson(): Promise<void> {
    const picked = [...(this.formData()?.invitees ?? [])];
    const avatar = await this.modelSelectService.selectPersonAvatar('', '', false, false, {
      accountTenant: this.tenantId(),
      excludeKeys: [...this.excludeKeys(), ...picked.map(person => person.key)],
    });
    if (!avatar) return;
    this.setInvitees([...picked, avatar]);
  }

  protected onMessageChange(message: string): void {
    this.dirty.emit(true);
    this.formData.update(data => ({ ...data, message }));
    this.emitValid();
  }

  public setInvitees(invitees: AvatarInfo[]): void {
    this.dirty.emit(true);
    this.formData.update(data => ({ ...data, invitees }));
    this.emitValid();
  }

  /** An invitation without a recipient is the only invalid state. */
  private emitValid(): void {
    this.valid.emit((this.formData()?.invitees ?? []).length > 0);
  }
}
