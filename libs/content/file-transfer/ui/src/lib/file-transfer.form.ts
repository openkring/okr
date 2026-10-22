import { Component, computed, effect, inject, input, model, output, signal } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonAvatar, IonButton, IonCard, IonCardContent, IonCol, IonGrid, IonIcon, IonItem, IonLabel, IonList, IonNote, IonRow } from '@ionic/angular';

import { AnyCharMask } from '@okr/shared-config';
import { COMMENT_LENGTH, LONG_NAME_LENGTH, PASSWORD_MAX_LENGTH } from '@okr/shared-constants';
import { GroupModel, PersonModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import {
  ErrorNote, FileInput, FileInputI18n, ImgDirective, NumberInput, NumberInputI18n, PasswordInput, PasswordInputI18n,
  StringList, TextareaInput, TextInputI18n,
} from '@okr/shared-ui';
import { MODEL_SELECTOR, validateVestTree, vestErrors } from '@okr/shared-util-angular';
import { coerceBoolean, fill, getFullName } from '@okr/shared-util-core';
import { AvatarPipe } from '@okr/avatar-ui';
import { getDefaultIcon } from '@okr/avatar-util';
import {
  FileTransferI18n, fileTransferValidations, formatFileTransferSize, ResolvedLimits, toFileTransferFormValues,
} from '@okr/content-file-transfer-util';

/** What the sender fills in. The files are only picked here — uploading is the caller's job. */
export interface FileTransferFormData {
  files: File[];
  groupKeys: string[];
  personKeys: string[];
  emails: string[];
  message: string;
  lifetimeDays: number;
  password: string;
}

export function newFileTransferFormData(defaultLifetimeDays: number, preset?: Partial<FileTransferFormData>): FileTransferFormData {
  return {
    files: [],
    groupKeys: [],
    personKeys: [],
    emails: [],
    message: '',
    lifetimeDays: defaultLifetimeDays,
    password: '',
    ...(preset ?? {}),
  };
}

type FileTransferField = keyof FileTransferFormData;

/**
 * Send form of a quick file transfer (spec 1.115 §4.1): files, recipients in any mix (groups,
 * persons, outside email addresses), message, lifetime and an optional password. The parent modal
 * drives sending through the change-confirmation banner; this form only edits and validates.
 * The limit checks here are a convenience — the server checks every limit again.
 */
@Component({
  selector: 'okr-file-transfer-form',
  standalone: true,
  imports: [
    ImgDirective, AvatarPipe, SvgIconPipe,
    FileInput, NumberInput, PasswordInput, TextareaInput, StringList, ErrorNote,
    IonCard, IonCardContent, IonGrid, IonRow, IonCol, IonButton, IonIcon, IonList, IonItem, IonAvatar, IonLabel, IonNote,
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px;} }
    ion-avatar { width: 30px; height: 30px; }
    .remove { cursor: pointer; }
    .select { padding: 8px 16px 0 16px; }
    .section-title { font-weight: 500; padding: 8px 16px 0 16px; }
    .consent { white-space: normal; }
  `],
  template: `
    @if (showForm()) {
      <form novalidate>
        <!-- files -->
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <okr-file-input [i18n]="filesI18n()" [files]="files()" (filesChange)="onFieldChange('files', $event)"
              [multiple]="true" [readOnly]="isReadOnly()" />
            @if (files().length > 0) {
              <ion-item lines="none">
                <ion-note>{{ totalSize() }}</ion-note>
              </ion-item>
            }
            <okr-error-note [errors]="filesErrors()" />
          </ion-card-content>
        </ion-card>

        <!-- recipients: groups and persons -->
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <div class="section-title">{{ i18n().groups_title() }}</div>
                  @if (!isReadOnly()) {
                    <div class="select">
                      <ion-button expand="block" fill="outline" (click)="selectGroup()">
                        <ion-icon slot="start" src="{{ 'add-circle' | svgIcon }}" />
                        {{ i18n().groups_add() }}
                      </ion-button>
                    </div>
                  }
                  <ion-list lines="none">
                    @for (key of groupKeys(); track key) {
                      <ion-item>
                        <ion-avatar slot="start">
                          <img okrImg src="{{ 'group.' + key | avatar:groupIcon }}" alt="Avatar" />
                        </ion-avatar>
                        <ion-label>{{ groupName(key) }}</ion-label>
                        @if (!isReadOnly()) {
                          <ion-icon class="remove" slot="end" src="{{ 'cancel' | svgIcon }}" [attr.aria-label]="i18n().remove()"
                            (click)="removeKey('groupKeys', key)" />
                        }
                      </ion-item>
                    }
                  </ion-list>
                </ion-col>
                <ion-col size="12" size-md="6">
                  <div class="section-title">{{ i18n().persons_title() }}</div>
                  @if (!isReadOnly()) {
                    <div class="select">
                      <ion-button expand="block" fill="outline" (click)="selectPerson()">
                        <ion-icon slot="start" src="{{ 'person-add' | svgIcon }}" />
                        {{ i18n().persons_add() }}
                      </ion-button>
                    </div>
                  }
                  <ion-list lines="none">
                    @for (key of personKeys(); track key) {
                      <ion-item>
                        <ion-avatar slot="start">
                          <img okrImg src="{{ 'person.' + key | avatar:personIcon }}" alt="Avatar" />
                        </ion-avatar>
                        <ion-label>{{ personName(key) }}</ion-label>
                        @if (!isReadOnly()) {
                          <ion-icon class="remove" slot="end" src="{{ 'cancel' | svgIcon }}" [attr.aria-label]="i18n().remove()"
                            (click)="removeKey('personKeys', key)" />
                        }
                      </ion-item>
                    }
                  </ion-list>
                </ion-col>
              </ion-row>
            </ion-grid>
            <okr-error-note [errors]="recipientsErrors()" />
          </ion-card-content>
        </ion-card>

        <!-- recipients: outside email addresses (okr-strings brings its own card) -->
        <okr-strings [strings]="emails()" (stringsChange)="onFieldChange('emails', $event)"
          [title]="i18n().emails_title()" [add]="i18n().emails_add()" [description]="emailsDescription()"
          [mask]="anyCharMask" [maxLength]="emailLength" [lowercase]="true" [readOnly]="isReadOnly()" />
        <okr-error-note [errors]="emailsErrors()" />
        @if (emails().length > 0) {
          <ion-item lines="none">
            <ion-icon slot="start" color="warning" src="{{ 'warning' | svgIcon }}" />
            <ion-label class="consent" color="warning">{{ i18n().consent_hint() }}</ion-label>
          </ion-item>
        }

        <!-- message, lifetime, password -->
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12">
                  <okr-textarea-input [i18n]="messageI18n()" [value]="message()" (valueChange)="onFieldChange('message', $event)"
                    [maxLength]="messageLength" [rows]="3" [showHelper]="true" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="messageErrors()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-number-input [i18n]="lifetimeI18n()" [value]="lifetimeDays()" (valueChange)="onFieldChange('lifetimeDays', $event)"
                    [integer]="true" [min]="1" [max]="maxLifetimeDays()" [showHelper]="true" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="lifetimeDaysErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-password-input [i18n]="passwordI18n()" [value]="password()" (valueChange)="onFieldChange('password', $event)"
                    [maxLength]="passwordLength" [copyable]="false" autocomplete="new-password" />
                  <okr-error-note [errors]="passwordErrors()" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
      </form>
    }
  `,
})
export class FileTransferForm {
  private readonly modelSelector = inject(MODEL_SELECTOR);

  // inputs
  public readonly i18n = input.required<FileTransferI18n>();
  public formData = model.required<FileTransferFormData>();
  public readonly limits = input.required<ResolvedLimits>();
  /** Lookup lists to show the names of preset keys (e.g. a chat room's members). */
  public readonly groups = input<GroupModel[]>([]);
  public readonly persons = input<PersonModel[]>([]);
  /** The tenant whose accounts the person picker offers first. */
  public readonly tenantId = input('');
  public readonly readOnly = input(false);
  public readonly showForm = input(true);

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  // The suite reads derived counts plus the limits, which validateVestTree does not pass — the
  // bridge calls it through this closure (reading limits() keeps validity in step with them).
  private readonly suiteWithContext = (data: FileTransferFormData) =>
    fileTransferValidations(toFileTransferFormValues(data, this.limits()));
  protected readonly transferForm = form(this.formData, (path) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    validateVestTree(path, this.suiteWithContext as any));
  private readonly validationResult = vestErrors(this.transferForm);
  protected readonly filesErrors = computed(() => this.validationResult().getErrors('files'));
  protected readonly recipientsErrors = computed(() => this.validationResult().getErrors('recipients'));
  protected readonly emailsErrors = computed(() => this.validationResult().getErrors('emails'));
  protected readonly messageErrors = computed(() => this.validationResult().getErrors('message'));
  protected readonly lifetimeDaysErrors = computed(() => this.validationResult().getErrors('lifetimeDays'));
  protected readonly passwordErrors = computed(() => this.validationResult().getErrors('password'));

  constructor() {
    effect(() => this.valid.emit(this.transferForm().valid()));
  }

  /** kept in step with the caps the Vest suite enforces on these fields */
  protected readonly messageLength = COMMENT_LENGTH;
  protected readonly passwordLength = PASSWORD_MAX_LENGTH;
  protected readonly emailLength = LONG_NAME_LENGTH;
  protected readonly anyCharMask = AnyCharMask;
  protected readonly groupIcon = getDefaultIcon('group');
  protected readonly personIcon = getDefaultIcon('person');

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly files = computed(() => this.formData()?.files ?? []);
  protected readonly groupKeys = computed(() => this.formData()?.groupKeys ?? []);
  protected readonly personKeys = computed(() => this.formData()?.personKeys ?? []);
  protected readonly emails = computed(() => this.formData()?.emails ?? []);
  protected readonly message = computed(() => this.formData()?.message ?? '');
  protected readonly lifetimeDays = computed(() => this.formData()?.lifetimeDays ?? this.limits().defaultLifetimeDays);
  protected readonly password = computed(() => this.formData()?.password ?? '');
  protected readonly maxLifetimeDays = computed(() => this.limits().maxLifetimeDays);

  protected readonly totalSize = computed(() =>
    fill(this.i18n().files_total(), { size: formatFileTransferSize(this.files().reduce((sum, f) => sum + f.size, 0)) }));

  /** names of groups and persons picked in this form, keyed by okey */
  private readonly pickedNames = signal<Record<string, string>>({});

  protected readonly filesI18n = computed(() => ({
    name: 'files',
    label: this.i18n().files_label(),
    helper: fill(this.i18n().files_helper(), { max: formatFileTransferSize(this.limits().maxFileTransferBytes) }),
  } as FileInputI18n));
  protected readonly emailsDescription = computed(() =>
    fill(this.i18n().emails_description(), { max: this.limits().maxExternalRecipients }));
  protected readonly messageI18n = computed(() => ({
    name: 'message',
    label: this.i18n().message_label(),
    placeholder: this.i18n().message_placeholder(),
    helper: this.i18n().message_helper(),
  } as TextInputI18n));
  protected readonly lifetimeI18n = computed(() => ({
    name: 'lifetimeDays',
    label: this.i18n().lifetime_label(),
    placeholder: this.i18n().lifetime_placeholder(),
    helper: fill(this.i18n().lifetime_helper(), { max: this.limits().maxLifetimeDays }),
  } as NumberInputI18n));
  protected readonly passwordI18n = computed(() => ({
    name: 'password',
    label: this.i18n().password_label(),
    placeholder: this.i18n().password_placeholder(),
    helper: this.i18n().password_helper(),
  } as PasswordInputI18n));

  protected groupName(key: string): string {
    return this.pickedNames()[key] ?? this.groups().find(g => g.okey === key)?.name ?? key;
  }

  protected personName(key: string): string {
    const picked = this.pickedNames()[key];
    if (picked) return picked;
    const person = this.persons().find(p => p.okey === key);
    return person ? getFullName(person.firstName, person.lastName) : key;
  }

  /** Adds one group; its members are resolved by the server at the moment of sending. */
  public async selectGroup(): Promise<void> {
    const group = await this.modelSelector.selectGroup();
    if (!group || this.groupKeys().includes(group.okey)) return;
    this.pickedNames.update(names => ({ ...names, [group.okey]: group.name }));
    this.onFieldChange('groupKeys', [...this.groupKeys(), group.okey]);
  }

  /** Adds one person; app accounts of this tenant come first in the picker. */
  public async selectPerson(): Promise<void> {
    const avatar = await this.modelSelector.selectPersonAvatar('', '', false, false, {
      accountsFirst: this.tenantId() || undefined,
      excludeKeys: this.personKeys(),
    });
    if (!avatar || this.personKeys().includes(avatar.key)) return;
    this.pickedNames.update(names => ({ ...names, [avatar.key]: getFullName(avatar.name1, avatar.name2) }));
    this.onFieldChange('personKeys', [...this.personKeys(), avatar.key]);
  }

  protected removeKey(field: 'groupKeys' | 'personKeys', key: string): void {
    this.onFieldChange(field, (this.formData()?.[field] ?? []).filter(k => k !== key));
  }

  protected onFieldChange(fieldName: FileTransferField, fieldValue: string | string[] | number | File[]): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }
}
