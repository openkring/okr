import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonCol, IonGrid, IonItem, IonLabel, IonNote, IonRow } from '@ionic/angular/standalone';

import { CalEventNotifyFormData, calEventNotifyValidations, CaleventI18n, MAX_NOTIFY_MESSAGE_LENGTH } from '@okr/calevent-util';
import { ErrorNote, NotesInput, NotesInputI18n, StringSelect, StringSelectI18n } from '@okr/shared-ui';
import { coerceBoolean, fill } from '@okr/shared-util-core';
import { validateVestTree } from '@okr/shared-util-angular';

/**
 * «Teilnehmende benachrichtigen» — the message an organiser sends to the participants of an
 * event (spec `2026-08-25-participant-messaging-spec.md` §1.1).
 *
 * Two fields and a read-only preview. The preview matters: a broadcast is irreversible, and
 * seeing the names beforehand is what turns "I hope this is the right list" into a decision.
 * The names are DISPLAY ONLY — the Cloud Function derives the real recipient set from the
 * event itself and never trusts a list from the client.
 */
@Component({
  selector: 'okr-calevent-notify-form',
  standalone: true,
  imports: [
    NotesInput, StringSelect, ErrorNote,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent, IonItem, IonLabel, IonNote,
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px; } }
    .recipients { white-space: normal; line-height: 1.4; }
  `],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12">
                  <okr-notes-input [i18n]="messageI18n()" [value]="message()"
                    (valueChange)="onFieldChange('message', $event)"
                    [maxLength]="maxLength" [rows]="4" [embedded]="true" [readOnly]="isReadOnly()" />
                  <!-- the confidentiality hint the spec requires (§1.3): NotesInputI18n has no
                       helper field, so it is rendered here rather than smuggled into the label -->
                  <ion-item lines="none">
                    <ion-note class="recipients">{{ i18n().notify_message_helper() }}</ion-note>
                  </ion-item>
                  <okr-error-note [errors]="messageErrors()" />
                </ion-col>
              </ion-row>

              @if (formData().hasSeries) {
                <ion-row>
                  <ion-col size="12" size-md="6">
                    <okr-string-select [i18n]="scopeI18n()"
                      [selectedString]="scope()" (selectedStringChange)="onFieldChange('scope', $event)"
                      [stringList]="scopeOptions" [labels]="scopeLabels()" [readOnly]="isReadOnly()" />
                  </ion-col>
                </ion-row>
              }

              <ion-row>
                <ion-col size="12">
                  <ion-item lines="none">
                    <ion-label>
                      <h3>{{ i18n().notify_recipients_label() }}</h3>
                      <ion-note class="recipients">{{ recipientSummary() }}</ion-note>
                    </ion-label>
                  </ion-item>
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
      </form>
    }
  `,
})
export class CalEventNotifyForm {
  // inputs
  public readonly i18n = input.required<CaleventI18n>();
  public formData = model.required<CalEventNotifyFormData>();
  public readonly readOnly = input(false);
  public readonly showForm = input(true);

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  protected readonly maxLength = MAX_NOTIFY_MESSAGE_LENGTH;
  protected readonly scopeOptions = ['event', 'series'];

  protected readonly notifyForm = form(this.formData, (path) =>
    validateVestTree(path, calEventNotifyValidations as any));

  constructor() {
    effect(() => this.valid.emit(this.notifyForm().valid()));
  }

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly message = computed(() => this.formData()?.message ?? '');
  protected readonly scope = computed(() => this.formData()?.scope ?? 'event');
  private readonly validationResult = computed(() => calEventNotifyValidations(this.formData()));
  protected readonly messageErrors = computed(() => this.validationResult().getErrors('message'));

  protected readonly messageI18n = computed(() => ({
    name: 'message',
    label: this.i18n().notify_message_label(),
    placeholder: this.i18n().notify_message_placeholder(),
  } as NotesInputI18n));

  protected readonly scopeI18n = computed(() => ({
    name: 'scope',
    label: this.i18n().notify_scope_label(),
  } as StringSelectI18n));

  protected readonly scopeLabels = computed(() => [
    this.i18n().notify_scope_event(),
    this.i18n().notify_scope_series(),
  ]);

  /**
   * "3 Angemeldete bekommen deine Mitteilung — Anna B., Carl D., Eva F."
   *
   * `fill` with SINGLE braces, not Transloco's `{{ }}`: a key resolved through the store's
   * `translateAll` has already been through Transloco, which substitutes `{{count}}` with
   * nothing before we ever see it.
   */
  protected readonly recipientSummary = computed(() => {
    const names = this.formData()?.recipientNames ?? [];
    if (names.length === 0) return this.i18n().notify_recipients_empty();
    return `${fill(this.i18n().notify_recipients_count(), { count: names.length })} — ${names.join(', ')}`;
  });

  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }
}
