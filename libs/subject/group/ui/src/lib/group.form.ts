import { Component, computed, input, linkedSignal, model, output } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonItem, IonLabel, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { LowercaseWordMask } from '@bk2/shared-config';
import { WORD_LENGTH } from '@bk2/shared-constants';
import { AvatarInfo, GroupModel, RoleName, UserModel } from '@bk2/shared-models';
import { ButtonCopy, ButtonCopyI18n, Checkbox, CheckboxI18n, Chips, NotesInput, NotesInputI18n, StringSelect, StringSelectI18n, TextInput, TextInputI18n } from '@bk2/shared-ui';
import { coerceBoolean, debugFormErrors, debugFormModel, hasRole } from '@bk2/shared-util-core';

import { Avatars } from '@bk2/avatar-ui';
import { groupValidations, GroupI18n } from '@bk2/subject-group-util';

@Component({
  selector: 'bk-group-form',
  standalone: true,
  imports: [
    vestForms,
    TextInput, Chips, NotesInput, Checkbox, ButtonCopy, StringSelect, Avatars,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonLabel, IonItem
  ],
   styles: [`
    @media (width <= 600px) { ion-card { margin: 5px;} }
    .input-wrapper { min-height: 24px; }
    .title { font-size: 1.25rem; font-weight: 500; margin-left: 0;}
    ion-card-header { padding: 0; }
  `],
  template: `
  @if (showForm()) {
    <form scVestForm
      [formValue]="formData()"
      [suite]="suite" 
      (dirtyChange)="dirty.emit($event)"
      (validChange)="valid.emit($event)"
      (formValueChange)="onFormChange($event)">

      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ i18n().attributes() }}</ion-card-title>
        </ion-card-header>
        <ion-card-content class="ion-no-padding">
          <ion-grid>
            <ion-row>
              @if(hasRole('admin')) {
                <ion-col size="12" size-md="6">
                  <bk-text-input [i18n]="bkeyI18n()"
                    [value]="bkey()"
                    [readOnly]="true"
                    [copyable]="true"
                  />
                </ion-col>
              }
              <ion-col size="12" size-md="6">
                @if(isNew()) {
                  <bk-text-input [i18n]="groupIdI18n()"
                    [value]="bkey()" (valueChange)="onFieldChange('bkey', $event)"
                    [maxLength]="maxWordLength"
                    [mask]="mask"
                    [showHelper]=true
                    [readOnly]="isReadOnly()"
                  />
                } @else {
                  <ion-item lines="none">
                    <ion-label>{{ i18n().id_label() }}: {{ bkey() }}</ion-label>
                    <bk-button-copy [i18n]="buttonCopyI18n()" [value]="bkey()" />
                  </ion-item>
                }                                     
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-text-input
                  [i18n]="nameI18n()"
                  [value]="name()" (valueChange)="onFieldChange('name', $event)" [maxLength]=50
                  [readOnly]="isReadOnly()"
                  [showHelper]="true"
                />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-text-input [i18n]="iconI18n()"
                  [value]="icon()" (valueChange)="onFieldChange('icon', $event)"
                  [maxLength]=20
                  [readOnly]="isReadOnly()"
                  [showHelper]="true"
                />
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      @if(currentUser(); as currentUser) {
        <bk-avatars name="groupAdmins"
          [avatars]="admins()" (avatarsChange)="onFieldChange('admins', $event)"
          (selectClicked)="selectPerson.emit()"
          [currentUser]="currentUser"
          [readOnly]="isReadOnly()"
          title="Gruppen-Administratoren"
          description="Diese Personen können die Gruppe verwalten, z.B. Mitglieder hinzufügen oder entfernen. Der erst genannte Administrator ist zudem der Hauptkontakt, dh. dieser Person werden Todo's automatisch zugewiesen."
          addLabel="@calevent.field.responsible.addLabel"
        />
      }

      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ i18n().display() }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row> 
              <ion-col size="12" size-md="6">
                <bk-checkbox [i18n]="hasContentI18n()"
                  [checked]="hasContent()" (checkedChange)="onFieldChange('hasContent', $event)"
                  [showHelper]="true"
                  [readOnly]="isReadOnly()"
                />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-checkbox [i18n]="hasChatI18n()"
                  [checked]="hasChat()" (checkedChange)="onFieldChange('hasChat', $event)"
                  [showHelper]="true"
                  [readOnly]="isReadOnly()"
                />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-checkbox [i18n]="hasCalendarI18n()"
                  [checked]="hasCalendar()" (checkedChange)="onFieldChange('hasCalendar', $event)"
                  [showHelper]="true"
                  [readOnly]="isReadOnly()"
                />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-checkbox [i18n]="hasTasksI18n()"
                  [checked]="hasTasks()" (checkedChange)="onFieldChange('hasTasks', $event)"
                  [showHelper]="true"
                  [readOnly]="isReadOnly()"
                />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-checkbox [i18n]="hasFilesI18n()"
                  [checked]="hasFiles()" (checkedChange)="onFieldChange('hasFiles', $event)"
                  [showHelper]="true"
                  [readOnly]="isReadOnly()"
                />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-checkbox [i18n]="hasAlbumI18n()"
                  [checked]="hasAlbum()" (checkedChange)="onFieldChange('hasAlbum', $event)"
                  [showHelper]="true"
                  [readOnly]="isReadOnly()"
                />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-checkbox [i18n]="hasMembersI18n()"
                  [checked]="hasMembers()" (checkedChange)="onFieldChange('hasMembers', $event)"
                  [showHelper]="true"
                  [readOnly]="isReadOnly()"
                />
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <!-- tbd: group hierarchy: select an org or group, fill in parentKey, parentName, parentModelType -->

      @if(hasRole('privileged') || hasRole('memberAdmin')) {
        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ i18n().access() }}</ion-card-title>
          </ion-card-header>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12">
                  <bk-text-input [i18n]="visibilityI18n()"
                    [value]="visibility()" (valueChange)="onFieldChange('visibility', $event)"
                    [maxLength]=100
                    [readOnly]="isReadOnly()"
                    [showHelper]="true"
                  />
                </ion-col>
                <ion-col size="12">
                  <bk-string-select [i18n]="notifyTypeI18n()"
                    [selectedString]="notifyType()" (selectedStringChange)="onFieldChange('notifyType', $event)"
                    [stringList]="notifyTypeOptions"
                    [readOnly]="isReadOnly()"
                  />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
      }

      @if(hasRole('privileged') || hasRole('memberAdmin')) {
        <bk-chips chipName="tag"
          [storedChips]="tags()" (storedChipsChange)="onFieldChange('tags', $event)"
          [allChips]="allTags()"
          [readOnly]="isReadOnly()"
        />
      }

      @if(hasRole('admin')) { 
        <bk-notes-input [i18n]="notesI18n()"
          [value]="notes()" (valueChange)="onFieldChange('notes', $event)"
          [readOnly]="isReadOnly()"
        />
      }
    </form>
  }
  `
})
export class GroupForm {
  protected readonly buttonCopyI18n = computed(() => ({ copy_conf: this.i18n().copy_conf() } as ButtonCopyI18n));
  protected bkeyI18n      = computed(() => ({ name: 'bkey',       label: this.i18n().bkey_label(),       placeholder: this.i18n().bkey_placeholder(),       helper: this.i18n().bkey_helper()       } as TextInputI18n));
  protected groupIdI18n   = computed(() => ({ name: 'groupId',    label: this.i18n().id_label(),    placeholder: this.i18n().id_placeholder(),    helper: this.i18n().id_helper()    } as TextInputI18n));
  protected nameI18n      = computed(() => ({ name: 'groupName',  label: this.i18n().name_label(),       placeholder: this.i18n().name_placeholder(),       helper: this.i18n().name_helper()       } as TextInputI18n));
  protected iconI18n      = computed(() => ({ name: 'icon',       label: this.i18n().icon_label(),       placeholder: this.i18n().icon_placeholder(),       helper: this.i18n().icon_helper()       } as TextInputI18n));
  protected visibilityI18n = computed(() => ({ name: 'visibility', label: this.i18n().visibility_label(), placeholder: this.i18n().visibility_placeholder(), helper: this.i18n().visibility_helper() } as TextInputI18n));
  protected notesI18n      = computed(() => ({ name: 'notes', label: this.i18n().notes_label(), placeholder: this.i18n().notes_placeholder() } as NotesInputI18n));
  protected notifyTypeI18n  = computed(() => ({ name: 'notifyType',   label: this.i18n().notifyType_label()  } as StringSelectI18n));
  protected hasContentI18n  = computed(() => ({ name: 'hasContent',   label: this.i18n().hasContent_label(),   helper: this.i18n().hasContent_helper()   } as CheckboxI18n));
  protected hasChatI18n     = computed(() => ({ name: 'hasChat',      label: this.i18n().hasChat_label(),      helper: this.i18n().hasChat_helper()      } as CheckboxI18n));
  protected hasCalendarI18n = computed(() => ({ name: 'hasCalendar',  label: this.i18n().hasCalendar_label(),  helper: this.i18n().hasCalendar_helper()  } as CheckboxI18n));
  protected hasTasksI18n    = computed(() => ({ name: 'hasTasks',     label: this.i18n().hasTasks_label(),     helper: this.i18n().hasTasks_helper()     } as CheckboxI18n));
  protected hasFilesI18n    = computed(() => ({ name: 'hasFiles',     label: this.i18n().hasFiles_label(),     helper: this.i18n().hasFiles_helper()     } as CheckboxI18n));
  protected hasAlbumI18n    = computed(() => ({ name: 'hasAlbum',     label: this.i18n().hasAlbum_label(),     helper: this.i18n().hasAlbum_helper()     } as CheckboxI18n));
  protected hasMembersI18n  = computed(() => ({ name: 'hasMembers',   label: this.i18n().hasMembers_label(),   helper: this.i18n().hasMembers_helper()   } as CheckboxI18n));

  // inputs
  public readonly i18n = input.required<GroupI18n>();
  public formData = model.required<GroupModel>();
  public currentUser = input<UserModel | undefined>();
  public showForm = input(true);   // used for initializing the form and resetting vest validations
  public readonly allTags = input.required<string>();
  public readonly tenantId = input.required<string>();
  public readonly isNew = input(false);
  public readOnly = input(true);  
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

 // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();
  public selectPerson = output<void>();
  public showPersonOutput = output<string>();

  // validation and errors
  protected readonly suite = groupValidations;
  private readonly validationResult = computed(() => groupValidations(this.formData(), this.tenantId(), this.allTags()));
  protected nameErrors = computed(() => this.validationResult().getErrors('name'));
  protected bkeyErrors = computed(() => this.validationResult().getErrors('bkey'));

  // fields
  protected name = linkedSignal(() => this.formData().name ?? '');
  protected bkey = linkedSignal(() => this.formData().bkey ?? '');
  protected icon = linkedSignal(() => this.formData().icon ?? '');

  // admin
  protected admins = linkedSignal(() => this.formData().admins);

  protected tags = linkedSignal(() => this.formData().tags ?? '');
  protected notes = linkedSignal(() => this.formData().notes ?? '');
  protected visibility = linkedSignal(() => this.formData().visibility ?? '');
  protected notifyType = linkedSignal(() => this.formData().notifyType ?? 'memberOnly');
  protected readonly notifyTypeOptions = ['memberOnly', 'membersAndMatchingVisibility'];
  protected hasContent = linkedSignal(() => this.formData().hasContent ?? true);
  protected hasChat = linkedSignal(() => this.formData().hasChat ?? true);
  protected hasCalendar = linkedSignal(() => this.formData().hasCalendar ?? true);
  protected hasTasks = linkedSignal(() => this.formData().hasTasks ?? true);
  protected hasFiles = linkedSignal(() => this.formData().hasFiles ?? true);
  protected hasAlbum = linkedSignal(() => this.formData().hasAlbum ?? true);
  protected hasMembers = linkedSignal(() => this.formData().hasMembers ?? true);

  // passing constants to template
  protected mask = LowercaseWordMask;
  protected readonly maxWordLength = WORD_LENGTH;

  /******************************* actions *************************************** */
  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number | boolean | AvatarInfo[]): void {
    if (fieldName === 'bkey') {
      fieldValue = (fieldValue as string).toLowerCase();
    }
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected onFormChange(value: GroupModel): void {
    this.formData.update((vm) => ({...vm, ...value}));
    debugFormModel('GroupForm.onFormChange', this.formData(), this.currentUser());
    debugFormErrors('GroupForm.onFormChange', this.validationResult().errors, this.currentUser());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }

  protected showPerson(personKey: string): void {
    this.showPersonOutput.emit(personKey);
  }
}
