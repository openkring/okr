import { Component, computed, effect, inject, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonChip, IonCol, IonGrid, IonIcon, IonItem, IonLabel, IonRow } from '@ionic/angular';

import { AvatarInfo, MandateAction, MandateModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { Checkbox, CheckboxI18n, DateInput, DateInputI18n, ErrorNote } from '@okr/shared-ui';
import { MODEL_SELECTOR, validateVestTree, vestErrors } from '@okr/shared-util-angular';
import { coerceBoolean, DateFormat, getFullName, getTodayStr } from '@okr/shared-util-core';
import { MandateI18n, mandateValidations } from '@okr/relationship-mandate-util';

/**
 * A family Vollmacht (spec 1.180 §5.1): who receives it, what they may do, until when. Pure apart from the person
 * picker: the parent modal saves through the change confirmation.
 */
@Component({
  selector: 'okr-mandate-form',
  standalone: true,
  imports: [
    SvgIconPipe,
    Checkbox, DateInput, ErrorNote,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonGrid, IonRow, IonCol, IonItem, IonLabel, IonButton, IonIcon, IonChip,
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ i18n().grantee_label() }}</ion-card-title>
          </ion-card-header>
          <ion-card-content class="ion-no-padding">
            @if (!isReadOnly() && offered().length > 0) {
              <div class="ion-padding-horizontal">
                @for (person of offered(); track person.key) {
                  <ion-chip [outline]="person.key !== granteeKey()" [color]="person.key === granteeKey() ? 'primary' : undefined"
                    (click)="setGrantee(person)">
                    <ion-label>{{ fullName(person) }}</ion-label>
                  </ion-chip>
                }
              </div>
            }
            <ion-item lines="none">
              @if (granteeName(); as name) {
                <ion-label>{{ name }}</ion-label>
              }
              @if (!isReadOnly()) {
                <ion-button [slot]="granteeName() ? 'end' : 'start'" fill="clear" (click)="pickGrantee()">
                  <ion-icon slot="start" src="{{ 'person-add' | svgIcon }}" />
                  {{ granteeName() ? i18n().grantee_change() : i18n().grantee_pick() }}
                </ion-button>
              }
            </ion-item>
            <okr-error-note [errors]="granteeErrors()" />
          </ion-card-content>
        </ion-card>

        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ i18n().actions_label() }}</ion-card-title>
          </ion-card-header>
          <ion-card-content class="ion-no-padding">
            <okr-checkbox [i18n]="attendI18n()" [checked]="hasAction('calevent.attend')"
              (checkedChange)="onActionChange('calevent.attend', $event)" [readOnly]="isReadOnly()" />
            <okr-checkbox [i18n]="answerI18n()" [checked]="hasAction('invitation.answer')"
              (checkedChange)="onActionChange('invitation.answer', $event)" [readOnly]="isReadOnly()" />
            <okr-error-note [errors]="actionsErrors()" />
          </ion-card-content>
        </ion-card>

        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-date-input [i18n]="validToI18n()" [storeDate]="validTo()" (storeDateChange)="onValidToChange($event)"
                    [minDate]="today" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="validToErrors()" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
      </form>
    }
  `,
})
export class MandateForm {
  private readonly modelSelector = inject(MODEL_SELECTOR);

  // inputs
  public readonly i18n = input.required<MandateI18n>();
  public formData = model.required<MandateModel>();
  /** the grantor's Vollmachten already stored: a second active one for the same person is refused */
  public readonly existing = input<MandateModel[]>([]);
  /** household members and related persons, offered as one-tap choices above the full picker (spec §5.1) */
  public readonly suggestions = input<AvatarInfo[]>([]);
  public readonly readOnly = input(false);
  public readonly showForm = input(true); // toggled by the parent to reset the form state on cancel

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  /** StoreDate of today: the duplicate check counts only active Vollmachten; the date picker starts here */
  protected readonly today = getTodayStr(DateFormat.StoreDate);

  // the suite needs the stored Vollmachten and today, which validateVestTree does not pass: a closure adds them
  private readonly suiteWithContext = (m: MandateModel) => mandateValidations(m, this.existing(), this.today);
  protected readonly mandateForm = form(this.formData, (path) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    validateVestTree(path, this.suiteWithContext as any));
  // the error notes read the same run back off the form — the suite runs once per change
  private readonly validationResult = vestErrors(this.mandateForm);
  protected readonly granteeErrors = computed(() => this.validationResult().getErrors('grantee'));
  protected readonly actionsErrors = computed(() => this.validationResult().getErrors('actions'));
  protected readonly validToErrors = computed(() => this.validationResult().getErrors('validTo'));

  constructor() {
    effect(() => this.valid.emit(this.mandateForm().valid()));
  }

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // fields (raw docs may lack later fields)
  protected readonly granteeName = computed(() => {
    const g = this.formData()?.grantee;
    return g?.key ? getFullName(g.name1, g.name2) : '';
  });
  protected readonly granteeKey = computed(() => this.formData()?.granteeKey ?? '');
  /** the suggestions without the grantor */
  protected readonly offered = computed(() => {
    const grantorKey = this.formData()?.grantorKey ?? '';
    return this.suggestions().filter((p) => p.key && p.key !== grantorKey);
  });
  protected readonly actions = computed(() => this.formData()?.actions ?? []);
  protected readonly validTo = computed(() => this.formData()?.validTo ?? '');

  // i18n for the shared/ui primitives
  protected readonly attendI18n = computed(() => ({ name: 'action_attend', label: this.i18n().action_attend(), helper: '' } as CheckboxI18n));
  protected readonly answerI18n = computed(() => ({ name: 'action_answer', label: this.i18n().action_answer(), helper: '' } as CheckboxI18n));
  protected readonly validToI18n = computed(() => ({
    name: 'validTo', label: this.i18n().validTo_label(), placeholder: this.i18n().validTo_placeholder(), helper: this.i18n().validTo_helper(),
  } as DateInputI18n));

  protected hasAction(action: MandateAction): boolean {
    return this.actions().includes(action);
  }

  protected onActionChange(action: MandateAction, checked: boolean): void {
    this.dirty.emit(true);
    this.formData.update((vm) => {
      const others = (vm.actions ?? []).filter((a) => a !== action);
      return { ...vm, actions: checked ? [...others, action] : others };
    });
  }

  protected onValidToChange(validTo: string): void {
    if (validTo === this.validTo()) return;
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, validTo }));
  }

  /** any person of the tenant except the grantor; the picker cannot tell who has a login (spec §5.1) */
  protected async pickGrantee(): Promise<void> {
    const grantorKey = this.formData()?.grantorKey ?? '';
    const avatar = await this.modelSelector.selectPersonAvatar('', '', false, false, { excludeKeys: grantorKey ? [grantorKey] : [] });
    if (!avatar?.key) return;
    this.setGrantee(avatar);
  }

  protected setGrantee(avatar: AvatarInfo): void {
    if (avatar.key === this.granteeKey()) return;
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, granteeKey: avatar.key, grantee: avatar }));
  }

  protected fullName(avatar: AvatarInfo): string {
    return getFullName(avatar.name1, avatar.name2);
  }
}
