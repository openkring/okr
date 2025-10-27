import { AsyncPipe } from '@angular/common';
import { Component, computed, input, model, output, signal } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { LowercaseWordMask } from '@bk2/shared-config';
import { WORD_LENGTH } from '@bk2/shared-constants';
import { TranslatePipe } from '@bk2/shared-i18n';
import { RoleName, UserModel } from '@bk2/shared-models';
import { CheckboxComponent, ChipsComponent, NotesInputComponent, TextInputComponent } from '@bk2/shared-ui';
import { debugFormErrors, hasRole } from '@bk2/shared-util-core';

import { GroupFormModel, groupFormModelShape, groupFormValidations } from '@bk2/subject-group-util';

@Component({
  selector: 'bk-group-form',
  standalone: true,
  imports: [
    vestForms,
    TranslatePipe, AsyncPipe,
    TextInputComponent, ChipsComponent, NotesInputComponent, CheckboxComponent,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent, IonCardHeader, IonCardTitle
  ],
  template: `
  <form scVestForm
    [formShape]="shape"
    [formValue]="vm()"
    [suite]="suite" 
    (dirtyChange)="dirtyChange.set($event)"
    (formValueChange)="onValueChange($event)">

    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ '@subject.group.field.attributes' | translate | async }}</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        <ion-grid>
          <ion-row> 
            <ion-col size="12" size-md="6">
              <bk-text-input name="name" [value]="name()" [maxLength]=50 [readOnly]="readOnly()" (changed)="onChange('name', $event)" />
            </ion-col>
              <ion-col size="12" size-md="">
                <bk-text-input name="id" [value]="id()" [maxLength]="maxWordLength" [mask]="mask" [showHelper]=true [readOnly]="readOnly()" (changed)="onChange('id', $event)" />                                        
              </ion-col>
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ '@subject.group.field.display' | translate | async }}</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        <ion-grid>
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
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>

            <!-- tbd: hierarchy comes later 
              select an org or group, fill in parentKey, parentName, parentModelType
            -->

    <bk-chips chipName="tag" [storedChips]="tags()" [allChips]="groupTags()" [readOnly]="readOnly()" (changed)="onChange('tags', $event)" />

    @if(hasRole('admin')) { 
      <bk-notes name="notes" [value]="notes()" />
    }
  </form>
  `
})
export class GroupFormComponent {
  public vm = model.required<GroupFormModel>();
  public currentUser = input<UserModel | undefined>();
  public readonly groupTags = input.required<string>();

  public readOnly = computed(() => !hasRole('memberAdmin', this.currentUser()));  

  public validChange = output<boolean>();
  protected dirtyChange = signal(false);
  
  protected readonly suite = groupFormValidations;
  protected readonly shape = groupFormModelShape;

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

  protected mask = LowercaseWordMask;
  protected readonly maxWordLength = WORD_LENGTH;

  private readonly validationResult = computed(() => groupFormValidations(this.vm()));
  protected nameErrors = computed(() => this.validationResult().getErrors('name'));

  protected onValueChange(value: GroupFormModel): void {
    this.vm.update((vm) => ({...vm, ...value}));
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected onChange(fieldName: string, $event: string | string[] | number | boolean): void {
    this.vm.update((vm) => ({ ...vm, [fieldName]: $event }));
    debugFormErrors('GroupForm', this.validationResult().errors, this.currentUser());
    this.dirtyChange.set(true); // it seems, that vest is not updating dirty by itself for this change
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
