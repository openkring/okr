import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonIcon, IonItem, IonLabel, IonList, IonRow } from '@ionic/angular';

import { NAME_LENGTH } from '@okr/shared-constants';
import { CategoryListModel, HouseholdBundle, HouseholdModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { CategorySelect, Checkbox, CheckboxI18n, ErrorNote, StringSelect, StringSelectI18n, TextInput, TextInputI18n } from '@okr/shared-ui';
import { validateVestTree, vestErrors } from '@okr/shared-util-angular';
import { coerceBoolean, readBundle, removeHouseholdMember } from '@okr/shared-util-core';
import { HouseholdEditMode, HouseholdI18n, householdValidations, memberOptions } from '@okr/relationship-household-util';

/**
 * A household: name, type, persons, payer, contact and what is combined. Pure: the parent modal adds persons
 * (`addMember`) and drives saving through the change confirmation.
 */
@Component({
  selector: 'okr-household-form',
  standalone: true,
  imports: [
    SvgIconPipe,
    TextInput, CategorySelect, StringSelect, Checkbox, ErrorNote,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonGrid, IonRow, IonCol, IonList, IonItem, IonLabel, IonButton, IonIcon,
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="nameI18n()" [value]="name()" (valueChange)="onFieldChange('name', $event)"
                    [autofocus]="true" [maxLength]="nameLength" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="nameErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-cat-select [category]="typeList()" [selectedItemName]="type()" (selectedItemNameChange)="onFieldChange('type', $event)"
                    [withAll]="false" [fieldStyle]="true" [label]="i18n().type_label()" [readOnly]="isReadOnly() || !isAdmin()" />
                  <okr-error-note [errors]="typeErrors()" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>

        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ i18n().members_label() }}</ion-card-title>
          </ion-card-header>
          <ion-card-content class="ion-no-padding">
            <ion-list lines="none">
              @for (key of memberKeys(); track key) {
                <ion-item>
                  <ion-label>{{ personName(key) }}</ion-label>
                  @if (canChangeMembers()) {
                    <ion-button slot="end" fill="clear" color="danger" [attr.aria-label]="i18n().member_remove()" (click)="removeMember(key)">
                      <ion-icon slot="icon-only" src="{{ 'trash' | svgIcon }}" />
                    </ion-button>
                  }
                </ion-item>
              } @empty {
                <ion-item><ion-label>{{ i18n().members_empty() }}</ion-label></ion-item>
              }
              @if (canChangeMembers()) {
                <ion-item>
                  <ion-button fill="clear" (click)="addMember.emit()">
                    <ion-icon slot="start" src="{{ 'person-add' | svgIcon }}" />
                    {{ i18n().member_add() }}
                  </ion-button>
                </ion-item>
              }
            </ion-list>
            <okr-error-note [errors]="memberKeysErrors()" />
          </ion-card-content>
        </ion-card>

        @if (memberKeys().length >= 2) {
          <ion-card>
            <ion-card-content class="ion-no-padding">
              <ion-grid>
                <ion-row>
                  <ion-col size="12" size-md="6">
                    <okr-string-select [i18n]="payerI18n()" [stringList]="payerOptions().keys" [labels]="payerOptions().labels"
                      [selectedString]="payerKey()" (selectedStringChange)="onFieldChange('payerKey', $event)" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="payerKeyErrors()" />
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <okr-string-select [i18n]="contactI18n()" [stringList]="members().keys" [labels]="members().labels"
                      [selectedString]="contactKey()" (selectedStringChange)="onFieldChange('contactKey', $event)" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="contactKeyErrors()" />
                  </ion-col>
                </ion-row>
              </ion-grid>
            </ion-card-content>
          </ion-card>

          <ion-card>
            <ion-card-header>
              <ion-card-title>{{ i18n().bundle_title() }}</ion-card-title>
            </ion-card-header>
            <ion-card-content class="ion-no-padding">
              <okr-checkbox [i18n]="bundlePostI18n()" [checked]="bundle().post" (checkedChange)="onBundleChange('post', $event)"
                [toggle]="true" [showHelper]="true" [readOnly]="isReadOnly()" />
              <okr-checkbox [i18n]="bundleEmailI18n()" [checked]="bundle().email" (checkedChange)="onBundleChange('email', $event)"
                [toggle]="true" [readOnly]="isReadOnly()" />
              <okr-checkbox [i18n]="bundleInAppI18n()" [checked]="bundle().inApp" (checkedChange)="onBundleChange('inApp', $event)"
                [toggle]="true" [readOnly]="isReadOnly()" />
            </ion-card-content>
          </ion-card>
        }
      </form>
    }
  `,
})
export class HouseholdForm {
  // inputs
  public readonly i18n = input.required<HouseholdI18n>();
  public formData = model.required<HouseholdModel>();
  public readonly mode = input<HouseholdEditMode>('member');
  public readonly typeList = input.required<CategoryListModel>();
  /** display names of the persons, by personKey */
  public readonly personNames = input<Record<string, string>>({});
  public readonly readOnly = input(false);
  public readonly showForm = input(true); // toggled by the parent to reset the form state on cancel

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();
  /** the parent picks a person and adds it to memberKeys */
  public readonly addMember = output<void>();

  protected readonly householdForm = form(this.formData, (path) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    validateVestTree(path, householdValidations as any));
  // the error notes read the same run back off the form — the suite runs once per change
  private readonly validationResult = vestErrors(this.householdForm);
  protected readonly nameErrors = computed(() => this.validationResult().getErrors('name'));
  protected readonly typeErrors = computed(() => this.validationResult().getErrors('type'));
  protected readonly memberKeysErrors = computed(() => this.validationResult().getErrors('memberKeys'));
  protected readonly payerKeyErrors = computed(() => this.validationResult().getErrors('payerKey'));
  protected readonly contactKeyErrors = computed(() => this.validationResult().getErrors('contactKey'));

  constructor() {
    effect(() => this.valid.emit(this.householdForm().valid()));
  }

  /** kept in step with the cap the Vest suite enforces on this field */
  protected readonly nameLength = NAME_LENGTH;

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly isAdmin = computed(() => this.mode() === 'admin');
  protected readonly canChangeMembers = computed(() => this.isAdmin() && !this.isReadOnly());

  // fields (raw docs may lack later fields)
  protected readonly name = computed(() => this.formData()?.name ?? '');
  protected readonly type = computed(() => this.formData()?.type ?? '');
  protected readonly memberKeys = computed(() => this.formData()?.memberKeys ?? []);
  protected readonly payerKey = computed(() => this.formData()?.payerKey ?? '');
  protected readonly contactKey = computed(() => this.formData()?.contactKey ?? '');
  protected readonly bundle = computed(() => readBundle(this.formData() ?? {}));
  protected readonly members = computed(() => memberOptions(this.memberKeys(), this.personNames()));
  /** '' first: no payer, one invoice per person (spec 1.168 §4.2) */
  protected readonly payerOptions = computed(() => ({
    keys: ['', ...this.members().keys],
    labels: [this.i18n().payer_none(), ...this.members().labels],
  }));

  // i18n for the shared/ui primitives
  protected readonly nameI18n = computed(() => ({
    name: 'name', label: this.i18n().name_label(), placeholder: this.i18n().name_placeholder(), helper: this.i18n().name_helper(),
  } as TextInputI18n));
  protected readonly payerI18n = computed(() => ({ name: 'payerKey', label: this.i18n().payer_label(), helper: this.i18n().payer_helper() } as StringSelectI18n));
  protected readonly contactI18n = computed(() => ({ name: 'contactKey', label: this.i18n().contact_label(), helper: this.i18n().contact_helper() } as StringSelectI18n));
  protected readonly bundlePostI18n = computed(() => ({ name: 'bundlePost', label: this.i18n().bundle_post(), helper: this.i18n().bundle_helper() } as CheckboxI18n));
  protected readonly bundleEmailI18n = computed(() => ({ name: 'bundleEmail', label: this.i18n().bundle_email(), helper: '' } as CheckboxI18n));
  protected readonly bundleInAppI18n = computed(() => ({ name: 'bundleInApp', label: this.i18n().bundle_inApp(), helper: '' } as CheckboxI18n));

  protected personName(key: string): string {
    return this.personNames()[key] || key;
  }

  protected onFieldChange(fieldName: 'name' | 'type' | 'payerKey' | 'contactKey', fieldValue: string): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected onBundleChange(channel: keyof HouseholdBundle, checked: boolean): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, bundle: { ...readBundle(vm), [channel]: checked } }));
  }

  /** payer / contact pointing to the removed person move to the first remaining one */
  protected removeMember(personKey: string): void {
    this.dirty.emit(true);
    this.formData.update((vm) => removeHouseholdMember({ ...vm, memberKeys: vm.memberKeys ?? [] }, personKey));
  }
}
