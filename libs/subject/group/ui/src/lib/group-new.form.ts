import { Component, computed, input, model, output, signal} from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { RoleName } from '@bk2/shared/config';
import { SwissCity, UserModel } from '@bk2/shared/models';
import { CheckboxComponent, ChipsComponent, ErrorNoteComponent, NotesInputComponent, TextInputComponent } from '@bk2/shared/ui';
import { debugFormErrors, hasRole } from '@bk2/shared/util';

import { GroupFormModel, GroupNewFormModel, groupNewFormModelShape, groupNewFormValidations } from '@bk2/group/util';

@Component({
  selector: 'bk-group-new-form',
  imports: [
    vestForms,
    TextInputComponent, ChipsComponent, NotesInputComponent, ErrorNoteComponent, CheckboxComponent,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent
  ],
  template: `
  <form scVestForm
    [formShape]="shape"
    [formValue]="vm()"
    [suite]="suite" 
    (dirtyChange)="dirtyChange.set($event)"
    (formValueChange)="onValueChange($event)">

    <ion-card>
      <ion-card-content>
        <ion-grid>
          <ion-row> 
            <ion-col size="12" size-md="6">
              <bk-text-input name="name" [value]="name()" [maxLength]=50 [readOnly]="readOnly()" (changed)="onChange('name', $event)" />
              <bk-error-note [errors]="nameErrors()" />                                                                                                                     
            </ion-col>
            <ion-col size="12" size-md="6">
              <!-- tbd: add word mask and check uniqueness -->
              <bk-text-input name="id" [value]="id()" [maxLength]=50 [readOnly]="readOnly()" (changed)="onChange('id', $event)" />
              <bk-error-note [errors]="idErrors()" />                                                                                                                     
            </ion-col>
          </ion-row>
          <ion-row> 
            <ion-col size="12" size-md="6">
              <bk-checkbox name="hasContent" [isChecked]="hasContent()" [showHelper]="true" (changed)="onChange('hasContent', $event)"/>
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-checkbox name="hasChat" [isChecked]="hasChat()" [showHelper]="true" (changed)="onChange('hasChat', $event)"/>
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-checkbox name="hasCalendar" [isChecked]="hasCalendar()" [showHelper]="true" (changed)="onChange('hasCalendar', $event)"/>
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-checkbox name="hasTasks" [isChecked]="hasTasks()" [showHelper]="true" (changed)="onChange('hasTasks', $event)"/>
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-checkbox name="hasFiles" [isChecked]="hasFiles()" [showHelper]="true" (changed)="onChange('hasFiles', $event)"/>
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-checkbox name="hasAlbum" [isChecked]="hasAlbum()" [showHelper]="true" (changed)="onChange('hasAlbum', $event)"/>
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-checkbox name="hasMembers" [isChecked]="hasMembers()" [showHelper]="true" (changed)="onChange('hasMembers', $event)"/>
            </ion-col>

            <!-- tbd: hierarchy comes later 
              select an org or group, fill in parentKey, parentName, parentModelType
            -->
          </ion-row>

        </ion-grid>
      </ion-card-content>
    </ion-card>
    <bk-chips chipName="tag" [storedChips]="tags()" [allChips]="groupTags()" [readOnly]="readOnly()" (changed)="onChange('tags', $event)" />

    @if(hasRole('admin')) { 
      <bk-notes name="notes" [value]="notes()" />
    }
  </form>
  `
})
export class GroupNewFormComponent {
  public vm = model.required<GroupNewFormModel>();
  public currentUser = input<UserModel | undefined>();
  public groupTags = input.required<string>();

  public readOnly = computed(() => !hasRole('memberAdmin', this.currentUser()));  

  public validChange = output<boolean>();
  protected dirtyChange = signal(false);
  
  protected readonly suite = groupNewFormValidations;
  protected readonly shape = groupNewFormModelShape;

  protected name = computed(() => this.vm().name ?? '');
  protected id = computed(() => this.vm().id ?? '');
  protected tags = computed(() => this.vm().tags ?? '');
  protected notes = computed(() => this.vm().notes ?? '');
  protected hasContent = computed(() => this.vm().hasContent ?? true);
  protected hasChat = computed(() => this.vm().hasChat ?? true);
  protected hasCalendar = computed(() => this.vm().hasCalendar ?? true);
  protected hasTasks = computed(() => this.vm().hasTasks ?? true);
  protected hasFiles = computed(() => this.vm().hasFiles ?? true);
  protected hasAlbum = computed(() => this.vm().hasAlbum ?? true);
  protected hasMembers = computed(() => this.vm().hasMembers ?? true);

  private readonly validationResult = computed(() => groupNewFormValidations(this.vm()));
  protected nameErrors = computed(() => this.validationResult().getErrors('name'));
  protected idErrors = computed(() => this.validationResult().getErrors('id'));

  protected onCitySelected(city: SwissCity): void {
    this.vm.update((_vm) => ({ ..._vm, city: city.name, countryCode: city.countryCode, zipCode: String(city.zipCode) }));
  }

  protected onValueChange(value: GroupFormModel): void {
    this.vm.update((_vm) => ({..._vm, ...value}));
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected onChange(fieldName: string, $event: string | string[] | number | boolean): void {
    this.vm.update((vm) => ({ ...vm, [fieldName]: $event }));
    debugFormErrors('GroupNewForm', this.validationResult().errors, this.currentUser());
    this.dirtyChange.set(true); // it seems, that vest is not updating dirty by itself for this change
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
